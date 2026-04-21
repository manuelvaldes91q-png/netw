import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface MikrotikStatus {
  host: string;
  status: 'up' | 'down';
  message: string;
  timestamp: string;
}

// In-memory store for monitoring state
let currentStatuses: Record<string, MikrotikStatus> = {};
let logs: MikrotikStatus[] = [];
let clients: any[] = [];

function broadcastStatus() {
  const data = JSON.stringify({
    current: Object.values(currentStatuses),
    logs: logs.slice(0, 50),
    config: {
      telegramConfigured: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    }
  });
  
  clients.forEach(client => client.res.write(`data: ${data}\n\n`));
}

async function sendTelegramNotification(message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('Telegram token or chat ID not configured.');
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Telegram API error:', errorData);
    }
  } catch (error) {
    console.error('Failed to send Telegram notification:', error);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Logger for ALL Mikrotik API attempts (to catch typos)
  app.use('/api/mikrotik', (req, res, next) => {
    console.log(`[ API Access ] Path: ${req.path}, Query: ${JSON.stringify(req.query)}`);
    next();
  });

  // Webhook endpoint for Mikrotik
  app.get('/api/mikrotik/webhook', async (req, res) => {
    const { host, status, message } = req.query;
    console.log(`[ Mikrotik Webhook Received ] Host: ${host}, Status: ${status}, Msg: ${message}`);

    if (!host || !status) {
      console.warn('!! Rejected Webhook: Missing host or status query parameters.');
      return res.status(400).json({ error: 'Missing host or status' });
    }

    const logEntry: MikrotikStatus = {
      host: host as string,
      status: (status as string).toLowerCase() as 'up' | 'down',
      message: (message as string) || `Host ${host} is ${status}`,
      timestamp: new Date().toISOString(),
    };

    // Update state
    currentStatuses[logEntry.host] = logEntry;
    logs.unshift(logEntry);
    if (logs.length > 100) logs.pop();

    // Notify via Telegram
    const emoji = logEntry.status === 'up' ? '✅' : '❌';
    const telegramMessage = `${emoji} <b>MikroWatch Alert</b>\n\n` +
      `<b>Host:</b> ${logEntry.host}\n` +
      `<b>Status:</b> ${logEntry.status.toUpperCase()}\n` +
      `<b>Message:</b> ${logEntry.message}\n` +
      `<b>Time:</b> ${new Date().toLocaleString()}`;

    await sendTelegramNotification(telegramMessage);

    // Broadcast to all connected web clients
    broadcastStatus();

    res.json({ success: true });
  });

  // Handle common typo: /api/mikrotik/webhookhost=... instead of /api/mikrotik/webhook?host=...
  app.get('/api/mikrotik/webhookhost=:data', async (req, res) => {
    console.log('!! Caught "Missing Question Mark" Typo in Mikrotik request.');
    const data = req.params.data;
    const parts = data.split('&');
    const query: any = {};
    parts.forEach(p => {
       const [k, v] = p.split('=');
       query[k] = v;
    });
    
    // Redirect or manually call logic
    const { host, status } = query;
    if (host && status) {
       // Logic to trigger broadcast and log
       const logEntry: MikrotikStatus = {
         host: host as string,
         status: (status as string).toLowerCase() as 'up' | 'down',
         message: `Recuperado de error DNS/Typo`,
         timestamp: new Date().toISOString(),
       };
       currentStatuses[logEntry.host] = logEntry;
       logs.unshift(logEntry);
       broadcastStatus();
       return res.json({ success: true, warning: 'Please add ? to your URL' });
    }
    res.status(400).send('Malformed typo-fix attempt');
  });

  // SSE endpoint for real-time updates
  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const clientId = Date.now();
    const newClient = { id: clientId, res };
    clients.push(newClient);

    // Send initial state immediately
    const initialState = JSON.stringify({
      current: Object.values(currentStatuses),
      logs: logs.slice(0, 50),
      config: {
        telegramConfigured: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      }
    });
    res.write(`data: ${initialState}\n\n`);

    req.on('close', () => {
      clients = clients.filter(c => c.id !== clientId);
    });
  });

  // API to get current status and logs for the frontend (fallback)
  app.get('/api/status', (req, res) => {
    res.json({
      current: Object.values(currentStatuses),
      logs: logs.slice(0, 50),
      config: {
        telegramConfigured: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      }
    });
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
