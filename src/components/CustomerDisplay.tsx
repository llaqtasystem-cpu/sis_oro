import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Coins, Sparkles, User, RefreshCw, Scale, ArrowRight, ShieldCheck } from 'lucide-react';

const formatNumber = (num: number, decimals: number = 2) => {
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
};

export default function CustomerDisplay() {
  const [currentHash, setCurrentHash] = useState(window.location.hash);
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [selectedBranchName, setSelectedBranchName] = useState<string>('');
  const [customerData, setCustomerData] = useState<{ cart: any[]; header: any } | null>(null);
  const [activeTabName, setActiveTabName] = useState<string>('');

  // Listen to hash changes
  useEffect(() => {
    const handleHashChange = () => {
      setCurrentHash(window.location.hash);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Parse parameters from hash
  const { branchId, branchName, username } = parseParams(currentHash);

  // Fallback to select branch if not provided
  useEffect(() => {
    if (!branchId) {
      fetch('/api/branches')
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setBranches(data.filter((b) => b.active !== 0));
          }
        })
        .catch((err) => console.error('Error fetching branches for customer view:', err));
    } else {
      setSelectedBranchId(branchId);
      setSelectedBranchName(branchName || 'Sucursal');
    }
  }, [branchId, branchName]);

  // Real-time synchronization
  useEffect(() => {
    if (!selectedBranchId) return;

    // 1. Initial and Poll synchronization
    const pollSync = () => {
      const urlSuffix = username ? `?username=${encodeURIComponent(username)}` : '';
      fetch(`/api/branches/${selectedBranchId}/customer-display${urlSuffix}`)
        .then((res) => {
          if (res.ok) return res.json();
          throw new Error('Not ok');
        })
        .then((data) => {
          if (data) {
            setCustomerData(data);
          }
        })
        .catch((err) => console.warn('Sync poll error:', err));
    };

    pollSync();
    const interval = setInterval(pollSync, 1500);

    // 2. Same browser BroadcastChannel (Instant matching)
    let bc: BroadcastChannel | null = null;
    try {
      const channelSuffix = username ? `_${username}` : '';
      bc = new BroadcastChannel(`customer_display_${selectedBranchId}${channelSuffix}`);
      bc.onmessage = (event) => {
        if (event.data) {
          setCustomerData(event.data);
        }
      };
    } catch (e) {
      console.warn('BroadcastChannel error:', e);
    }

    return () => {
      clearInterval(interval);
      if (bc) bc.close();
    };
  }, [selectedBranchId, username]);

  // Handle manual branch selection when no branchId is passed in URL
  const handleSelectBranch = (id: string, name: string) => {
    setSelectedBranchId(id);
    setSelectedBranchName(name);
    const userParam = username ? `&username=${encodeURIComponent(username)}` : '';
    window.location.hash = `#customer-view?branchId=${id}&branchName=${encodeURIComponent(name)}${userParam}`;
  };

  const cart = customerData?.cart || [];
  const header = customerData?.header || null;

  // Manual Select Branch Screen
  if (!selectedBranchId) {
    return (
      <div className="min-h-screen bg-[#09090b] text-zinc-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-zinc-900 border border-white/5 p-8 rounded-3xl shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="p-3 bg-amber-500/10 text-amber-500 rounded-full w-fit mx-auto border border-amber-500/20">
              <Coins className="w-8 h-8 animate-pulse" />
            </div>
            <h1 className="text-xl font-black text-zinc-100 tracking-tight">Pantalla Externa de Cliente</h1>
            <p className="text-xs text-zinc-500">Seleccione la sucursal de la que desea proyectar o duplicar la vista del cliente en este dispositivo.</p>
          </div>

          <div className="space-y-3">
            <label className="text-[9px] font-extrabold uppercase text-zinc-500 tracking-wider">Sucursales Activas</label>
            {branches.length === 0 ? (
              <div className="py-4 text-center text-zinc-600 text-xs">Cargando sucursales...</div>
            ) : (
              <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto pr-1">
                {branches.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => handleSelectBranch(b.id, b.name)}
                    className="w-full text-left p-4 rounded-2xl bg-zinc-950 hover:bg-zinc-800 border border-white/5 hover:border-amber-500/30 transition-all flex items-center justify-between group cursor-pointer"
                  >
                    <div>
                      <p className="font-bold text-sm text-zinc-200 group-hover:text-amber-400 transition-colors">{b.name}</p>
                      <p className="text-[10px] text-zinc-500 font-mono italic">{b.location || 'Sin ubicación registrada'}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-amber-400 group-hover:translate-x-1 transition-all" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Active Customer display
  return (
    <div className="min-h-screen bg-[#070708] text-zinc-100 font-sans flex flex-col justify-between select-none">
      {/* Top Professional Header */}
      <header className="px-8 py-5 bg-zinc-900/40 border-b border-white/5 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 shrink-0 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center text-amber-400 font-black shadow-inner">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[8px] font-extrabold text-amber-500 uppercase tracking-widest block bg-amber-500/5 px-2 py-0.5 rounded border border-amber-500/10 w-fit">
              Pantalla del Cliente
            </span>
            <h1 className="text-base font-black text-zinc-100 tracking-tight mt-0.5">
              {selectedBranchName.toUpperCase()}
            </h1>
          </div>
          {username && (
            <div className="bg-zinc-800/40 border border-white/5 py-1 px-3 rounded-xl flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-blue-400 font-bold animate-pulse" />
              <div className="text-left leading-none">
                <span className="text-[7.5px] font-bold text-zinc-500 block uppercase tracking-wide">Asesor</span>
                <span className="text-xs font-black text-zinc-200 capitalize">{username}</span>
              </div>
            </div>
          )}
        </div>

        {/* Real-time Indicator Tag */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full text-[10px] font-black tracking-widest text-emerald-400 uppercase select-none">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            Sincronizado
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-8 grid grid-cols-1 xl:grid-cols-12 gap-8 items-start overflow-hidden">
        <AnimatePresence mode="wait">
          {cart.length === 0 ? (
            /* Cinematic Waiting State */
            <motion.div
              key="waiting"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="col-span-12 flex flex-col items-center justify-center py-20 text-center space-y-6 max-w-2xl mx-auto"
            >
              <div className="relative">
                <div className="absolute inset-0 bg-amber-500/20 blur-3xl rounded-full scale-125 select-none" />
                <div className="relative p-6 bg-zinc-900 border border-white/5 text-amber-400 rounded-3xl shadow-xl w-fit mx-auto skeleton">
                  <Coins className="w-12 h-12" />
                </div>
              </div>
              <div className="space-y-3">
                <h2 className="text-2xl font-black text-zinc-100 tracking-tight">Preparando Valoración de Materiales</h2>
                <div className="flex items-center gap-2 justify-center text-xs text-zinc-400 font-medium">
                  <User className="w-4 h-4 text-amber-500" />
                  <span>Socio / Cliente:</span>
                  <span className="text-zinc-200 font-bold">
                    {header?.clientName || 'Asignando Cliente...'}
                  </span>
                </div>
                {header?.referrerName && (
                  <div className="text-[10px] text-zinc-500 bg-zinc-900 border border-white/5 py-1 px-3 rounded-full w-fit mx-auto font-bold uppercase tracking-wide">
                    Recomendado por: <span className="text-amber-400 font-extrabold">{header.referrerName}</span>
                  </div>
                )}
                <p className="text-sm text-zinc-500 leading-relaxed max-w-md mx-auto pt-2">
                  Su asesor de compras está registrando las piezas y detalles en el sistema. Los pesajes, mermas, niveles de pureza (ley de quilates) y cotizaciones aparecerán reflejados en esta pantalla de forma inmediata.
                </p>
              </div>
              <div className="flex items-center gap-2 bg-amber-500/5 px-4 py-2 rounded-2xl border border-amber-500/10 text-[10px] uppercase font-extrabold tracking-wider text-amber-400">
                <Sparkles className="w-3.5 h-3.5 animate-spin" /> Escaneo y registro en curso por el asesor
              </div>
            </motion.div>
          ) : (
            /* Active Live Detail Mirror */
            <>
              {/* Left Column: Items Detailed Table */}
              <motion.div
                key="table"
                initial={{ opacity: 0, x: -15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="xl:col-span-8 bg-zinc-900/40 border border-white/5 p-6 rounded-3xl shadow-lg space-y-6 h-full flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-white/5 pb-4">
                    <div className="flex items-center gap-2">
                      <Scale className="w-5 h-5 text-amber-500" />
                      <h2 className="text-base font-black text-zinc-100 tracking-tight">Materiales Entregados</h2>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-zinc-500 bg-zinc-950 px-2.5 py-1 rounded-lg">
                      {cart.length} {cart.length === 1 ? 'Pieza' : 'Piezas'}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-white/5 text-[9px] font-extrabold uppercase text-zinc-500 tracking-wider">
                          <th className="py-3 px-3">#</th>
                          <th className="py-3 px-3">Tipo / Pieza</th>
                          <th className="py-3 px-3 text-center">Ley (Pureza)</th>
                          <th className="py-3 px-3 text-right">Peso Final</th>
                          <th className="py-3 px-3 text-right">Precio x Gramo</th>
                          <th className="py-3 px-3 text-right pr-4">Monto (Valor)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {cart.map((item, idx) => (
                          <tr key={idx} className="hover:bg-zinc-800/20 transition-colors group">
                            <td className="py-4 px-3 text-xs font-mono text-zinc-600 font-bold">{idx + 1}</td>
                            <td className="py-4 px-3">
                              <span className="text-sm font-bold text-zinc-200 capitalize">
                                {item.type === 'pieza' ? 'Pieza de Oro' : item.type === 'lote' ? 'Lote de Oro' : item.type}
                              </span>
                            </td>
                            <td className="py-4 px-3 text-center">
                              <span className="mx-auto px-2.5 py-1 bg-amber-500/10 text-amber-500 rounded-lg text-xs font-black font-mono border border-amber-500/20">
                                {formatNumber(item.purity)}%
                              </span>
                            </td>
                            <td className="py-4 px-3 text-right font-mono text-zinc-100 font-bold">
                              {formatNumber(item.finalWeight)}g
                              {item.loss > 0 && (
                                <span className="block text-[9px] text-red-400 font-normal">
                                  Merma: {formatNumber(item.loss)}g ({formatNumber(item.lossPercentage)}%)
                                </span>
                              )}
                            </td>
                            <td className="py-4 px-3 text-right font-mono text-zinc-400 text-xs">
                              {formatNumber(item.pricePerGram)} BS
                            </td>
                            <td className="py-4 px-3 text-right font-mono text-emerald-400 font-black pr-4 text-sm">
                              {formatNumber(item.total)} <span className="text-[10px] font-sans font-bold text-emerald-500">BS</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Left Footer Partner Branding */}
                <div className="pt-6 border-t border-white/5 flex items-center justify-between text-[10px] text-zinc-500">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <span>Transparencia Garantizada por {selectedBranchName}</span>
                  </div>
                  <div className="font-mono">Ref: Cotización oficial en tiempo de balanza</div>
                </div>
              </motion.div>

              {/* Right Column: Calculations & Summaries Panel */}
              <motion.div
                key="summary"
                initial={{ opacity: 0, x: 15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="xl:col-span-4 space-y-6"
              >
                {/* Client / Partner Info Card */}
                <div className="bg-zinc-900 border border-white/5 p-6 rounded-3xl shadow-md space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-2xl border border-blue-500/20">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[8px] font-extrabold text-blue-400 uppercase tracking-widest block">Propietario / Cliente</span>
                      <h3 className="text-sm font-black text-zinc-100 tracking-tight">
                        {header?.clientName || 'Cliente No Registrado'}
                      </h3>
                    </div>
                  </div>

                  {header?.referrerName && (
                    <div className="bg-zinc-950 p-3 rounded-2xl border border-white/5 flex items-center justify-between">
                      <div className="space-y-0.5">
                        <span className="text-[7.5px] font-extrabold text-zinc-500 uppercase tracking-widest block">Recomendado por</span>
                        <span className="text-xs font-bold text-zinc-200">{header.referrerName}</span>
                      </div>
                      <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded text-[9px] font-black uppercase border border-indigo-500/20">
                        Socio Referido
                      </span>
                    </div>
                  )}
                </div>

                {/* Big Calculation Box */}
                <div className="bg-zinc-900 border border-white/5 p-6 rounded-3xl shadow-xl space-y-6 relative overflow-hidden">
                  {/* Subtle Background Accent */}
                  <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 blur-2xl rounded-full select-none" />

                  <div className="border-b border-white/5 pb-4">
                    <span className="text-[8px] font-extrabold text-zinc-500 uppercase tracking-widest block">Tipo de Operación</span>
                    <h4 className="text-sm font-black text-indigo-400 uppercase tracking-wide flex items-center gap-1.5 mt-0.5">
                      <Sparkles className="w-4 h-4 text-amber-500 animate-spin" />
                      Compra Tipo: {header?.type === 'abierto' ? 'Abierto (Liquidable)' : 'Cerrado al Instante'}
                    </h4>
                  </div>

                  <div className="space-y-4 font-mono">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-zinc-500 font-sans font-medium">Peso Total Balanza:</span>
                      <span className="font-bold text-zinc-200">
                        {formatNumber(cart.reduce((s, c) => s + (c.finalWeight || 0), 0))}g
                      </span>
                    </div>

                    {header?.type === 'abierto' && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-zinc-500 font-sans font-medium">Factor de Apertura (Antc):</span>
                        <span className="font-bold text-amber-400">
                          {header.openEstimateFactor || 90}%
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between items-center text-xs border-b border-white/5 pb-3">
                      <span className="text-zinc-500 font-sans font-medium">Monto Bruto Compra:</span>
                      <span className="font-extrabold text-zinc-300">
                        {formatNumber(cart.reduce((s, c) => s + (c.total || 0), 0))} BS
                      </span>
                    </div>

                    {/* Bold Total Box */}
                    <div className="bg-zinc-950 p-4 rounded-2xl border border-white/5 space-y-1">
                      <span className="text-[8px] font-extrabold text-zinc-500 uppercase tracking-widest block font-sans">VALOR TOTAL DE MATERIALES (REDONDEADO)</span>
                      <div className="text-2xl font-black text-amber-500 flex items-baseline gap-1.5">
                        {formatNumber(Math.floor(cart.reduce((s, c) => s + (c.total || 0), 0)))}
                        <span className="text-xs text-amber-600 font-sans font-black">BS</span>
                      </div>
                      {cart.reduce((s, c) => s + (c.total || 0), 0) !== Math.floor(cart.reduce((s, c) => s + (c.total || 0), 0)) && (
                        <span className="text-[8.5px] text-zinc-500 block font-mono">
                          Monto exacto sin redondear: {formatNumber(cart.reduce((s, c) => s + (c.total || 0), 0))} BS
                        </span>
                      )}
                    </div>

                    {/* Advance if specified */}
                    {header?.advancePayment > 0 && (
                      <div className="space-y-3">
                        <div className="flex justify-between items-center text-xs text-yellow-500">
                          <span className="font-sans font-medium text-zinc-500">Anticipo / Pago a Recibir Hoy:</span>
                          <span className="font-bold">
                            -{formatNumber(Math.floor(header.advancePayment))} BS
                          </span>
                        </div>

                        {/* Net Balance Remainder */}
                        <div className="bg-emerald-500/5 p-4 rounded-2xl border border-emerald-500/10 space-y-1">
                          <span className="text-[8px] font-extrabold text-emerald-500 uppercase tracking-widest block font-sans">SALDO RESTANTE PENDIENTE</span>
                          <div className="text-xl font-black text-emerald-400 flex items-baseline gap-1.5">
                            {formatNumber(Math.floor(cart.reduce((s, c) => s + (c.total || 0), 0)) - Math.floor(header.advancePayment))}
                            <span className="text-xs text-emerald-500 font-sans font-black">BS</span>
                          </div>
                          <p className="text-[8px] text-zinc-500 font-sans font-medium leading-tight">
                            Este monto queda pendiente de liquidar en su cuenta final.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </main>

      {/* Modern Static Bottom Status Row */}
      <footer className="px-8 py-3 bg-zinc-950 text-center border-t border-white/5 text-[9px] font-mono text-zinc-600 tracking-wider">
        SISTEMA DE ADMINISTRADOR DE SUCURSALES © 2026 • ESTA VISTA SOLO REFLEJA DATOS DE EVALUACIÓN
      </footer>
    </div>
  );
}

// Helper to parse search parameters from hash value (hash routing safely support)
function parseParams(hash: string): { branchId: string; branchName: string; username: string } {
  if (!hash.includes('?')) return { branchId: '', branchName: '', username: '' };
  const query = hash.split('?')[1];
  const params = new URLSearchParams(query);
  return {
    branchId: params.get('branchId') || '',
    branchName: params.get('branchName') || '',
    username: params.get('username') || '',
  };
}
