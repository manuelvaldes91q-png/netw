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
  const antennaNodes = data.current.filter(n => 
    n.host.toUpperCase().includes('ANTEN') || 
    n.host.toUpperCase().includes('MAP') || 
    n.host.toUpperCase().includes('CPE') ||
    n.host.toUpperCase().includes('AP-') ||
    n.host.toUpperCase().includes('RAD') ||
    n.host.toUpperCase().includes('LINK') ||
    n.host.toUpperCase().includes('TX') ||
    n.host.toUpperCase().includes('RX')
  );
  const otherNodes = data.current.filter(n => !wanNodes.includes(n) && !antennaNodes.includes(n));

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
      <header className="border-b border-terminal-text/20 p-2 sm:p-4 flex flex-col sm:flex-row justify-between items-center z-10 bg-black/60 backdrop-blur-md gap-2 sm:gap-3">
        <div className="flex items-center justify-between w-full sm:w-auto">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 sm:w-5 sm:h-5 text-neon-green terminal-glow" />
            <h1 className="text-xs sm:text-lg font-bold tracking-widest uppercase terminal-glow text-neon-green">MikroWatch</h1>
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
            {/* TOP: WAN NODES (HORIZON) */}
            <section className="p-3 sm:p-6 bg-black/40 border-b border-white/10 overflow-x-auto scrollbar-none">
              <div className="flex items-center justify-between mb-3 px-1 sm:px-2">
                <div className="flex items-center gap-2 sm:gap-3">
                  <Shield className="w-3 h-3 sm:w-4 sm:h-4 text-neon-green" />
                  <span className="text-[10px] sm:text-[12px] font-black uppercase tracking-[0.2em] sm:tracking-[0.3em] text-neon-green">Backbone_WAN</span>
                </div>
                <span className="text-[8px] sm:text-[10px] font-mono opacity-40">{wanNodes.length}_ACTV</span>
              </div>

              <div className="flex gap-3 sm:gap-4 pb-1 min-w-full">
                {wanNodes.map((item) => (
                  <motion.div
                    key={item.host}
                    layout
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="min-w-[240px] sm:min-w-[320px] p-4 sm:p-5 border border-white/10 bg-white/[0.03] relative overflow-hidden group rounded-sm shadow-xl"
                  >
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${item.status === 'up' ? 'bg-neon-green shadow-[0_0_15px_rgba(0,255,65,0.4)]' : 'bg-red-500 animate-pulse'}`} />
                    <div className="flex justify-between items-start mb-2 sm:mb-3">
                      <span className="text-[10px] sm:text-xs font-black text-white truncate pr-2">{item.host}</span>
                      <span className={`text-[8px] sm:text-[9px] font-black px-1.5 py-0.5 rounded border ${
                        item.status === 'up' ? 'bg-neon-green/10 text-neon-green border-neon-green/30' : 'bg-red-500/10 text-red-500 border-red-500/30 animate-pulse'
                      }`}>
                        {item.status.toUpperCase()}
                      </span>
                    </div>
                    <p className={`text-[10px] sm:text-xs font-bold truncate ${item.status === 'up' ? 'text-white/60' : 'text-red-400'}`}>
                      {item.message}
                    </p>
                  </motion.div>
                ))}
              </div>
            </section>

            {/* BOTTOM SPLIT: ANTENNAS & CONFIG */}
            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-black/20">
              {/* ANTENNA MONITORING */}
              <section className="flex-1 flex flex-col p-3 sm:p-5 overflow-y-auto border-r border-white/5 scrollbar-thin">
                <div className="flex items-center justify-between mb-4 sm:mb-5 opacity-50 px-1">
                  <div className="flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-neon-blue" />
                    <span className="text-[10px] sm:text-[13px] font-black uppercase tracking-[0.2em] text-neon-blue">Antenna_NOC_Grid</span>
                  </div>
                  <span className="text-[8px] font-mono">{antennaNodes.length}_TOTAL</span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2 sm:gap-3">
                  {antennaNodes.map((item) => (
                    <motion.div
                      key={item.host}
                      layout
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="p-3 border border-white/10 bg-black/40 relative overflow-hidden rounded-sm group hover:border-neon-blue/40 transition-all"
                    >
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${item.status === 'up' ? 'bg-neon-blue shadow-[0_0_10px_rgba(0,163,255,0.4)]' : 'bg-red-500 animate-pulse'}`} />
                      <div className="flex justify-between items-start mb-1.5">
                         <span className="text-[10px] sm:text-xs font-black text-white/90 truncate pr-1" title={item.host}>{item.host}</span>
                         <span className={`text-[7px] sm:text-[8px] font-black px-1 rounded ${
                           item.status === 'up' ? 'text-neon-blue' : 'text-red-500 animate-pulse'
                         }`}>
                           {item.status.toUpperCase()}
                         </span>
                      </div>
                      <div className="flex justify-between items-end">
                        <div className="space-y-0.5 max-w-[70%]">
                          <p className={`text-[8px] sm:text-[10px] font-bold truncate ${item.status === 'up' ? 'text-white/40' : 'text-red-400'}`}>{item.message}</p>
                        </div>
                        <div className="flex items-center gap-1 opacity-20">
                          <Clock className="w-2 h-2" />
                          <span className="text-[7px] font-mono">{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </section>

              {/* CONFIG SIDEBAR */}
              <aside className="hidden xs:block w-full lg:w-[400px] p-4 sm:p-6 bg-black/40 overflow-y-auto scrollbar-thin border-l border-white/5">
                <div className="flex items-center gap-2 mb-4 opacity-40">
                  <Code className="w-4 h-4 text-neon-amber" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neon-amber">Config_Engine</span>
                </div>
                <div className="p-4 bg-black/60 rounded-sm border border-white/10 space-y-4">
                  <div className="border-b border-white/5 pb-3">
                    <p className="text-neon-blue font-black uppercase text-[9px] mb-2">[# TEST_CMD]</p>
                    <code className="block break-all leading-relaxed bg-blue-950/20 p-3 rounded-sm border border-neon-blue/30 text-[9px] font-mono">
                      {`/tool fetch url="http://${window.location.hostname}:3000/api/mikrotik/webhook?host=WAN1&status=up" keep-result=no`}
                    </code>
                  </div>
                </div>
              </aside>
            </div>
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
