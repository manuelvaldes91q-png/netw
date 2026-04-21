import { useEffect, useState, useRef, FormEvent } from 'react';
import { Terminal, Shield, Wifi, Cpu, Clock, Activity, Bell, ChevronRight, Settings, Code, Info } from 'lucide-react';
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
  const [terminalOutput, setTerminalOutput] = useState<string[]>(['MikroWatch OS v2.0.5 NOC Initialized...', 'System: PASS', 'Network: SECURE', 'Waiting for Mikrotik broadcast...']);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'logs'>('dashboard');
  const outputRef = useRef<HTMLDivElement>(null);

  // Categorize nodes
  const wanNodes = data.current.filter(n => n.host.toUpperCase().includes('WAN'));
  const otherNodes = data.current.filter(n => 
    !n.host.toUpperCase().includes('WAN') && 
    n.host !== 'MIKROTIK_SYSTEM'
  );

  const formatVE = (dateStr?: string) => {
    return new Date(dateStr || new Date()).toLocaleTimeString('es-VE', {
      timeZone: 'America/Caracas',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  useEffect(() => {
    let eventSource: EventSource | null = null;
    const connect = () => {
      setConnectionStatus('connecting');
      eventSource = new EventSource('/api/events');
      eventSource.onopen = () => {
        setConnectionStatus('online');
        setTerminalOutput(prev => [
          ...prev, 
          `[${formatVE()}] >> EVENT_STREAM_CONNECTED`,
          `[${formatVE()}] >> LOCAL_ENDPOINT: ${window.location.hostname}`,
          `[${formatVE()}] >> STATUS: SYNCHRONIZED`
        ]);
      };
      eventSource.onmessage = (event) => {
        try {
          const result = JSON.parse(event.data);
          setData(result);
          if (result.logs.length > 0) {
            const lastLog = result.logs[0];
            setTerminalOutput(prev => {
              const logMsg = `[${formatVE(lastLog.timestamp)}] >> ALERT: ${lastLog.host} is ${lastLog.status.toUpperCase()} - ${lastLog.message}`;
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

  const mikrotikSystem = data.current.find(n => n.host === 'MIKROTIK_SYSTEM');

  return (
    <div className="h-screen w-screen bg-terminal-bg text-terminal-text font-mono flex flex-col relative overflow-hidden text-[13px] sm:text-sm">
      {/* Decorative Scanlines */}
      <div className="absolute inset-0 terminal-scanlines z-50 pointer-events-none opacity-10" />
         {/* TOP NAV / SYSTEM BAR */}
      <header className="border-b border-terminal-text/20 p-2 sm:p-4 flex flex-col sm:flex-row justify-between items-center z-10 bg-black/60 backdrop-blur-md gap-2 sm:gap-3">
        <div className="flex items-center justify-between w-full sm:w-auto overflow-hidden">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 sm:w-5 sm:h-5 text-neon-green terminal-glow" />
              <h1 className="text-xs sm:text-lg font-bold tracking-widest uppercase terminal-glow text-neon-green shrink-0">MikroWatch</h1>
            </div>
            
            {/* HEARTBEAT INDICATOR */}
            <div className={`flex items-center gap-2 border-l border-white/10 pl-3 sm:pl-4 transition-all duration-500 ${!mikrotikSystem || mikrotikSystem.status === 'down' ? 'opacity-100' : 'opacity-40'}`}>
               <Activity className={`w-3 h-3 sm:w-4 sm:h-4 ${!mikrotikSystem || mikrotikSystem.status === 'down' ? 'text-red-500 animate-pulse' : 'text-neon-green animate-pulse'}`} />
               <div className="flex flex-col">
                  <span className={`text-[6px] sm:text-[8px] font-black tracking-tighter leading-none ${!mikrotikSystem || mikrotikSystem.status === 'down' ? 'text-red-500' : 'text-neon-green'}`}>
                    SYSTEM_PULSE: {mikrotikSystem?.status.toUpperCase() || 'WAITING'}
                  </span>
                  {mikrotikSystem && (
                    <span className="text-[5px] sm:text-[7px] opacity-60 leading-none mt-0.5">LAST: {formatVE(mikrotikSystem.timestamp)}</span>
                  )}
               </div>
            </div>
          </div>
          <div className="flex sm:hidden items-center gap-3 text-[8px] uppercase font-bold">
            <span className={connectionStatus === 'online' ? 'text-neon-green' : 'text-neon-amber'}>{connectionStatus}</span>
          </div>
        </div>

        {/* TAB NAVIGATION */}
        <nav className="flex bg-black/40 p-0.5 rounded border border-white/5 w-full sm:w-auto">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`flex-1 sm:flex-none px-4 sm:px-6 py-1.5 sm:py-2 text-[9px] sm:text-[10px] uppercase font-black tracking-widest transition-all rounded ${activeTab === 'dashboard' ? 'bg-neon-green/10 text-neon-green border border-neon-green/20' : 'opacity-40'}`}
          >
            Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('logs')}
            className={`flex-1 sm:flex-none px-4 sm:px-6 py-1.5 sm:py-2 text-[9px] sm:text-[10px] uppercase font-black tracking-widest transition-all rounded ${activeTab === 'logs' ? 'bg-neon-blue/10 text-neon-blue border border-neon-blue/20' : 'opacity-40'}`}
          >
            Logs
          </button>
        </nav>

        <div className="hidden sm:flex items-center gap-4 text-[9px] uppercase font-bold">
          <div className="flex items-center gap-2">
            <span className="opacity-40">Stream:</span>
            <span className={connectionStatus === 'online' ? 'text-neon-green' : 'text-neon-amber'}>{connectionStatus}</span>
          </div>
          <div className="px-2 py-0.5 border border-terminal-text/20 rounded">
            <span className="text-neon-amber">12MB</span>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 overflow-hidden flex flex-col z-10 relative">
        
        {activeTab === 'dashboard' ? (
          <>
            {/* MAIN MONITORING AREA: WAN ONLY */}
            <section className="flex-1 p-3 sm:p-6 flex flex-col gap-4 overflow-hidden bg-black/20">
              <div className="flex items-center justify-between mb-2 sm:mb-4 px-1 sm:px-2 opacity-50">
                <div className="flex items-center gap-2 sm:gap-3">
                  <Shield className="w-4 h-4 text-neon-green" />
                  <span className="text-[11px] sm:text-[14px] font-black uppercase tracking-[0.2em] sm:tracking-[0.4em] text-neon-green">Backbone_WAN_Core</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono text-neon-green">{wanNodes.filter(n => n.status === 'up').length} UP</span>
                    <span className="text-[9px] font-mono text-white/20">|</span>
                    <span className={`text-[9px] font-mono ${wanNodes.filter(n => n.status === 'down').length > 0 ? 'text-red-500 animate-pulse' : 'text-white/40'}`}>
                      {wanNodes.filter(n => n.status === 'down').length} DOWN
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto scrollbar-thin pr-1 flex flex-col gap-3 sm:gap-4">
                {wanNodes.map((item) => (
                  <motion.div
                    key={item.host}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full p-5 sm:p-7 border border-white/10 bg-white/[0.03] relative overflow-hidden group rounded-sm shadow-2xl hover:border-neon-green/30 transition-colors"
                  >
                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${item.status === 'up' ? 'bg-neon-green shadow-[0_0_20px_rgba(0,255,65,0.4)]' : 'bg-red-500 animate-pulse shadow-[0_0_30px_rgba(239,68,68,0.6)]'}`} />
                    
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 sm:gap-0">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm sm:text-xl font-black text-white tracking-[0.1em] uppercase">{item.host}</span>
                        <div className="flex items-center gap-3">
                           <div className="flex items-center gap-1.5 opacity-40">
                             <Clock className="w-3.5 h-3.5" />
                             <span className="text-[10px] sm:text-xs font-mono">{formatVE(item.timestamp)}</span>
                           </div>
                           <span className="text-white/10 text-[10px]">|</span>
                           <div className="flex items-center gap-1.5 opacity-40">
                             <Info className="w-3.5 h-3.5" />
                             <span className="text-[10px] sm:text-xs uppercase font-bold tracking-tighter">Verified</span>
                           </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-6">
                        <p className={`text-xs sm:text-sm font-bold ${item.status === 'up' ? 'text-white/60' : 'text-red-400'}`}>
                          {item.message}
                        </p>
                        <span className={`text-[10px] sm:text-xs font-black px-4 py-1.5 rounded border tracking-widest ${
                          item.status === 'up' ? 'bg-neon-green/10 text-neon-green border-neon-green/30' : 'bg-red-500/10 text-red-500 border-red-500/30 animate-pulse'
                        }`}>
                          {item.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))}

                {wanNodes.length === 0 && (
                  <div className="flex-1 flex flex-col items-center justify-center opacity-20 py-20 grayscale">
                    <Shield className="w-16 h-16 mb-4" />
                    <p className="text-xs uppercase font-black tracking-[0.3em]">No WAN Nodes Detected</p>
                    <p className="text-[10px] lowercase font-mono mt-2">Waiting for Mikrotik broadcast...</p>
                  </div>
                )}
              </div>
            </section>
          </>
        ) : (
          /* LOGS VIEW (FULL TERMINAL) */
          <section className="flex-1 flex flex-col bg-black/90 p-4 sm:p-6 relative overflow-hidden">
            <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-2 sm:pb-4">
               <div className="flex items-center gap-2 sm:gap-3">
                 <Terminal className="w-4 h-4 sm:w-5 sm:h-5 text-neon-blue" />
                 <span className="text-[10px] sm:text-sm font-black uppercase tracking-[0.2em] text-neon-blue">Active_Logs</span>
               </div>
            </div>

            <div 
              ref={outputRef}
              className="flex-1 overflow-y-auto space-y-1.5 mb-4 scrollbar-thin scrollbar-thumb-white/10 font-mono text-[10px] sm:text-xs"
            >
              {terminalOutput.map((line, i) => (
                 <div key={i} className="flex gap-2 sm:gap-4 items-start">
                   <span className="opacity-10 text-[8px] sm:text-[10px] mt-0.5 min-w-[30px] sm:min-w-[40px]">[{i.toString().padStart(4, '0')}]</span>
                   <p className={`leading-relaxed break-all ${line.startsWith('!!') ? 'text-red-400' : line.startsWith('>>') ? 'text-neon-blue' : 'opacity-70'}`}>
                     {line}
                   </p>
                 </div>
              ))}
            </div>

            <form onSubmit={handleCommand} className="flex items-center gap-3 p-3 border border-white/10 rounded-sm bg-black/80">
              <ChevronRight className="w-4 h-4 text-neon-blue" />
              <input 
                type="text" 
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="PROMPT..."
                className="flex-1 bg-transparent outline-none text-xs sm:text-sm text-neon-blue font-mono"
              />
            </form>
          </section>
        )}
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
