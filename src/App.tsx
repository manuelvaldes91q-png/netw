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
      <main className="flex-1 overflow-hidden flex flex-col z-10 relative">
        
        {/* TOP: HORIZONTAL LIVE SYSTEM NODES */}
        <section className={`p-6 bg-black/40 border-b border-white/10 transition-all duration-500 overflow-y-auto max-h-[50%] ${activeTab === 'stats' ? 'block' : 'hidden lg:block'}`}>
          <div className="flex items-center justify-between mb-6 px-2">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Shield className="w-5 h-5 text-neon-green animate-pulse" />
                <div className="absolute inset-0 bg-neon-green/20 blur-lg rounded-full" />
              </div>
              <span className="text-[14px] font-black uppercase tracking-[0.3em] text-neon-green">Live_Network_NOC</span>
            </div>
            <div className="flex items-center gap-4">
               <div className="hidden sm:flex items-center gap-2 text-[10px] text-white/40 font-mono">
                 <div className="w-2 h-2 rounded-full bg-neon-green animate-ping" />
                 REALTIME_SYNC_ENABLED
               </div>
               <span className="text-[10px] font-mono bg-white/5 px-3 py-1 rounded border border-white/10">{data.current.length} ACTIVE_NODES</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 pb-2">
            <AnimatePresence mode="popLayout">
              {data.current.map((item) => (
                <motion.div
                  key={item.host}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-5 border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent relative overflow-hidden group hover:border-neon-blue/40 transition-all duration-500 rounded-sm shadow-2xl"
                >
                  <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${item.status === 'up' ? 'bg-neon-green shadow-[0_0_20px_rgba(0,255,65,0.5)]' : 'bg-red-500 animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.5)]'}`} />
                  
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-bold opacity-30 uppercase tracking-[0.2em] mb-1">Target_Node</span>
                      <span className="text-xl font-black text-white group-hover:text-neon-blue transition-colors tracking-tight">{item.host}</span>
                    </div>
                    <span className={`text-[10px] font-black px-3 py-1 rounded border shadow-inner ${
                      item.status === 'up' ? 'bg-neon-green/10 text-neon-green border-neon-green/30' : 'bg-red-500/10 text-red-500 border-red-500/30 animate-pulse'
                    }`}>
                      {item.status.toUpperCase()}
                    </span>
                  </div>
                  
                  <div className="mt-6 flex justify-between items-center border-t border-white/5 pt-4">
                    <div className="flex-1">
                      <p className={`text-base font-bold truncate ${item.status === 'up' ? 'text-white/70' : 'text-red-400'}`}>
                        {item.message}
                      </p>
                      <div className="flex items-center gap-2 opacity-20 mt-1">
                        <Clock className="w-3 h-3" />
                        <span className="text-[9px] uppercase font-mono tracking-tighter italic">Last_Signal: {new Date(item.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </div>
                    <Activity className={`w-10 h-10 opacity-5 group-hover:opacity-20 transition-opacity ${item.status === 'up' ? 'text-neon-green' : 'text-red-500'}`} />
                  </div>
                  
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/5 overflow-hidden">
                    <motion.div 
                      className={`h-full ${item.status === 'up' ? 'bg-neon-green/30' : 'bg-red-500/30'}`}
                      initial={{ width: "0%" }}
                      animate={{ width: "100%" }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            
            {data.current.length === 0 && (
              <div className="col-span-full py-12 border border-dashed border-white/10 rounded-sm flex flex-col items-center justify-center opacity-30">
                <Wifi className="w-10 h-10 mb-3 animate-pulse" />
                <p className="text-[12px] uppercase font-black tracking-[0.4em]">Listening_For_Broadcast...</p>
              </div>
            )}
          </div>
        </section>

        {/* BOTTOM: SPLIT SECTION */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-black/20">
          
          {/* TERMINAL FEED */}
          <section className={`flex-1 flex flex-col border-r border-white/5 p-4 transition-all duration-300 ${activeTab === 'terminal' ? 'flex' : 'hidden lg:flex'}`}>
            <div className="flex items-center justify-between mb-4 opacity-40 border-b border-white/10 pb-2">
               <div className="flex items-center gap-2">
                 <Bell className="w-3 h-3" />
                 <span className="text-[10px] font-bold uppercase tracking-widest text-neon-blue">Real-time_Log_Stream</span>
               </div>
               <span className="text-[9px] font-mono">BUFFER_SIZE: 50_LINES</span>
            </div>
            
            <div 
              ref={outputRef}
              className="flex-1 overflow-y-auto space-y-1.5 mb-4 scrollbar-thin scrollbar-thumb-white/10 pr-2 font-mono scroll-smooth"
            >
              {terminalOutput.map((line, i) => (
                 <div key={i} className="flex gap-3 items-start animate-in fade-in slide-in-from-left-2 duration-300">
                   <span className="text-[9px] opacity-20 font-mono mt-0.5 min-w-[30px]">[{i.toString().padStart(3, '0')}]</span>
                   <p className={`text-[11px] leading-relaxed break-all ${
                     line.startsWith('!!') ? 'text-neon-amber' : 
                     line.startsWith('>>') ? 'text-neon-blue' : 
                     line.startsWith('>') ? 'text-neon-green font-black' : 'opacity-80'
                   }`}>
                     {line}
                   </p>
                 </div>
              ))}
            </div>
            
            <form onSubmit={handleCommand} className="flex items-center gap-3 p-3 border border-white/10 rounded-sm bg-black/40 focus-within:border-neon-green/40 transition-all">
              <ChevronRight className="w-4 h-4 text-neon-green" />
              <input 
                type="text" 
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="EXECUTE COMMAND (help, status, config)..."
                className="flex-1 bg-transparent border-none outline-none text-xs text-neon-green placeholder:text-white/10 font-mono"
                autoFocus
              />
            </form>
          </section>

          {/* SIDEBAR: DEPLOYMENT ENGINE */}
          <aside className="w-full lg:w-[450px] p-6 overflow-y-auto scrollbar-thin bg-black/40 border-l border-white/5">
            <div className="flex items-center gap-3 mb-6 opacity-40">
              <Code className="w-5 h-5 text-neon-amber" />
              <span className="text-[12px] font-bold uppercase tracking-[0.2em] text-neon-amber">Sync_Engine_Deployment</span>
            </div>
            
            <div className="space-y-6">
               <div className="p-6 bg-black/60 rounded-sm border border-white/10 space-y-6 select-all">
                 <div className="border-b border-white/5 pb-4">
                   <div className="flex items-center justify-between mb-3">
                     <p className="text-neon-blue font-black uppercase text-[11px] tracking-widest">[# NODE_PRIMARY_SYNC]</p>
                     <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                     </div>
                   </div>
                   <div className="relative group">
                     <div className="absolute -top-3 right-0 text-[8px] text-green-400 font-black uppercase tracking-wider bg-black px-2 py-0.5 border border-green-500/30">VERIFIED_CMD</div>
                     <code className="opacity-90 block break-all leading-relaxed bg-blue-950/30 p-4 rounded-sm border border-neon-blue/20 text-[10px] select-all font-mono shadow-inner group-hover:border-neon-blue/60 transition-all cursor-pointer">
                       {`/tool fetch url="http://${window.location.hostname}:3000/api/mikrotik/webhook?host=WAN1&status=up" keep-result=no`}
                     </code>
                   </div>
                   <p className="text-[9px] text-neon-amber font-black uppercase mt-3 tracking-widest italic animate-pulse">!! FAST_TEST: PASTE IN WINBOX TERMINAL</p>
                 </div>

                 <div className="opacity-60 hover:opacity-100 transition-opacity">
                   <p className="text-white/60 mb-3 font-bold uppercase text-[10px] tracking-widest">[# PERMANENT_NETWATCH]</p>
                   <code className="opacity-80 block break-all leading-relaxed bg-white/5 p-4 rounded-sm border border-white/10 text-[9px] select-all font-mono">
                     {`/tool netwatch add host=8.8.8.8 interval=1m up-script="/tool fetch url=\\"http://${window.location.hostname}:3000/api/mikrotik/webhook?host=WAN1&status=up\\" keep-result=no" comment="MON_WAN1"`}
                   </code>
                 </div>
               </div>

               <div className="p-4 bg-neon-amber/5 border border-neon-amber/10 rounded-sm flex gap-3">
                  <Info className="w-5 h-5 text-neon-amber shrink-0 mt-0.5" />
                  <p className="text-[10px] text-white/60 leading-relaxed font-medium">
                    This instance is running at <span className="text-white font-bold">{window.location.hostname}</span>. 
                    Ensure port <span className="text-neon-amber font-bold">3000</span> is open in your VPS firewall.
                  </p>
               </div>
            </div>
          </aside>
        </div>
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
