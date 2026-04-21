import { useEffect, useState, useRef, FormEvent } from 'react';
import { Terminal, Shield, Wifi, Cpu, Clock, Activity, Bell, ChevronRight, Settings, Code } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface MikrotikStatus {
  host: string;
  status: 'up' | 'down';
  message: string;
  timestamp: string;
}

interface MonitorData {
  current: MikrotikStatus[];
  logs: MikrotikStatus[];
  config?: {
    telegramConfigured: boolean;
  };
}

export default function App() {
  const [data, setData] = useState<MonitorData>({ current: [], logs: [], config: { telegramConfigured: false } });
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [command, setCommand] = useState('');
  const [terminalOutput, setTerminalOutput] = useState<string[]>(['MikroWatch OS v2.0.4 Initialized...', 'System: PASS', 'Network: SECURE', 'Waiting for Mikrotik broadcast...', '>> TIP: If sync fails, check help for troubleshooting commands.']);
  const [activeTab, setActiveTab] = useState<'terminal' | 'stats'>('terminal');
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    const connect = () => {
      setConnectionStatus('connecting');
      eventSource = new EventSource('/api/events');
      eventSource.onopen = () => {
        setConnectionStatus('online');
        setTerminalOutput(prev => [
          ...prev, 
          '>> EVENT_STREAM_CONNECTED: Synchronous monitoring active.',
          `>> LOCAL_ENDPOINT: ${window.location.hostname}`,
          '>> STATUS: SYNCHRONIZED - Monitoring system ready.'
        ]);
      };
      eventSource.onmessage = (event) => {
        try {
          const result = JSON.parse(event.data);
          setData(result);
          if (result.logs.length > 0) {
            const lastLog = result.logs[0];
            setTerminalOutput(prev => {
              const logMsg = `>> ALERT: ${lastLog.host} is ${lastLog.status.toUpperCase()} - ${lastLog.message}`;
              // Avoid duplicate logs if possible
              if (prev[prev.length - 1] === logMsg) return prev;
              return [...prev, logMsg];
            });
          }
        } catch (error) {
          console.error('Error parsing SSE data:', error);
        }
      };
      eventSource.onerror = () => {
        setConnectionStatus('offline');
        setTerminalOutput(prev => [...prev, '!! CONNECTION_LOST: Attempting reconnection...']);
        eventSource?.close();
        setTimeout(connect, 3000);
      };
    };
    connect();
    return () => eventSource?.close();
  }, []);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [terminalOutput]);

  const handleCommand = (e: FormEvent) => {
    e.preventDefault();
    const cmd = command.toLowerCase().trim();
    if (!cmd) return;

    let response = `Unknown command: ${cmd}. Type 'help' for available commands.`;

    if (cmd === 'help') {
      response = 'Available commands: status, troubleshoot, check-url, config, clear, help, about, tabs';
    } else if (cmd === 'status') {
      response = `ONLINE_HOSTS: ${data.current.filter(h => h.status === 'up').length}, OFFLINE: ${data.current.filter(h => h.status === 'down').length}`;
    } else if (cmd === 'check-url') {
      response = `YOUR_WEBHOOK_URL: ${window.location.origin}/api/mikrotik/webhook`;
    } else if (cmd === 'troubleshoot') {
      response = '1. ERROR 302 FOUND: El link de "ais-dev" está protegido por login de Google. El Mikrotik no puede entrar. SOLUCIÓN: Instala en tu VPS o despliega como Pública. 2. URL FORMAT: Debe tener "?" después de "webhook". 3. SSL: Usa check-certificate=no.';
    } else if (cmd === 'config') {
      response = `TELEGRAM_INTEGRATION: ${data.config?.telegramConfigured ? 'ENABLED' : 'DISABLED'}`;
    } else if (cmd === 'clear') {
      setTerminalOutput(['>> Buffers cleared. Listening...']);
      setCommand('');
      return;
    } else if (cmd === 'tabs') {
      response = 'Switching layouts for mobile. Use internal UI buttons.';
    } else if (cmd === 'about') {
      response = 'MikroWatch v2.0 - High Performance Monitoring for Mikrotik Systems.';
    }

    setTerminalOutput(prev => [...prev, `> ${cmd}`, response]);
    setCommand('');
  };

  return (
    <div className="h-screen w-screen bg-terminal-bg text-terminal-text font-mono flex flex-col relative overflow-hidden text-[13px] sm:text-sm">
      {/* Decorative Scanlines */}
      <div className="absolute inset-0 terminal-scanlines z-50 pointer-events-none opacity-10" />
      
      {/* TOP NAV / SYSTEM BAR */}
      <header className="border-b border-terminal-text/20 p-3 sm:p-4 flex flex-wrap justify-between items-center z-10 bg-black/60 backdrop-blur-md gap-3">
        <div className="flex items-center gap-3">
          <Terminal className="w-5 h-5 text-neon-green terminal-glow" />
          <h1 className="text-sm sm:text-lg font-bold tracking-widest uppercase terminal-glow text-neon-green">MikroWatch_CLI</h1>
        </div>
        <div className="flex items-center gap-4 sm:gap-6 text-[9px] sm:text-[10px] uppercase tracking-wider font-bold">
          <div className="hidden xs:flex items-center gap-2">
            <span className="opacity-40">Uptime:</span>
            <span className="text-neon-blue">100%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="opacity-40">Stream:</span>
            <span className={connectionStatus === 'online' ? 'text-neon-green' : 'text-neon-amber animate-pulse'}>
              {connectionStatus}
            </span>
          </div>
          <div className="flex items-center gap-2 px-2 py-0.5 border border-terminal-text/20 rounded">
            <span className="opacity-40">RAM:</span>
            <span className="text-neon-amber">12MB</span>
          </div>
        </div>
      </header>

      {/* MOBILE TAB CONTROLS */}
      <div className="lg:hidden flex border-b border-terminal-text/10 z-10">
        <button 
          onClick={() => setActiveTab('terminal')}
          className={`flex-1 py-3 text-[10px] uppercase font-bold tracking-widest transition-colors ${activeTab === 'terminal' ? 'bg-white/10 text-neon-green border-b-2 border-neon-green' : 'opacity-40'}`}
        >
          Terminal
        </button>
        <button 
          onClick={() => setActiveTab('stats')}
          className={`flex-1 py-3 text-[10px] uppercase font-bold tracking-widest transition-colors ${activeTab === 'stats' ? 'bg-white/10 text-neon-green border-b-2 border-neon-green' : 'opacity-40'}`}
        >
          Monitors
        </button>
      </div>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 overflow-hidden flex flex-col lg:flex-row z-10 relative">
        
        {/* LEFT: LIVE COMMAND FEED */}
        <section className={`flex-1 flex flex-col border-r border-terminal-text/10 bg-black/20 p-4 transition-all duration-300 ${activeTab === 'terminal' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="flex items-center gap-2 mb-4 opacity-50 border-b border-terminal-text/20 pb-2">
             <Bell className="w-3 h-3" />
             <span className="text-[10px] font-bold uppercase tracking-widest">Real-time Log Stream</span>
          </div>
          <div 
            ref={outputRef}
            className="flex-1 overflow-y-auto space-y-1 mb-4 scrollbar-thin scrollbar-thumb-terminal-text/10 pr-2 font-mono scroll-smooth"
          >
            {terminalOutput.map((line, i) => (
              <div key={i} className={`text-[11px] sm:text-xs leading-relaxed ${
                line.startsWith('!!') ? 'text-neon-amber' : 
                line.startsWith('>>') ? 'text-neon-blue' : 
                line.startsWith('>') ? 'text-neon-green font-bold' : 'opacity-80'
              }`}>
                {line}
              </div>
            ))}
          </div>
          
          {/* INTERACTIVE PROMPT */}
          <form onSubmit={handleCommand} className="flex items-center gap-2 p-2 border border-terminal-text/20 rounded bg-white/5 group focus-within:border-neon-green transition-colors mt-auto">
            <ChevronRight className="w-4 h-4 text-neon-green" />
            <input 
              type="text" 
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Command (help, status, config)..."
              className="flex-1 bg-transparent border-none outline-none text-xs text-neon-green placeholder:text-terminal-text/20"
              autoFocus
            />
          </form>
        </section>

        {/* RIGHT: SYSTEM STATUS GRIDS */}
        <aside className={`w-full lg:w-[500px] flex flex-col gap-6 p-6 bg-black/50 overflow-y-auto border-l border-white/5 transition-all duration-300 ${activeTab === 'stats' ? 'flex' : 'hidden lg:flex'}`}>
          
          {/* MONITOR LIST */}
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-2 opacity-50">
              <div className="flex items-center gap-3">
                <Shield className="w-4 h-4 text-neon-green" />
                <span className="text-[12px] font-bold uppercase tracking-[0.2em] text-neon-green">Live System Nodes</span>
              </div>
              <span className="text-[10px] font-mono">{data.current.length} ACTIVE_NODES</span>
            </div>
            
            <AnimatePresence mode="popLayout">
              {data.current.map((item) => (
                <motion.div
                  key={item.host}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-5 border border-white/10 bg-white/[0.03] relative overflow-hidden group hover:border-neon-blue/30 transition-all rounded-sm"
                >
                  <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${item.status === 'up' ? 'bg-neon-green shadow-[0_0_15px_rgba(0,255,65,0.4)]' : 'bg-red-500 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.4)]'}`} />
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex flex-col pl-2">
                      <span className="text-[10px] font-bold opacity-30 uppercase tracking-widest mb-1">NODE_ID</span>
                      <span className="text-xl font-bold text-white/90 tracking-tight">{item.host}</span>
                    </div>
                    <span className={`text-[11px] font-black px-4 py-1.5 rounded border ${
                      item.status === 'up' ? 'bg-neon-green/20 text-neon-green border-neon-green/40' : 'bg-red-500/20 text-red-500 border-red-500/40 animate-pulse'
                    }`}>
                      {item.status.toUpperCase()}
                    </span>
                  </div>
                  
                  <div className="pl-2 mt-4 pt-4 border-t border-white/5 flex justify-between items-end">
                    <div className="space-y-1">
                      <p className={`text-base font-bold ${item.status === 'up' ? 'text-white/80' : 'text-red-400'}`}>
                        {item.message}
                      </p>
                      <div className="flex items-center gap-2 opacity-30">
                        <Clock className="w-3 h-3" />
                        <span className="text-[10px] uppercase font-mono tracking-tighter">Last Update: {new Date(item.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </div>
                    <Activity className={`w-8 h-8 opacity-10 ${item.status === 'up' ? 'text-neon-green' : 'text-red-500'}`} />
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            
            {data.current.length === 0 && (
              <div className="py-20 border border-dashed border-white/10 rounded flex flex-col items-center justify-center opacity-30 text-center">
                <Wifi className="w-12 h-12 mb-4 animate-pulse" />
                <p className="text-[11px] uppercase font-bold tracking-widest leading-relaxed">System Standby<br/>Waiting for broadcast...</p>
              </div>
            )}
          </div>

          {/* NETWATCH QUICK CMDS */}
          <div className="mt-auto pt-6 border-t border-white/10">
            <div className="flex items-center gap-2 mb-4 opacity-50">
              <Settings className="w-4 h-4" />
              <span className="text-[11px] font-bold uppercase tracking-widest">Router Sync Engine</span>
            </div>
            <div className="bg-black/60 p-5 rounded text-[10px] font-mono border border-white/5 space-y-6 max-h-80 overflow-y-auto select-all scrollbar-thin">
               <div className="border-b border-white/5 pb-4">
                 <p className="text-neon-blue mb-2 font-bold">[# WAN1 - AIRTEK (8.8.8.8)]</p>
                 <div className="relative group">
                   <div className="absolute -top-6 right-0 text-[7px] text-green-400 font-bold uppercase tracking-wider">✓ verified_format</div>
                   <code className="opacity-80 block break-all leading-relaxed bg-blue-950/30 p-2 rounded border border-neon-blue/20 text-[8.5px] sm:text-[9.5px] select-all font-mono">
                     {`/tool netwatch add host=8.8.8.8 up-script="/tool fetch url=\\"${window.location.origin}/api/mikrotik/webhook?host=WAN1&status=up\\" keep-result=no" comment="AIRTEK_WAN"`}
                   </code>
                 </div>
                 <p className="text-[8px] text-green-400 mt-2 font-bold uppercase tracking-tighter">!! PUBLIC ENDPOINT ACTIVE: {window.location.hostname}</p>
               </div>

               <div className="border-b border-neon-amber/10 pb-4">
                 <p className="text-neon-amber mb-2 font-bold">[# WAN2 - INTER (9.9.9.9)]</p>
                 <code className="opacity-80 block break-all leading-relaxed bg-amber-950/30 p-2 rounded border border-neon-amber/20 text-[8.5px] sm:text-[9.5px] select-all font-mono">
                   {`/tool netwatch add host=9.9.9.9 interval=1m up-script="/tool fetch url=\\"${window.location.origin}/api/mikrotik/webhook?host=WAN2&status=up\\" keep-result=no" comment="INTER_WAN"`}
                 </code>
               </div>
               <div className="border-b border-terminal-text/10 pb-4">
                 <p className="text-neon-green mb-2 font-bold">[# ANTENNA_MONITORING (MAP)]</p>
                 <code className="opacity-60 block break-all leading-relaxed bg-black/40 p-2 rounded">
                   {`/tool netwatch add host=192.168.1.10 interval=30s up-script="/tool fetch url=\\"${window.location.origin}/api/mikrotik/webhook?host=ANTENA_PPTP&status=up\\" keep-result=no" comment="BACKHAUL_CHECK"`}
                 </code>
               </div>
               <div className="pt-2">
                 <p className="text-terminal-text/60 mb-2 font-bold">[# CPU_ALERT_SYSTEM]</p>
                 <code className="opacity-60 block break-all leading-relaxed bg-black/40 p-2 rounded">
                   {`/system script add name=watch_cpu source="[:if ([:pick [/system resource get cpu-load] 0 3] > 80) do={ /tool fetch url=\\"${window.location.origin}/api/mikrotik/webhook?host=CPU&status=down&message=HIGH_LOAD\\" keep-result=no }]"`}
                 </code>
               </div>
            </div>
          </div>

        </aside>
      </main>

      {/* FOOTER */}
      <footer className="p-2 border-t border-terminal-text/10 text-[8px] sm:text-[9px] flex justify-between items-center opacity-40 bg-black z-10 px-4">
        <div className="flex gap-4">
          <span className="hidden xs:inline">OS_KERN: AIS_CLOUD_v2</span>
          <span>MOD: NET_RECEP</span>
        </div>
        <div className="flex gap-4">
           {data.config?.telegramConfigured ? (
             <span className="text-neon-green font-bold">TG_BOT: OK</span>
           ) : (
             <span className="text-neon-amber font-bold">TG_BOT: IDLE</span>
           )}
           <span className="opacity-50">2026_MICRO_CLI</span>
        </div>
      </footer>
    </div>
  );
}
