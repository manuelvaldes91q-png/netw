import { useEffect, useState, useRef, FormEvent } from 'react';
import { Terminal, Shield, Wifi, Cpu, Clock, Activity, Bell, ChevronRight, Settings, Code, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface MikrotikStatus {
  host: string;
  ip?: string;
  status: 'up' | 'down';
  message: string;
  timestamp: string;
  uptime?: number;
}

interface MonitorData {
  current: MikrotikStatus[];
  logs: MikrotikStatus[];
  config: {
    telegramConfigured: boolean;
    telegramChatIds: string;
  };
}

export default function App() {
  const [data, setData] = useState<MonitorData>({ 
    current: [], 
    logs: [], 
    config: { telegramConfigured: false, telegramChatIds: '' } 
  });
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [command, setCommand] = useState('');
  const [terminalOutput, setTerminalOutput] = useState<string[]>(['MikroWatch OS v2.0.5 NOC Inicializado...', 'Sistema: PASS', 'Red: SEGURA', 'Esperando broadcast del MikroTik...']);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'logs' | 'settings'>('dashboard');
  const [isUpdatingConfig, setIsUpdatingConfig] = useState(false);
  const [newChatIds, setNewChatIds] = useState('');
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (data.config.telegramChatIds !== undefined) {
      setNewChatIds(data.config.telegramChatIds);
    }
  }, [data.config.telegramChatIds]);

  const handleUpdateConfig = async () => {
    setIsUpdatingConfig(true);
    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramChatIds: newChatIds })
      });
      if (response.ok) {
        alert('Configuración guardada correctamente.');
      }
    } catch (err) {
      console.error(err);
      alert('Error al guardar configuración.');
    } finally {
      setIsUpdatingConfig(false);
    }
  };

  // Categorize nodes
  const wanNodes = data.current.filter(n => n.host.toUpperCase().includes('WAN'));
  const antennaNodes = data.current.filter(n => 
    !n.host.toUpperCase().includes('WAN') && 
    n.host !== 'MIKROTIK_SYSTEM'
  );

  const formatVE = (dateStr?: string) => {
    return new Date(dateStr || new Date()).toLocaleString('es-VE', {
      timeZone: 'America/Caracas',
      hour12: false,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
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
          `[${formatVE()}] >> FLUJO_EVENTOS_CONECTADO`,
          `[${formatVE()}] >> ENDPOINT_LOCAL: ${window.location.hostname}`,
          `[${formatVE()}] >> ESTADO: SINCRONIZADO`
        ]);
      };
      eventSource.onmessage = (event) => {
        try {
          const result = JSON.parse(event.data);
          setData(result);
          if (result.logs.length > 0) {
            const lastLog = result.logs[0];
            setTerminalOutput(prev => {
              const logMsg = `[${formatVE(lastLog.timestamp)}] >> ALERTA: ${lastLog.host} está ${lastLog.status === 'up' ? 'EN LÍNEA' : 'FUERA DE LÍNEA'} - ${lastLog.message}`;
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
        setTerminalOutput(prev => [...prev, '!! CONEXIÓN_PERDIDA: Intentando reconexión...']);
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
      response = 'Comandos disponibles: status, troubleshoot, check-url, config, clear, help, about, tabs';
    } else if (cmd === 'status') {
      response = `HOSTS_ACTIVOS: ${data.current.filter(h => h.status === 'up').length}, INACTIVOS: ${data.current.filter(h => h.status === 'down').length}`;
    } else if (cmd === 'check-url') {
      response = `TU_URL_WEBHOOK: ${window.location.origin}/api/mikrotik/webhook`;
    } else if (cmd === 'troubleshoot') {
      response = '1. ERROR 302 FOUND: El link de "ais-dev" está protegido. SOLUCIÓN: Despliega como Pública. 2. FORMATO URL: Debe tener "?" después de "webhook". 3. SSL: Usa check-certificate=no.';
    } else if (cmd === 'config') {
      response = `INTEGRACIÓN_TELEGRAM: ${data.config?.telegramConfigured ? 'HABILITADA' : 'DESHABILITADA'}`;
    } else if (cmd === 'clear') {
      setTerminalOutput(['>> Buffers limpiados. Escuchando...']);
      setCommand('');
      return;
    } else if (cmd === 'tabs') {
      response = 'Cambiando layouts. Usa los botones superiores.';
    } else if (cmd === 'about') {
      response = 'MikroWatch v2.0 - Monitoreo de Alto Rendimiento para MikroTik.';
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
               <Activity className={`w-5 h-5 sm:w-6 sm:h-6 ${!mikrotikSystem || mikrotikSystem.status === 'down' ? 'text-red-500 animate-pulse' : 'text-neon-green animate-pulse'}`} />
               <div className="flex flex-col">
                  <span className={`text-[9px] sm:text-[11px] font-black tracking-tighter leading-none ${!mikrotikSystem || mikrotikSystem.status === 'down' ? 'text-red-500' : 'text-neon-green'}`}>
                    SYSTEM_PULSE: {mikrotikSystem?.status.toUpperCase() || 'WAITING'}
                  </span>
                  {mikrotikSystem && (
                    <span className="text-[7px] sm:text-[9px] opacity-60 leading-none mt-1">LAST: {formatVE(mikrotikSystem.timestamp)}</span>
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
            Panel
          </button>
          <button 
            onClick={() => setActiveTab('logs')}
            className={`flex-1 sm:flex-none px-4 sm:px-6 py-1.5 sm:py-2 text-[9px] sm:text-[10px] uppercase font-black tracking-widest transition-all rounded ${activeTab === 'logs' ? 'bg-neon-blue/10 text-neon-blue border border-neon-blue/20' : 'opacity-40'}`}
          >
            Logs
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={`flex-1 sm:flex-none px-4 sm:px-6 py-1.5 sm:py-2 text-[9px] sm:text-[10px] uppercase font-black tracking-widest transition-all rounded ${activeTab === 'settings' ? 'bg-neon-amber/10 text-neon-amber border border-neon-amber/20' : 'opacity-40'}`}
          >
            Ajustes
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
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* TOP MONITORING AREA: WAN CORE */}
            <section className="p-3 sm:p-6 bg-black/40 border-b border-white/10 overflow-x-auto scrollbar-none shrink-0">
              <div className="flex items-center justify-between mb-3 sm:mb-4 px-1 sm:px-2 opacity-50">
                <div className="flex items-center gap-2 sm:gap-3">
                  <Shield className="w-4 h-4 text-neon-green" />
                  <span className="text-[11px] sm:text-[13px] font-black uppercase tracking-[0.2em] sm:tracking-[0.4em] text-neon-green">Monitoreo_WAN_Principal</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono text-neon-green">{wanNodes.filter(n => n.status === 'up').length} ACTIVO</span>
                    <span className="text-[9px] font-mono text-white/20">|</span>
                    <span className={`text-[9px] font-mono ${wanNodes.filter(n => n.status === 'down').length > 0 ? 'text-red-500 animate-pulse' : 'text-white/40'}`}>
                      {wanNodes.filter(n => n.status === 'down').length} CAÍDO
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-4 pb-2">
                {wanNodes.map((item) => {
                  const ispLabel = item.host.toUpperCase().includes('WAN1') ? 'AIRTEK' : 
                                  item.host.toUpperCase().includes('WAN2') ? 'INTER' : null;
                  
                  return (
                    <motion.div
                      key={item.host}
                      layout
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="min-w-[300px] sm:min-w-[420px] p-4 sm:p-6 border border-white/10 bg-white/[0.03] relative overflow-hidden group rounded-sm shadow-2xl hover:border-neon-green/30 transition-colors"
                    >
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${item.status === 'up' ? 'bg-neon-green shadow-[0_0_20px_rgba(0,255,65,0.4)]' : 'bg-red-500 animate-pulse shadow-[0_0_30px_rgba(239,68,68,0.6)]'}`} />
                      
                      <div className="flex flex-col gap-3">
                        <div className="flex justify-between items-start">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs sm:text-lg font-black text-white tracking-[0.1em] uppercase">{item.host}</span>
                              {ispLabel && (
                                <span className="text-[8px] sm:text-[9px] font-black px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-white/40 tracking-widest">
                                  {ispLabel}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 opacity-40">
                              <Info className="w-3 h-3" />
                              <span className="text-[9px] uppercase font-bold tracking-tighter">
                                {item.ip || (item.host.includes('1') ? '8.8.8.8' : '9.9.9.9')}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex flex-col items-end gap-1">
                             <span className="text-[8px] font-black opacity-30 tracking-[0.2em]">DISPONIBILIDAD</span>
                             <span className={`text-xs sm:text-sm font-mono font-black ${
                               (item.uptime || 0) > 99 ? 'text-neon-green' : 
                               (item.uptime || 0) > 95 ? 'text-neon-amber' : 'text-red-500'
                             }`}>
                               {item.uptime !== undefined ? `${item.uptime}%` : '---'}
                             </span>
                          </div>
                        </div>

                        <div className="flex justify-between items-center mt-1">
                           <div className="flex items-center gap-1.5 opacity-40">
                             <Clock className="w-4 h-4 text-neon-green" />
                             <span className="text-[11px] sm:text-xs font-mono font-bold">{formatVE(item.timestamp)}</span>
                           </div>
                           <span className={`text-[9px] font-black px-3 py-1 rounded border tracking-widest ${
                             item.status === 'up' ? 'bg-neon-green/10 text-neon-green border-neon-green/30' : 'bg-red-500/10 text-red-500 border-red-500/30 animate-pulse'
                           }`}>
                             {item.status === 'up' ? 'ACTIVO' : 'CRÍTICO'}
                           </span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </section>

            {/* ANTENNA MONITORING: FULL WIDTH LIST */}
            <section className="flex-1 p-3 sm:p-6 flex flex-col gap-4 overflow-hidden bg-black/10">
              <div className="flex items-center justify-between mb-2 opacity-50 px-1 sm:px-2">
                <div className="flex items-center gap-2 sm:gap-3">
                  <Wifi className="w-4 h-4 text-neon-blue" />
                  <span className="text-[11px] sm:text-[13px] font-black uppercase tracking-[0.2em] sm:tracking-[0.4em] text-neon-blue">Red_de_Antenas_NOC</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono text-neon-blue">{antennaNodes.length} NODOS</span>
                  {antennaNodes.filter(n => n.status === 'down').length > 0 && (
                    <>
                      <span className="text-[9px] font-mono text-white/20">|</span>
                      <span className="text-[9px] font-mono text-red-500 animate-pulse">{antennaNodes.filter(n => n.status === 'down').length} CRÍTICO</span>
                   </>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto scrollbar-thin pr-1 pb-4">
                 <div className="flex flex-col gap-2">
                   {antennaNodes.map((item) => (
                     <motion.div
                       key={item.host}
                       layout
                       initial={{ opacity: 0, x: -10 }}
                       animate={{ opacity: 1, x: 0 }}
                       className={`flex flex-col md:flex-row md:items-center justify-between p-3 sm:p-4 border relative overflow-hidden rounded-sm group transition-all gap-4 ${
                         item.status === 'up' ? 'border-white/5 bg-white/[0.02] hover:border-neon-blue/40' : 'border-red-500/30 bg-red-950/20 shadow-[0_0_20px_rgba(239,68,68,0.1)]'
                       }`}
                     >
                       <div className={`absolute left-0 top-0 bottom-0 w-1 ${item.status === 'up' ? 'bg-neon-blue/40' : 'bg-red-500 animate-pulse'}`} />
                       
                       <div className="flex items-start gap-4 min-w-[200px]">
                         <div className="flex flex-col">
                           <span className={`text-[12px] sm:text-sm font-black tracking-tight ${item.status === 'up' ? 'text-white/90' : 'text-red-400'}`}>
                             {item.host}
                           </span>
                           {item.ip && <span className="text-[10px] opacity-40 font-mono tracking-tighter">{item.ip}</span>}
                         </div>
                       </div>

                       <div className="flex-1 min-w-0">
                         <p className={`text-[10px] sm:text-xs font-medium leading-relaxed opacity-60 ${item.status === 'up' ? '' : 'text-red-300'}`}>
                           {item.message}
                         </p>
                         <div className="flex items-center gap-2 mt-1 opacity-20 group-hover:opacity-40 transition-opacity">
                           <Clock className="w-3 h-3 text-neon-blue" />
                           <span className="text-[9px] font-mono font-bold">{formatVE(item.timestamp)}</span>
                         </div>
                       </div>

                       <div className="flex items-center justify-between md:justify-end gap-6 sm:gap-12 border-t border-white/5 pt-3 md:pt-0 md:border-0">
                         {/* DISPONIBILIDAD */}
                         <div className="flex flex-col items-start md:items-end gap-1">
                            <span className="text-[8px] font-black opacity-30 tracking-[0.2em] whitespace-nowrap">DISPONIBILIDAD_15D</span>
                            <div className="flex items-center gap-3">
                               <div className="hidden xs:block h-1 w-20 bg-white/5 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full transition-all duration-1000 ${
                                      (item.uptime || 0) > 99 ? 'bg-neon-blue' : 
                                      (item.uptime || 0) > 95 ? 'bg-neon-amber' : 'bg-red-500'
                                    }`} 
                                    style={{ width: `${item.uptime || 0}%` }} 
                                  />
                               </div>
                               <span className={`text-base font-mono font-black ${
                                 (item.uptime || 0) > 99 ? 'text-neon-blue' : 
                                 (item.uptime || 0) > 95 ? 'text-neon-amber' : 'text-red-500'
                               }`}>
                                 {item.uptime !== undefined ? `${item.uptime}%` : '---'}
                               </span>
                            </div>
                         </div>

                         <span className={`text-[7px] sm:text-[9px] font-black px-4 py-1.5 rounded border tracking-[0.2em] whitespace-nowrap ${
                           item.status === 'up' ? 'bg-neon-blue/10 text-neon-blue border-neon-blue/30' : 'bg-red-500/10 text-red-500 border-red-500/30 animate-pulse'
                         }`}>
                           {item.status === 'up' ? 'ACTIVO' : 'ERROR'}
                         </span>
                       </div>
                     </motion.div>
                   ))}
                   
                   {antennaNodes.length === 0 && (
                    <div className="py-12 flex flex-col items-center justify-center opacity-10 border border-dashed border-white/10">
                      <Wifi className="w-12 h-12 mb-2" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Esperando Métricas de Antenas</span>
                    </div>
                   )}
                 </div>
              </div>
            </section>
          </div>
        ) : activeTab === 'logs' ? (
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
        ) : (
          /* SETTINGS VIEW */
          <section className="flex-1 p-4 sm:p-8 overflow-y-auto bg-black/40">
            <div className="max-w-2xl mx-auto space-y-8">
              <div className="flex items-center gap-3 opacity-50 mb-6">
                <Settings className="w-6 h-6 text-neon-amber" />
                <span className="text-lg font-black uppercase tracking-[0.3em] text-neon-amber">Configuración del Sistema</span>
              </div>

              {/* TELEGRAM MANAGEMENT */}
              <div className="p-6 border border-white/10 bg-white/[0.02] rounded-sm space-y-6 shadow-2xl">
                 <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                       <div className={`w-3 h-3 rounded-full ${data.config?.telegramConfigured ? 'bg-neon-green shadow-[0_0_10px_rgba(0,255,65,0.5)]' : 'bg-red-500'}`} />
                       <h3 className="font-black uppercase tracking-widest text-sm">Notificaciones de Telegram</h3>
                    </div>
                    {data.config?.telegramConfigured && <Bell className="w-4 h-4 text-neon-green" />}
                 </div>

                 <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-black opacity-40 uppercase tracking-widest mb-2">IDs de Mensajería (Chat IDs)</label>
                      <textarea 
                        value={newChatIds}
                        onChange={(e) => setNewChatIds(e.target.value)}
                        placeholder="Ingresa los IDs separados por comas. Ejemplo: 123456, 789012"
                        className="w-full bg-black/60 border border-white/10 rounded p-4 font-mono text-xs focus:border-neon-amber/50 focus:outline-none transition-colors min-h-[100px] text-neon-amber"
                      />
                      <p className="text-[10px] opacity-30 mt-2 italic">* Puedes agregar múltiples IDs separados por comas para que las alertas lleguen a varias personas.</p>
                      <p className="text-[10px] opacity-30 mt-1 italic">* En tu VPS, estos se guardan en el archivo monitoring_logs.json automáticamente.</p>
                    </div>

                    <button 
                      onClick={handleUpdateConfig}
                      disabled={isUpdatingConfig}
                      className="px-8 py-3 bg-neon-amber text-black font-black text-[10px] uppercase tracking-widest rounded-sm hover:opacity-90 disabled:opacity-50 transition-all font-sans"
                    >
                      {isUpdatingConfig ? 'Guardando...' : 'Guardar IDs de Telegram'}
                    </button>
                 </div>
              </div>

              {/* MIKROTIK HELP */}
              <div className="p-6 border border-white/10 bg-white/[0.02] rounded-sm space-y-4 shadow-xl">
                 <div className="flex items-center gap-3">
                    <Code className="w-5 h-5 text-neon-blue" />
                    <h3 className="font-black uppercase tracking-widest text-sm text-neon-blue">MikroTik Webhook Config</h3>
                 </div>
                 
                 <div className="space-y-3">
                    <p className="text-xs opacity-60">Usa esta URL en tus Netwatch scripts:</p>
                    <div className="group relative">
                       <code className="block break-all bg-black/80 font-mono text-[10px] p-4 border border-neon-blue/20 text-neon-blue rounded overflow-hidden select-all">
                         {`http://${window.location.host}/api/mikrotik/webhook?host=NODO_NOMBRE&status=up`}
                       </code>
                    </div>
                    <div className="p-4 bg-blue-950/20 border border-neon-blue/10 rounded sm space-y-2">
                       <p className="text-[9px] font-black text-neon-blue uppercase">Instrucciones de Uso:</p>
                       <ul className="text-[10px] space-y-2 opacity-60 list-disc list-inside">
                         <li>Accede a MikroTik via Winbox</li>
                         <li>Ve a <span className="font-bold">Tools {">"} Netwatch</span></li>
                         <li>Crea un nuevo host para monitorear</li>
                         <li>En la pestaña <span className="text-neon-green">Up</span>, pega el script fetch con tu URL</li>
                         <li>En la pestaña <span className="text-red-500">Down</span>, pega la misma URL pero con <span className="font-bold underline">status=down</span></li>
                       </ul>
                    </div>
                 </div>
              </div>
            </div>
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
