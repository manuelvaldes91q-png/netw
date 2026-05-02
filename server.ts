import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';
import TelegramBot from 'node-telegram-bot-api';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGS_FILE = path.join(process.cwd(), 'monitoring_logs.json');

// Initialize Telegram Bot for receiving commands
let telegramBot: TelegramBot | null = null;
if (process.env.TELEGRAM_BOT_TOKEN) {
  try {
    telegramBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
    console.log('[TELEGRAM] Bot polling started');

    const sendPanel = (chatId: number) => {
      const summary = getStatusSummary();
      telegramBot?.sendMessage(chatId, summary, { 
        parse_mode: 'HTML',
        reply_markup: {
          keyboard: [
            [{ text: '📊 Ver Panel de Estado' }]
          ],
          resize_keyboard: true,
          is_persistent: true
        }
      });
    };

    telegramBot.onText(/\/(panel|status)/, (msg) => {
      sendPanel(msg.chat.id);
    });

    telegramBot.onText(/📊 Ver Panel de Estado/, (msg) => {
      sendPanel(msg.chat.id);
    });

    telegramBot.onText(/\/(start|help)/, (msg) => {
      const chatId = msg.chat.id;
      const helpMsg = `🤖 <b>MikroWatch NOC Bot</b>\n\nPresiona el botón de abajo para ver el estado de la red.`;
      telegramBot?.sendMessage(chatId, helpMsg, { 
        parse_mode: 'HTML',
        reply_markup: {
          keyboard: [
            [{ text: '📊 Ver Panel de Estado' }]
          ],
          resize_keyboard: true,
          is_persistent: true
        }
      });
    });
  } catch (error) {
    console.warn('[TELEGRAM] Failed to initialize bot polling:', error);
  }
}

interface MikrotikStatus {
  host: string;
  ip?: string;
  status: 'up' | 'down';
  message: string;
  timestamp: string;
}

// In-memory store for monitoring state
let currentStatuses: Record<string, MikrotikStatus> = {};
let logs: MikrotikStatus[] = [];
let config = {
  telegramChatIds: process.env.TELEGRAM_CHAT_ID || ''
};

// Initialize state from file if exists
try {
  if (fs.existsSync(LOGS_FILE)) {
    const data = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
    currentStatuses = data.currentStatuses || {};
    logs = data.logs || [];
    if (data.config) {
      config = { ...config, ...data.config };
    }
    console.log(`[PERSISTENCE] Loaded ${logs.length} logs and config from disk.`);
  }
} catch (err) {
  console.error('[PERSISTENCE] Error loading logs:', err);
}

let clients: any[] = [];
let lastHeartbeat: string | null = null;
let heartbeatTimeout: NodeJS.Timeout | null = null;

function persistState() {
  try {
    // 15 days retention policy
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

    logs = logs.filter(log => new Date(log.timestamp) > fifteenDaysAgo);

    const data = JSON.stringify({ currentStatuses, logs, config }, null, 2);
    fs.writeFileSync(LOGS_FILE, data);
  } catch (err) {
    console.error('[PERSISTENCE] Error saving logs:', err);
  }
}

function calculateUptime(host: string): number {
  const hostLogs = logs
    .filter(l => l.host === host)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (hostLogs.length < 2) return currentStatuses[host]?.status === 'up' ? 100 : 0;

  const now = new Date().getTime();
  const startTime = new Date(hostLogs[0].timestamp).getTime();
  const totalTime = now - startTime;
  
  if (totalTime <= 0) return 100;

  let totalDownTime = 0;
  let downStart: number | null = null;

  // If the very first state we ever saw was down, start counting from then
  if (hostLogs[0].status === 'down') {
    downStart = startTime;
  }

  for (let i = 1; i < hostLogs.length; i++) {
    const log = hostLogs[i];
    const logTime = new Date(log.timestamp).getTime();

    if (log.status === 'down' && downStart === null) {
      downStart = logTime;
    } else if (log.status === 'up' && downStart !== null) {
      totalDownTime += logTime - downStart;
      downStart = null;
    }
  }

  // If currently down, add time since the last down log until now
  if (downStart !== null) {
    totalDownTime += now - downStart;
  }

  const uptimePercent = ((totalTime - totalDownTime) / totalTime) * 100;
  return Math.min(100, Math.max(0, parseFloat(uptimePercent.toFixed(2))));
}

function broadcastStatus() {
  const currentWithUptime = Object.values(currentStatuses).map(n => ({
    ...n,
    uptime: calculateUptime(n.host)
  }));

  const data = JSON.stringify({
    current: currentWithUptime,
    logs: logs.slice(0, 50),
    config: {
      telegramChatIds: config.telegramChatIds,
      telegramConfigured: !!(process.env.TELEGRAM_BOT_TOKEN && (config.telegramChatIds || process.env.TELEGRAM_CHAT_ID)),
    }
  });
  
  clients.forEach(client => client.res.write(`data: ${data}\n\n`));
}

function getStatusSummary(): string {
  const allNodes = Object.values(currentStatuses).sort((a, b) => a.host.localeCompare(b.host));
  const wanNodes = allNodes.filter(n => n.host.toUpperCase().includes('WAN'));
  const antennaNodes = allNodes.filter(n => 
    !n.host.toUpperCase().includes('WAN') && 
    n.host !== 'MIKROTIK_SYSTEM'
  );

  let summary = `\n\n📊 <b>PANEL DE ESTADO ACTUAL</b>\n`;
  
  if (wanNodes.length > 0) {
    summary += `\n🌐 <b>REDES WAN:</b>\n`;
    wanNodes.forEach(n => {
      summary += `${n.status === 'up' ? '✅' : '❌'} ${n.host}\n`;
    });
  }

  if (antennaNodes.length > 0) {
    summary += `\n📡 <b>ANTENAS / NODOS:</b>\n`;
    antennaNodes.forEach(n => {
      summary += `${n.status === 'up' ? '✅' : '❌'} ${n.host}\n`;
    });
  }

  return summary;
}

// Watchdog to detect if Mikrotik stops sending data
const startHeartbeatWatchdog = () => {
  if (heartbeatTimeout) clearInterval(heartbeatTimeout);
  
  heartbeatTimeout = setInterval(async () => {
    if (!lastHeartbeat) return;

    const lastSeen = new Date(lastHeartbeat).getTime();
    const now = new Date().getTime();
    const diffMinutes = (now - lastSeen) / (1000 * 60);

    // If more than 3 minutes without heartbeat, notify
    if (diffMinutes >= 3) {
      const venezuelaTime = new Date().toLocaleString('es-VE', { 
        timeZone: 'America/Caracas',
        hour12: true,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });

      console.log(`[WATCHDOG] Mikrotik Heartbeat Lost. Last seen: ${venezuelaTime}`);
      
      // Update UI state first so it reflects in summary
      currentStatuses['MIKROTIK_SYSTEM'] = {
        host: 'MIKROTIK_SYSTEM',
        status: 'down',
        message: 'CONNECTION_LOST: Heartbeat timeout',
        timestamp: new Date().toISOString()
      };

      const telegramMessage = `⚠️ <b>ALERTA CRÍTICA: MIKROTIK DESCONECTADO</b>\n\n` +
        `<b>Problema:</b> Se perdió el latido (Sin comunicación)\n` +
        `<b>Último Pulso:</b> ${venezuelaTime}\n\n` +
        `<i>El sistema no ha recibido comunicación del MikroTik en más de 3 minutos. Es posible que el equipo esté apagado o sin internet.</i>`;
      
      await sendTelegramNotification(telegramMessage);
      
      broadcastStatus();
      lastHeartbeat = null; // Prevent alert spam
    }
  }, 60000); 
};

async function sendTelegramNotification(message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatIdEnv = config.telegramChatIds || process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatIdEnv) {
    console.warn('Telegram token or chat ID not configured.');
    return;
  }

  // Support multiple chat IDs separated by commas or spaces
  const chatIds = chatIdEnv.split(/[,\s]+/).filter(id => id.trim().length > 0);

  for (const chatId of chatIds) {
    try {
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId.trim(),
          text: message,
          parse_mode: 'HTML',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error(`Telegram API error for chat ID ${chatId}:`, errorData);
      } else {
        console.log(`[TELEGRAM] Notification sent to ${chatId}`);
      }
    } catch (error) {
      console.error(`Failed to send Telegram notification to ${chatId}:`, error);
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  startHeartbeatWatchdog();

  // Logger for ALL Mikrotik API attempts (to catch typos)
  app.use('/api/mikrotik', (req, res, next) => {
    console.log(`[ API Access ] Path: ${req.path}, Query: ${JSON.stringify(req.query)}`);
    next();
  });

  // Webhook endpoint for Mikrotik
  app.get('/api/mikrotik/webhook', async (req, res) => {
    const { host, status, message, ip } = req.query;
    console.log(`[ Mikrotik Webhook Received ] Host: ${host}, IP: ${ip}, Status: ${status}, Msg: ${message}`);

    if (!host || !status) {
      console.warn('!! Rejected Webhook: Missing host or status query parameters.');
      return res.status(400).json({ error: 'Missing host or status' });
    }

    lastHeartbeat = new Date().toISOString();

    const venezuelaTime = new Date().toLocaleString('es-VE', { 
      timeZone: 'America/Caracas',
      hour12: true,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const logEntry: MikrotikStatus = {
      host: host as string,
      ip: ip as string || undefined,
      status: (status as string).toLowerCase() as 'up' | 'down',
      message: (message as string) || `Host ${host} ${ip ? `(${ip}) ` : ''}está ${status === 'up' ? 'en línea' : 'fuera de línea'}`,
      timestamp: new Date().toISOString(),
    };

    // Update state
    currentStatuses[logEntry.host] = logEntry;
    logs.unshift(logEntry);
    
    persistState();

    // Notify via Telegram
    const emoji = logEntry.status === 'up' ? '✅' : '❌';
    const statusText = logEntry.status === 'up' ? 'EN LÍNEA' : 'FUERA DE LÍNEA';
    const telegramMessage = `${emoji} <b>Alerta MikroWatch</b>\n\n` +
      `<b>Host:</b> ${logEntry.host}\n` +
      (logEntry.ip ? `<b>IP:</b> ${logEntry.ip}\n` : '') +
      `<b>Estado:</b> ${statusText}\n` +
      `<b>Mensaje:</b> ${logEntry.message}\n` +
      `<b>Fecha (VE):</b> ${venezuelaTime}`;

    await sendTelegramNotification(telegramMessage);

    // Broadcast to all connected web clients
    broadcastStatus();

    res.json({ success: true });
  });

  // Handle common typo: /api/mikrotik/webhookhost=... or /api/mikrotik/webhookhost=NAME&status=down
  app.get('/api/mikrotik/webhookhost=:data', async (req, res) => {
    console.log('!! Caught "Missing Question Mark" Typo in Mikrotik request.');
    const data = req.params.data;
    const parts = data.split('&');
    const query: any = {};
    
    parts.forEach((p, index) => {
       const [k, v] = p.split('=');
       if (v !== undefined) {
         query[k] = v;
       } else if (index === 0) {
         // Assume the first val without = is the host
         query['host'] = k;
       }
    });
    
    const host = query.host;
    const status = query.status;
    
    if (host && status) {
       lastHeartbeat = new Date().toISOString();
       const venezuelaTime = new Date().toLocaleString('es-VE', { 
         timeZone: 'America/Caracas',
         hour12: true,
         hour: '2-digit',
         minute: '2-digit',
         second: '2-digit'
       });

       const logEntry: MikrotikStatus = {
         host: host as string,
         status: (status as string).toLowerCase() as 'up' | 'down',
         message: `Recuperado (Typo Fixed)`,
         timestamp: new Date().toISOString(),
       };
       currentStatuses[logEntry.host] = logEntry;
       logs.unshift(logEntry);
       persistState();
       
       const emoji = logEntry.status === 'up' ? '✅' : '❌';
       const telegramMessage = `${emoji} <b>MikroWatch Alert (Typo Fix)</b>\n\n` +
         `<b>Host:</b> ${logEntry.host}\n` +
         `<b>Status:</b> ${logEntry.status.toUpperCase()}\n` +
         `<b>Time (VE):</b> ${venezuelaTime}`;

       await sendTelegramNotification(telegramMessage);
       broadcastStatus();
       return res.json({ success: true, warning: 'Please add ? before host= in your Mikrotik URL' });
    }
    res.status(400).send('Malformed typo-fix attempt. Use: /api/mikrotik/webhook?host=NAME&status=down');
  });

  // Heartbeat endpoint for Mikrotik Scheduler
  app.get('/api/mikrotik/heartbeat', (req, res) => {
    const { host } = req.query;
    lastHeartbeat = new Date().toISOString();
    
    const hostName = (host as string) || 'MIKROTIK_SYSTEM';
    
    currentStatuses[hostName] = {
      host: hostName,
      status: 'up',
      message: 'System alive (Heartbeat OK)',
      timestamp: lastHeartbeat
    };

    persistState();
    broadcastStatus();
    res.json({ status: 'ok', serverTime: lastHeartbeat });
  });

  // TYPO HANDLER for Heartbeat (catches /api/mikrotik/heartbeathost=...)
  app.get('/api/mikrotik/heartbeathost=:data', (req, res) => {
    const data = req.params.data;
    lastHeartbeat = new Date().toISOString();
    
    let hostName = 'MIKROTIK_SYSTEM';
    if (data.includes('=')) {
      hostName = data.split('=')[1] || 'MIKROTIK_SYSTEM';
    } else {
      hostName = data;
    }

    currentStatuses[hostName] = {
      host: hostName,
      status: 'up',
      message: 'System alive (Typo Heartbeat OK)',
      timestamp: lastHeartbeat
    };

    persistState();
    broadcastStatus();
    res.json({ status: 'ok', warning: 'Please add ? before host= in your Heartbeat URL', serverTime: lastHeartbeat });
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

  // API to update config
  app.post('/api/config', express.json(), (req, res) => {
    const { telegramChatIds } = req.body;
    if (typeof telegramChatIds === 'string') {
      config.telegramChatIds = telegramChatIds;
      persistState();
      broadcastStatus();
      res.json({ status: 'ok', config });
    } else {
      res.status(400).json({ error: 'Invalid config' });
    }
  });

  // API to get current status and logs for the frontend (fallback)
  app.get('/api/status', (req, res) => {
    const currentWithUptime = Object.values(currentStatuses).map(n => ({
      ...n,
      uptime: calculateUptime(n.host)
    }));

    res.json({
      current: currentWithUptime,
      logs: logs.slice(0, 50),
      config: {
        telegramChatIds: config.telegramChatIds,
        telegramConfigured: !!(process.env.TELEGRAM_BOT_TOKEN && (config.telegramChatIds || process.env.TELEGRAM_CHAT_ID)),
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
