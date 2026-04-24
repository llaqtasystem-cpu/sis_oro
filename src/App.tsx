import * as React from 'react';
import { useState, useEffect, useMemo, Component, useRef, useCallback } from 'react';
import { 
  Plus, 
  Flame, 
  History, 
  Package, 
  LogOut, 
  Search, 
  Filter,
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Scale,
  User,
  Hash,
  Calendar,
  Coins,
  ArrowRight,
  X,
  RefreshCw,
  Download,
  FileText,
  Printer,
  Edit,
  Edit2,
  Mail,
  Trash2,
  Settings,
  Building2,
  Users,
  MapPin,
  Phone,
  Image as ImageIcon,
  LockOpen,
  Lock,
  Eye
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { motion, AnimatePresence } from 'motion/react';
import { Material, MaterialType, MaterialStatus, SmeltingOperation, ExportOperation, User as SystemUser, UserRole, Branch, SourceMaterialInfo, CompanySettings, Client, GoldPurchase, GoldPurchaseItem, Referrer, ReferrerPayout } from './types';

// --- Error Handling ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleApiError(error: unknown, operationType: OperationType, path: string | null) {
  console.error(`API Error (${operationType}) on ${path}:`, error);
  alert(`Error en la operación ${operationType}: ${error instanceof Error ? error.message : String(error)}`);
}

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, { ...options, cache: 'no-store' });
  const text = await res.text();
  
  if (!res.ok) {
    let errorMessage = `HTTP ${res.status}`;
    try {
      const json = JSON.parse(text);
      if (json.error) errorMessage = json.error;
      else if (json.message) errorMessage = json.message;
    } catch {
      errorMessage = `${errorMessage}: ${text.slice(0, 100)}`;
    }
    throw new Error(`${errorMessage} (${url})`);
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    console.error(`JSON parse error on ${url}:`, err);
    console.error(`Response text (first 100 chars): ${text.slice(0, 100)}`);
    throw new Error(`Invalid JSON response from ${url}: ${text.slice(0, 50)}...`);
  }
}

// --- Formatting Utils ---
const formatNumber = (num: number, decimals: number = 2) => {
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
};

const formatCurrency = (num: number) => {
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

const numeroALetras = (n: number): string => {
  const unidades = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
  const decenas = ['DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const especiales = ['ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
  const centenas = ['CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

  const formatearParte = (num: number): string => {
    if (num === 0) return '';
    if (num < 10) return unidades[num];
    if (num < 20) {
      if (num === 10) return 'DIEZ';
      return especiales[num - 11];
    }
    if (num < 100) {
      const d = Math.floor(num / 10);
      const u = num % 10;
      if (u === 0) return decenas[d - 1];
      if (d === 2) return `VEINTI${unidades[u]}`;
      return `${decenas[d - 1]} Y ${unidades[u]}`;
    }
    if (num < 1000) {
      if (num === 100) return 'CIEN';
      const c = Math.floor(num / 100);
      const resto = num % 100;
      return `${centenas[c - 1]} ${formatearParte(resto)}`;
    }
    return '';
  };

  const entero = Math.floor(n);
  const decimales = Math.round((n - entero) * 100);
  
  let resultado = '';
  if (entero === 0) resultado = 'CERO';
  else if (entero < 1000) resultado = formatearParte(entero);
  else if (entero < 1000000) {
    const miles = Math.floor(entero / 1000);
    const resto = entero % 1000;
    const milesTxt = miles === 1 ? 'MIL' : `${formatearParte(miles)} MIL`;
    resultado = `${milesTxt} ${formatearParte(resto)}`;
  } else {
    resultado = 'CANTIDAD NO SOPORTADA';
  }

  return `${resultado.trim()} ${decimales.toString().padStart(2, '0')}/100 BOLIVIANOS`;
};

const exportSourceHistoryToExcel = (resultMaterial: Material) => {
  if (!resultMaterial.sourceMaterials) return;

  const flattenedData: any[] = [];

  const flatten = (materials: SourceMaterialInfo[], parentReceipt: string, level: number) => {
    materials.forEach(m => {
      flattenedData.push({
        'Nivel': level === 0 ? 'Origen Directo' : `Componente de #${parentReceipt}`,
        'Fecha': m.registrationDate ? new Date(m.registrationDate).toLocaleDateString() : 'N/A',
        'Nro. Recibo': m.receiptNumber,
        'Cliente': m.client,
        'Ley (%)': m.purity,
        'Cotización (BS)': m.marketPrice,
        'Peso Final (g)': m.finalWeight,
        'Total (BS)': m.total
      });

      if (m.sourceMaterials && m.sourceMaterials.length > 0) {
        flatten(m.sourceMaterials, m.receiptNumber, level + 1);
      }
    });
  };

  flatten(resultMaterial.sourceMaterials, resultMaterial.receiptNumber, 0);

  // Add summary row
  flattenedData.push({});
  flattenedData.push({
    'Cliente': 'TOTALES DE ORIGEN',
    'Peso Final (g)': resultMaterial.sourceMaterials.reduce((acc, curr) => acc + curr.finalWeight, 0),
    'Total (BS)': resultMaterial.sourceMaterials.reduce((acc, curr) => acc + curr.total, 0)
  });

  const ws = XLSX.utils.json_to_sheet(flattenedData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Historial de Origen");
  
  XLSX.writeFile(wb, `Historial_Origen_${resultMaterial.receiptNumber}.xlsx`);
};

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends (Component as any) {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    const state = (this as any).state;
    if (state.hasError) {
      let errorMessage = "Algo salió mal.";
      try {
        const parsed = JSON.parse(state.error?.message || "");
        if (parsed.error && parsed.operationType) {
          errorMessage = `Error de base de datos (${parsed.operationType}): ${parsed.error}`;
        }
      } catch {
        errorMessage = state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
          <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl border border-red-100 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Error del Sistema</h2>
            <p className="text-gray-600 mb-6 text-sm">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-gray-900 text-white rounded-xl font-medium"
            >
              Reintentar
            </button>
          </div>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

// --- Components ---

const Auth = ({ onLogin }: { onLogin: (user: SystemUser) => void }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [terminalId] = useState(() => Math.random().toString(36).substring(7).toUpperCase());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    const trimmedUsername = username.trim();
    const trimmedPin = pin.trim();
    
    try {
      const user = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmedUsername, pin: trimmedPin })
      });
      onLogin(user);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error al conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-zinc-950 overflow-hidden font-sans">
      {/* Dynamic Atmospheric Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] bg-amber-900/10 rounded-full blur-[140px] animate-pulse opacity-60" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-zinc-800/20 rounded-full blur-[120px] animate-pulse opacity-50" style={{ animationDelay: '2s' }} />
        <div className="absolute top-[40%] left-[30%] w-[20vw] h-[20vw] bg-amber-500/5 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: '4s' }} />
        
        {/* Subtle Grid Pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      </div>

      {/* Login Card */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-md px-6"
      >
        <div className="bg-zinc-900/40 backdrop-blur-2xl p-10 rounded-[40px] border border-white/5 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] relative overflow-hidden group">
          {/* Interactive highlight effect */}
          <div className="absolute -inset-1 bg-gradient-to-tr from-amber-500/10 via-transparent to-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 blur-sm pointer-events-none" />
          
          <div className="relative z-10">
            <motion.div 
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="flex justify-between items-start mb-14"
            >
              <div className="bg-zinc-950/80 p-4 rounded-2xl border border-white/10 shadow-inner group-hover:border-amber-500/30 transition-colors duration-500">
                <TrendingUp className="text-amber-500 w-8 h-8" />
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase text-zinc-500 tracking-[0.2em] block mb-1">Terminal Secure</span>
                <div className="flex items-center gap-2 justify-end">
                  <span className="w-1 h-1 bg-emerald-500 rounded-full animate-ping" />
                  <p className="text-[10px] text-zinc-400 font-mono tracking-tighter uppercase">{terminalId}</p>
                </div>
              </div>
            </motion.div>

            <motion.div 
               initial={{ x: -10, opacity: 0 }}
               animate={{ x: 0, opacity: 1 }}
               transition={{ delay: 0.4 }}
            >
              <h1 className="text-4xl font-serif italic text-zinc-100 mb-2 leading-none tracking-tight">Aurum Manager</h1>
              <p className="text-sm font-light text-zinc-500 mb-12">Portal de acceso Almacén Central</p>
            </motion.div>
            
            <form onSubmit={handleSubmit} className="space-y-8">
              <AnimatePresence mode="wait">
                {error && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0, scale: 0.95 }}
                    animate={{ height: 'auto', opacity: 1, scale: 1 }}
                    exit={{ height: 0, opacity: 0, scale: 0.95 }}
                    className="flex items-center gap-3 text-red-200 text-[11px] bg-red-500/10 p-4 rounded-2xl border border-red-500/20 overflow-hidden"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{error}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-6">
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="group/input"
                >
                  <label className="block text-[10px] font-black uppercase text-zinc-600 tracking-[0.2em] mb-3 ml-1 group-focus-within/input:text-amber-500/70 transition-colors">Credential ID</label>
                  <div className="relative">
                    <User className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-700 group-focus-within/input:text-amber-500 transition-colors" />
                    <input 
                      required
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Nombre de usuario"
                      className="w-full pl-14 pr-4 py-4 bg-zinc-950/40 rounded-2xl border border-white/5 focus:border-amber-500/30 text-zinc-100 focus:outline-none focus:ring-[12px] focus:ring-amber-500/[0.03] transition-all placeholder:text-zinc-800 placeholder:font-light"
                    />
                  </div>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="group/input"
                >
                  <label className="block text-[10px] font-black uppercase text-zinc-600 tracking-[0.2em] mb-3 ml-1 group-focus-within/input:text-amber-500/70 transition-colors">Access PIN</label>
                  <div className="relative">
                    <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-700 group-focus-within/input:text-amber-500 transition-colors" />
                    <input 
                      required
                      type="password"
                      maxLength={6}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="••••"
                      className="w-full pl-14 pr-4 py-4 bg-zinc-950/40 rounded-2xl border border-white/5 focus:border-amber-500/30 text-zinc-100 text-center text-3xl font-mono tracking-[0.8em] focus:outline-none focus:ring-[12px] focus:ring-amber-500/[0.03] transition-all placeholder:text-zinc-800 placeholder:tracking-normal"
                    />
                  </div>
                </motion.div>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
              >
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-5 bg-zinc-100 text-zinc-950 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-white transition-all flex items-center justify-center gap-3 shadow-[0_20px_40px_-12px_rgba(255,255,255,0.1)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed group/btn overflow-hidden relative"
                >
                  {loading ? (
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                      className="w-5 h-5 border-2 border-zinc-950 border-t-transparent rounded-full"
                    />
                  ) : (
                    <>
                      <span className="relative z-10">Autenticar Usuario</span>
                      <ArrowRight className="w-4 h-4 relative z-10 group-hover:translate-x-1 transition-transform" />
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] pointer-events-none" />
                    </>
                  )}
                </button>
              </motion.div>
            </form>
            
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              className="mt-14 pt-8 border-t border-white/5 flex flex-col items-center"
            >
              <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mb-4">Protocolo de Seguridad</p>
              <ul className="text-[9px] text-zinc-700 font-medium space-y-1.5 list-none text-center leading-relaxed">
                <li>Conexión encriptada AES-256</li>
                <li>Monitoreo de terminal activo</li>
                <li>Registro de IP {terminalId ? 'Enabled' : 'Disabled'}</li>
              </ul>
              <div className="mt-6 px-4 py-1.5 bg-zinc-950/50 rounded-full border border-white/5 flex items-center gap-3">
                <span className="text-[8px] font-bold text-amber-500/40 uppercase tracking-widest">Master Key: admin / 1234</span>
              </div>
            </motion.div>
          </div>
        </div>
        
        <div className="mt-10 flex items-center justify-center gap-4">
          <div className="h-px w-8 bg-zinc-800" />
          <span className="text-[9px] text-zinc-800 font-black uppercase tracking-[0.3em]">Aurum Network</span>
          <div className="h-px w-8 bg-zinc-800" />
        </div>
      </motion.div>
    </div>
  );
};

interface MaterialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  formData: any;
  setFormData: React.Dispatch<React.SetStateAction<any>>;
  title: string;
  subtitle: string;
  submitLabel: string;
}

const MaterialModal = ({ isOpen, onClose, onSubmit, formData, setFormData, title, subtitle, submitLabel }: MaterialModalProps) => {
  const initialRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (initialRef.current) {
          initialRef.current.focus();
          initialRef.current.select();
        }
      }, 100);
    }
  }, [isOpen]);

  useEffect(() => {
    const { finalWeight, marketPrice, purity, usdToBs, pricePerGram: currentPrice, total: currentTotal } = formData;
    if (marketPrice > 0 && purity > 0 && usdToBs > 0) {
      const val1 = marketPrice * (purity / 100);
      const val2 = val1 / 31.1035;
      const val3 = val2 * usdToBs;
      
      // Warehouse items use 100% factor by default
      const nextPrice = parseFloat(val3.toFixed(2));
      const nextTotal = parseFloat((nextPrice * finalWeight).toFixed(2));

      if (Math.abs(nextPrice - currentPrice) > 0.001 || Math.abs(nextTotal - currentTotal) > 0.001) {
        setFormData(prev => ({
          ...prev,
          pricePerGram: nextPrice,
          total: nextTotal
        }));
      }
    }
  }, [formData.finalWeight, formData.marketPrice, formData.purity, formData.usdToBs]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative bg-zinc-900 w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden border border-white/5"
          >
            <div className="p-8 border-b border-white/5 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-zinc-100">{title}</h2>
                <p className="text-sm text-zinc-400">{subtitle}</p>
              </div>
              <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>

            <form onSubmit={onSubmit} className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">Número de Recibo</label>
                  <input 
                    ref={initialRef}
                    required
                    type="text" 
                    value={formData.receiptNumber || ''}
                    onChange={e => setFormData({...formData, receiptNumber: e.target.value})}
                    className="w-full p-2 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">Cliente</label>
                  <input 
                    required
                    type="text" 
                    value={formData.client || ''}
                    onChange={e => setFormData({...formData, client: e.target.value})}
                    className="w-full p-2 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">Peso Inicial (g)</label>
                  <input 
                    required
                    type="number" 
                    step="0.01"
                    value={formData.initialWeight || ''}
                    onChange={e => {
                      const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                      const finalW = val * (1 - formData.loss / 100);
                      setFormData({...formData, initialWeight: val, finalWeight: Number(finalW.toFixed(2))});
                    }}
                    className="w-full p-2 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">Peso Final (g)</label>
                  <input 
                    required
                    type="number" 
                    step="0.01"
                    value={formData.finalWeight || ''}
                    onChange={e => {
                      const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                      const lossPct = formData.initialWeight > 0 ? ((formData.initialWeight - val) * 100) / formData.initialWeight : 0;
                      setFormData({...formData, finalWeight: val, loss: Number(lossPct.toFixed(2))});
                    }}
                    className="w-full p-2 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">Ley (%)</label>
                  <input 
                    required
                    type="number" 
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.purity || ''}
                    onChange={e => setFormData({...formData, purity: e.target.value === '' ? 0 : parseFloat(e.target.value)})}
                    className="w-full p-2 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">Cotización Mercado</label>
                  <input 
                    required
                    type="number" 
                    step="0.01"
                    value={formData.marketPrice || ''}
                    onChange={e => setFormData({...formData, marketPrice: e.target.value === '' ? 0 : parseFloat(e.target.value)})}
                    className="w-full p-2 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">Valor 1 USD en BS</label>
                  <input 
                    required
                    type="number" 
                    step="0.01"
                    value={formData.usdToBs || ''}
                    onChange={e => setFormData({...formData, usdToBs: e.target.value === '' ? 0 : parseFloat(e.target.value)})}
                    className="w-full p-2 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">Precio por Gramo</label>
                  <input 
                    required
                    type="number" 
                    step="0.01"
                    value={formData.pricePerGram || ''}
                    onChange={e => setFormData({...formData, pricePerGram: e.target.value === '' ? 0 : parseFloat(e.target.value)})}
                    className="w-full p-2 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-sm font-bold text-amber-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">Merma (%)</label>
                  <input 
                    required
                    type="number" 
                    step="0.01"
                    value={formData.loss || ''}
                    onChange={e => {
                      const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                      const finalW = formData.initialWeight * (1 - val / 100);
                      setFormData({...formData, loss: val, finalWeight: Number(finalW.toFixed(2))});
                    }}
                    className="w-full p-2 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">Tipo de Material</label>
                  <select 
                    value={formData.type || 'pieza'}
                    onChange={e => setFormData({...formData, type: e.target.value as MaterialType})}
                    className="w-full p-2 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-sm"
                  >
                    <option value="pieza" className="bg-zinc-900">Pieza</option>
                    <option value="barra" className="bg-zinc-900">Barra</option>
                  </select>
                </div>
                <div className="flex items-end lg:col-span-2">
                  <div className="w-full p-2 bg-amber-500/10 rounded-xl border border-amber-500/20 text-center">
                    <p className="text-[10px] font-bold uppercase text-amber-500">Total Estimado</p>
                    <p className="text-lg font-mono font-bold text-amber-500">
                      {formatCurrency(formData.finalWeight * formData.pricePerGram)}
                    </p>
                  </div>
                </div>
              </div>

              <button 
                type="submit"
                className="w-full py-4 bg-amber-500 text-zinc-950 rounded-2xl font-bold shadow-xl hover:bg-amber-400 transition-all"
              >
                {submitLabel}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

interface MaterialCardProps {
  key?: React.Key;
  material: Material;
  systemUsers: SystemUser[];
  onSelect?: (id: string) => void;
  onViewSource?: (material: Material) => void;
  onEdit?: (material: Material) => void;
  onDelete?: (material: Material) => void;
  isSelected?: boolean;
  selectable?: boolean;
  canEdit?: boolean;
}

const MaterialCard = ({ material, systemUsers, onSelect, onViewSource, onEdit, onDelete, isSelected, selectable, canEdit }: MaterialCardProps) => {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`p-5 rounded-2xl border transition-all cursor-pointer relative group ${
        isSelected 
          ? 'bg-amber-950/40 border-amber-500 shadow-md ring-2 ring-amber-500/20' 
          : 'bg-zinc-900 border-white/5 hover:border-amber-500/50 hover:shadow-sm'
      }`}
      onClick={() => {
        if (selectable && onSelect && material.id) {
          onSelect(material.id);
        }
      }}
    >
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all z-10">
        {canEdit && material.status === 'disponible' && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onEdit && onEdit(material);
            }}
            className="p-2 bg-zinc-800 text-zinc-400 rounded-lg hover:bg-amber-500/10 hover:text-amber-500 border border-white/5"
            title="Editar Registro"
          >
            <Edit className="w-3.5 h-3.5" />
          </button>
        )}
        {canEdit && material.status === 'disponible' && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onDelete && onDelete(material);
            }}
            className="p-2 bg-zinc-800 text-zinc-400 rounded-lg hover:bg-red-500/10 hover:text-red-500 border border-white/5"
            title="Eliminar Registro"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-lg ${material.type === 'barra' ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-400'}`}>
            {material.type === 'barra' ? <Package className="w-4 h-4" /> : <Hash className="w-4 h-4" />}
          </div>
          <div>
            <h3 className="font-bold text-zinc-100 leading-none mb-1">#{material.receiptNumber}</h3>
            <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">{material.client}</p>
          </div>
        </div>
        <span className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-tighter ${
          material.status === 'disponible' ? 'bg-emerald-500/10 text-emerald-400' : 
          material.status === 'exportado' ? 'bg-blue-500/10 text-blue-400' :
          'bg-zinc-800 text-zinc-500'
        }`}>
          {material.status === 'exportado' ? 'Vendido' : material.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="space-y-1">
          <p className="text-[10px] text-zinc-500 uppercase font-bold flex items-center gap-1">
            <Scale className="w-3 h-3" /> Peso Inicial
          </p>
          <p className="text-sm font-mono font-bold text-zinc-400">{formatNumber(material.initialWeight)}g</p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-zinc-500 uppercase font-bold flex items-center gap-1">
            <Scale className="w-3 h-3" /> Peso Final
          </p>
          <p className="text-sm font-mono font-bold text-zinc-100">{formatNumber(material.finalWeight)}g</p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-zinc-500 uppercase font-bold flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> Cotización
          </p>
          <p className="text-sm font-mono font-bold text-zinc-400">{formatCurrency(material.marketPrice)}</p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-zinc-500 uppercase font-bold flex items-center gap-1">
            <Coins className="w-3 h-3" /> Precio/g
          </p>
          <p className="text-sm font-mono font-bold text-zinc-400">{formatCurrency(material.pricePerGram)}</p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-zinc-500 uppercase font-bold flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Merma
          </p>
          <p className="text-sm font-mono font-bold text-red-400">
            {material.lossPercentage ? `${formatNumber(material.lossPercentage)}%` : `${formatNumber((material.loss / material.initialWeight) * 100)}%`}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-zinc-500 uppercase font-bold flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Ley
          </p>
          <p className="text-sm font-mono font-bold text-emerald-400">{formatNumber(material.purity)}%</p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-zinc-500 uppercase font-bold flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> USD/BS
          </p>
          <p className="text-sm font-mono font-bold text-blue-400">{formatNumber(material.usdToBs)}</p>
        </div>
      </div>

      <div className="bg-amber-950/20 p-3 rounded-xl border border-amber-500/20 mb-4">
        <p className="text-[10px] text-zinc-500 uppercase font-bold flex items-center gap-1 mb-1">
          <Coins className="w-3 h-3" /> Total
        </p>
        <p className="text-xl font-mono font-bold text-amber-500">{formatCurrency(material.total)}</p>
      </div>

      <div className="flex flex-col gap-3 pt-4 border-t border-white/5">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1 text-zinc-500">
            <Calendar className="w-3 h-3" />
            <span className="text-[10px] font-medium">{new Date(material.registrationDate).toLocaleDateString()}</span>
          </div>
          <div className="text-[10px] font-bold text-zinc-400 bg-zinc-800 px-2 py-1 rounded capitalize">
            {material.type}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center border border-white/5">
            <User className="w-2.5 h-2.5 text-zinc-500" />
          </div>
          <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">
            Res: {systemUsers.find(u => u.id === material.createdBy || u.username === material.createdBy)?.name || material.createdBy || 'Sistema'}
          </p>
        </div>
      </div>

      {material.sourceMaterials && material.sourceMaterials.length > 0 && (
        <div className="mt-4 pt-4 border-t border-dashed border-zinc-800">
          <div className="flex justify-between items-center mb-2">
            <p className="text-[10px] text-zinc-500 uppercase font-bold flex items-center gap-1">
              <History className="w-3 h-3" /> Materiales de Origen
            </p>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onViewSource && onViewSource(material);
              }}
              className="text-[10px] font-bold text-amber-500 hover:text-amber-400 bg-amber-500/10 px-2 py-1 rounded-lg border border-amber-500/20 transition-colors"
            >
              Ver Detalles
            </button>
          </div>
          <div className="space-y-2">
            {material.sourceMaterials.slice(0, 2).map((sm, idx) => (
              <div key={idx} className="bg-zinc-800/50 p-2 rounded-lg text-[10px] border border-white/5">
                <div className="flex justify-between font-bold text-zinc-300 mb-0.5">
                  <span>#{sm.receiptNumber}</span>
                  <span>{formatNumber(sm.finalWeight)}g</span>
                </div>
                <div className="flex justify-between text-zinc-500">
                  <span className="truncate max-w-[100px]">{sm.client}</span>
                  <span>{formatCurrency(sm.total)}</span>
                </div>
              </div>
            ))}
            {material.sourceMaterials.length > 2 && (
              <p className="text-[9px] text-center text-zinc-500 font-medium">
                + {material.sourceMaterials.length - 2} materiales más
              </p>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
};

interface SourceHistoryRowProps {
  key?: React.Key;
  sm: SourceMaterialInfo;
  level?: number;
}

const SourceHistoryRow = ({ sm, level = 0 }: SourceHistoryRowProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasChildren = sm.sourceMaterials && sm.sourceMaterials.length > 0;

  return (
    <>
      <tr className={`hover:bg-zinc-900 transition-colors ${level > 0 ? 'bg-zinc-900/30' : ''}`}>
        <td className="px-6 py-4">
          <div className="flex items-center gap-2 text-zinc-400" style={{ paddingLeft: `${level * 20}px` }}>
            {hasChildren && (
              <button 
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1 hover:bg-zinc-800 rounded transition-colors"
              >
                <Plus className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-45' : ''}`} />
              </button>
            )}
            <Calendar className="w-3 h-3" />
            <span className="text-xs font-medium">
              {sm.registrationDate ? new Date(sm.registrationDate).toLocaleDateString() : 'N/A'}
            </span>
          </div>
        </td>
        <td className="px-6 py-4">
          <span className="text-sm font-bold text-zinc-100">#{sm.receiptNumber}</span>
        </td>
        <td className="px-6 py-4">
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${sm.type === 'barra' ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-500'}`}>
            {sm.type || 'pieza'}
          </span>
        </td>
        <td className="px-6 py-4">
          <span className="text-xs text-zinc-400 font-medium">{sm.client}</span>
        </td>
        <td className="px-6 py-4 text-right">
          <span className="text-sm font-mono font-bold text-emerald-500">{sm.purity ? formatNumber(sm.purity) : formatNumber(0)}%</span>
        </td>
        <td className="px-6 py-4 text-right">
          <span className="text-sm font-mono font-bold text-zinc-400">{sm.marketPrice ? formatNumber(sm.marketPrice) : formatNumber(0)}</span>
        </td>
        <td className="px-6 py-4 text-right">
          <span className="text-sm font-mono font-bold text-zinc-300">{formatNumber(sm.finalWeight)}g</span>
        </td>
        <td className="px-6 py-4 text-right">
          <span className="text-sm font-mono font-bold text-amber-500">{formatCurrency(sm.total)}</span>
        </td>
      </tr>
      {hasChildren && isExpanded && (
        <>
          <tr className="bg-gray-100/50">
            <td colSpan={8} className="px-6 py-2 text-[9px] font-bold uppercase text-gray-400 tracking-widest" style={{ paddingLeft: `${(level + 1) * 20}px` }}>
              Componentes de #{sm.receiptNumber}
            </td>
          </tr>
          {sm.sourceMaterials!.map((child, idx) => (
            <SourceHistoryRow key={`${sm.receiptNumber}-${idx}`} sm={child} level={level + 1} />
          ))}
        </>
      )}
    </>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<SystemUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [smeltingOperations, setSmeltingOperations] = useState<SmeltingOperation[]>([]);
  const [exportOperations, setExportOperations] = useState<ExportOperation[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [referrers, setReferrers] = useState<Referrer[]>([]);
  const [goldPurchases, setGoldPurchases] = useState<GoldPurchase[]>([]);
  const [referrerPayouts, setReferrerPayouts] = useState<ReferrerPayout[]>([]);
  const [selectedPurchasesForPayout, setSelectedPurchasesForPayout] = useState<string[]>([]);
  const [payoutNotes, setPayoutNotes] = useState('');
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [showPayoutHistoryModal, setShowPayoutHistoryModal] = useState(false);
  const [payoutReferrer, setPayoutReferrer] = useState<Referrer | null>(null);
  const [payoutHistoryReferrer, setPayoutHistoryReferrer] = useState<Referrer | null>(null);
  const [showClientHistoryModal, setShowClientHistoryModal] = useState(false);
  const [historyClient, setHistoryClient] = useState<Client | null>(null);

  const [view, setView] = useState<'inventory' | 'smelt' | 'export' | 'users' | 'history' | 'settings' | 'deleted' | 'branches' | 'branch_dashboard' | 'branch_clients' | 'branch_purchases' | 'branch_referrers'>('inventory');
  const [branchMode, setBranchMode] = useState<string | null>(null); // null means Warehouse mode, otherwise branchId
  const [selectedForSmelting, setSelectedForSmelting] = useState<string[]>([]);
  const [selectedForExport, setSelectedForExport] = useState<string[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deletingMaterial, setDeletingMaterial] = useState<Material | null>(null);
  const [viewingSourceMaterial, setViewingSourceMaterial] = useState<Material | null>(null);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
  const [showAddBranchModal, setShowAddBranchModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [inventoryClientSearch, setInventoryClientSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'pieza' | 'barra'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'disponible' | 'fundido' | 'exportado'>('disponible');
  const [minPurity, setMinPurity] = useState<number>(0);
  const [maxPurity, setMaxPurity] = useState<number>(100);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const lastSmeltIds = useRef<string>("");
  const lastExportIds = useRef<string>("");

  // Smelting Form State
  const [smeltFormData, setSmeltFormData] = useState({
    initialWeight: 0,
    finalWeight: 0,
    marketPrice: 0,
    loss: 0,
    purity: 100,
    usdToBs: 6.96,
    pricePerGram: 0,
    total: 0
  });

  // Export Form State
  const [exportFormData, setExportFormData] = useState({
    totalWeight: 0,
    marketPrice: 0,
    pricePerGram: 0,
    salePrice: 0,
    client: '',
    receiptNumber: ''
  });

  // User Form State
  const [userFormData, setUserFormData] = useState({
    name: '',
    username: '',
    email: '',
    pin: '',
    role: 'operator' as UserRole,
    branchId: ''
  });

  // Branch Form State
  const [branchFormData, setBranchFormData] = useState({
    name: '',
    abbreviation: '',
    location: '',
    phone: '',
    managerId: ''
  });

  // Referrer Form State
  const [referrerFormData, setReferrerFormData] = useState({
    name: '',
    phone1: '',
    phone2: '',
    ci: ''
  });

  // Client Form State
  const [clientFormData, setClientFormData] = useState({
    name: '',
    phone: '',
    email: '',
    ci: '',
    workplace: '',
    isMineCooperative: false,
    recommendedBy: '',
    referentialPhone: ''
  });

  // Gold Purchase Form State
  const [purchaseHeader, setPurchaseHeader] = useState({
    clientId: '',
    type: 'abierto' as 'abierto' | 'cerrado',
    date: new Date().toISOString().split('T')[0],
    referrerName: '',
    commission: 0,
    advancePayment: 0
  });

  const [clientSearch, setClientSearch] = useState('');
  const [referrerSearch, setReferrerSearch] = useState('');
  const [purchaseTypeFilter, setPurchaseTypeFilter] = useState<'abierto' | 'cerrado'>('abierto');
  const [purchaseHistoryPage, setPurchaseHistoryPage] = useState(1);
  const PURCHASE_HISTORY_PER_PAGE = 10;
  const [expandedPurchases, setExpandedPurchases] = useState<string[]>([]);
  const [revaluationItem, setRevaluationItem] = useState<GoldPurchaseItem | null>(null);

  useEffect(() => {
    setPurchaseHistoryPage(1);
    setExpandedPurchases([]);
  }, [view, branchMode, purchaseTypeFilter]);

  const filteredPurchaseHistory = useMemo(() => {
    return goldPurchases
      .filter(p => p.branchId === branchMode)
      .filter(p => p.type === purchaseTypeFilter)
      .sort((a, b) => {
        const dateA = a.type === 'cerrado' && a.closedAt ? new Date(a.closedAt).getTime() : new Date(a.createdAt).getTime();
        const dateB = b.type === 'cerrado' && b.closedAt ? new Date(b.closedAt).getTime() : new Date(b.createdAt).getTime();
        return dateB - dateA;
      });
  }, [goldPurchases, branchMode, purchaseTypeFilter]);

  const paginatedPurchaseHistory = useMemo(() => {
    const start = (purchaseHistoryPage - 1) * PURCHASE_HISTORY_PER_PAGE;
    return filteredPurchaseHistory.slice(start, start + PURCHASE_HISTORY_PER_PAGE);
  }, [filteredPurchaseHistory, purchaseHistoryPage]);

  const [purchaseItem, setPurchaseItem] = useState({
    type: 'pieza' as MaterialType,
    initialWeight: 0,
    finalWeight: 0,
    marketPrice: 0,
    purity: 100,
    pricePerGram: 0,
    total: 0,
    usdToBs: 6.96,
    loss: 0,
    lossPercentage: 0
  });

  const [purchaseCart, setPurchaseCart] = useState<any[]>([]);

  useEffect(() => {
    const { finalWeight, marketPrice, purity, usdToBs, pricePerGram: currentPrice, total: currentTotal } = purchaseItem;
    // Calculate if we have the necessary market values
    if (marketPrice > 0 && purity > 0 && usdToBs > 0) {
      const val1 = marketPrice * (purity / 100);
      const val2 = val1 / 31.1035;
      const val3 = val2 * usdToBs;
      
      // Applying requested logic: 90% for 'abierto', 100% for 'cerrado'
      const factor = purchaseHeader.type === 'abierto' ? 0.90 : 1.0;
      const val4 = val3 * factor;
      
      const nextPrice = parseFloat(val4.toFixed(2));
      const nextTotal = parseFloat((nextPrice * finalWeight).toFixed(2));

      // Only update if changes are significant (avoiding float jitter and infinite loops)
      if (Math.abs(nextPrice - currentPrice) > 0.001 || Math.abs(nextTotal - currentTotal) > 0.001) {
        setPurchaseItem(prev => ({
          ...prev,
          pricePerGram: nextPrice,
          total: nextTotal
        }));
      }
    }
  }, [purchaseItem.finalWeight, purchaseItem.marketPrice, purchaseItem.purity, purchaseItem.usdToBs, purchaseHeader.type]);

  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [showAddReferrerModal, setShowAddReferrerModal] = useState(false);
  const [editingReferrer, setEditingReferrer] = useState<Referrer | null>(null);
  const [showAddPurchaseModal, setShowAddPurchaseModal] = useState(false);
  const [showViewPurchaseModal, setShowViewPurchaseModal] = useState(false);
  const [viewingPurchase, setViewingPurchase] = useState<GoldPurchase | null>(null);
  const [showClosePurchaseModal, setShowClosePurchaseModal] = useState(false);
  const [closingPurchase, setClosingPurchase] = useState<GoldPurchase | null>(null);
  const [closeMarketPrice, setCloseMarketPrice] = useState(0);
  const [closeUsdToBs, setCloseUsdToBs] = useState(0);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isManuallyEditingAdvance, setIsManuallyEditingAdvance] = useState(false);

  // Validation state
  const isCiAlreadyUsed = useMemo(() => {
    if (!clientFormData.ci || !branchMode) return false;
    const cleanedCi = clientFormData.ci.trim().toLowerCase();
    if (!cleanedCi) return false;
    
    return clients.some(c => 
      c.branchId === branchMode && 
      c.ci?.trim().toLowerCase() === cleanedCi && 
      c.id !== editingClient?.id
    );
  }, [clientFormData.ci, branchMode, clients, editingClient]);

  const isReferrerCiAlreadyUsed = useMemo(() => {
    if (!referrerFormData.ci || !branchMode) return false;
    const cleanedCi = referrerFormData.ci.trim().toLowerCase();
    if (!cleanedCi) return false;

    return referrers.some(r => 
      r.branchId === branchMode && 
      r.ci?.trim().toLowerCase() === cleanedCi && 
      r.id !== editingReferrer?.id
    );
  }, [referrerFormData.ci, branchMode, referrers, editingReferrer]);

  // Auto-fill advancePayment for "abierto" purchases
  useEffect(() => {
    if (!isManuallyEditingAdvance && purchaseHeader.type === 'abierto') {
      const netTotal = purchaseCart.reduce((acc, curr) => acc + curr.total, 0) - (purchaseHeader.commission || 0);
      setPurchaseHeader(prev => ({
        ...prev,
        advancePayment: netTotal > 0 ? parseFloat(netTotal.toFixed(2)) : 0
      }));
    }
    if (purchaseHeader.type === 'cerrado') {
      setPurchaseHeader(prev => ({
        ...prev,
        advancePayment: 0
      }));
    }
  }, [purchaseCart, purchaseHeader.type, purchaseHeader.commission, isManuallyEditingAdvance]);

  const [editingPurchase, setEditingPurchase] = useState<GoldPurchase | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const purchaseInitialWeightRef = useRef<HTMLInputElement>(null);
  const clientSearchRef = useRef<HTMLInputElement>(null);
  const receiptNumberRef = useRef<HTMLInputElement>(null);

  // Company Settings Form State
  const [companyFormData, setCompanyFormData] = useState<CompanySettings>({
    name: '',
    address: '',
    phone: '',
    email: '',
    taxId: '',
    logoUrl: '',
    updatedAt: ''
  });

  // Form State
  const [formData, setFormData] = useState({
    receiptNumber: '',
    client: '',
    initialWeight: 0,
    finalWeight: 0,
    marketPrice: 0,
    loss: 0,
    purity: 100,
    usdToBs: 6.96,
    pricePerGram: 0,
    total: 0,
    type: 'pieza' as MaterialType
  });

  const resetFormData = () => {
    setFormData({
      receiptNumber: '',
      client: '',
      initialWeight: 0,
      finalWeight: 0,
      marketPrice: 0,
      loss: 0,
      purity: 100,
      usdToBs: 6.96,
      pricePerGram: 0,
      type: 'pieza'
    });
  };

  useEffect(() => {
    if (editingMaterial) {
      setFormData({
        receiptNumber: editingMaterial.receiptNumber,
        client: editingMaterial.client,
        initialWeight: editingMaterial.initialWeight,
        finalWeight: editingMaterial.finalWeight,
        marketPrice: editingMaterial.marketPrice,
        loss: editingMaterial.loss,
        purity: editingMaterial.purity,
        usdToBs: editingMaterial.usdToBs,
        pricePerGram: editingMaterial.pricePerGram,
        type: editingMaterial.type
      });
    }
  }, [editingMaterial]);

  useEffect(() => {
    const savedUser = localStorage.getItem('aurum_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user && user.role !== 'superadmin' && user.branchId) {
      if (branchMode !== user.branchId) {
        setBranchMode(user.branchId);
      }
      if (!view.startsWith('branch_')) {
        setView('branch_dashboard');
      }
    }
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    setIsRefreshing(true);
    try {
      // Fetch each endpoint individually to identify exactly which one fails
      const mats = await apiFetch('/api/materials');
      setMaterials(mats);
      
      const users = await apiFetch('/api/users');
      setSystemUsers(users);
      
      const smelting = await apiFetch('/api/smelting');
      setSmeltingOperations(smelting);
      
      const exports = await apiFetch('/api/export');
      setExportOperations(exports);
      
      const settings = await apiFetch('/api/settings');
      setCompanySettings(settings);
      setCompanyFormData(settings || {
        name: '',
        address: '',
        phone: '',
        email: '',
        taxId: '',
        logoUrl: '',
        updatedAt: ''
      });
      
      const branchesData = await apiFetch('/api/branches');
      setBranches(branchesData);
      
      const clientsData = await apiFetch('/api/clients');
      setClients(clientsData);
      
      const purchasesData = await apiFetch('/api/gold-purchases');
      setGoldPurchases(purchasesData);
      
      const referrersData = await apiFetch('/api/referrers');
      setReferrers(referrersData);
      
      const payoutsData = await apiFetch('/api/referrer-payouts');
      setReferrerPayouts(payoutsData);
    } catch (error) {
      handleApiError(error, OperationType.LIST, 'all');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleViewChange = (newView: string) => {
    if (user && user.role !== 'superadmin' && !newView.startsWith('branch_')) {
      // Si no es superadmin, solo puede ver vistas de sucursal
      return;
    }
    setView(newView);
    fetchData();
  };

  useEffect(() => {
    if (user) {
      fetchData();
      const interval = setInterval(fetchData, 5000);
      return () => clearInterval(interval);
    }
  }, [user]);

  useEffect(() => {
    if (showAddPurchaseModal) {
      setTimeout(() => clientSearchRef.current?.focus(), 100);
    }
  }, [showAddPurchaseModal]);

  useEffect(() => {
    if (showAddModal) {
      setTimeout(() => receiptNumberRef.current?.focus(), 100);
    }
  }, [showAddModal]);

  useEffect(() => {
    const currentIds = [...selectedForSmelting].sort().join(',');
    if (currentIds === lastSmeltIds.current) return;
    lastSmeltIds.current = currentIds;

    if (selectedForSmelting.length > 0) {
      const selectedMaterials = materials.filter(m => selectedForSmelting.includes(m.id!));
      const totalInitialWeight = selectedMaterials.reduce((acc, m) => acc + m.initialWeight, 0);
      const totalFinalWeight = selectedMaterials.reduce((acc, m) => acc + m.finalWeight, 0);
      const avgMarketPrice = selectedMaterials.reduce((acc, m) => acc + m.marketPrice, 0) / selectedMaterials.length;
      const avgPricePerGram = selectedMaterials.reduce((acc, m) => acc + m.pricePerGram, 0) / selectedMaterials.length;
      const avgUsdToBs = selectedMaterials.reduce((acc, m) => acc + (m.usdToBs || 6.96), 0) / selectedMaterials.length;
      
      setSmeltFormData({
        initialWeight: totalInitialWeight,
        finalWeight: totalFinalWeight,
        marketPrice: avgMarketPrice,
        loss: totalInitialWeight - totalFinalWeight,
        purity: 100, // Default to 100% as requested
        usdToBs: avgUsdToBs,
        pricePerGram: avgPricePerGram,
        total: totalFinalWeight * avgPricePerGram
      });
    } else {
      setSmeltFormData({
        initialWeight: 0,
        finalWeight: 0,
        marketPrice: 0,
        loss: 0,
        purity: 100,
        usdToBs: 6.96,
        pricePerGram: 0,
        total: 0
      });
    }
  }, [selectedForSmelting, materials]);

  useEffect(() => {
    const currentIds = [...selectedForExport].sort().join(',');
    if (currentIds === lastExportIds.current) return;
    lastExportIds.current = currentIds;

    if (selectedForExport.length > 0) {
      const selectedMaterials = materials.filter(m => selectedForExport.includes(m.id!));
      const totalWeight = selectedMaterials.reduce((acc, m) => acc + m.finalWeight, 0);
      const avgMarketPrice = selectedMaterials.reduce((acc, m) => acc + m.marketPrice, 0) / selectedMaterials.length;
      const avgPricePerGram = selectedMaterials.reduce((acc, m) => acc + m.pricePerGram, 0) / selectedMaterials.length;
      
      setExportFormData(prev => ({
        ...prev,
        totalWeight,
        marketPrice: avgMarketPrice,
        pricePerGram: avgPricePerGram,
        salePrice: totalWeight * avgPricePerGram
      }));
    } else {
      setExportFormData({
        totalWeight: 0,
        marketPrice: 0,
        pricePerGram: 0,
        salePrice: 0,
        client: '',
        receiptNumber: ''
      });
    }
  }, [selectedForExport, materials]);

  const handleLogin = (u: SystemUser) => {
    setUser(u);
    localStorage.setItem('aurum_user', JSON.stringify(u));
  };

  const handleLogout = () => {
    setUser(null);
    setBranchMode(null);
    setView('inventory');
    localStorage.removeItem('aurum_user');
  };

  const resetFilters = () => {
    setSearchTerm('');
    setInventoryClientSearch('');
    setTypeFilter('all');
    setStatusFilter('disponible');
    setMinPurity(0);
    setMaxPurity(100);
    setCurrentPage(1);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [view, searchTerm, inventoryClientSearch, typeFilter, statusFilter, minPurity, maxPurity]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) return;

    try {
      if (editingUser) {
        await fetch(`/api/users/${editingUser.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(userFormData)
        });
      } else {
        await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(userFormData)
        });
      }
      setShowAddUserModal(false);
      setEditingUser(null);
      setUserFormData({ name: '', username: '', email: '', pin: '', role: 'operator', branchId: '' });
      fetchData();
    } catch (error) {
      handleApiError(error, editingUser ? OperationType.UPDATE : OperationType.CREATE, 'users');
    }
  };

  const handleEditUser = (u: SystemUser) => {
    setEditingUser(u);
    setUserFormData({
      name: u.name,
      username: u.username,
      email: u.email,
      pin: u.pin,
      role: u.role,
      branchId: u.branchId || ''
    });
    setShowAddUserModal(true);
  };

  const handleDeleteUser = async (id: string) => {
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin') || id === user.id) return;
    if (confirm('¿Está seguro de eliminar este usuario?')) {
      try {
        await fetch(`/api/users/${id}`, { method: 'DELETE' });
        fetchData();
      } catch (error) {
        handleApiError(error, OperationType.DELETE, 'users');
      }
    }
  };

  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || user.role !== 'superadmin') return;

    try {
      if (editingBranch) {
        await fetch(`/api/branches/${editingBranch.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(branchFormData)
        });
      } else {
        await fetch('/api/branches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(branchFormData)
        });
      }
      setShowAddBranchModal(false);
      setEditingBranch(null);
      setBranchFormData({ name: '', abbreviation: '', location: '', phone: '', managerId: '' });
      fetchData();
    } catch (error) {
      handleApiError(error, editingBranch ? OperationType.UPDATE : OperationType.CREATE, 'branches');
    }
  };

  const handleEditBranch = (b: Branch) => {
    setEditingBranch(b);
    setBranchFormData({
      name: b.name,
      abbreviation: b.abbreviation || '',
      location: b.location,
      phone: b.phone,
      managerId: b.managerId || ''
    });
    setShowAddBranchModal(true);
  };

  const handleDeleteBranch = async (id: string) => {
    if (!user || user.role !== 'superadmin') return;
    if (confirm('¿Está seguro de eliminar esta sucursal?')) {
      try {
        await fetch(`/api/branches/${id}`, { method: 'DELETE' });
        fetchData();
      } catch (error) {
        handleApiError(error, OperationType.DELETE, 'branches');
      }
    }
  };

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !branchMode) return;

    const branch = branches.find(b => b.id === branchMode);
    const branchName = branch ? branch.name : '';

    try {
      if (editingClient) {
        await apiFetch(`/api/clients/${editingClient.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            ...clientFormData, 
            branchId: branchMode,
            branchName,
            registeredBy: user.name
          })
        });
      } else {
        await apiFetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            ...clientFormData, 
            branchId: branchMode,
            branchName,
            registeredBy: user.name
          })
        });
      }
      setShowAddClientModal(false);
      setEditingClient(null);
      setClientFormData({ 
        name: '', phone: '', email: '', ci: '', 
        workplace: '', isMineCooperative: false, recommendedBy: '',
        referentialPhone: ''
      });
      fetchData();
    } catch (error) {
      handleApiError(error, editingClient ? OperationType.UPDATE : OperationType.CREATE, 'clients');
    }
  };

  const handleAddToCart = (e: React.FormEvent) => {
    e.preventDefault();
    
    const newItem = {
      ...purchaseItem,
      id: crypto.randomUUID()
    };

    setPurchaseCart([...purchaseCart, newItem]);
    setPurchaseItem({
      ...purchaseItem,
      initialWeight: 0,
      finalWeight: 0,
      pricePerGram: 0,
      total: 0,
      loss: 0,
      lossPercentage: 0
    });

    // Auto focus back to initial weight field for fast entry
    setTimeout(() => {
      if (purchaseInitialWeightRef.current) {
        purchaseInitialWeightRef.current.focus();
        purchaseInitialWeightRef.current.select();
      }
    }, 100);
  };

  const handleRemoveFromCart = (id: string) => {
    setPurchaseCart(purchaseCart.filter(item => item.id !== id));
  };

  const handleUpdateCartItem = (id: string, updates: Partial<GoldPurchaseItem>) => {
    setPurchaseCart(purchaseCart.map(item => {
      if (item.id === id) {
        const updatedItem = { ...item, ...updates };
        // We no longer automatically recalculate total when pricePerGram changes
        // as per user request to allow manual overrides without side effects
        return updatedItem;
      }
      return item;
    }));
  };

  const handleUpdateRevaluation = (id: string, otherWeight: number, otherPurity: number) => {
    setPurchaseCart(purchaseCart.map(item => 
      item.id === id ? { ...item, otherWeight, otherPurity } : item
    ));
    setRevaluationItem(null);
  };

  const handleSaveReferrer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !branchMode) return;

    try {
      await apiFetch(editingReferrer ? `/api/referrers/${editingReferrer.id}` : '/api/referrers', {
        method: editingReferrer ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...referrerFormData,
          branchId: branchMode
        })
      });
      
      setShowAddReferrerModal(false);
      setEditingReferrer(null);
      setReferrerFormData({ name: '', phone1: '', phone2: '', ci: '' });
      fetchData();
    } catch (error) {
      handleApiError(error, editingReferrer ? OperationType.UPDATE : OperationType.CREATE, 'referrers');
    }
  };

  const handleDeleteReferrer = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este referido?')) return;
    try {
      const response = await fetch(`/api/referrers/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Error al eliminar referido');
      fetchData();
    } catch (error) {
      handleApiError(error, OperationType.DELETE, 'referrers');
    }
  };

  const handleAddReferrerPayout = async () => {
    if (!user || !branchMode || !payoutReferrer || selectedPurchasesForPayout.length === 0) return;

    try {
      const selectedPurchases = goldPurchases.filter(p => selectedPurchasesForPayout.includes(p.id));
      const totalAmount = selectedPurchases.reduce((acc, curr) => acc + (curr.commission || 0), 0);
      const purchaseReceipts = selectedPurchases.map(p => p.receiptNumber);

      const response = await fetch('/api/referrer-payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referrerId: payoutReferrer.id,
          referrerName: payoutReferrer.name,
          purchaseIds: selectedPurchasesForPayout,
          purchaseReceipts,
          totalAmount,
          paidBy: user.name,
          branchId: branchMode,
          notes: payoutNotes
        })
      });

      if (!response.ok) throw new Error('Error al procesar pago');
      
      const payoutData = await response.json();
      
      // Imprimir comprobante
      handlePrintCommissionReceipt({
        id: payoutData.id,
        referrerId: payoutReferrer.id,
        referrerName: payoutReferrer.name,
        purchaseIds: selectedPurchasesForPayout,
        purchaseReceipts,
        totalAmount,
        paidAt: payoutData.paidAt,
        paidBy: user.name,
        branchId: branchMode,
        notes: payoutNotes
      });

      setShowPayoutModal(false);
      setSelectedPurchasesForPayout([]);
      setPayoutNotes('');
      setPayoutReferrer(null);
      fetchData();
    } catch (error) {
      handleApiError(error, OperationType.CREATE, 'referrerPayouts');
    }
  };

  const handlePrintCommissionReceipt = (payout: ReferrerPayout) => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a5'
    });

    const company = companySettings;
    const margin = 15;
    const pageWidth = 148;

    // Header
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(company?.name?.toUpperCase() || 'AURUM MANAGER', margin, 18);
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`NIT: ${company?.taxId || ''}`, margin, 23);
    doc.text(`Fecha: ${new Date(payout.paidAt).toLocaleString()}`, margin, 27);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`RECIBO DE COMISIÓN`, pageWidth - margin, 18, { align: 'right' });
    doc.setFontSize(12);
    doc.setTextColor(180, 0, 0);
    doc.text(`COM-${payout.id.slice(0, 8).toUpperCase()}`, pageWidth - margin, 24, { align: 'right' });

    doc.setTextColor(0, 0, 0);
    doc.line(margin, 35, pageWidth - margin, 35);

    // Body
    doc.setFontSize(9);
    doc.text(`He pagado a:`, margin, 45);
    doc.setFont('helvetica', 'bold');
    doc.text(payout.referrerName, margin + 25, 45);

    doc.setFont('helvetica', 'normal');
    doc.text(`La suma de:`, margin, 55);
    doc.setFont('helvetica', 'bold');
    doc.text(`${formatCurrency(payout.totalAmount)} BS`, margin + 25, 55);
    doc.text(`(${numeroALetras(payout.totalAmount)})`, margin, 62);

    doc.setFont('helvetica', 'normal');
    doc.text(`Por concepto de comisiones de los siguientes recibos:`, margin, 75);
    doc.text(payout.purchaseReceipts.join(', '), margin, 82, { maxWidth: pageWidth - (margin * 2) });

    if (payout.notes) {
      doc.text(`Notas: ${payout.notes}`, margin, 95);
    }

    // Signatures
    doc.line(margin, 150, margin + 40, 150);
    doc.text('Entregué Conforme', margin, 155);
    
    doc.line(pageWidth - margin - 40, 150, pageWidth - margin, 150);
    doc.text('Recibí Conforme', pageWidth - margin - 40, 155);

    doc.save(`Comision_${payout.referrerName}_${payout.id.slice(0, 8)}.pdf`);
  };

  const handleFinalizePurchase = async () => {
    if (!user || !branchMode || purchaseCart.length === 0 || !purchaseHeader.clientId) return;

    try {
      const totalAmount = purchaseCart.reduce((acc, curr) => acc + curr.total, 0);
      const response = await fetch('/api/gold-purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...purchaseHeader,
          branchId: branchMode,
          createdBy: user.id,
          total: totalAmount,
          items: purchaseCart.map(({ id, ...rest }) => rest)
        })
      });

      if (response.ok) {
        setPurchaseCart([]);
        setPurchaseHeader({ 
          clientId: '', 
          type: 'abierto',
          date: new Date().toISOString().split('T')[0],
          referrerName: '',
          commission: 0,
          advancePayment: 0
        });
        setIsManuallyEditingAdvance(false);
        setShowAddPurchaseModal(false);
        fetchData();
      }
    } catch (error) {
      handleApiError(error, OperationType.CREATE, 'goldPurchases');
    }
  };

  const handlePrintAdvanceReceipt = (purchase: GoldPurchase) => {
    if (!purchase.advancePayment || purchase.advancePayment <= 0) return;
    
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a5'
    });

    const company = companySettings;
    const branch = branches.find(b => b.id === purchase.branchId);
    const client = clients.find(c => c.id === purchase.clientId);
    const creatorUser = systemUsers.find(u => u.id === purchase.createdBy || u.username === purchase.createdBy || u.email === purchase.createdBy);

    const margin = 15;
    const pageWidth = 148;
    const contentWidth = pageWidth - (margin * 2);

    // Header Borders (optional but makes it look organized)
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(margin, 10, pageWidth - margin, 10); // Top line

    // Header - Company Info
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11); // Reduced from 14
    doc.setFont('helvetica', 'bold');
    doc.text(company?.name?.toUpperCase() || 'AURUM MANAGER', margin, 18);
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(company?.address || '', margin, 23);
    doc.text(`Tel: ${company?.phone || ''} | NIT: ${company?.taxId || ''}`, margin, 27);
    doc.text(`Email: ${company?.email || ''}`, margin, 31);

    // Branch/Payment Info (Top Right)
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`COMPROBANTE DE ANTICIPO`, pageWidth - margin, 18, { align: 'right' });
    doc.setFontSize(12);
    doc.setTextColor(180, 0, 0); // Solid darker red for professional look
    doc.text(`PAG-${purchase.receiptNumber}`, pageWidth - margin, 24, { align: 'right' });
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Sucursal: ${branch?.name || 'Central'}`, pageWidth - margin, 31, { align: 'right' });

    doc.line(margin, 35, pageWidth - margin, 35); // Divider

    // Date and Operator Info
    const registerDate = new Date(purchase.createdAt);
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text(`Fecha/Hora: ${registerDate.toLocaleDateString()} ${registerDate.toLocaleTimeString()}`, margin, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(`Usuario que registró: ${creatorUser?.name || purchase.createdBy || 'Sistema'}`, pageWidth - margin, 42, { align: 'right' });

    // Client Info Section
    doc.setTextColor(20, 20, 20);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('DATOS DEL CLIENTE', margin, 52);
    
    doc.setLineWidth(0.1);
    doc.setDrawColor(200, 200, 200);
    doc.rect(margin, 55, contentWidth, 20); // Border around client info
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Señor(es): ${client?.name || 'Desconocido'}`, margin + 5, 62);
    doc.text(`C.I. / NIT: ${client?.ci || 'S/N'}`, margin + 5, 68);
    doc.text(`Fecha: ${new Date().toLocaleDateString()}`, pageWidth - margin - 35, 68);

    // Details table
    autoTable(doc, {
      startY: 80,
      margin: { left: margin, right: margin },
      head: [['Descripción del Concepto', 'Importe (BS)']],
      body: [
        [`Anticipo correspondiente a la Compra de Oro #${purchase.receiptNumber}`, formatNumber(purchase.advancePayment)],
      ],
      theme: 'grid',
      headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold', lineWidth: 0.1, lineColor: [0, 0, 0] },
      styles: { fontSize: 10, cellPadding: 4, lineColor: [0, 0, 0], lineWidth: 0.1 },
      columnStyles: {
        1: { halign: 'right', fontStyle: 'bold' }
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;

    // Amount in Literal
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('SON:', margin, finalY);
    doc.setFont('helvetica', 'normal');
    const literal = numeroALetras(purchase.advancePayment);
    // Wrap text if literal is too long
    const splitLiteral = doc.splitTextToSize(literal, contentWidth - 15);
    doc.text(splitLiteral, margin + 12, finalY);

    const literalHeight = splitLiteral.length * 4;
    const totalY = finalY + literalHeight + 5;

    // Total highlight
    const totalBoxWidth = 65; // Increased from 50 to give more space
    doc.setLineWidth(0.5);
    doc.line(pageWidth - margin - totalBoxWidth, totalY - 4, pageWidth - margin, totalY - 4);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL RECIBIDO:', pageWidth - margin - totalBoxWidth, totalY + 2);
    
    doc.setFontSize(12); // Slightly larger for emphasis
    doc.text(`${formatNumber(purchase.advancePayment)} BS`, pageWidth - margin, totalY + 2, { align: 'right' });
    
    doc.setLineWidth(0.5);
    doc.line(pageWidth - margin - totalBoxWidth, totalY + 5, pageWidth - margin, totalY + 5);

    // Signatures
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    
    // Line for signatures
    const signY = 185;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    
    doc.line(margin + 5, signY, margin + 45, signY);
    doc.text('ENTREGADO POR', margin + 25, signY + 5, { align: 'center' });
    doc.setFontSize(7);
    doc.text(creatorUser?.name || '', margin + 25, signY + 9, { align: 'center' });
    
    doc.setFontSize(8);
    doc.line(pageWidth - margin - 45, signY, pageWidth - margin - 5, signY);
    doc.text('RECIBIDO POR (CLIENTE)', pageWidth - margin - 25, signY + 5, { align: 'center' });
    doc.setFontSize(7);
    doc.text(client?.name || '', pageWidth - margin - 25, signY + 9, { align: 'center' });

    // Global Border for the whole page (gives it a "official" document look)
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.rect(5, 5, pageWidth - 10, 200);

    doc.save(`Recibo_Anticipo_${purchase.receiptNumber}.pdf`);
  };

  const handlePrintPurchaseReceipt = (purchase: GoldPurchase, mode: 'abierto' | 'cerrado' | 'combined' | 'cierre' = 'combined') => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const company = companySettings;
    const branch = branches.find(b => b.id === purchase.branchId);
    const client = clients.find(c => c.id === purchase.clientId);
    const creatorUser = systemUsers.find(u => u.id === purchase.createdBy || u.username === purchase.createdBy || u.email === purchase.createdBy);

    const margin = 15;
    const pageWidth = 210;
    const contentWidth = pageWidth - (margin * 2);
    
    // Determine the actual mode based on the purchase type and requested mode
    const isActuallyClosed = purchase.type === 'cerrado';
    const effectiveMode = isActuallyClosed ? mode : 'abierto';
    const isPrintingOpenPart = effectiveMode === 'abierto';
    const isPrintingClosedPart = effectiveMode === 'cerrado' || effectiveMode === 'cierre';
    const isPrintingCombined = effectiveMode === 'combined';

    // Header - Company Info
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(company?.name?.toUpperCase() || 'AURUM MANAGER', margin, 20);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(company?.address || '', margin, 26);
    doc.text(`NIT: ${company?.taxId || ''} | Tel: ${company?.phone || ''}`, margin, 31);
    doc.text(`Email: ${company?.email || ''}`, margin, 35);

    // Receipt Number & Title (Top Right)
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    
    let title = 'COMPROBANTE DE COMPRA DE ORO';
    if (isPrintingOpenPart && isActuallyClosed) title = 'COMPROBANTE DE COMPRA (ABIERTO)';
    if (isPrintingClosedPart) title = 'COMPROBANTE DE COMPRA (CIERRE)';
    
    doc.text(title, pageWidth - margin, 20, { align: 'right' });
    doc.setFontSize(14);
    doc.setTextColor(180, 0, 0);
    doc.text(`#${purchase.receiptNumber}`, pageWidth - margin, 27, { align: 'right' });
    
    doc.setTextColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(margin, 38, pageWidth - margin, 38);
    
    // Summary Info Grid
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('DATOS DE LA OPERACIÓN', margin, 48);
    
    doc.setFont('helvetica', 'normal');
    const regDate = new Date(purchase.createdAt);
    
    if (isPrintingClosedPart) {
      doc.text(`Estado: CERRADO`, margin, 54);
      doc.text(`Fecha Registro Orig: ${regDate.toLocaleDateString()}`, margin, 58);
      if (purchase.closedAt) {
        const closedDate = new Date(purchase.closedAt);
        doc.setFont('helvetica', 'bold');
        doc.text(`FECHA CIERRE: ${closedDate.toLocaleDateString()} ${closedDate.toLocaleTimeString()}`, margin, 64);
        doc.setFont('helvetica', 'normal');
      }
    } else {
      doc.text(`Estado: ${purchase.type.toUpperCase()}`, margin, 54);
      doc.text(`Fecha Apertura: ${regDate.toLocaleDateString()} ${regDate.toLocaleTimeString()}`, margin, 58);
    }
    
    doc.text(`Sucursal: ${branch?.name || 'Central'}`, margin, (isPrintingClosedPart ? 70 : 62));
    const opUser = isPrintingClosedPart ? 
      systemUsers.find(u => u.id === purchase.closedBy || u.username === purchase.closedBy || u.email === purchase.closedBy) : 
      creatorUser;
    doc.text(`Operador: ${opUser?.name || purchase.createdBy || 'Sistema'}`, margin, (isPrintingClosedPart ? 74 : 66));
    
    if (isPrintingCombined && isActuallyClosed && purchase.closedAt) {
      const closedDate = new Date(purchase.closedAt);
      const closerUser = systemUsers.find(u => u.id === purchase.closedBy || u.username === purchase.closedBy || u.email === purchase.closedBy);
      doc.setFont('helvetica', 'bold');
      doc.text('INFORMACIÓN DE CIERRE', margin, 74);
      doc.setFont('helvetica', 'normal');
      doc.text(`Fecha Cierre: ${closedDate.toLocaleDateString()} ${closedDate.toLocaleTimeString()}`, margin, 80);
      doc.text(`Operador Cierre: ${closerUser?.name || purchase.closedBy || 'Sistema'}`, margin, 84);
    }
    
    // Client Info (Right Side)
    doc.setFont('helvetica', 'bold');
    doc.text('DATOS DEL CLIENTE', pageWidth / 2 + 10, 48);
    doc.setFont('helvetica', 'normal');
    doc.text(`Nombre: ${client?.name || 'Desconocido'}`, pageWidth / 2 + 10, 54);
    doc.text(`C.I./NIT: ${client?.ci || 'S/N'}`, pageWidth / 2 + 10, 58);
    doc.text(`Teléfono: ${client?.phone || 'S/N'}`, pageWidth / 2 + 10, 62);
    if (purchase.referrerName) {
      doc.text(`Referido: ${purchase.referrerName}`, pageWidth / 2 + 10, 66);
    }

    // Items Table
    if (isPrintingOpenPart || (!isActuallyClosed)) {
      // Normal table/Apertura table
      autoTable(doc, {
        startY: 78,
        margin: { left: margin, right: margin },
        head: [['Tipo', 'P. Inicial', 'P. Final', 'Merma (%)', 'Ley (%)', 'T.C. (BS)', 'Mkt (USD)', 'P. Gramo', 'Total (BS)']],
        body: purchase.items?.map(item => [
          item.type || 'pieza',
          `${formatNumber(item.initialWeight)}g`,
          `${formatNumber(item.finalWeight)}g`,
          `${formatNumber(item.lossPercentage, 1)}%`,
          `${formatNumber(item.purity)}%`,
          formatNumber(item.usdToBs),
          formatNumber(item.marketPrice),
          formatNumber(item.pricePerGram),
          `${formatNumber(item.total)} BS`
        ]) || [],
        theme: 'grid',
        headStyles: { fillColor: [60, 60, 60], textColor: 255, fontStyle: 'bold', fontSize: 7, halign: 'center' },
        styles: { fontSize: 7, cellPadding: 2, font: 'helvetica' },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'center' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right', fontStyle: 'bold' } }
      });
    } else if (isPrintingClosedPart) {
      // Only Liquidation Table
      autoTable(doc, {
        startY: 85,
        margin: { left: margin, right: margin },
        head: [['Tipo', 'Peso Liq.', 'Ley (%)', 'T.C. Cierre', 'Mkt Cierre', 'P. Gramo Cierre', 'TOTAL BS']],
        body: purchase.items?.map(item => [
          item.type || 'pieza',
          `${formatNumber(item.finalWeight)}g`,
          `${formatNumber(item.purity)}%`,
          formatNumber(item.closeUsdToBs || 0),
          formatNumber(item.closeMarketPrice || 0),
          formatNumber(item.closePricePerGram || 0),
          `${formatNumber(item.closeTotal || 0)} BS`
        ]) || [],
        theme: 'grid',
        headStyles: { fillColor: [0, 100, 0], textColor: 255, fontStyle: 'bold', fontSize: 7, halign: 'center' },
        styles: { fontSize: 7, cellPadding: 2, font: 'helvetica' },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right', fontStyle: 'bold' } }
      });
    } else {
      // Combined Detail (Two tables)
      doc.text('1. DETALLE DE REGISTRO ORIGINAL (ABIERTO)', margin, 92);

      autoTable(doc, {
        startY: 96,
        margin: { left: margin, right: margin },
        head: [['Tipo', 'P. Inicial', 'P. Final', 'Merma (%)', 'Ley (%)', 'T.C. Orig', 'Mkt Orig', 'Subtotal Orig']],
        body: purchase.items?.map(item => [
          item.type || 'pieza',
          `${formatNumber(item.initialWeight)}g`,
          `${formatNumber(item.finalWeight)}g`,
          `${formatNumber(item.lossPercentage, 1)}%`,
          `${formatNumber(item.purity)}%`,
          formatNumber(item.usdToBs),
          formatNumber(item.marketPrice),
          `${formatNumber(item.total)} BS`
        ]) || [],
        theme: 'grid',
        headStyles: { fillColor: [80, 80, 80], textColor: 255, fontStyle: 'bold', fontSize: 7, halign: 'center' },
        styles: { fontSize: 7, cellPadding: 2, font: 'helvetica' },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'center' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } }
      });

      let nextY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('2. DETALLE DE LIQUIDACIÓN FINAL (CIERRE)', margin, nextY);

      autoTable(doc, {
        startY: nextY + 4,
        margin: { left: margin, right: margin },
        head: [['Tipo', 'Peso Liq. (P. Final)', 'Ley (%)', 'T.C. Cierre', 'Mkt Cierre', 'P. Gramo Cierre', 'TOTAL CIERRE']],
        body: purchase.items?.map(item => [
          item.type || 'pieza',
          `${formatNumber(item.finalWeight)}g`,
          `${formatNumber(item.purity)}%`,
          formatNumber(item.closeUsdToBs || 0),
          formatNumber(item.closeMarketPrice || 0),
          formatNumber(item.closePricePerGram || 0),
          `${formatNumber(item.closeTotal || 0)} BS`
        ]) || [],
        theme: 'grid',
        headStyles: { fillColor: [0, 100, 0], textColor: 255, fontStyle: 'bold', fontSize: 7, halign: 'center' },
        styles: { fontSize: 7, cellPadding: 2, font: 'helvetica' },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right', fontStyle: 'bold' } }
      });
    }

    let currentY = (doc as any).lastAutoTable.finalY + 10;
    
    // Financial Summary
    const originalTotal = purchase.total;
    const finalTotal = isActuallyClosed && !isPrintingOpenPart ? (purchase.closeTotal || purchase.total) : purchase.total;
    const totalsWidth = 80;
    const totalsX = pageWidth - margin - totalsWidth;

    if (currentY + 65 > 280) {
      doc.addPage();
      currentY = 20;
    }

    const summaryBoxHeight = (isActuallyClosed && isPrintingCombined) ? 40 : 30;
    doc.setFillColor(240, 240, 240);
    doc.rect(totalsX - 5, currentY - 5, totalsWidth + 5, summaryBoxHeight + (purchase.advancePayment > 0 ? 5 : 0) + (purchase.commission > 0 ? 5 : 0), 'F');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(50, 50, 50);
    doc.text('RESUMEN DE PAGO', totalsX, currentY);
    currentY += 6;
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    
    if (isActuallyClosed && isPrintingCombined) {
      doc.text('TOTAL ORIGINAL (Abierto):', totalsX, currentY);
      doc.text(`${formatNumber(originalTotal)} BS`, pageWidth - margin, currentY, { align: 'right' });
      currentY += 5;
      
      doc.setFont('helvetica', 'bold');
      doc.text('TOTAL RECALCULADO (Cierre):', totalsX, currentY);
      doc.text(`${formatNumber(finalTotal)} BS`, pageWidth - margin, currentY, { align: 'right' });
      doc.setFont('helvetica', 'normal');
    } else {
      doc.text(isPrintingClosedPart ? 'TOTAL CIERRE:' : 'SUBTOTAL COMPRA:', totalsX, currentY);
      doc.text(`${formatNumber(finalTotal)} BS`, pageWidth - margin, currentY, { align: 'right' });
    }
    currentY += 5;

    if (purchase.advancePayment > 0) {
      doc.text('(-) ANTICIPO PAGADO:', totalsX, currentY);
      doc.text(`${formatNumber(purchase.advancePayment)} BS`, pageWidth - margin, currentY, { align: 'right' });
      currentY += 5;
    }
    
    if (purchase.commission > 0) {
      doc.text('(-) COMISIÓN:', totalsX, currentY);
      doc.text(`${formatNumber(purchase.commission)} BS`, pageWidth - margin, currentY, { align: 'right' });
      currentY += 5;
    }

    doc.setLineWidth(0.3);
    doc.setDrawColor(0, 0, 0);
    doc.line(totalsX, currentY - 2, pageWidth - margin, currentY - 2);
    currentY += 4;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 100, 0); 
    const balance = finalTotal - (purchase.advancePayment || 0) - (purchase.commission || 0);
    doc.text((isActuallyClosed && !isPrintingOpenPart) ? 'SALDO FINAL A PAGAR:' : 'LÍQUIDO A PAGAR:', totalsX, currentY);
    doc.text(`${formatNumber(balance)} BS`, pageWidth - margin, currentY, { align: 'right' });

    // Amount in Literal
    currentY += 12;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('SON:', margin, currentY);
    doc.setFont('helvetica', 'normal');
    const literal = numeroALetras(balance);
    const splitLiteral = doc.splitTextToSize(literal, (pageWidth - margin) - (margin + 12));
    doc.text(splitLiteral, margin + 12, currentY);

    // Signatures Area
    const signY = 260;
    doc.setFontSize(8);
    doc.setLineWidth(0.2);
    doc.setDrawColor(150, 150, 150);
    
    doc.line(margin + 15, signY, margin + 70, signY);
    doc.text('FIRMA CLIENTE', margin + 42.5, signY + 5, { align: 'center' });
    doc.setFontSize(7);
    doc.text(client?.name || '', margin + 42.5, signY + 9, { align: 'center' });
    
    doc.setFontSize(8);
    doc.line(pageWidth - margin - 70, signY, pageWidth - margin - 15, signY);
    doc.text('RESPONSABLE CAJA', pageWidth - margin - 42.5, signY + 5, { align: 'center' });
    doc.setFontSize(7);
    const finalOpUserLookup = isPrintingClosedPart ? 
      systemUsers.find(u => u.id === purchase.closedBy || u.username === purchase.closedBy || u.email === purchase.closedBy) : 
      systemUsers.find(u => u.id === purchase.createdBy || u.username === purchase.createdBy || u.email === purchase.createdBy);
    doc.text(finalOpUserLookup?.name || purchase.createdBy || '', pageWidth - margin - 42.5, signY + 9, { align: 'center' });

    const fileName = isPrintingOpenPart ? `Abierto` : (isPrintingClosedPart ? `Cierre` : `Detalle_Completo`);
    doc.save(`${fileName}_Compra_${purchase.receiptNumber}.pdf`);
  };

  const handleAddPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    handleAddToCart(e);
  };

  const handleClosePurchase = async (p: GoldPurchase) => {
    if (!user) return;
    
    // Recalculate items for closure
    const recalculatedItems = p.items?.map(item => {
      const pricePerGram = (closeMarketPrice / 31.1035) * (item.purity / 100) * closeUsdToBs;
      const total = item.finalWeight * pricePerGram;
      return {
        ...item,
        closeMarketPrice,
        closeUsdToBs,
        closePricePerGram: pricePerGram,
        closeTotal: total
      };
    });

    const closeTotal = recalculatedItems?.reduce((acc, curr) => acc + curr.closeTotal, 0) || 0;

    try {
      const res = await apiFetch(`/api/gold-purchases/${p.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          closedBy: user.id || user.username,
          closeMarketPrice,
          closeUsdToBs,
          closeTotal,
          items: recalculatedItems
        })
      });
      if (res.success) {
        setShowClosePurchaseModal(false);
        setClosingPurchase(null);
        fetchData();
        alert('Compra cerrada correctamente con los nuevos valores recalculados');
      }
    } catch (error) {
      handleApiError(error, OperationType.UPDATE, `gold-purchases/${p.id}/close`);
    }
  };

  const handleSaveCompanySettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) return;

    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(companyFormData)
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al guardar la configuración');
      }
      
      alert('Configuración guardada correctamente');
      fetchData();
    } catch (error: any) {
      console.error(error);
      alert(error.message || 'Error al conectar con el servidor');
    }
  };

  const filteredMaterials = useMemo(() => {
    return materials.filter(m => {
      if (m.status === 'eliminado') return false;
      const matchesSearch = m.client.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           m.receiptNumber.includes(searchTerm) ||
                           m.finalWeight.toString().includes(searchTerm);
      const matchesClientSearch = m.client.toLowerCase().includes(inventoryClientSearch.toLowerCase());
      const matchesType = typeFilter === 'all' || m.type === typeFilter;
      const matchesStatus = statusFilter === 'all' || m.status === statusFilter;
      const matchesPurity = m.purity >= minPurity && m.purity <= maxPurity;
      return matchesSearch && matchesClientSearch && matchesType && matchesStatus && matchesPurity;
    });
  }, [materials, searchTerm, inventoryClientSearch, typeFilter, statusFilter, minPurity, maxPurity]);

  const deletedMaterials = useMemo(() => {
    return materials.filter(m => {
      if (m.status !== 'eliminado') return false;
      const matchesSearch = m.client.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           m.receiptNumber.includes(searchTerm) ||
                           m.finalWeight.toString().includes(searchTerm);
      return matchesSearch;
    });
  }, [materials, searchTerm]);

  const inventoryStats = useMemo(() => {
    const activeMaterials = materials.filter(m => m.status === 'disponible');
    const totalWeight = activeMaterials.reduce((acc, m) => acc + m.finalWeight, 0);
    const totalValue = activeMaterials.reduce((acc, m) => acc + m.total, 0);
    const activeCount = activeMaterials.length;
    return { totalWeight, totalValue, activeCount };
  }, [materials]);

  const paginatedInventory = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredMaterials.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredMaterials, currentPage]);

  const availableForSmelting = useMemo(() => {
    return materials.filter(m => {
      if (m.status !== 'disponible') return false;
      const matchesSearch = m.client.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           m.receiptNumber.includes(searchTerm) ||
                           m.finalWeight.toString().includes(searchTerm);
      const matchesPurity = m.purity >= minPurity && m.purity <= maxPurity;
      return matchesSearch && matchesPurity;
    });
  }, [materials, searchTerm, minPurity, maxPurity]);

  const paginatedSmelting = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return availableForSmelting.slice(start, start + ITEMS_PER_PAGE);
  }, [availableForSmelting, currentPage]);

  const paginatedHistory = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return smeltingOperations.slice(start, start + ITEMS_PER_PAGE);
  }, [smeltingOperations, currentPage]);

  const Pagination = ({ totalItems, currentPage, onPageChange, itemsPerPage = ITEMS_PER_PAGE }: { totalItems: number, currentPage: number, onPageChange: (page: number) => void, itemsPerPage?: number }) => {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (totalPages <= 1) return null;

    return (
      <div className="flex flex-col items-center gap-4 mt-8 pb-8">
        <p className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest">
          Mostrando {Math.min(totalItems, (currentPage - 1) * itemsPerPage + 1)} - {Math.min(totalItems, currentPage * itemsPerPage)} de {totalItems} registros
        </p>
        <div className="flex items-center justify-center gap-2">
          <button 
            disabled={currentPage === 1}
            onClick={() => onPageChange(currentPage - 1)}
            className="p-2 rounded-xl border border-white/5 bg-zinc-900 text-zinc-400 disabled:opacity-30 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                className={`w-10 h-10 rounded-xl text-sm font-bold transition-all ${currentPage === page ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'bg-zinc-900 text-zinc-500 border border-white/5 hover:bg-zinc-800 hover:text-zinc-300'}`}
              >
                {page}
              </button>
            ))}
          </div>
          <button 
            disabled={currentPage === totalPages}
            onClick={() => onPageChange(currentPage + 1)}
            className="p-2 rounded-xl border border-white/5 bg-zinc-900 text-zinc-400 disabled:opacity-30 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  };

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const total = formData.finalWeight * formData.pricePerGram;
    
    try {
      await fetch('/api/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          total,
          status: 'disponible',
          createdBy: user.id
        })
      });
      setShowAddModal(false);
      setFormData({
        receiptNumber: '',
        client: '',
        initialWeight: 0,
        finalWeight: 0,
        marketPrice: 0,
        loss: 0,
        purity: 100,
        usdToBs: 6.96,
        pricePerGram: 0,
        type: 'pieza'
      });
    } catch (error) {
      handleApiError(error, OperationType.CREATE, 'materials');
    }
  };

  const handleEditMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingMaterial) return;

    const total = formData.finalWeight * formData.pricePerGram;
    
    try {
      await fetch(`/api/materials/${editingMaterial.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          total
        })
      });
      setShowEditModal(false);
      setEditingMaterial(null);
      resetFormData();
    } catch (error) {
      handleApiError(error, OperationType.UPDATE, 'materials');
    }
  };

  const handleDeleteMaterial = async () => {
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin') || !deletingMaterial || !deletingMaterial.id) return;

    try {
      await fetch(`/api/materials/${deletingMaterial.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'eliminado' })
      });
      setDeletingMaterial(null);
      fetchData();
    } catch (error) {
      handleApiError(error, OperationType.UPDATE, 'materials');
    }
  };

  const handleRestoreMaterial = async (material: Material) => {
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin') || !material.id) return;

    try {
      await fetch(`/api/materials/${material.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'disponible' })
      });
      fetchData();
    } catch (error) {
      handleApiError(error, OperationType.UPDATE, 'materials');
    }
  };

  const handleSmelt = async () => {
    if (!user || selectedForSmelting.length === 0) return;

    try {
      await fetch('/api/smelting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: { ...smeltFormData, createdBy: user.id },
          materialIds: selectedForSmelting
        })
      });

      setSelectedForSmelting([]);
      setView('inventory');
      fetchData();
      alert('Fundición registrada correctamente');
    } catch (error) {
      handleApiError(error, OperationType.CREATE, 'smeltingOperations');
    }
  };

  const handleExport = async (e?: React.SyntheticEvent) => {
    if (e) e.preventDefault();
    if (!user || selectedForExport.length === 0) return;

    try {
      await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: { ...exportFormData, createdBy: user.id },
          materialIds: selectedForExport
        })
      });

      setSelectedForExport([]);
      setExportFormData({
        totalWeight: 0,
        marketPrice: 0,
        pricePerGram: 0,
        salePrice: 0,
        client: '',
        receiptNumber: ''
      });
      setView('inventory');
      fetchData();
      alert('Exportación registrada con éxito');
    } catch (error) {
      handleApiError(error, OperationType.CREATE, 'exportOperations');
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#E4E3E0]">
      <motion.div 
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full"
      />
    </div>
  );

  if (!user) return <Auth onLogin={handleLogin} />;

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans pb-24">
      {/* Header */}
      <header className="bg-zinc-900/50 backdrop-blur-xl border-b border-white/5 sticky top-0 z-30 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-gray-900 p-1.5 rounded-xl shadow-lg overflow-hidden flex items-center justify-center">
              {companySettings?.logoUrl ? (
                <img 
                  src={companySettings.logoUrl} 
                  alt="Logo" 
                  className="w-7 h-7 object-contain"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <TrendingUp className="text-white w-6 h-6" />
              )}
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
                {companySettings?.name || 'Aurum Manager'} - {branchMode ? (branches.find(b => b.id === branchMode)?.name || 'Sucursal') : 'Almacén'}
                <button 
                  onClick={fetchData}
                  disabled={isRefreshing}
                  className={`p-1 rounded-full hover:bg-zinc-800 transition-all ${isRefreshing ? 'opacity-50' : 'opacity-100'}`}
                  title="Refrescar datos"
                >
                  <motion.div 
                    animate={isRefreshing ? { rotate: 360 } : {}}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  >
                    <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'text-amber-500' : 'text-zinc-500'}`} />
                  </motion.div>
                </button>
              </h1>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                {branchMode ? 'Módulo Sucursal' : 'Módulo Almacén'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {user.role === 'superadmin' && (
              <select 
                value={branchMode || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setBranchMode(val || null);
                  handleViewChange(val ? 'branch_dashboard' : 'inventory');
                }}
                className="bg-zinc-900 border border-white/5 rounded-xl px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              >
                <option value="">Sede Central (Almacén)</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}
            <div className="hidden md:flex items-center gap-2 bg-zinc-900 px-3 py-1.5 rounded-full border border-white/5">
              <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center text-white text-[10px] font-bold">
                {user.name[0]}
              </div>
              <span className="text-xs font-medium text-zinc-300">{user.name}</span>
              <span className="text-[8px] font-bold uppercase bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500">{user.role}</span>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 text-zinc-500 hover:text-red-500 transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 pt-8">
        {/* Stats Summary - ONLY for Warehouse */}
        {!branchMode && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <div className="bg-zinc-900 p-6 rounded-3xl border border-white/5 shadow-sm">
              <p className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Inventario Total</p>
              <p className="text-3xl font-mono font-bold tracking-tighter text-zinc-100">
                {formatNumber(inventoryStats.totalWeight)}g
              </p>
            </div>
            <div className="bg-zinc-900 p-6 rounded-3xl border border-white/5 shadow-sm">
              <p className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Valor Estimado</p>
              <p className="text-3xl font-mono font-bold tracking-tighter text-zinc-100">
                {formatCurrency(inventoryStats.totalValue)}
              </p>
            </div>
            <div className="bg-zinc-100 p-6 rounded-3xl shadow-xl text-zinc-900">
              <p className="text-[10px] text-zinc-600 uppercase font-bold mb-1">Materiales Activos</p>
              <p className="text-3xl font-mono font-bold tracking-tighter">
                {inventoryStats.activeCount} <span className="text-sm font-sans font-normal text-zinc-500 tracking-normal">unidades</span>
              </p>
            </div>
          </div>
        )}

        {/* Branch Mode Header */}
        {branchMode && (
          <div className="bg-gradient-to-r from-amber-600/10 to-transparent p-8 rounded-[40px] border border-amber-500/10 mb-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-amber-500 rounded-3xl shadow-xl shadow-amber-500/20">
                  <Building2 className="w-8 h-8 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-3xl font-bold text-zinc-100 italic">
                      {branches.find(b => b.id === branchMode)?.name}
                    </h1>
                    <span className="px-3 py-1 bg-amber-500/10 text-amber-500 rounded-full text-[10px] font-bold uppercase tracking-widest border border-amber-500/20">
                      Sucursal Activa
                    </span>
                  </div>
                  <p className="text-zinc-500 text-sm mt-1">{branches.find(b => b.id === branchMode)?.location || 'Gestión local de compras y clientes'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-zinc-900/50 p-2 rounded-2xl border border-white/5 backdrop-blur-sm">
                <button 
                  onClick={() => setView('branch_dashboard')}
                  className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${view === 'branch_dashboard' ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Panel de Control
                </button>
                <button 
                  onClick={() => setView('branch_purchases')}
                  className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${view === 'branch_purchases' ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Historial de Compras
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-col md:flex-row gap-4 mb-8 items-center justify-between">
          <div className="flex items-center gap-2 bg-zinc-900 p-1 rounded-2xl border border-white/5 w-full md:w-auto overflow-x-auto">
            {!branchMode ? (
              <>
                <button 
                  onClick={() => handleViewChange('inventory')}
                  className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${view === 'inventory' ? 'bg-zinc-100 text-zinc-900 shadow-lg' : 'text-zinc-500 hover:bg-zinc-800'}`}
                >
                  Inventario
                </button>
                <button 
                  onClick={() => handleViewChange('smelt')}
                  className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap ${view === 'smelt' ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'text-zinc-500 hover:bg-zinc-800'}`}
                >
                  <Flame className="w-4 h-4" /> Fundir
                </button>
                <button 
                  onClick={() => handleViewChange('export')}
                  className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap ${view === 'export' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'text-zinc-500 hover:bg-zinc-800'}`}
                >
                  <TrendingUp className="w-4 h-4" /> Exportar
                </button>
                <button 
                  onClick={() => handleViewChange('history')}
                  className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap ${view === 'history' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' : 'text-zinc-500 hover:bg-zinc-800'}`}
                >
                  <History className="w-4 h-4" /> Historial
                </button>
              </>
            ) : (
              <>
                <button 
                  onClick={() => handleViewChange('branch_dashboard')}
                  className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${view === 'branch_dashboard' ? 'bg-zinc-100 text-zinc-900 shadow-lg' : 'text-zinc-500 hover:bg-zinc-800'}`}
                >
                  Panel Sucursal
                </button>
                <button 
                  onClick={() => handleViewChange('branch_clients')}
                  className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap ${view === 'branch_clients' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-zinc-500 hover:bg-zinc-800'}`}
                >
                  <User className="w-4 h-4" /> Clientes
                </button>
                <button 
                  onClick={() => handleViewChange('branch_purchases')}
                  className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap ${view === 'branch_purchases' ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'text-zinc-500 hover:bg-zinc-800'}`}
                >
                  <Coins className="w-4 h-4" /> Compra Oro
                </button>
                <button 
                  onClick={() => handleViewChange('branch_referrers')}
                  className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap ${view === 'branch_referrers' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-zinc-500 hover:bg-zinc-800'}`}
                >
                  <Users className="w-4 h-4" /> Referidos
                </button>
              </>
            )}
            {!branchMode && (user.role === 'admin' || user.role === 'superadmin') && (
              <button 
                onClick={() => handleViewChange('users')}
                className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap ${view === 'users' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-zinc-500 hover:bg-zinc-800'}`}
              >
                <User className="w-4 h-4" /> Usuarios
              </button>
            )}
            {!branchMode && (user.role === 'admin' || user.role === 'superadmin') && (
              <button 
                onClick={() => handleViewChange('deleted')}
                className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap ${view === 'deleted' ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' : 'text-zinc-500 hover:bg-zinc-800'}`}
              >
                <Trash2 className="w-4 h-4" /> Eliminados
              </button>
            )}
            {!branchMode && (user.role === 'admin' || user.role === 'superadmin') && (
              <button 
                onClick={() => handleViewChange('settings')}
                className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap ${view === 'settings' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-zinc-500 hover:bg-zinc-800'}`}
              >
                <Settings className="w-4 h-4" /> Empresa
              </button>
            )}
            {!branchMode && user.role === 'superadmin' && (
              <button 
                onClick={() => handleViewChange('branches')}
                className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap ${view === 'branches' ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/20' : 'text-zinc-500 hover:bg-zinc-800'}`}
              >
                <Building2 className="w-4 h-4" /> Sucursales
              </button>
            )}
          </div>

          {!branchMode && view !== 'users' && view !== 'history' && (
            <div className="flex items-center gap-4 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input 
                  type="text" 
                  placeholder="Buscar por cliente o recibo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-11 pr-10 py-3 bg-zinc-900 rounded-2xl border border-white/5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all"
                />
                {searchTerm && (
                  <button 
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-800 rounded-full transition-colors"
                  >
                    <X className="w-3 h-3 text-zinc-500" />
                  </button>
                )}
              </div>
              <button 
                onClick={() => {
                  resetFormData();
                  setShowAddModal(true);
                }}
                className="bg-amber-500 text-zinc-950 p-3 rounded-2xl shadow-lg hover:bg-amber-400 transition-all"
              >
                <Plus className="w-6 h-6" />
              </button>
            </div>
          )}

          {view === 'users' && (
            <button 
              onClick={() => setShowAddUserModal(true)}
              className="bg-blue-600 text-white px-6 py-3 rounded-2xl shadow-lg hover:bg-blue-700 transition-all flex items-center gap-2 font-bold shadow-blue-600/20"
            >
              <Plus className="w-5 h-5" /> Nuevo Usuario
            </button>
          )}
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {view === 'inventory' && (
            <motion.div 
              key="inventory"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              {/* Filters */}
              <div className="flex flex-wrap gap-3 mb-6">
                <div className="flex items-center gap-2 bg-zinc-900 px-4 py-2 rounded-2xl border border-white/5 shadow-sm min-w-[200px]">
                  <Search className="w-4 h-4 text-zinc-500" />
                  <input 
                    type="text"
                    placeholder="Buscar por cliente..."
                    value={inventoryClientSearch}
                    onChange={(e) => setInventoryClientSearch(e.target.value)}
                    className="text-xs font-bold bg-transparent focus:outline-none text-zinc-300 w-full placeholder:text-zinc-600"
                  />
                  {inventoryClientSearch && (
                    <button onClick={() => setInventoryClientSearch('')}>
                      <X className="w-3 h-3 text-zinc-500 hover:text-zinc-300" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 bg-zinc-900 px-4 py-2 rounded-2xl border border-white/5 shadow-sm">
                  <Filter className="w-4 h-4 text-zinc-500" />
                  <select 
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value as any)}
                    className="text-xs font-bold bg-transparent focus:outline-none cursor-pointer text-zinc-300"
                  >
                    <option value="all" className="bg-zinc-900">Todos los Tipos</option>
                    <option value="pieza" className="bg-zinc-900">Piezas</option>
                    <option value="barra" className="bg-zinc-900">Barras</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 bg-zinc-900 px-4 py-2 rounded-2xl border border-white/5 shadow-sm">
                  <CheckCircle2 className="w-4 h-4 text-zinc-500" />
                  <select 
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="text-xs font-bold bg-transparent focus:outline-none cursor-pointer text-zinc-300"
                  >
                    <option value="all" className="bg-zinc-900">Todos los Estados</option>
                    <option value="disponible" className="bg-zinc-900">Disponibles</option>
                    <option value="fundido" className="bg-zinc-900">Fundidos</option>
                    <option value="exportado" className="bg-zinc-900">Vendidos</option>
                  </select>
                </div>

                <div className="flex items-center gap-4 bg-zinc-900 px-4 py-2 rounded-2xl border border-white/5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase text-zinc-500">Ley Min:</span>
                    <input 
                      type="number" 
                      value={minPurity}
                      onChange={(e) => setMinPurity(Number(e.target.value))}
                      className="w-12 text-xs font-bold bg-transparent focus:outline-none text-zinc-300"
                    />
                    <span className="text-xs text-zinc-500">%</span>
                  </div>
                  <div className="w-px h-4 bg-zinc-800" />
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase text-zinc-500">Max:</span>
                    <input 
                      type="number" 
                      value={maxPurity}
                      onChange={(e) => setMaxPurity(Number(e.target.value))}
                      className="w-12 text-xs font-bold bg-transparent focus:outline-none text-zinc-300"
                    />
                    <span className="text-xs text-zinc-500">%</span>
                  </div>
                </div>
                
                {(typeFilter !== 'all' || statusFilter !== 'disponible' || searchTerm !== '' || inventoryClientSearch !== '' || minPurity > 0 || maxPurity < 100) && (
                  <motion.button 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onClick={resetFilters}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 text-amber-500 rounded-2xl border border-amber-500/20 text-[10px] uppercase font-bold hover:bg-amber-500/20 transition-all shadow-sm"
                  >
                    <X className="w-3 h-3" />
                    Limpiar Filtros
                  </motion.button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {paginatedInventory.map(m => (
                  <MaterialCard 
                    key={m.id} 
                    material={m} 
                    systemUsers={systemUsers}
                    onViewSource={setViewingSourceMaterial}
                    onEdit={(m) => {
                      setEditingMaterial(m);
                      setShowEditModal(true);
                    }}
                    onDelete={(mat) => setDeletingMaterial(mat)}
                    canEdit={user?.role === 'admin'}
                  />
                ))}
                {filteredMaterials.length === 0 && (
                  <div className="col-span-full py-20 text-center">
                    <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/5">
                      <AlertCircle className="text-zinc-500 w-8 h-8" />
                    </div>
                    <p className="text-zinc-500 font-medium">No se encontraron materiales con los filtros aplicados</p>
                  </div>
                )}
              </div>
              <Pagination 
                totalItems={filteredMaterials.length} 
                currentPage={currentPage} 
                onPageChange={setCurrentPage} 
              />
            </motion.div>
          )}

          {view === 'deleted' && (
            <motion.div 
              key="deleted"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
                    <Trash2 className="w-6 h-6 text-red-500" /> Materiales Eliminados
                  </h2>
                  <p className="text-sm text-zinc-500">Registros ocultos del inventario principal</p>
                </div>
              </div>

              {deletedMaterials.length === 0 ? (
                <div className="bg-zinc-900 border border-white/5 rounded-[32px] p-20 text-center">
                  <div className="w-20 h-20 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-6 border border-white/5">
                    <Trash2 className="w-10 h-10 text-zinc-600" />
                  </div>
                  <h3 className="text-xl font-bold text-zinc-100 mb-2">No hay materiales eliminados</h3>
                  <p className="text-zinc-500 max-w-sm mx-auto">Los materiales que elimines del inventario principal aparecerán aquí para su referencia o restauración.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {deletedMaterials.map(m => (
                    <div key={m.id} className="relative group">
                      <MaterialCard 
                        material={m} 
                        systemUsers={systemUsers}
                        onViewSource={setViewingSourceMaterial}
                      />
                      <div className="absolute bottom-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-all">
                        <button 
                          onClick={() => handleRestoreMaterial(m)}
                          className="px-4 py-2 bg-amber-500 text-zinc-950 text-[10px] font-bold rounded-xl hover:bg-amber-400 transition-all shadow-lg flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-3 h-3" /> Restaurar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {view === 'smelt' && (
            <motion.div 
              key="smelt"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="bg-zinc-900 border border-white/5 p-6 rounded-3xl mb-8">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-zinc-100 mb-1 flex items-center gap-2">
                      <Flame className="w-5 h-5 text-amber-500" /> Operación de Fundición
                    </h2>
                    <p className="text-zinc-500 text-sm">Seleccione al menos un material para generar una nueva barra.</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-[10px] text-zinc-500 uppercase font-bold">Seleccionados</p>
                      <p className="text-2xl font-mono font-bold text-zinc-100">{selectedForSmelting.length}</p>
                    </div>
                    <button 
                      disabled={selectedForSmelting.length < 1}
                      onClick={handleSmelt}
                      className="px-8 py-3 bg-amber-600 text-white rounded-2xl font-bold shadow-lg shadow-amber-600/20 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                    >
                      Procesar Fundición <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {selectedForSmelting.length > 0 && (
                  <div className="bg-zinc-950 p-6 rounded-2xl border border-white/5 shadow-inner space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                      {/* Pesos Group */}
                      <div className="space-y-4">
                        <h4 className="text-[10px] font-bold uppercase text-amber-500 tracking-widest border-b border-white/5 pb-2">Control de Pesos</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-zinc-500">Inicial (g)</label>
                            <input 
                              type="number" 
                              step="0.01"
                              value={smeltFormData.initialWeight || ''}
                              onChange={e => {
                                const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                const finalW = val * (1 - smeltFormData.loss / 100);
                                setSmeltFormData(prev => ({
                                  ...prev, 
                                  initialWeight: val,
                                  finalWeight: Number(finalW.toFixed(2)),
                                  total: Number(finalW.toFixed(2)) * prev.pricePerGram
                                }));
                              }}
                              className="w-full p-2 bg-zinc-900 rounded-lg border border-white/5 text-sm font-mono text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-zinc-500">Final (g)</label>
                            <input 
                              type="number" 
                              step="0.01"
                              value={smeltFormData.finalWeight || ''}
                              onChange={e => {
                                const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                const lossPct = smeltFormData.initialWeight > 0 ? ((smeltFormData.initialWeight - val) / smeltFormData.initialWeight) * 100 : 0;
                                setSmeltFormData(prev => ({
                                  ...prev, 
                                  finalWeight: val,
                                  loss: Number(lossPct.toFixed(2)),
                                  total: val * prev.pricePerGram
                                }));
                              }}
                              className="w-full p-2 bg-zinc-900 rounded-lg border border-white/5 text-sm font-mono text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                            />
                          </div>
                          <div className="col-span-2 space-y-1">
                            <label className="text-[10px] font-bold uppercase text-zinc-500">Merma (%)</label>
                            <input 
                              type="number" 
                              step="0.01"
                              value={smeltFormData.loss || ''}
                              onChange={e => {
                                const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                const finalW = smeltFormData.initialWeight * (1 - val / 100);
                                setSmeltFormData(prev => ({
                                  ...prev, 
                                  loss: val,
                                  finalWeight: Number(finalW.toFixed(2)),
                                  total: Number(finalW.toFixed(2)) * prev.pricePerGram
                                }));
                              }}
                              className="w-full p-2 bg-zinc-900 rounded-lg border border-white/5 text-sm font-mono text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Mercado Group */}
                      <div className="space-y-4">
                        <h4 className="text-[10px] font-bold uppercase text-amber-500 tracking-widest border-b border-white/5 pb-2">Mercado y Pureza</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-zinc-500">Cotización</label>
                            <input 
                              type="number" 
                              step="0.01"
                              value={smeltFormData.marketPrice || ''}
                              onChange={e => setSmeltFormData(prev => ({...prev, marketPrice: e.target.value === '' ? 0 : parseFloat(e.target.value)}))}
                              className="w-full p-2 bg-zinc-900 rounded-lg border border-white/5 text-sm font-mono text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-zinc-500">Ley (%)</label>
                            <input 
                              type="number" 
                              step="0.01"
                              value={smeltFormData.purity || ''}
                              onChange={e => setSmeltFormData(prev => ({...prev, purity: e.target.value === '' ? 0 : parseFloat(e.target.value)}))}
                              className="w-full p-2 bg-zinc-900 rounded-lg border border-white/5 text-sm font-mono text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                            />
                          </div>
                          <div className="col-span-2 space-y-1">
                            <label className="text-[10px] font-bold uppercase text-zinc-500">USD/BS</label>
                            <input 
                              type="number" 
                              step="0.01"
                              value={smeltFormData.usdToBs || ''}
                              onChange={e => setSmeltFormData(prev => ({...prev, usdToBs: e.target.value === '' ? 0 : parseFloat(e.target.value)}))}
                              className="w-full p-2 bg-zinc-900 rounded-lg border border-white/5 text-sm font-mono text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Resultado Group */}
                      <div className="space-y-4">
                        <h4 className="text-[10px] font-bold uppercase text-amber-500 tracking-widest border-b border-white/5 pb-2">Valorización</h4>
                        <div className="grid grid-cols-1 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-zinc-500">Precio/g</label>
                            <input 
                              type="number" 
                              step="0.01"
                              value={smeltFormData.pricePerGram || ''}
                              onChange={e => {
                                const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                setSmeltFormData(prev => ({
                                  ...prev, 
                                  pricePerGram: val,
                                  total: prev.finalWeight * val
                                }));
                              }}
                              className="w-full p-2 bg-zinc-900 rounded-lg border border-white/5 text-sm font-mono text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-zinc-500">Total</label>
                            <input 
                              type="number" 
                              step="0.01"
                              value={smeltFormData.total || ''}
                              onChange={e => setSmeltFormData(prev => ({...prev, total: e.target.value === '' ? 0 : parseFloat(e.target.value)}))}
                              className="w-full p-2 bg-amber-500/10 rounded-lg border border-amber-500/20 text-sm font-mono font-bold text-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Smelting Filters */}
              <div className="bg-zinc-900 p-4 rounded-3xl border border-white/5 shadow-sm mb-8 flex flex-col md:flex-row items-center gap-4">
                <div className="relative flex-1 w-full">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input 
                    type="text"
                    placeholder="Buscar por recibo, cliente o peso..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-zinc-950 rounded-2xl border border-white/5 focus:border-amber-500/20 focus:bg-zinc-950 focus:ring-4 focus:ring-amber-500/5 transition-all text-sm text-zinc-100"
                  />
                </div>
                
                <div className="flex items-center gap-3 w-full md:w-auto">
                  <div className="flex items-center gap-2 bg-zinc-950 px-4 py-2.5 rounded-2xl border border-white/5">
                    <Filter className="w-4 h-4 text-zinc-500" />
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase text-zinc-500">Ley:</span>
                      <input 
                        type="number" 
                        value={minPurity}
                        onChange={(e) => setMinPurity(Number(e.target.value))}
                        className="w-10 text-xs font-bold bg-transparent focus:outline-none text-zinc-300 text-center"
                        placeholder="0"
                      />
                      <span className="text-zinc-700">-</span>
                      <input 
                        type="number" 
                        value={maxPurity}
                        onChange={(e) => setMaxPurity(Number(e.target.value))}
                        className="w-10 text-xs font-bold bg-transparent focus:outline-none text-zinc-300 text-center"
                        placeholder="100"
                      />
                      <span className="text-xs text-zinc-500">%</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => {
                        const allIds = availableForSmelting.map(m => m.id!);
                        setSelectedForSmelting(prev => {
                          const newSelection = [...new Set([...prev, ...allIds])];
                          return newSelection;
                        });
                      }}
                      className="px-4 py-2.5 bg-zinc-950 text-zinc-400 rounded-2xl text-[10px] font-bold uppercase hover:bg-zinc-800 hover:text-zinc-100 transition-all border border-white/5"
                    >
                      Seleccionar Todo
                    </button>

                    {selectedForSmelting.length > 0 && (
                      <button 
                        onClick={() => setSelectedForSmelting([])}
                        className="px-4 py-2.5 bg-red-500/10 text-red-400 rounded-2xl text-[10px] font-bold uppercase hover:bg-red-500/20 transition-all border border-red-500/20"
                      >
                        Deseleccionar
                      </button>
                    )}
                    
                    {(searchTerm !== '' || minPurity > 0 || maxPurity < 100) && (
                      <button 
                        onClick={resetFilters}
                        className="p-2.5 bg-zinc-950 text-zinc-500 rounded-2xl hover:bg-zinc-800 hover:text-zinc-300 transition-all border border-white/5"
                        title="Limpiar Filtros"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {paginatedSmelting.map(m => (
                  <MaterialCard 
                    key={m.id} 
                    material={m} 
                    systemUsers={systemUsers}
                    selectable 
                    isSelected={selectedForSmelting.includes(m.id!)}
                    onViewSource={setViewingSourceMaterial}
                    onSelect={(id) => {
                      setSelectedForSmelting(prev => 
                        prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
                      );
                    }}
                    onEdit={(m) => {
                      setEditingMaterial(m);
                      setShowEditModal(true);
                    }}
                    canEdit={user?.role === 'admin'}
                  />
                ))}
              </div>
              <Pagination 
                totalItems={availableForSmelting.length} 
                currentPage={currentPage} 
                onPageChange={setCurrentPage} 
              />
            </motion.div>
          )}

          {view === 'export' && (
            <motion.div 
              key="export"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="bg-zinc-900 border border-white/5 p-6 rounded-3xl mb-8">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-zinc-100 mb-1 flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-emerald-500" /> Exportación de Mineral
                    </h2>
                    <p className="text-zinc-500 text-sm">Seleccione los materiales de oro para la venta/exportación.</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-[10px] text-zinc-500 uppercase font-bold">Seleccionados</p>
                      <p className="text-2xl font-mono font-bold text-zinc-100">{selectedForExport.length}</p>
                    </div>
                    <button 
                      disabled={selectedForExport.length < 1 || !exportFormData.client || !exportFormData.receiptNumber}
                      onClick={handleExport}
                      className="px-8 py-3 bg-emerald-600 text-white rounded-2xl font-bold shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                    >
                      Registrar Venta <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {selectedForExport.length > 0 && (
                  <div className="bg-zinc-950 p-6 rounded-2xl border border-white/5 shadow-inner space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                      {/* Datos de Venta */}
                      <div className="space-y-4">
                        <h4 className="text-[10px] font-bold uppercase text-emerald-500 tracking-widest border-b border-white/5 pb-2">Datos de Venta</h4>
                        <div className="grid grid-cols-1 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-zinc-500">Cliente / Destino</label>
                            <input 
                              type="text" 
                              placeholder="Nombre del comprador"
                              value={exportFormData.client || ''}
                              onChange={e => setExportFormData(prev => ({...prev, client: e.target.value}))}
                              className="w-full p-2 bg-zinc-900 rounded-lg border border-white/5 text-sm font-medium text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-zinc-500">Nº Comprobante / Factura</label>
                            <input 
                              type="text" 
                              placeholder="EXP-001"
                              value={exportFormData.receiptNumber || ''}
                              onChange={e => setExportFormData(prev => ({...prev, receiptNumber: e.target.value}))}
                              className="w-full p-2 bg-zinc-900 rounded-lg border border-white/5 text-sm font-mono text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Control de Pesos y Precios */}
                      <div className="space-y-4">
                        <h4 className="text-[10px] font-bold uppercase text-emerald-500 tracking-widest border-b border-white/5 pb-2">Pesos y Cotización</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-zinc-500">Peso Total (g)</label>
                            <input 
                              type="number" 
                              readOnly
                              value={exportFormData.totalWeight || 0}
                              className="w-full p-2 bg-zinc-900/50 rounded-lg border border-white/5 text-sm font-mono text-zinc-400 cursor-not-allowed"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-zinc-500">Cotización</label>
                            <input 
                              type="number" 
                              step="0.01"
                              value={exportFormData.marketPrice || ''}
                              onChange={e => setExportFormData(prev => ({...prev, marketPrice: parseFloat(e.target.value) || 0}))}
                              className="w-full p-2 bg-zinc-900 rounded-lg border border-white/5 text-sm font-mono text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                            />
                          </div>
                          <div className="col-span-2 space-y-1">
                            <label className="text-[10px] font-bold uppercase text-zinc-500">Precio por Gramo</label>
                            <input 
                              type="number" 
                              step="0.01"
                              value={exportFormData.pricePerGram || ''}
                              onChange={e => {
                                const val = parseFloat(e.target.value) || 0;
                                setExportFormData(prev => ({
                                  ...prev, 
                                  pricePerGram: val,
                                  salePrice: prev.totalWeight * val
                                }));
                              }}
                              className="w-full p-2 bg-zinc-900 rounded-lg border border-white/5 text-sm font-mono text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Valorización Final */}
                      <div className="space-y-4">
                        <h4 className="text-[10px] font-bold uppercase text-emerald-500 tracking-widest border-b border-white/5 pb-2">Valorización Final</h4>
                        <div className="bg-emerald-500/5 p-6 rounded-2xl border border-emerald-500/10 flex flex-col justify-center h-[calc(100%-2rem)]">
                          <p className="text-[10px] text-emerald-500/60 uppercase font-bold mb-2">Precio de Venta Total</p>
                          <p className="text-4xl font-mono font-bold text-emerald-400 tracking-tighter">
                            {formatCurrency(exportFormData.salePrice)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-8">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Materiales Disponibles</h3>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setSelectedForExport(availableForSmelting.map(m => m.id!))}
                        className="text-[10px] font-bold text-zinc-400 hover:text-zinc-100 transition-colors"
                      >
                        Seleccionar Todos
                      </button>
                      <span className="text-zinc-800">|</span>
                      <button 
                        onClick={() => setSelectedForExport([])}
                        className="text-[10px] font-bold text-zinc-400 hover:text-zinc-100 transition-colors"
                      >
                        Deseleccionar
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {paginatedSmelting.map(m => (
                      <MaterialCard 
                        key={m.id} 
                        material={m} 
                        systemUsers={systemUsers}
                        selectable
                        isSelected={selectedForExport.includes(m.id!)}
                        onSelect={(id) => {
                          setSelectedForExport(prev => 
                            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
                          );
                        }}
                        onEdit={(m) => {
                          setEditingMaterial(m);
                          setShowEditModal(true);
                        }}
                        canEdit={user?.role === 'admin'}
                      />
                    ))}
                  </div>
                  <Pagination 
                    totalItems={availableForSmelting.length} 
                    currentPage={currentPage} 
                    onPageChange={setCurrentPage} 
                  />
                </div>
              </div>
            </motion.div>
          )}

          {view === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-2xl font-bold text-zinc-100">Historial de Fundiciones</h2>
                <p className="text-xs text-zinc-400 font-medium bg-zinc-900 px-3 py-1 rounded-full border border-white/5">
                  {smeltingOperations.length} operaciones registradas
                </p>
              </div>
              <div className="bg-zinc-900 rounded-3xl border border-white/5 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-950 border-b border-white/5">
                        <th className="px-6 py-4 text-[10px] font-bold uppercase text-zinc-500 tracking-widest">Fecha</th>
                        <th className="px-6 py-4 text-[10px] font-bold uppercase text-zinc-500 tracking-widest">Material Resultante</th>
                        <th className="px-6 py-4 text-[10px] font-bold uppercase text-zinc-500 tracking-widest text-right">Peso Inicial</th>
                        <th className="px-6 py-4 text-[10px] font-bold uppercase text-zinc-500 tracking-widest text-right">Peso Final</th>
                        <th className="px-6 py-4 text-[10px] font-bold uppercase text-zinc-500 tracking-widest text-right">Pureza</th>
                        <th className="px-6 py-4 text-[10px] font-bold uppercase text-zinc-500 tracking-widest text-right">Precio Mercado</th>
                        <th className="px-6 py-4 text-[10px] font-bold uppercase text-zinc-500 tracking-widest text-right">Total</th>
                        <th className="px-6 py-4 text-[10px] font-bold uppercase text-zinc-500 tracking-widest">Materiales de Origen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {paginatedHistory.map(op => {
                        const resultMat = materials.find(m => m.id === op.resultMaterialId);
                        return (
                          <tr key={op.id} className="hover:bg-zinc-800/50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className="text-sm font-bold text-zinc-100">
                                  {new Date(op.date).toLocaleDateString()}
                                </span>
                                <span className="text-[10px] text-zinc-500">
                                  {new Date(op.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              {resultMat ? (
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold text-amber-500">#{resultMat.receiptNumber}</span>
                                  <span className="text-[10px] text-zinc-400">{resultMat.client}</span>
                                </div>
                              ) : (
                                <span className="text-xs text-zinc-500 italic">Cargando...</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="text-sm font-mono font-bold text-zinc-300">{formatNumber(op.totalInitialWeight)}g</span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="text-sm font-mono font-bold text-amber-500">{formatNumber(op.totalFinalWeight)}g</span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="text-sm font-mono font-bold text-zinc-300">{formatNumber(op.purity)}%</span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="text-sm font-mono font-bold text-zinc-300">${formatNumber(op.marketPrice)}</span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="text-sm font-mono font-bold text-emerald-500">${formatNumber(op.total)}</span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-wrap gap-1">
                                {resultMat?.sourceMaterials?.map((sm, idx) => (
                                  <span key={idx} className="px-2 py-0.5 bg-zinc-950 text-[9px] font-bold text-zinc-500 rounded-full border border-white/5">
                                    #{sm.receiptNumber}
                                  </span>
                                )) || (
                                  <span className="text-[10px] text-zinc-500 italic">Detalle no disponible</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {smeltingOperations.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-6 py-12 text-center">
                            <div className="flex flex-col items-center gap-2 text-zinc-500">
                              <History className="w-8 h-8 opacity-20" />
                              <p className="text-sm font-medium">No hay operaciones registradas</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <Pagination 
                totalItems={smeltingOperations.length} 
                currentPage={currentPage} 
                onPageChange={setCurrentPage} 
              />
            </motion.div>
          )}

          {view === 'users' && (
            <motion.div 
              key="users"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
            >
              {systemUsers.map(u => (
                <div key={u.id} className="bg-zinc-900 p-6 rounded-3xl border border-white/5 shadow-sm relative overflow-hidden">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold text-xl">
                      {u.name[0]}
                    </div>
                    <div>
                      <h3 className="font-bold text-zinc-100">{u.name}</h3>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] font-bold uppercase text-blue-400 tracking-widest">{u.role}</p>
                          {u.branchId && (
                            <span className="text-[8px] font-bold uppercase bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500">
                              {branches.find(b => b.id === u.branchId)?.name}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">@{u.username}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-4 border-t border-white/5">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Hash className="w-3 h-3 text-zinc-500" />
                        <span className="text-xs font-mono font-bold text-zinc-400 tracking-widest">PIN: {u.pin}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3 h-3 text-zinc-500" />
                        <span className="text-[10px] text-zinc-500 font-bold">
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleEditUser(u)}
                        className="text-[10px] font-bold text-blue-400 hover:bg-blue-500/10 px-2 py-1 rounded transition-colors"
                      >
                        Editar
                      </button>
                      <button 
                        onClick={() => handleDeleteUser(u.id!)}
                        className="text-[10px] font-bold text-red-400 hover:bg-red-500/10 px-2 py-1 rounded transition-colors"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {view === 'branches' && user.role === 'superadmin' && (
            <motion.div 
              key="branches"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-zinc-100">Gestión de Sucursales</h2>
                  <p className="text-sm text-zinc-400">Administre las diferentes sedes del sistema.</p>
                </div>
                <button 
                  onClick={() => {
                    setEditingBranch(null);
                    setBranchFormData({ name: '', abbreviation: '', location: '', phone: '', managerId: '' });
                    setShowAddBranchModal(true);
                  }}
                  className="px-6 py-3 bg-orange-600 text-white rounded-2xl font-bold shadow-lg shadow-orange-600/20 hover:bg-orange-700 transition-all flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" /> Nueva Sucursal
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {branches.map(b => (
                  <div key={b.id} className="bg-zinc-900 p-6 rounded-3xl border border-white/5 shadow-sm relative overflow-hidden group">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 rounded-2xl bg-orange-500/10 text-orange-400 flex items-center justify-center">
                        <Building2 className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-zinc-100">{b.name}</h3>
                          <span className="px-1.5 py-0.5 bg-orange-500/10 text-orange-400 rounded text-[10px] font-bold uppercase tracking-widest border border-orange-500/20">
                            {b.abbreviation}
                          </span>
                        </div>
                        <p className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest">Sucursal</p>
                      </div>
                    </div>
                    
                    <div className="space-y-3 mb-6">
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <MapPin className="w-3 h-3" />
                        <span>{b.location || 'Sin ubicación'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <Phone className="w-3 h-3" />
                        <span>{b.phone || 'Sin teléfono'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <User className="w-3 h-3" />
                        <span>Encargado: {systemUsers.find(u => u.id === b.managerId)?.name || 'No asignado'}</span>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4 border-t border-white/5">
                      <button 
                        onClick={() => handleEditBranch(b)}
                        className="text-[10px] font-bold text-orange-400 hover:bg-orange-500/10 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Editar
                      </button>
                      <button 
                        onClick={() => handleDeleteBranch(b.id)}
                        className="text-[10px] font-bold text-red-400 hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {view === 'branch_dashboard' && (
            <motion.div 
              key="branch_dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-zinc-900 p-6 rounded-3xl border border-white/5 shadow-sm">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-500">
                      <User className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-500 uppercase font-bold">Total Clientes</p>
                      <p className="text-2xl font-bold text-zinc-100">{clients.filter(c => c.branchId === branchMode).length}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setView('branch_clients')}
                    className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold transition-all"
                  >
                    Gestionar Clientes
                  </button>
                </div>

                <div className="bg-zinc-900 p-6 rounded-3xl border border-white/5 shadow-sm">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-indigo-500/10 rounded-2xl text-indigo-500">
                      <Users className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-500 uppercase font-bold">Total Referidos</p>
                      <p className="text-2xl font-bold text-zinc-100">{referrers.filter(r => r.branchId === branchMode).length}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setView('branch_referrers')}
                    className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold transition-all"
                  >
                    Gestionar Referidos
                  </button>
                </div>

                <div className="bg-zinc-900 p-6 rounded-3xl border border-white/5 shadow-sm">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-amber-500/10 rounded-2xl text-amber-500">
                      <Coins className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-500 uppercase font-bold">Compras Hoy</p>
                      <p className="text-2xl font-bold text-zinc-100">
                        {goldPurchases.filter(p => p.branchId === branchMode && p.createdAt.startsWith(new Date().toISOString().split('T')[0])).length}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setView('branch_purchases')}
                    className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold transition-all"
                  >
                    Nueva Compra
                  </button>
                </div>

                <div className="bg-zinc-900 p-6 rounded-3xl border border-white/5 shadow-sm">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-500">
                      <TrendingUp className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-500 uppercase font-bold">Total Comprado (g)</p>
                      <p className="text-2xl font-bold text-zinc-100">
                        {formatNumber(goldPurchases.filter(p => p.branchId === branchMode).reduce((acc, curr) => acc + (curr.items?.reduce((iAcc, item) => iAcc + item.finalWeight, 0) || 0), 0))}g
                      </p>
                    </div>
                  </div>
                  <div className="text-[10px] text-zinc-500 font-bold uppercase">Rendimiento Sucursal</div>
                </div>
              </div>

              <div className="bg-zinc-900 rounded-3xl border border-white/5 overflow-hidden">
                <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center">
                  <h3 className="text-sm font-bold text-zinc-100">Últimas Compras</h3>
                  <button onClick={() => setView('branch_purchases')} className="text-xs text-amber-500 font-bold hover:underline">Ver todas</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-[10px] text-zinc-500 uppercase font-bold border-b border-white/5">
                        <th className="px-6 py-3 text-left">Cliente</th>
                        <th className="px-6 py-3 text-left">Tipo</th>
                        <th className="px-6 py-3 text-left">Peso</th>
                        <th className="px-6 py-3 text-left">Precio</th>
                        <th className="px-6 py-3 text-left">Fecha</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {goldPurchases.filter(p => p.branchId === branchMode).slice(0, 5).map(p => (
                        <tr key={p.id} className="text-sm text-zinc-300">
                          <td className="px-6 py-3">
                            <div>
                              <p className="font-bold text-zinc-100">{clients.find(c => c.id === p.clientId)?.name || 'Desconocido'}</p>
                              {p.referrerName && (
                                <p className="text-[9px] text-blue-400 font-bold uppercase tracking-widest flex items-center gap-1">
                                  <User className="w-2 h-2" /> Ref: {p.referrerName}
                                </p>
                              )}
                            </div>
                          </td>
                            <td className="px-6 py-3">
                              <div className="flex flex-col gap-0.5">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase w-fit ${p.type === 'abierto' ? 'bg-blue-500/10 text-blue-500' : 'bg-zinc-800 text-zinc-400'}`}>
                                  {p.type}
                                </span>
                                {p.advancePayment > 0 && (
                                  <span className="text-[7px] text-amber-500 font-bold uppercase">Anticipo</span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-3 font-mono">{formatNumber(p.items?.reduce((acc, curr) => acc + curr.finalWeight, 0) || 0)}g</td>
                            <td className="px-6 py-3 font-mono text-emerald-500">{formatNumber(p.total)} BS</td>
                            <td className="px-6 py-3 text-xs text-zinc-500">{new Date(p.createdAt).toLocaleDateString()}</td>
                          </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'branch_clients' && (
            <motion.div 
              key="branch_clients"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-zinc-100">Gestión de Clientes</h2>
                <button 
                  onClick={() => {
                    setEditingClient(null);
                    setClientFormData({ 
                      name: '', phone: '', email: '', ci: '', 
                      workplace: '', isMineCooperative: false, recommendedBy: '',
                      referentialPhone: ''
                    });
                    setShowAddClientModal(true);
                  }}
                  className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-blue-600/20 hover:bg-blue-500 transition-all flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Nuevo Cliente
                </button>
              </div>

              <div className="bg-zinc-900 rounded-3xl border border-white/5 overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="text-[10px] text-zinc-500 uppercase font-bold border-b border-white/5">
                      <th className="px-6 py-4 text-left">Cliente</th>
                      <th className="px-6 py-4 text-left">CI / Trabajo</th>
                      <th className="px-6 py-4 text-left">Contacto</th>
                      <th className="px-6 py-4 text-left">Referencia</th>
                      <th className="px-6 py-4 text-left">Registro</th>
                      <th className="px-6 py-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                     {clients.filter(c => c.branchId === branchMode).map(c => (
                      <tr key={c.id} className="group hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-zinc-100">{c.name}</p>
                            {c.isMineCooperative && (
                              <span className="px-2 py-0.5 bg-amber-500/10 text-amber-500 text-[8px] font-bold uppercase rounded-full border border-amber-500/20">
                                Coop. Mina
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <p className="text-xs font-bold text-zinc-300">CI: {c.ci || 'N/A'}</p>
                            <p className="text-[10px] text-zinc-500">{c.workplace || 'N/A'}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                              <Phone className="w-3 h-3" /> {c.phone}
                            </div>
                            {c.referentialPhone && (
                              <div className="flex items-center gap-2 text-[9px] text-zinc-500">
                                <Phone className="w-2.5 h-2.5" /> Ref: {c.referentialPhone}
                              </div>
                            )}
                            <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                              <Mail className="w-3 h-3" /> {c.email || 'N/A'}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-xs text-zinc-400">{c.recommendedBy || 'Directo'}</p>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <p className="text-[10px] text-zinc-400">{new Date(c.createdAt).toLocaleDateString()}</p>
                            <p className="text-[9px] text-zinc-600">Por: {c.registeredBy || 'N/A'}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => {
                                setHistoryClient(c);
                                setShowClientHistoryModal(true);
                              }}
                              className="px-3 py-1.5 bg-amber-500/10 text-amber-500 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-amber-500 hover:text-zinc-950 transition-all border border-amber-500/20"
                            >
                              Historial
                            </button>
                            <button 
                              onClick={() => {
                                setEditingClient(c);
                                setClientFormData({
                                  name: c.name,
                                  phone: c.phone,
                                  email: c.email || '',
                                  ci: c.ci || '',
                                  workplace: c.workplace || '',
                                  isMineCooperative: !!c.isMineCooperative,
                                  recommendedBy: c.recommendedBy || '',
                                  referentialPhone: c.referentialPhone || ''
                                });
                                setShowAddClientModal(true);
                              }}
                              className="p-2 bg-zinc-800 text-zinc-400 rounded-xl hover:bg-zinc-700 transition-all"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {view === 'branch_referrers' && (
            <motion.div 
              key="branch_referrers"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-zinc-100 italic">Gestión de Referidos</h2>
                <button 
                  onClick={() => {
                    setEditingReferrer(null);
                    setReferrerFormData({ 
                      name: '', phone1: '', phone2: '', ci: ''
                    });
                    setShowAddReferrerModal(true);
                  }}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 transition-all flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Nuevo Referido
                </button>
              </div>

              <div className="bg-zinc-900 rounded-3xl border border-white/5 overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="text-[10px] text-zinc-500 uppercase font-bold border-b border-white/5">
                      <th className="px-6 py-4 text-left">Nombre</th>
                      <th className="px-6 py-4 text-left">CI</th>
                      <th className="px-6 py-4 text-left">Teléfonos</th>
                      <th className="px-6 py-4 text-left">Comisiones Pendientes</th>
                      <th className="px-6 py-4 text-left">Registro</th>
                      <th className="px-6 py-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                     {referrers.filter(r => r.branchId === branchMode).map(r => (
                      <tr key={r.id} className="group hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4">
                          <p className="text-sm font-bold text-zinc-100">{r.name}</p>
                        </td>
                        <td className="px-6 py-4 text-xs font-bold text-zinc-300">
                          {r.ci || 'N/A'}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <p className="text-xs text-zinc-300">{r.phone1}</p>
                            {r.phone2 && <p className="text-[10px] text-zinc-500">{r.phone2} (Opcional)</p>}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            {(() => {
                              const pending = goldPurchases
                                .filter(p => p.referrerName === r.name && p.branchId === branchMode && !p.commissionPaid && p.commission && p.commission > 0);
                              const totalPending = pending.reduce((acc, curr) => acc + (curr.commission || 0), 0);
                              
                              return (
                                <>
                                  <p className="text-sm font-mono font-bold text-amber-500">{formatNumber(totalPending)} BS</p>
                                  <p className="text-[9px] text-zinc-500 font-bold uppercase">{pending.length} recibos pendientes</p>
                                </>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs text-zinc-500">
                          {new Date(r.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => {
                                setPayoutHistoryReferrer(r);
                                setShowPayoutHistoryModal(true);
                              }}
                              className="px-3 py-1.5 bg-blue-500/10 text-blue-500 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-blue-500 hover:text-white transition-all border border-blue-500/20"
                            >
                              Historial
                            </button>
                            <button 
                              onClick={() => {
                                setPayoutReferrer(r);
                                setSelectedPurchasesForPayout([]);
                                setPayoutNotes('');
                                setShowPayoutModal(true);
                              }}
                              className="px-3 py-1.5 bg-amber-500/10 text-amber-500 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-amber-500 hover:text-zinc-950 transition-all border border-amber-500/20"
                            >
                              Liquidar Pagar
                            </button>
                            <button 
                              onClick={() => {
                                setEditingReferrer(r);
                                setReferrerFormData({
                                  name: r.name,
                                  phone1: r.phone1,
                                  phone2: r.phone2 || '',
                                  ci: r.ci
                                });
                                setShowAddReferrerModal(true);
                              }}
                              className="p-2 bg-zinc-800 text-zinc-400 rounded-xl hover:bg-zinc-700 transition-all font-bold"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleDeleteReferrer(r.id)}
                              className="p-2 bg-red-600/10 text-red-500 rounded-xl hover:bg-red-600/20 transition-all font-bold"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {referrers.filter(r => r.branchId === branchMode).length === 0 && (
                  <div className="px-6 py-12 text-center text-zinc-600">
                    <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="text-sm font-bold uppercase tracking-widest">No hay referidos registrados</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {view === 'branch_purchases' && (
            <motion.div 
              key="branch_purchases"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                  <h2 className="text-xl font-bold text-zinc-100">Registro de Compras</h2>
                  <div className="flex bg-zinc-900 p-1 rounded-xl border border-white/5">
                    <button 
                      onClick={() => {
                        setPurchaseTypeFilter('abierto');
                        setPurchaseHistoryPage(1);
                      }}
                      className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${purchaseTypeFilter === 'abierto' ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                      Abiertos
                    </button>
                    <button 
                      onClick={() => {
                        setPurchaseTypeFilter('cerrado');
                        setPurchaseHistoryPage(1);
                      }}
                      className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${purchaseTypeFilter === 'cerrado' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                      Cerrados
                    </button>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setEditingPurchase(null);
                    setPurchaseCart([]);
                    setPurchaseHeader({ 
                      clientId: '', 
                      type: 'abierto',
                      date: new Date().toISOString().split('T')[0],
                      referrerName: '',
                      commission: 0
                    });
                    setPurchaseItem({
                      initialWeight: 0,
                      finalWeight: 0,
                      marketPrice: 0,
                      purity: 100,
                      pricePerGram: 0,
                      total: 0,
                      usdToBs: 6.96,
                      loss: 0
                    });
                    setClientSearch('');
                    setShowAddPurchaseModal(true);
                  }}
                  className="bg-amber-500 text-zinc-950 px-4 py-2 rounded-xl text-sm font-bold shadow-lg hover:bg-amber-400 transition-all flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Nueva Compra
                </button>
              </div>

              <div className="bg-zinc-900 rounded-3xl border border-white/5 overflow-hidden">
                <div className="px-6 py-4 border-b border-white/5">
                  <h3 className="text-sm font-bold text-zinc-100">Historial de Compras</h3>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="text-[10px] text-zinc-500 uppercase font-bold border-b border-white/5">
                      <th className="px-6 py-4 text-left">Recibo</th>
                      <th className="px-6 py-4 text-left">Cliente</th>
                      <th className="px-6 py-4 text-left">Items</th>
                      <th className="px-6 py-4 text-left">Tipo</th>
                      <th className="px-6 py-4 text-left">Comisión</th>
                      <th className="px-6 py-4 text-left">Anticipo</th>
                      <th className="px-6 py-4 text-left">Total BS</th>
                      <th className="px-6 py-4 text-left">Fecha</th>
                      <th className="px-6 py-4 text-left">Operador</th>
                      <th className="px-6 py-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {paginatedPurchaseHistory.map(p => {
                      const isExpanded = expandedPurchases.includes(p.id);
                      const hasOpeningDetails = p.type === 'cerrado' && p.closedAt;
                      
                      return (
                        <React.Fragment key={p.id}>
                          <tr 
                            className={`group hover:bg-white/[0.02] transition-colors ${hasOpeningDetails ? 'cursor-pointer' : ''}`}
                            onClick={() => hasOpeningDetails && setExpandedPurchases(prev => prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id])}
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                {hasOpeningDetails && (
                                  <div className="text-zinc-600">
                                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                  </div>
                                )}
                                <div>
                                  <p className="text-sm font-mono font-bold text-amber-500">#{p.receiptNumber}</p>
                                  {hasOpeningDetails && (
                                    <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-tight">Cierre (Expandible)</p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div>
                                <p className="text-sm font-bold text-zinc-100">{clients.find(c => c.id === p.clientId)?.name || 'Desconocido'}</p>
                                {p.referrerName && (
                                  <p className="text-[9px] text-blue-400 font-bold uppercase tracking-widest flex items-center gap-1">
                                    <User className="w-2 h-2" /> Ref: {p.referrerName}
                                  </p>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-1 bg-zinc-800 text-zinc-400 rounded-lg text-[10px] font-bold">
                                  {p.items?.length || 0} items
                                </span>
                                <span className="text-[10px] text-zinc-500 font-bold">
                                  {formatNumber(p.items?.reduce((acc: number, curr: any) => acc + curr.finalWeight, 0) || 0)}g total
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col gap-1">
                                <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider w-fit flex items-center gap-1 ${
                                  p.type === 'abierto' 
                                    ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' 
                                    : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]'
                                }`}>
                                  {p.type === 'abierto' ? (
                                    <>
                                      <LockOpen className="w-3 h-3" /> ABIERTO
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="w-3 h-3" /> CIERRE
                                    </>
                                  )}
                                </span>
                                {p.advancePayment > 0 && p.type === 'abierto' && (
                                  <span className="px-2 py-0.5 bg-amber-500/10 text-amber-500 text-[8px] font-bold uppercase rounded-md border border-amber-500/20 w-fit">
                                    Anticipo Pagado
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-sm font-mono font-bold text-blue-400">{formatNumber(p.type === 'cerrado' && p.closedAt ? 0 : (p.commission || 0))} BS</p>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-sm font-mono font-bold text-amber-500">{formatNumber(p.type === 'cerrado' && p.closedAt ? 0 : (p.advancePayment || 0))} BS</p>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-sm font-mono font-bold text-emerald-500">{formatNumber(p.type === 'cerrado' ? (p.closeTotal || p.total) : p.total)} BS</p>
                            </td>
                            <td className="px-6 py-4 text-xs text-zinc-500 font-mono">
                              {p.type === 'cerrado' && p.closedAt ? new Date(p.closedAt).toLocaleString() : new Date(p.createdAt).toLocaleString()}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center border border-white/5">
                                  <User className="w-3 h-3 text-zinc-500" />
                                </div>
                                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-tight">
                                  {(p.type === 'cerrado' && p.closedAt) ? (
                                    systemUsers.find(u => u.id === p.closedBy || u.username === p.closedBy || u.email === p.closedBy)?.name || p.closedBy || 'Sistema'
                                  ) : (
                                    systemUsers.find(u => u.id === p.createdBy || u.username === p.createdBy || u.email === p.createdBy)?.name || p.createdBy || 'Sistema'
                                  )}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                                {p.type === 'abierto' && p.advancePayment > 0 && (
                                  <button 
                                    onClick={() => handlePrintAdvanceReceipt(p)}
                                    className="p-2 bg-amber-500/10 text-amber-500 rounded-xl hover:bg-amber-500 hover:text-zinc-950 transition-all border border-amber-500/20"
                                    title="Imprimir Recibo de Pago"
                                  >
                                    <Download className="w-4 h-4" />
                                  </button>
                                )}
                                
                                <button 
                                  onClick={() => handlePrintPurchaseReceipt(p, p.type === 'abierto' ? 'abierto' : 'cierre')}
                                  className={`p-2 rounded-xl transition-all border ${
                                    p.type === 'abierto' 
                                      ? 'bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500 hover:text-white' 
                                      : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500 hover:text-white'
                                  }`}
                                  title={`Imprimir Detalle de ${p.type === 'abierto' ? 'Abierto' : 'Cierre'}`}
                                >
                                  <Printer className="w-4 h-4" />
                                </button>

                                {p.type === 'cerrado' && (
                                  <button 
                                    onClick={() => handlePrintPurchaseReceipt(p, 'combined')}
                                    className="p-2 bg-purple-500/10 text-purple-500 rounded-xl hover:bg-purple-500 hover:text-white transition-all border border-purple-500/20"
                                    title="Imprimir Detalle Combinado (Ambos)"
                                  >
                                    <FileText className="w-4 h-4" />
                                  </button>
                                )}

                                <button 
                                  onClick={() => {
                                    setViewingPurchase(p);
                                    setShowViewPurchaseModal(true);
                                  }}
                                  className="p-2 bg-zinc-800 text-zinc-400 rounded-xl hover:bg-zinc-700 transition-all"
                                  title="Ver Detalle"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                
                                {p.type === 'abierto' && (
                                  <button 
                                    onClick={() => {
                                      setClosingPurchase(p);
                                      const firstItem = p.items?.[0];
                                      setCloseMarketPrice(firstItem?.marketPrice || 0);
                                      setCloseUsdToBs(p.usdToBs || 6.96);
                                      setShowClosePurchaseModal(true);
                                    }}
                                    className="p-2 bg-amber-500/10 text-amber-500 rounded-xl hover:bg-amber-500 hover:text-zinc-950 transition-all border border-amber-500/20"
                                    title="Cerrar/Liquidar Compra"
                                  >
                                    <Scale className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>

                          <AnimatePresence>
                            {isExpanded && hasOpeningDetails && (
                              <motion.tr 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="bg-zinc-950/50"
                              >
                                <td colSpan={10} className="px-6 py-4">
                                  <div className="pl-10 border-l-2 border-amber-500/30 py-4 space-y-4">
                                    <div className="flex items-center justify-between">
                                      <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                        Origen de la Compra (Estado Abierto)
                                      </h4>
                                      <button 
                                        onClick={() => handlePrintPurchaseReceipt(p, 'abierto')}
                                        className="px-3 py-1 bg-zinc-800 text-zinc-300 rounded-lg text-[10px] font-bold hover:bg-zinc-700 transition-all flex items-center gap-2"
                                      >
                                        <Printer className="w-3 h-3" /> Imprimir Origen
                                      </button>
                                    </div>

                                    <div className="grid grid-cols-6 gap-4">
                                      <div className="bg-zinc-900/50 p-3 rounded-xl border border-white/5">
                                        <p className="text-[8px] text-zinc-500 uppercase font-bold mb-1">Monto Abierto</p>
                                        <p className="text-sm font-mono font-bold text-zinc-100">{formatNumber(p.total)} BS</p>
                                      </div>
                                      <div className="bg-zinc-900/50 p-3 rounded-xl border border-white/5">
                                        <p className="text-[8px] text-zinc-500 uppercase font-bold mb-1">Comisión Pactada</p>
                                        <p className="text-sm font-mono font-bold text-blue-400">{formatNumber(p.commission || 0)} BS</p>
                                      </div>
                                      <div className="bg-zinc-900/50 p-3 rounded-xl border border-white/5">
                                        <p className="text-[8px] text-zinc-500 uppercase font-bold mb-1">Anticipo Pagado</p>
                                        <p className="text-sm font-mono font-bold text-amber-500">{formatNumber(p.advancePayment || 0)} BS</p>
                                      </div>
                                      <div className="bg-zinc-900/50 p-3 rounded-xl border border-white/5">
                                        <p className="text-[8px] text-zinc-500 uppercase font-bold mb-1">Fecha Registro</p>
                                        <p className="text-[10px] font-mono text-zinc-400">{new Date(p.createdAt).toLocaleString()}</p>
                                      </div>
                                      <div className="bg-zinc-900/50 p-3 rounded-xl border border-white/5">
                                        <p className="text-[8px] text-zinc-500 uppercase font-bold mb-1">Operador Origen</p>
                                        <p className="text-[10px] font-bold text-zinc-400 uppercase">{systemUsers.find(u => u.id === p.createdBy || u.username === p.createdBy || u.email === p.createdBy)?.name || p.createdBy}</p>
                                      </div>
                                      <div className="bg-zinc-900/50 p-3 rounded-xl border border-white/5">
                                        <p className="text-[8px] text-emerald-500 uppercase font-bold mb-1">Saldo Final Liquidado</p>
                                        <p className="text-sm font-mono font-bold text-emerald-500">{formatNumber((p.closeTotal || p.total) - p.advancePayment)} BS</p>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </motion.tr>
                            )}
                          </AnimatePresence>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>

                <Pagination 
                  totalItems={filteredPurchaseHistory.length}
                  currentPage={purchaseHistoryPage}
                  onPageChange={setPurchaseHistoryPage}
                  itemsPerPage={PURCHASE_HISTORY_PER_PAGE}
                />

                {filteredPurchaseHistory.length === 0 && (
                  <div className="px-6 py-20 text-center text-zinc-600">
                    <History className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="text-[10px] font-bold uppercase tracking-widest">
                      {purchaseTypeFilter === 'abierto' ? 'No hay compras abiertas registradas' : 
                       'No hay compras cerradas registradas'}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {view === 'settings' && (user.role === 'admin' || user.role === 'superadmin') && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-2xl mx-auto"
            >
              <div className="bg-zinc-900 p-8 rounded-3xl border border-white/5 shadow-sm">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-zinc-100">Configuración de Empresa</h2>
                    <p className="text-sm text-zinc-400">Estos datos aparecerán en los reportes y el encabezado.</p>
                  </div>
                </div>

                <form onSubmit={handleSaveCompanySettings} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest">Nombre de la Empresa</label>
                      <input 
                        type="text" 
                        required
                        value={companyFormData.name || ''}
                        onChange={e => setCompanyFormData(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        placeholder="Ej. Aurum Joyería"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest">NIT / Identificación Fiscal</label>
                      <input 
                        type="text" 
                        value={companyFormData.taxId || ''}
                        onChange={e => setCompanyFormData(prev => ({ ...prev, taxId: e.target.value }))}
                        className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        placeholder="Ej. 123456789-0"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest">Teléfono</label>
                      <input 
                        type="text" 
                        value={companyFormData.phone || ''}
                        onChange={e => setCompanyFormData(prev => ({ ...prev, phone: e.target.value }))}
                        className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        placeholder="+591 ..."
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest">Email de Contacto</label>
                      <input 
                        type="email" 
                        value={companyFormData.email || ''}
                        onChange={e => setCompanyFormData(prev => ({ ...prev, email: e.target.value }))}
                        className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        placeholder="contacto@empresa.com"
                      />
                    </div>
                    <div className="col-span-full space-y-2">
                      <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest">Dirección</label>
                      <input 
                        type="text" 
                        value={companyFormData.address || ''}
                        onChange={e => setCompanyFormData(prev => ({ ...prev, address: e.target.value }))}
                        className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        placeholder="Calle, Ciudad, País"
                      />
                    </div>
                    <div className="col-span-full space-y-2">
                      <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest">URL del Logo (Imagen)</label>
                      <div className="flex gap-4 items-center">
                        <div className="flex-1 relative">
                          <ImageIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                          <input 
                            type="url" 
                            value={companyFormData.logoUrl || ''}
                            onChange={e => setCompanyFormData(prev => ({ ...prev, logoUrl: e.target.value }))}
                            className="w-full pl-11 pr-4 py-3 bg-zinc-950 rounded-xl border border-white/5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            placeholder="https://ejemplo.com/logo.png"
                          />
                        </div>
                        {companyFormData.logoUrl && (
                          <div className="w-12 h-12 rounded-xl bg-zinc-950 border border-white/5 overflow-hidden flex items-center justify-center">
                            <img 
                              src={companyFormData.logoUrl} 
                              alt="Preview" 
                              className="w-full h-full object-contain"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        )}
                      </div>
                      <p className="text-[10px] text-zinc-500 italic">Se recomienda una imagen cuadrada con fondo transparente.</p>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-white/5">
                    <button 
                      type="submit"
                      className="w-full py-4 bg-indigo-500 text-white rounded-2xl font-bold shadow-lg shadow-indigo-500/20 hover:bg-indigo-600 transition-all flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 className="w-5 h-5" /> Guardar Configuración
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Add User Modal */}
      <AnimatePresence>
        {showAddUserModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddUserModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-white/5"
            >
              <div className="p-8 border-b border-white/5 flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-zinc-100">{editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}</h2>
                  <p className="text-sm text-zinc-400">{editingUser ? 'Modifique los datos del usuario' : 'Cree un nuevo acceso al sistema'}</p>
                </div>
                <button onClick={() => {
                  setShowAddUserModal(false);
                  setEditingUser(null);
                  setUserFormData({ name: '', username: '', email: '', pin: '', role: 'operator' });
                }} className="text-zinc-500 hover:text-zinc-300">
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>

              <form onSubmit={handleAddUser} className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">Nombre Completo</label>
                  <input 
                    required
                    type="text" 
                    value={userFormData.name || ''}
                    onChange={e => setUserFormData({...userFormData, name: e.target.value})}
                    className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">Nombre de Usuario</label>
                  <input 
                    required
                    type="text" 
                    placeholder="usuario"
                    value={userFormData.username || ''}
                    onChange={e => setUserFormData({...userFormData, username: e.target.value.toLowerCase().replace(/\s/g, '')})}
                    className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">Correo Electrónico (Opcional)</label>
                  <input 
                    type="email" 
                    placeholder="ejemplo@gmail.com"
                    value={userFormData.email || ''}
                    onChange={e => setUserFormData({...userFormData, email: e.target.value})}
                    className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">PIN de Acceso (4-6 dígitos)</label>
                  <input 
                    required
                    type="password" 
                    maxLength={6}
                    value={userFormData.pin || ''}
                    onChange={e => setUserFormData({...userFormData, pin: e.target.value.replace(/\D/g, '')})}
                    className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-mono tracking-widest"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">Rol del Usuario</label>
                  <select 
                    value={userFormData.role || 'operator'}
                    onChange={e => setUserFormData({...userFormData, role: e.target.value as UserRole})}
                    className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="operator" className="bg-zinc-900">Operador</option>
                    <option value="admin" className="bg-zinc-900">Administrador</option>
                    {user.role === 'superadmin' && <option value="superadmin" className="bg-zinc-900">Super Administrador</option>}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">Sucursal Asignada</label>
                  <select 
                    value={userFormData.branchId || ''}
                    onChange={e => setUserFormData({...userFormData, branchId: e.target.value})}
                    className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="" className="bg-zinc-900">Sin sucursal (Sede Central)</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id} className="bg-zinc-900">{b.name}</option>
                    ))}
                  </select>
                </div>

                <button 
                  type="submit"
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-xl hover:bg-blue-700 transition-all"
                >
                  {editingUser ? 'Guardar Cambios' : 'Crear Usuario'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Modal */}
      <MaterialModal 
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          resetFormData();
        }}
        onSubmit={handleAddMaterial}
        formData={formData}
        setFormData={setFormData}
        title="Nuevo Registro"
        subtitle="Ingrese los detalles del material de oro"
        submitLabel="Registrar Material"
      />

      {/* Edit Modal */}
      <MaterialModal 
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingMaterial(null);
          resetFormData();
        }}
        onSubmit={handleEditMaterial}
        formData={formData}
        setFormData={setFormData}
        title="Editar Registro"
        subtitle="Actualice los detalles del material de oro"
        submitLabel="Guardar Cambios"
      />

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingMaterial && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeletingMaterial(null)}
              className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-zinc-900 rounded-[32px] border border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Trash2 className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="text-2xl font-bold text-zinc-100 mb-2">¿Eliminar Registro?</h3>
                <p className="text-zinc-500 mb-8">
                  El registro <span className="text-zinc-100 font-bold">#{deletingMaterial.receiptNumber}</span> se ocultará del inventario principal y se moverá a la lista de eliminados.
                </p>
                <div className="flex gap-4">
                  <button 
                    onClick={() => setDeletingMaterial(null)}
                    className="flex-1 py-4 bg-zinc-800 text-zinc-100 rounded-2xl font-bold hover:bg-zinc-700 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleDeleteMaterial}
                    className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-500 transition-all shadow-lg shadow-red-600/20"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Source Details Modal */}
      <AnimatePresence>
        {viewingSourceMaterial && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setViewingSourceMaterial(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-zinc-900 w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden border border-white/5"
            >
              <div className="p-8 border-b border-white/5 flex justify-between items-center bg-zinc-950">
                <div>
                  <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
                    <History className="w-6 h-6 text-amber-500" /> Historial de Origen
                  </h2>
                  <p className="text-sm text-zinc-400">
                    Material Resultante: <span className="font-bold text-amber-500">#{viewingSourceMaterial.receiptNumber}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => exportSourceHistoryToExcel(viewingSourceMaterial)}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
                  >
                    <Download className="w-4 h-4" /> Exportar Excel
                  </button>
                  <button onClick={() => setViewingSourceMaterial(null)} className="text-zinc-500 hover:text-zinc-300 p-2 hover:bg-zinc-900 rounded-full transition-colors">
                    <Plus className="w-6 h-6 rotate-45" />
                  </button>
                </div>
              </div>

              <div className="p-8">
                <div className="bg-zinc-950 rounded-2xl border border-white/5 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-zinc-900/50 border-b border-white/5">
                          <th className="px-6 py-4 text-[10px] font-bold uppercase text-zinc-500 tracking-widest">Fecha</th>
                          <th className="px-6 py-4 text-[10px] font-bold uppercase text-zinc-500 tracking-widest">Nro. Recibo</th>
                          <th className="px-6 py-4 text-[10px] font-bold uppercase text-zinc-500 tracking-widest text-left">Tipo</th>
                          <th className="px-6 py-4 text-[10px] font-bold uppercase text-zinc-500 tracking-widest">Cliente</th>
                          <th className="px-6 py-4 text-[10px] font-bold uppercase text-zinc-500 tracking-widest text-right">Ley (%)</th>
                          <th className="px-6 py-4 text-[10px] font-bold uppercase text-zinc-500 tracking-widest text-right">Cotización</th>
                          <th className="px-6 py-4 text-[10px] font-bold uppercase text-zinc-500 tracking-widest text-right">Peso Final</th>
                          <th className="px-6 py-4 text-[10px] font-bold uppercase text-gray-400 tracking-widest text-right">Total BS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {viewingSourceMaterial.sourceMaterials?.map((sm, idx) => (
                          <SourceHistoryRow key={idx} sm={sm} />
                        ))}
                      </tbody>
                      <tfoot className="bg-amber-500/5">
                        <tr>
                          <td colSpan={6} className="px-6 py-4 text-right text-[10px] font-bold uppercase text-amber-500">Totales de Origen</td>
                          <td className="px-6 py-4 text-right">
                            <span className="text-sm font-mono font-bold text-amber-500">
                              {formatNumber(viewingSourceMaterial.sourceMaterials?.reduce((acc, curr) => acc + curr.finalWeight, 0) || 0)}g
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="text-sm font-mono font-bold text-amber-500">
                              {formatCurrency(viewingSourceMaterial.sourceMaterials?.reduce((acc, curr) => acc + curr.total, 0) || 0)}
                            </span>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
                
                <div className="mt-8 flex justify-end">
                  <button 
                    onClick={() => setViewingSourceMaterial(null)}
                    className="px-8 py-3 bg-zinc-100 text-zinc-950 rounded-2xl font-bold shadow-xl hover:bg-white transition-all"
                  >
                    Cerrar Historial
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Branch Modal */}
      <AnimatePresence>
        {showAddBranchModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddBranchModal(false)}
              className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-zinc-900 rounded-[32px] border border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-white/5 bg-zinc-950">
                <h2 className="text-2xl font-bold text-zinc-100">{editingBranch ? 'Editar Sucursal' : 'Nueva Sucursal'}</h2>
                <p className="text-sm text-zinc-400">Ingrese los datos de la sede.</p>
              </div>
              <form onSubmit={handleAddBranch} className="p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase text-zinc-500">Nombre de Sucursal</label>
                    <input 
                      required
                      type="text" 
                      placeholder="Ej. Sucursal Central"
                      value={branchFormData.name}
                      onChange={e => setBranchFormData({...branchFormData, name: e.target.value})}
                      className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase text-zinc-500">Abreviación (Ej. C, S, N)</label>
                    <input 
                      required
                      type="text" 
                      maxLength={2}
                      placeholder="Ej. C"
                      value={branchFormData.abbreviation}
                      onChange={e => setBranchFormData({...branchFormData, abbreviation: e.target.value.toUpperCase()})}
                      className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">Ubicación / Dirección</label>
                  <input 
                    type="text" 
                    placeholder="Calle, Ciudad"
                    value={branchFormData.location}
                    onChange={e => setBranchFormData({...branchFormData, location: e.target.value})}
                    className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">Teléfono</label>
                  <input 
                    type="text" 
                    placeholder="+591 ..."
                    value={branchFormData.phone}
                    onChange={e => setBranchFormData({...branchFormData, phone: e.target.value})}
                    className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">Encargado (Admin)</label>
                  <select 
                    value={branchFormData.managerId}
                    onChange={e => setBranchFormData({...branchFormData, managerId: e.target.value})}
                    className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  >
                    <option value="" className="bg-zinc-900">Sin asignar</option>
                    {systemUsers.filter(u => u.role === 'admin').map(u => (
                      <option key={u.id} value={u.id} className="bg-zinc-900">{u.name}</option>
                    ))}
                  </select>
                </div>

                <button 
                  type="submit"
                  className="w-full py-4 bg-orange-600 text-white rounded-2xl font-bold shadow-xl hover:bg-orange-700 transition-all"
                >
                  {editingBranch ? 'Guardar Cambios' : 'Crear Sucursal'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Client Modal */}
      <AnimatePresence>
        {showAddClientModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddClientModal(false)}
              className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-zinc-900 rounded-[32px] border border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-white/5 bg-zinc-950">
                <h2 className="text-2xl font-bold text-zinc-100">{editingClient ? 'Editar Cliente' : 'Nuevo Cliente'}</h2>
                <p className="text-sm text-zinc-400">Ingrese los datos del cliente.</p>
              </div>
              <form onSubmit={handleAddClient} className="p-8 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase text-zinc-500">Nombre Completo</label>
                    <input 
                      required
                      type="text" 
                      placeholder="Ej. Juan Perez"
                      value={clientFormData.name}
                      onChange={e => setClientFormData({...clientFormData, name: e.target.value})}
                      className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase text-zinc-500">CI / Documento</label>
                    <div className="relative">
                      <input 
                        required
                        type="text" 
                        placeholder="1234567 LP"
                        value={clientFormData.ci}
                        onChange={e => setClientFormData({...clientFormData, ci: e.target.value})}
                        className={`w-full p-3 bg-zinc-950 rounded-xl border ${isCiAlreadyUsed ? 'border-red-500/50 focus:ring-red-500/20' : 'border-white/5 focus:ring-blue-500/20'} text-zinc-100 focus:outline-none focus:ring-2`}
                      />
                      {isCiAlreadyUsed && (
                        <div className="absolute -bottom-5 left-0 flex items-center gap-1 text-[9px] text-red-500 font-bold animate-pulse">
                          <AlertCircle className="w-2.5 h-2.5" /> Este CI ya está registrado
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase text-zinc-500">Teléfono</label>
                    <input 
                      required
                      type="text" 
                      placeholder="+591 ..."
                      value={clientFormData.phone}
                      onChange={e => setClientFormData({...clientFormData, phone: e.target.value})}
                      className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase text-zinc-500">Teléfono Referencial</label>
                    <input 
                      type="text" 
                      placeholder="Ej. +591 ..."
                      value={clientFormData.referentialPhone}
                      onChange={e => setClientFormData({...clientFormData, referentialPhone: e.target.value})}
                      className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">Email (Opcional)</label>
                  <input 
                    type="email" 
                    placeholder="correo@ejemplo.com"
                    value={clientFormData.email}
                    onChange={e => setClientFormData({...clientFormData, email: e.target.value})}
                    className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">Lugar de Trabajo</label>
                  <input 
                    type="text" 
                    placeholder="Empresa o ubicación"
                    value={clientFormData.workplace}
                    onChange={e => setClientFormData({...clientFormData, workplace: e.target.value})}
                    className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <div className="flex items-center gap-3 p-4 bg-zinc-950 rounded-xl border border-white/5">
                  <input 
                    type="checkbox"
                    id="isMineCooperative"
                    checked={clientFormData.isMineCooperative}
                    onChange={e => setClientFormData({...clientFormData, isMineCooperative: e.target.checked})}
                    className="w-5 h-5 rounded border-white/10 bg-zinc-900 text-blue-600 focus:ring-blue-500/20"
                  />
                  <label htmlFor="isMineCooperative" className="text-sm text-zinc-300 font-medium cursor-pointer">
                    ¿Es Cooperativa de Mina?
                  </label>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">Recomendado por</label>
                  <input 
                    type="text" 
                    placeholder="Nombre del referente"
                    value={clientFormData.recommendedBy}
                    onChange={e => setClientFormData({...clientFormData, recommendedBy: e.target.value})}
                    className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <button 
                  type="submit"
                  disabled={isCiAlreadyUsed}
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-xl hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingClient ? 'Guardar Cambios' : 'Registrar Cliente'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Purchase Modal */}
      <AnimatePresence>
        {showAddPurchaseModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddPurchaseModal(false)}
              className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-7xl bg-zinc-900 rounded-[32px] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-8 border-b border-white/5 bg-zinc-950 flex justify-between items-center shrink-0">
                <div>
                  <h2 className="text-2xl font-bold text-zinc-100">Nueva Compra de Oro</h2>
                  <p className="text-sm text-zinc-400">Registro de compra por lote.</p>
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase text-zinc-500">Fecha de Registro</label>
                    <input 
                      type="date"
                      value={purchaseHeader.date}
                      onChange={e => setPurchaseHeader({...purchaseHeader, date: e.target.value})}
                      className="p-2 bg-zinc-950 rounded-xl border border-amber-500/30 text-sm text-amber-500 font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase text-zinc-500">Sucursal de Registro</label>
                    <div className="px-4 py-2 bg-zinc-900 border border-white/10 rounded-xl flex items-center gap-2 shadow-inner">
                      <Building2 className="w-4 h-4 text-amber-500" />
                      <span className="text-sm font-bold text-zinc-100">
                        {branches.find(b => b.id === branchMode)?.name || 'Desconocida'}
                      </span>
                    </div>
                  </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase text-zinc-500">Cliente</label>
                      <div className="flex items-center gap-1 bg-zinc-950 rounded-xl border border-white/5 p-1">
                        <div className="relative w-32">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500" />
                          <input 
                            ref={clientSearchRef}
                            type="text"
                            placeholder="Filtrar..."
                            value={clientSearch}
                            onChange={e => setClientSearch(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                purchaseInitialWeightRef.current?.focus();
                              }
                            }}
                            className="w-full pl-7 pr-2 py-1.5 bg-zinc-900/50 rounded-lg border-none text-[10px] text-zinc-300 focus:outline-none"
                          />
                        </div>
                        <select 
                          required
                          value={purchaseHeader.clientId}
                          onChange={e => setPurchaseHeader({...purchaseHeader, clientId: e.target.value})}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              purchaseInitialWeightRef.current?.focus();
                            }
                          }}
                          className="p-1.5 bg-transparent text-xs text-zinc-100 focus:outline-none min-w-[180px] cursor-pointer"
                        >
                          <option value="" className="bg-zinc-900">Seleccionar Cliente</option>
                          {clients
                            .filter(c => c.branchId === branchMode)
                            .filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
                            .map(c => (
                              <option key={c.id} value={c.id} className="bg-zinc-900">{c.name}</option>
                            ))}
                        </select>
                      </div>
                    </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold uppercase text-zinc-500">Tipo de Compra</label>
                        <div className="flex bg-zinc-950 rounded-lg border border-white/5 p-1 relative group">
                          <button 
                            type="button"
                            disabled={purchaseCart.length > 0}
                            onClick={() => setPurchaseHeader({...purchaseHeader, type: 'abierto'})}
                            className={`px-4 py-1.5 rounded-md text-[10px] font-bold transition-all ${purchaseHeader.type === 'abierto' ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20' : 'text-zinc-500 hover:text-zinc-300'} ${purchaseCart.length > 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            Abierto (90%)
                          </button>
                          <button 
                            type="button"
                            disabled={purchaseCart.length > 0}
                            onClick={() => setPurchaseHeader({...purchaseHeader, type: 'cerrado'})}
                            className={`px-4 py-1.5 rounded-md text-[10px] font-bold transition-all ${purchaseHeader.type === 'cerrado' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-zinc-500 hover:text-zinc-300'} ${purchaseCart.length > 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            Cerrado (100%)
                          </button>
                          {purchaseCart.length > 0 && (
                            <div className="absolute -bottom-8 left-0 hidden group-hover:block bg-zinc-800 text-zinc-400 text-[8px] font-bold uppercase py-1 px-2 rounded-md border border-white/5 whitespace-nowrap z-10">
                              Vacíe el carrito para cambiar el tipo
                            </div>
                          )}
                        </div>
                      </div>
                  <button onClick={() => setShowAddPurchaseModal(false)} className="text-zinc-500 hover:text-zinc-300 ml-4">
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>
              
              <div className="flex-1 overflow-hidden flex flex-col">
                {/* Items Table */}
                <div className="flex-1 overflow-y-auto p-8">
                  <div className="bg-zinc-950/50 rounded-3xl border border-white/5 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-[10px] text-zinc-500 uppercase font-bold border-b border-white/5 bg-zinc-900/50">
                          <th className="px-6 py-4 text-left">#</th>
                          <th className="px-6 py-4 text-left">Tipo</th>
                          <th className="px-6 py-4 text-left">Peso Inicial</th>
                          <th className="px-6 py-4 text-left">Peso Final</th>
                          <th className="px-6 py-4 text-left">Merma (%)</th>
                          <th className="px-6 py-4 text-left">Cotización</th>
                          <th className="px-6 py-4 text-left">Ley (%)</th>
                          <th className="px-6 py-4 text-left">Dólar (BS)</th>
                          <th className="px-6 py-4 text-left">Precio x Gramo</th>
                          <th className="px-6 py-4 text-left">Total (BS)</th>
                          <th className="px-6 py-4 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {purchaseCart.length === 0 ? (
                          <tr>
                            <td colSpan={11} className="px-6 py-12 text-center text-zinc-600">
                              <Package className="w-12 h-12 mx-auto mb-4 opacity-20" />
                              <p className="text-sm font-bold uppercase tracking-widest">No hay materiales agregados</p>
                            </td>
                          </tr>
                        ) : (
                          purchaseCart.map((item, index) => (
                            <tr key={item.id} className="group hover:bg-white/[0.02] transition-colors">
                              <td className="px-6 py-4 text-xs font-bold text-zinc-500">{index + 1}</td>
                              <td className="px-6 py-4">
                                <span className={`px-2 py-1 rounded-lg text-[8px] font-bold uppercase ${item.type === 'barra' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-blue-500/10 text-blue-500 border border-blue-500/20'}`}>
                                  {item.type || 'pieza'}
                                </span>
                              </td>
                      <td className="px-6 py-4 text-xs font-mono text-zinc-300">{formatNumber(item.initialWeight)}g</td>
                              <td className="px-6 py-4 text-xs font-mono font-bold text-zinc-100">{formatNumber(item.finalWeight)}g</td>
                              <td className="px-6 py-4 text-xs font-mono text-red-400">
                                {item.lossPercentage > 0 ? '-' : ''}{formatNumber(Math.abs(item.lossPercentage), 1)}% ({formatNumber(Math.abs(item.loss))}g)
                              </td>
                              <td className="px-6 py-4 text-xs font-mono text-zinc-300">{formatNumber(item.marketPrice)}</td>
                              <td className="px-6 py-4 text-xs font-mono text-amber-500">{formatNumber(item.purity)}%</td>
                               <td className="px-6 py-4 text-xs font-mono text-zinc-300">{formatNumber(item.usdToBs)}</td>
                               <td className="px-6 py-4">
                                 <input 
                                   type="number"
                                   step="0.01"
                                   value={item.pricePerGram}
                                   onChange={e => handleUpdateCartItem(item.id, { pricePerGram: parseFloat(e.target.value) || 0 })}
                                   className="w-20 p-1 bg-zinc-900 border border-white/10 rounded text-[10px] font-mono text-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                                 />
                               </td>
                               <td className="px-6 py-4">
                                 <input 
                                   readOnly={!!branchMode}
                                   type="number"
                                   step="0.01"
                                   value={item.total}
                                   onChange={e => handleUpdateCartItem(item.id, { total: parseFloat(e.target.value) || 0 })}
                                   className={`w-24 p-1 bg-zinc-900 border border-white/10 rounded text-[10px] font-mono text-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 ${branchMode ? 'cursor-not-allowed opacity-70' : ''}`}
                                 />
                               </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-2">
                                  <button 
                                    onClick={() => setRevaluationItem(item)}
                                    className="p-2 bg-amber-500/10 text-amber-500 rounded-lg hover:bg-amber-500 hover:text-white transition-all"
                                    title="Otros Datos"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                  <button 
                                    onClick={() => handleRemoveFromCart(item.id)}
                                    className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      {purchaseCart.length > 0 && (
                        <tfoot>
                          <tr className="bg-zinc-900/50 border-t border-white/10">
                            <td colSpan={2} className="px-6 py-4 text-[10px] font-bold uppercase text-zinc-500">Totales</td>
                            <td className="px-6 py-4 text-xs font-mono font-bold text-zinc-100">
                              {formatNumber(purchaseCart.reduce((acc, curr) => acc + curr.finalWeight, 0))}g
                            </td>
                            <td className="px-6 py-4 text-xs font-mono text-red-400">
                              {(() => {
                                const totalInitial = purchaseCart.reduce((acc, curr) => acc + curr.initialWeight, 0);
                                const totalLoss = purchaseCart.reduce((acc, curr) => acc + curr.loss, 0);
                                const totalPercentage = totalInitial > 0 ? (totalLoss * 100) / totalInitial : 0;
                                return `${formatNumber(totalPercentage)}% (-${formatNumber(totalLoss)}g)`;
                              })()}
                            </td>
                            <td colSpan={4}></td>
                            <td className="px-6 py-4 text-sm font-mono font-bold text-emerald-500">
                              {formatNumber(purchaseCart.reduce((acc, curr) => acc + curr.total, 0))} BS
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>

                {/* Add Material Row (Horizontal) */}
                <div className="p-8 bg-zinc-950 border-t border-white/5 shrink-0">
                  <form onSubmit={handleAddPurchase} className="flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-[90px] space-y-1">
                      <label className="text-[10px] font-bold uppercase text-zinc-500">Tipo Item</label>
                      <select 
                        value={purchaseItem.type}
                        onChange={e => setPurchaseItem({...purchaseItem, type: e.target.value as MaterialType})}
                        className="w-full p-2.5 bg-zinc-900 rounded-xl border border-white/5 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20 cursor-pointer font-bold"
                      >
                        <option value="pieza">Pieza</option>
                        <option value="barra">Barra</option>
                      </select>
                    </div>
                    <div className="flex-1 min-w-[110px] space-y-1">
                      <label className="text-[10px] font-bold uppercase text-zinc-500">Peso Inicial (g)</label>
                      <input 
                        ref={purchaseInitialWeightRef}
                        required
                        type="number" 
                        step="0.01"
                        value={purchaseItem.initialWeight || ''}
                        onChange={e => {
                          const val = parseFloat(e.target.value) || 0;
                          const loss = (purchaseItem.lossPercentage / 100) * val;
                          const finalWeight = val - loss;
                          const total = (finalWeight > 0 ? finalWeight : 0) * purchaseItem.pricePerGram;
                          setPurchaseItem({
                            ...purchaseItem, 
                            initialWeight: val, 
                            loss: loss > 0 ? loss : 0,
                            finalWeight: finalWeight > 0 ? finalWeight : 0,
                            total: parseFloat(total.toFixed(2))
                          });
                        }}
                        className="w-full p-2.5 bg-zinc-900 rounded-xl border border-white/5 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>
                    <div className="flex-1 min-w-[110px] space-y-1">
                      <label className="text-[10px] font-bold uppercase text-zinc-500">Peso Final (g)</label>
                      <input 
                        required
                        type="number" 
                        step="0.01"
                        value={purchaseItem.finalWeight || ''}
                        onChange={e => {
                          const val = parseFloat(e.target.value) || 0;
                          const loss = purchaseItem.initialWeight - val;
                          const percentage = purchaseItem.initialWeight > 0 ? Math.max(0, (loss * 100) / purchaseItem.initialWeight) : 0;
                          const total = val * purchaseItem.pricePerGram;
                          setPurchaseItem({
                            ...purchaseItem, 
                            finalWeight: val, 
                            loss: loss > 0 ? loss : 0,
                            lossPercentage: parseFloat(percentage.toFixed(2)),
                            total: parseFloat(total.toFixed(2))
                          });
                        }}
                        className="w-full p-2.5 bg-zinc-900 rounded-xl border border-white/5 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>
                    <div className="flex-1 min-w-[70px] space-y-1">
                      <label className="text-[10px] font-bold uppercase text-zinc-500">Ley (%)</label>
                      <input 
                        required
                        type="number" 
                        step="0.01"
                        value={purchaseItem.purity || ''}
                        onChange={e => {
                          const purity = parseFloat(e.target.value) || 0;
                          const pricePerGram = (purchaseItem.marketPrice / 31.1035) * (purity / 100) * purchaseItem.usdToBs;
                          const total = purchaseItem.finalWeight * pricePerGram;
                          setPurchaseItem({
                            ...purchaseItem,
                            purity,
                            pricePerGram: parseFloat(pricePerGram.toFixed(2)),
                            total: parseFloat(total.toFixed(2))
                          });
                        }}
                        className="w-full p-2.5 bg-zinc-900 rounded-xl border border-white/5 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>
                    <div className="flex-1 min-w-[100px] space-y-1">
                      <label className="text-[10px] font-bold uppercase text-zinc-500">Cotización</label>
                      <input 
                        required
                        type="number" 
                        step="0.01"
                        value={purchaseItem.marketPrice || ''}
                        onChange={e => {
                          const marketPrice = parseFloat(e.target.value) || 0;
                          const pricePerGram = (marketPrice / 31.1035) * (purchaseItem.purity / 100) * purchaseItem.usdToBs;
                          const total = purchaseItem.finalWeight * pricePerGram;
                          setPurchaseItem({
                            ...purchaseItem,
                            marketPrice,
                            pricePerGram: parseFloat(pricePerGram.toFixed(2)),
                            total: parseFloat(total.toFixed(2))
                          });
                        }}
                        className="w-full p-2.5 bg-zinc-900 rounded-xl border border-white/5 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>
                    <div className="flex-1 min-w-[90px] space-y-1">
                      <label className="text-[10px] font-bold uppercase text-zinc-500">Dólar (BS)</label>
                      <input 
                        required
                        type="number" 
                        step="0.01"
                        value={purchaseItem.usdToBs || ''}
                        onChange={e => {
                          const usdToBs = parseFloat(e.target.value) || 0;
                          const pricePerGram = (purchaseItem.marketPrice / 31.1035) * (purchaseItem.purity / 100) * usdToBs;
                          const total = purchaseItem.finalWeight * pricePerGram;
                          setPurchaseItem({
                            ...purchaseItem,
                            usdToBs,
                            pricePerGram: parseFloat(pricePerGram.toFixed(2)),
                            total: parseFloat(total.toFixed(2))
                          });
                        }}
                        className="w-full p-2.5 bg-zinc-900 rounded-xl border border-white/5 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>
                    <div className="flex-1 min-w-[110px] space-y-1">
                      <label className="text-[10px] font-bold uppercase text-zinc-500">Precio x Gr</label>
                      <input 
                        required
                        type="number" 
                        step="0.01"
                        value={purchaseItem.pricePerGram || ''}
                        onChange={e => {
                          const pricePerGram = parseFloat(e.target.value) || 0;
                          setPurchaseItem({
                            ...purchaseItem,
                            pricePerGram
                          });
                        }}
                        className="w-full p-2.5 bg-zinc-900 rounded-xl border border-white/5 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20 font-bold text-amber-500"
                      />
                    </div>
                    <div className="flex-1 min-w-[90px] space-y-1">
                      <label className="text-[10px] font-bold uppercase text-zinc-500">Merma (%)</label>
                      <input 
                        readOnly={!!branchMode}
                        required
                        type="number" 
                        step="0.01"
                        value={purchaseItem.lossPercentage || ''}
                        onChange={e => {
                          const percentage = parseFloat(e.target.value) || 0;
                          const loss = (percentage / 100) * purchaseItem.initialWeight;
                          const finalWeight = purchaseItem.initialWeight - loss;
                          const total = (finalWeight > 0 ? finalWeight : 0) * purchaseItem.pricePerGram;
                          setPurchaseItem({
                            ...purchaseItem, 
                            lossPercentage: percentage, 
                            loss: loss, 
                            finalWeight: finalWeight > 0 ? finalWeight : 0,
                            total: parseFloat(total.toFixed(2))
                          });
                        }}
                        className={`w-full p-2.5 bg-zinc-900 rounded-xl border border-white/5 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20 ${branchMode ? 'cursor-not-allowed opacity-70' : ''}`}
                      />
                    </div>
                    <div className="flex-1 min-w-[110px] space-y-1">
                      <label className="text-[10px] font-bold uppercase text-zinc-500">Total (BS)</label>
                      <input 
                        readOnly={!!branchMode}
                        required
                        type="number" 
                        step="0.01"
                        value={purchaseItem.total || ''}
                        onChange={e => {
                          const total = parseFloat(e.target.value) || 0;
                          const pricePerGram = purchaseItem.finalWeight > 0 ? total / purchaseItem.finalWeight : 0;
                          setPurchaseItem({
                            ...purchaseItem,
                            total,
                            pricePerGram: parseFloat(pricePerGram.toFixed(2))
                          });
                        }}
                        className={`w-full p-2.5 bg-zinc-900 rounded-xl border border-white/5 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold text-emerald-500 ${branchMode ? 'cursor-not-allowed opacity-70' : ''}`}
                      />
                    </div>
                    <button 
                      type="submit"
                      className="px-6 py-2.5 bg-amber-500 text-zinc-950 rounded-xl font-bold hover:bg-amber-400 transition-all flex items-center gap-2 shadow-lg shadow-amber-500/20"
                    >
                      <Plus className="w-4 h-4" /> Agregar
                    </button>
                  </form>
                </div>

                {/* Footer Action */}
                <div className="p-8 bg-zinc-900 border-t border-white/5 flex flex-col gap-6 shrink-0">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-6">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold uppercase text-zinc-500">Referido por</label>
                        <div className="flex items-center gap-1 bg-zinc-950 rounded-xl border border-white/5 p-1">
                          <div className="relative w-28">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500" />
                            <input 
                              type="text"
                              placeholder="Filtrar..."
                              value={referrerSearch}
                              onChange={e => setReferrerSearch(e.target.value)}
                              className="w-full pl-7 pr-2 py-1.5 bg-zinc-900/50 rounded-lg border-none text-[10px] text-zinc-300 focus:outline-none"
                            />
                          </div>
                          <select 
                            value={purchaseHeader.referrerName || ''}
                            onChange={e => setPurchaseHeader({...purchaseHeader, referrerName: e.target.value})}
                            className="p-1.5 bg-transparent text-xs text-zinc-100 focus:outline-none w-36 cursor-pointer"
                          >
                            <option value="" className="bg-zinc-900">Ninguno</option>
                            {referrers
                              .filter(r => r.branchId === branchMode)
                              .filter(r => r.name.toLowerCase().includes(referrerSearch.toLowerCase()))
                              .map(r => (
                                <option key={r.id} value={r.name} className="bg-zinc-900">{r.name}</option>
                              ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold uppercase text-zinc-500">Comisión (BS)</label>
                        <input 
                          type="number"
                          step="0.01"
                          value={purchaseHeader.commission || ''}
                          onChange={e => setPurchaseHeader({...purchaseHeader, commission: parseFloat(e.target.value) || 0})}
                          className="p-2.5 bg-zinc-950 rounded-xl border border-white/5 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-28 font-mono font-bold text-blue-400"
                        />
                      </div>
                      {purchaseHeader.type === 'abierto' && (
                        <div className="flex flex-col gap-1 relative">
                          <label className="text-[10px] font-bold uppercase text-zinc-500">Anticipo (BS)</label>
                          <div className="relative">
                            <input 
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={purchaseHeader.advancePayment || ''}
                              onChange={e => {
                                setPurchaseHeader({...purchaseHeader, advancePayment: parseFloat(e.target.value) || 0});
                                setIsManuallyEditingAdvance(true);
                              }}
                              className="p-2.5 bg-zinc-950 rounded-xl border border-white/5 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20 w-32 font-mono font-bold text-amber-500"
                            />
                            {isManuallyEditingAdvance && (
                              <button 
                                onClick={() => setIsManuallyEditingAdvance(false)}
                                className="absolute -top-6 right-0 text-[8px] text-zinc-500 hover:text-amber-500 font-bold uppercase tracking-widest"
                              >
                                [Reset Auto]
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-8 border-l border-white/10 pl-8">
                      <div className="flex flex-col border-r border-white/10 pr-8">
                        <span className="text-[10px] font-bold uppercase text-zinc-500">Total Material</span>
                        <span className="text-2xl font-mono font-bold text-zinc-100">{formatNumber(purchaseCart.reduce((acc, curr) => acc + curr.total, 0))} BS</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase text-zinc-500">
                          {purchaseHeader.advancePayment > 0 ? (purchaseHeader.advancePayment === (purchaseCart.reduce((acc, curr) => acc + curr.total, 0) - (purchaseHeader.commission || 0)) ? 'Pago Total Hoy' : 'A Pagar Hoy (Anticipo)') : 'Neto a Pagar'}
                        </span>
                        <span className="text-2xl font-mono font-bold text-emerald-500">
                          {purchaseHeader.advancePayment > 0 
                            ? formatNumber(purchaseHeader.advancePayment) 
                            : formatNumber(purchaseCart.reduce((acc, curr) => acc + curr.total, 0) - (purchaseHeader.commission || 0))
                          } BS
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center bg-zinc-950/50 p-4 rounded-2xl border border-white/5">
                    <div className="flex items-center gap-8">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase text-zinc-500">Items</span>
                        <span className="text-xl font-bold text-zinc-100">{purchaseCart.length}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase text-zinc-500">Peso Total</span>
                        <span className="text-xl font-bold text-zinc-100">{formatNumber(purchaseCart.reduce((acc, curr) => acc + curr.finalWeight, 0))}g</span>
                      </div>
                      {purchaseHeader.advancePayment > 0 && purchaseHeader.advancePayment < (purchaseCart.reduce((acc, curr) => acc + curr.total, 0) - (purchaseHeader.commission || 0)) && (
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold uppercase text-amber-500">Saldo Pendiente</span>
                          <span className="text-xl font-mono font-bold text-amber-500">
                            {formatNumber(purchaseCart.reduce((acc, curr) => acc + curr.total, 0) - (purchaseHeader.commission || 0) - purchaseHeader.advancePayment)} BS
                          </span>
                        </div>
                      )}
                      {purchaseHeader.commission > 0 && (
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold uppercase text-blue-400">Comisión (-)</span>
                          <span className="text-xl font-mono font-bold text-blue-400">-{formatNumber(purchaseHeader.commission)} BS</span>
                        </div>
                      )}
                    </div>
                    <button 
                      onClick={handleFinalizePurchase}
                      disabled={!purchaseHeader.clientId || purchaseCart.length === 0}
                      className="px-12 py-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-xl shadow-emerald-600/20 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-5 h-5" /> Finalizar y Registrar Compra
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* View Purchase Modal */}
      <AnimatePresence>
        {showViewPurchaseModal && viewingPurchase && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowViewPurchaseModal(false)}
              className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-6xl bg-zinc-900 rounded-[32px] border border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-white/5 bg-zinc-950 flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-3">
                    <Package className="w-6 h-6 text-amber-500" />
                    Detalle de Compra #{viewingPurchase.receiptNumber}
                  </h2>
                  <p className="text-sm text-zinc-400">
                    Sucursal: <span className="text-amber-500 font-bold">{branches.find(b => b.id === viewingPurchase.branchId)?.name || 'Desconocida'}</span> | 
                    Cliente: {clients.find(c => c.id === viewingPurchase.clientId)?.name || 'Desconocido'} | 
                    Fecha: {new Date(viewingPurchase.createdAt).toLocaleString()} |
                    Registrado por: <span className="text-zinc-100 font-bold">{systemUsers.find(u => u.id === viewingPurchase.createdBy || u.username === viewingPurchase.createdBy)?.name || viewingPurchase.createdBy || 'Sistema'}</span>
                    {viewingPurchase.closedAt && (
                      <> | <span className="text-emerald-500 font-bold">Cerrado: {new Date(viewingPurchase.closedAt).toLocaleString()}</span></>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => handlePrintPurchaseReceipt(viewingPurchase)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20"
                  >
                    <Printer className="w-4 h-4" /> Imprimir Comprobante
                  </button>
                  <button onClick={() => setShowViewPurchaseModal(false)} className="text-zinc-500 hover:text-zinc-300">
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>
              
              <div className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <div className="bg-zinc-950 p-4 rounded-2xl border border-white/5">
                    <p className="text-[10px] font-bold uppercase text-zinc-500 mb-1">
                      {viewingPurchase.type === 'cerrado' && viewingPurchase.closeTotal ? 'Total Cierre BS' : 'Total BS'}
                    </p>
                    <p className="text-2xl font-mono font-bold text-emerald-500">
                      {formatNumber(viewingPurchase.type === 'cerrado' && viewingPurchase.closeTotal ? viewingPurchase.closeTotal : viewingPurchase.total)} BS
                    </p>
                    {viewingPurchase.type === 'cerrado' && viewingPurchase.closeMarketPrice && (
                      <p className="text-[8px] text-zinc-500 mt-1">
                        Cerrado con Kot. {formatNumber(viewingPurchase.closeMarketPrice)} USD | TC {formatNumber(viewingPurchase.closeUsdToBs || 0)}
                      </p>
                    )}
                  </div>
                  {viewingPurchase.referrerName && (
                    <div className="bg-zinc-950 p-4 rounded-2xl border border-white/5">
                      <p className="text-[10px] font-bold uppercase text-zinc-500 mb-1">Referido por</p>
                      <p className="text-lg font-bold text-blue-400 italic">{viewingPurchase.referrerName}</p>
                    </div>
                  )}
                  {viewingPurchase.commission !== undefined && viewingPurchase.commission > 0 && (
                    <div className="bg-zinc-950 p-4 rounded-2xl border border-white/5">
                      <p className="text-[10px] font-bold uppercase text-zinc-500 mb-1">Comisión pagada</p>
                      <p className="text-lg font-mono font-bold text-blue-400">{formatNumber(viewingPurchase.commission)} BS</p>
                    </div>
                  )}
                  <div className="bg-zinc-950 p-4 rounded-2xl border border-white/5">
                    <p className="text-[10px] font-bold uppercase text-zinc-500 mb-1">Peso Total</p>
                    <p className="text-2xl font-mono font-bold text-amber-500">
                      {formatNumber(viewingPurchase.items?.reduce((acc, curr) => acc + curr.finalWeight, 0) || 0)}g
                    </p>
                  </div>
                  <div className="bg-zinc-950 p-4 rounded-2xl border border-white/5 flex justify-between items-center">
                    <div>
                      <p className="text-[10px] font-bold uppercase text-zinc-500 mb-1">Tipo</p>
                      <p className="text-2xl font-bold text-zinc-100 uppercase">{viewingPurchase.type}</p>
                    </div>
                    {viewingPurchase.advancePayment !== undefined && viewingPurchase.advancePayment > 0 && (
                      <button 
                        onClick={() => handlePrintAdvanceReceipt(viewingPurchase)}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-zinc-950 rounded-xl font-bold text-xs shadow-lg shadow-amber-500/20 hover:bg-amber-400 transition-all"
                      >
                        <Download className="w-4 h-4" /> Imprimir Recibo Anticipo
                      </button>
                    )}
                  </div>
                  {viewingPurchase.type === 'abierto' && viewingPurchase.advancePayment !== undefined && (
                    <div className="bg-zinc-950 p-4 rounded-2xl border border-white/10 border-dashed border-amber-500/20">
                      <p className="text-[10px] font-bold uppercase text-amber-500 mb-1">Anticipo entregado</p>
                      <p className="text-2xl font-mono font-bold text-amber-500">{formatNumber(viewingPurchase.advancePayment)} BS</p>
                    </div>
                  )}
                  {viewingPurchase.type === 'abierto' && viewingPurchase.advancePayment !== undefined && (
                    <div className="bg-zinc-950 p-4 rounded-2xl border border-white/5">
                      <p className="text-[10px] font-bold uppercase text-zinc-500 mb-1">Saldo Final</p>
                      <p className="text-2xl font-mono font-bold text-zinc-100">
                        {formatNumber(viewingPurchase.total - (viewingPurchase.commission || 0) - viewingPurchase.advancePayment)} BS
                      </p>
                    </div>
                  )}
                </div>

                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">Materiales Comprados</h3>
                <div className="bg-zinc-950 rounded-2xl border border-white/5 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="text-[10px] text-zinc-500 uppercase font-bold border-b border-white/5">
                        <th className="px-6 py-3 text-left">Tipo</th>
                        <th className="px-6 py-3 text-left">Peso Inicial</th>
                        <th className="px-6 py-3 text-left">Peso Final</th>
                        <th className="px-6 py-3 text-left">Merma (%)</th>
                        <th className="px-6 py-3 text-left">Ley</th>
                        <th className="px-6 py-3 text-left">Precio/g</th>
                        <th className="px-6 py-3 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {viewingPurchase.items?.map((item, idx) => (
                        <tr key={idx} className="text-sm">
                          <td className="px-6 py-4">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${item.type === 'barra' ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-500'}`}>
                              {item.type || 'pieza'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-zinc-300">{formatNumber(item.initialWeight)}g</td>
                          <td className="px-6 py-4 text-zinc-100 font-bold">{formatNumber(item.finalWeight)}g</td>
                          <td className="px-6 py-4 text-red-400">
                            {item.lossPercentage ? `${formatNumber(item.lossPercentage)}%` : `${formatNumber((item.loss / item.initialWeight) * 100)}%`} ({formatNumber(item.loss)}g)
                          </td>
                          <td className="px-6 py-4 text-amber-500 font-bold">{formatNumber(item.purity)}%</td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className={`font-bold ${viewingPurchase.type === 'cerrado' ? 'text-emerald-500' : 'text-zinc-400'}`}>
                                {formatNumber(viewingPurchase.type === 'cerrado' ? (item.closePricePerGram || item.pricePerGram) : item.pricePerGram)} BS
                              </span>
                              {viewingPurchase.type === 'cerrado' && item.closePricePerGram && (
                                <span className="text-[8px] text-zinc-600 line-through">Estm: {formatNumber(item.pricePerGram)} BS</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex flex-col items-end">
                              <span className={`font-bold ${viewingPurchase.type === 'cerrado' ? 'text-emerald-500' : 'text-zinc-100'}`}>
                                {formatNumber(viewingPurchase.type === 'cerrado' ? (item.closeTotal || item.total) : item.total)} BS
                              </span>
                              {viewingPurchase.type === 'cerrado' && item.closeTotal && (
                                <span className="text-[8px] text-zinc-600 line-through">Estm: {formatNumber(item.total)} BS</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {viewingPurchase.items && viewingPurchase.items.length > 0 && (
                      <tfoot>
                        <tr className="bg-zinc-900/50 border-t border-white/10">
                          <td className="px-6 py-4 text-[10px] font-bold uppercase text-zinc-500">Totales</td>
                          <td className="px-6 py-4 text-sm font-mono font-bold text-zinc-100">
                            {formatNumber(viewingPurchase.items.reduce((acc, curr) => acc + curr.finalWeight, 0))}g
                          </td>
                          <td className="px-6 py-4 text-sm font-mono text-red-400">
                            {(() => {
                              const totalInitial = viewingPurchase.items.reduce((acc, curr) => acc + curr.initialWeight, 0);
                              const totalLoss = viewingPurchase.items.reduce((acc, curr) => acc + curr.loss, 0);
                              const totalPercentage = totalInitial > 0 ? (totalLoss / totalInitial) * 100 : 0;
                              return `${totalPercentage > 0 ? '-' : ''}${formatNumber(Math.abs(totalPercentage), 1)}% (${totalLoss > 0 ? '-' : ''}${formatNumber(Math.abs(totalLoss))}g)`;
                            })()}
                          </td>
                          <td colSpan={2}></td>
                          <td className="px-6 py-4 text-right text-sm font-mono font-bold">
                            <div className="flex flex-col items-end">
                              <span className="text-emerald-500">
                                {formatNumber(viewingPurchase.items.reduce((acc, curr) => acc + (viewingPurchase.type === 'cerrado' ? (curr.closeTotal || curr.total) : curr.total), 0))} BS
                              </span>
                              {viewingPurchase.type === 'cerrado' && (
                                <span className="text-[8px] text-zinc-600 line-through">Estm Original: {formatNumber(viewingPurchase.total)} BS</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              <div className="p-6 bg-zinc-950/50 border-t border-white/5 flex justify-end">
                <button 
                  onClick={() => setShowViewPurchaseModal(false)}
                  className="px-6 py-2 bg-zinc-800 text-zinc-100 rounded-xl font-bold hover:bg-zinc-700 transition-all"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Close Purchase Modal */}
      <AnimatePresence>
        {showClosePurchaseModal && closingPurchase && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowClosePurchaseModal(false);
                setClosingPurchase(null);
              }}
              className="absolute inset-0 bg-zinc-950/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-6xl bg-zinc-900 rounded-[32px] border border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-white/5 bg-zinc-950 flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <div className="p-2 bg-emerald-500/10 rounded-xl">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    </div>
                    <h2 className="text-2xl font-bold text-zinc-100">
                      Cerrar Compra de Oro #{closingPurchase.receiptNumber}
                    </h2>
                  </div>
                  <p className="text-sm text-zinc-400">
                    Procedimiento de recalculo y liquidación final de compra abierta
                  </p>
                </div>
                <button onClick={() => {
                  setShowClosePurchaseModal(false);
                  setClosingPurchase(null);
                }} className="p-2 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 rounded-full transition-all">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Body */}
              <div className="p-8 max-h-[75vh] overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
                  {/* Column 1: Info Origen y Apertura */}
                  <div className="space-y-4">
                    <div className="bg-zinc-950/50 p-5 rounded-2xl border border-white/5 shadow-sm">
                      <p className="text-[10px] font-bold uppercase text-zinc-500 mb-3 tracking-widest border-b border-white/5 pb-2 flex items-center gap-2">
                        <Building2 className="w-3 h-3 text-amber-500/70" /> INFORMACIÓN DE ORIGEN
                      </p>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] text-zinc-500 uppercase font-bold">Sucursal</span>
                          <span className="text-xs font-bold text-amber-500">{branches.find(b => b.id === closingPurchase.branchId)?.name || 'Sede Central'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] text-zinc-500 uppercase font-bold">Cliente</span>
                          <span className="text-xs font-bold text-zinc-100">{clients.find(c => c.id === closingPurchase.clientId)?.name || 'Desconocido'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] text-zinc-500 uppercase font-bold">Fecha Registro</span>
                          <span className="text-[10px] font-mono text-zinc-400">{new Date(closingPurchase.createdAt).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-zinc-950/50 p-5 rounded-2xl border border-white/5 shadow-sm">
                      <p className="text-[10px] font-bold uppercase text-zinc-600 mb-3 tracking-widest flex items-center gap-2">
                        <TrendingUp className="w-3 h-3 text-zinc-600" /> DATOS DE APERTURA (ORIGINAL)
                      </p>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-zinc-900/50 rounded-xl border border-white/5">
                          <p className="text-[8px] uppercase text-zinc-500 mb-1">Mkt Original</p>
                          <p className="text-xs font-mono text-zinc-300 font-bold">{formatNumber(closingPurchase.items?.[0]?.marketPrice || 0)} <span className="text-[8px]">USD</span></p>
                        </div>
                        <div className="p-3 bg-zinc-900/50 rounded-xl border border-white/5">
                          <p className="text-[8px] uppercase text-zinc-500 mb-1">TC Original</p>
                          <p className="text-xs font-mono text-zinc-300 font-bold">{formatNumber(closingPurchase.items?.[0]?.usdToBs || 0)} <span className="text-[8px]">BS</span></p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Column 2: Procedimiento de Cierre */}
                  <div className="space-y-4">
                    <div className="bg-emerald-500/5 p-6 rounded-3xl border border-emerald-500/20 ring-1 ring-emerald-500/5 shadow-inner h-full flex flex-col">
                      <p className="text-[10px] font-bold uppercase text-emerald-500 mb-4 tracking-widest border-b border-emerald-500/10 pb-2 flex items-center gap-2">
                        <RefreshCw className="w-3 h-3" /> PROCEDIMIENTO CIERRE
                      </p>
                      
                      <div className="space-y-6 flex-1">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase text-zinc-500 ml-1">Cotización Cierre (USD/oz)</label>
                          <div className="relative group">
                            <input 
                              type="number"
                              value={closeMarketPrice || ''}
                              onChange={e => setCloseMarketPrice(parseFloat(e.target.value) || 0)}
                              className="w-full pl-4 pr-12 py-4 bg-zinc-950 rounded-2xl border border-white/10 text-zinc-100 font-mono text-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all font-bold placeholder:text-zinc-800"
                              placeholder="0.00"
                            />
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-end pointer-events-none opacity-50 group-focus-within:opacity-100 transition-opacity">
                              <span className="text-[10px] font-bold text-zinc-400">USD</span>
                              <span className="text-[8px] text-zinc-500 uppercase tracking-tighter">Fix Cierre</span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase text-zinc-500 ml-1">Tipo de Cambio Cierre (BS/USD)</label>
                          <div className="relative group">
                            <input 
                              type="number"
                              value={closeUsdToBs || ''}
                              onChange={e => setCloseUsdToBs(parseFloat(e.target.value) || 0)}
                              className="w-full pl-4 pr-12 py-4 bg-zinc-950 rounded-2xl border border-white/10 text-zinc-100 font-mono text-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all font-bold placeholder:text-zinc-800"
                              placeholder="0.00"
                            />
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-end pointer-events-none opacity-50 group-focus-within:opacity-100 transition-opacity">
                              <span className="text-[10px] font-bold text-zinc-400">BS</span>
                              <span className="text-[8px] text-zinc-500 uppercase tracking-tighter">TC Cierre</span>
                            </div>
                          </div>
                        </div>

                        <div className="pt-4 flex justify-between items-center mt-auto border-t border-emerald-500/10">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                            <p className="text-[9px] text-zinc-400 italic">Fecha Cierre: {new Date().toLocaleDateString()}</p>
                          </div>
                          <span className="text-[9px] font-mono text-emerald-500/60 font-bold">{new Date().toLocaleTimeString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Column 3: Resumen de Resultados */}
                  <div className="space-y-4">
                    {(() => {
                      const recalculatedItems = (closingPurchase.items || []).map(item => {
                        const pricePerGram = (closeMarketPrice / 31.1035) * (item.purity / 100) * closeUsdToBs;
                        const total = item.finalWeight * pricePerGram;
                        return { ...item, closeTotal: total };
                      });
                      const newTotal = recalculatedItems.reduce((acc, curr) => acc + curr.closeTotal, 0);
                      const balance = newTotal - (closingPurchase.advancePayment || 0) - (closingPurchase.commission || 0);

                      return (
                        <div className="h-full flex flex-col gap-4">
                          <div className="bg-zinc-950 p-6 rounded-3xl border border-white/5 flex-1 shadow-inner flex flex-col relative overflow-hidden">
                            <div className="absolute -right-4 -top-4 p-4 opacity-[0.03] pointer-events-none">
                              <Coins className="w-24 h-24 text-white" />
                            </div>
                            
                            <div className="flex justify-between items-start mb-4">
                              <div>
                                <p className="text-[10px] font-bold uppercase text-emerald-500 tracking-[0.2em] mb-1">TOTAL RECALCULADO</p>
                                <p className="text-sm text-zinc-500 flex items-center gap-1.5 font-medium">
                                  <Scale className="w-3.5 h-3.5" /> Valor de Liquidación
                                </p>
                              </div>
                              <div className="p-2 bg-emerald-500/10 rounded-xl">
                                <TrendingUp className="w-4 h-4 text-emerald-500" />
                              </div>
                            </div>
                            
                            <p className="text-4xl font-mono font-bold text-zinc-100 mb-auto tracking-tight">{formatNumber(newTotal)} <span className="text-sm text-zinc-500 uppercase">BS</span></p>
                            
                            <div className="space-y-3 border-t border-white/5 pt-6 mt-6">
                              {closingPurchase.advancePayment > 0 && (
                                <div className="flex justify-between items-center group">
                                  <span className="text-[10px] uppercase font-bold text-zinc-500 flex items-center gap-2">
                                    <div className="w-1 h-1 bg-amber-500 rounded-full" /> (+) Anticipo
                                  </span>
                                  <span className="text-xs font-mono font-bold text-amber-500">-{formatNumber(closingPurchase.advancePayment)} <span className="text-[9px]">BS</span></span>
                                </div>
                              )}
                              {closingPurchase.commission > 0 && (
                                <div className="flex justify-between items-center group">
                                  <span className="text-[10px] uppercase font-bold text-zinc-500 flex items-center gap-2">
                                    <div className="w-1 h-1 bg-blue-500 rounded-full" /> (+) Comisión
                                  </span>
                                  <span className="text-xs font-mono font-bold text-blue-400">-{formatNumber(closingPurchase.commission)} <span className="text-[9px]">BS</span></span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="bg-emerald-600 p-6 rounded-[32px] shadow-2xl shadow-emerald-900/40 flex flex-col items-center justify-center border border-white/20 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-125 transition-transform duration-500 pointer-events-none">
                              <CheckCircle2 className="w-20 h-20 text-white" />
                            </div>
                            <p className="text-[10px] font-bold uppercase text-emerald-100/70 mb-2 tracking-[0.3em] relative z-10 text-center">Saldo Líquido a Pagar</p>
                            <p className="text-4xl font-mono font-bold text-white drop-shadow-lg relative z-10">
                              {formatNumber(balance)} <span className="text-lg opacity-80">BS</span>
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Material Recalculation Table */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-2">
                    <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-3">
                      <div className="p-1.5 bg-zinc-800 rounded-lg">
                        <Scale className="w-3.5 h-3.5 text-zinc-400" />
                      </div>
                      RECALCULACIÓN DETALLE DE MATERIALES
                    </h3>
                  </div>
                  
                  <div className="bg-zinc-950 rounded-[32px] border border-white/5 overflow-hidden shadow-2xl">
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="text-[9px] text-zinc-500 uppercase font-bold border-b border-white/5 bg-zinc-900/50">
                            <th className="px-6 py-5 text-left text-amber-500/80">Material</th>
                            <th className="px-6 py-5 text-left">Peso Base (g)</th>
                            <th className="px-6 py-5 text-left">Ley (%)</th>
                            <th className="px-6 py-5 text-left">P.Gramo Orig.</th>
                            <th className="px-6 py-5 text-left bg-emerald-500/5 text-emerald-400 border-x border-emerald-500/10">P.Gramo Cierre</th>
                            <th className="px-6 py-5 text-right">Subtotal Orig.</th>
                            <th className="px-6 py-5 text-right bg-emerald-500/10 text-emerald-400 font-black">Subtotal Cierre</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {(closingPurchase.items || []).map((item, idx) => {
                            const closePricePerGram = (closeMarketPrice / 31.1035) * (item.purity / 100) * closeUsdToBs;
                            const subtotalOrig = item.total;
                            const subtotalClose = item.finalWeight * closePricePerGram;
                            return (
                              <tr key={idx} className="hover:bg-white/[0.02] transition-colors group">
                                <td className="px-6 py-5">
                                  <div className="flex items-center gap-3">
                                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500/50 group-hover:bg-amber-500 transition-colors" />
                                    <span className="text-xs font-bold text-zinc-300 uppercase">{item.type || 'pieza'}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-5 text-sm font-mono text-zinc-400">{formatNumber(item.finalWeight)}g</td>
                                <td className="px-6 py-5">
                                  <span className="px-2 py-0.5 bg-amber-500/10 text-amber-500 rounded text-[10px] font-mono font-bold border border-amber-500/20">{formatNumber(item.purity)}%</span>
                                </td>
                                <td className="px-6 py-5 text-sm font-mono text-zinc-500">{formatNumber(item.pricePerGram)} BS</td>
                                <td className="px-6 py-5 bg-emerald-500/[0.02] border-x border-emerald-500/5">
                                  <span className="text-sm font-mono text-emerald-500 font-bold">{formatNumber(closePricePerGram)} BS</span>
                                </td>
                                <td className="px-6 py-5 text-right text-xs font-mono text-zinc-500 italic">{formatNumber(subtotalOrig)} BS</td>
                                <td className="px-6 py-5 text-right bg-emerald-500/5">
                                  <span className="text-sm font-mono text-emerald-400 font-black">{formatNumber(subtotalClose)} BS</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-8 bg-zinc-950 border-t border-white/5 flex gap-4">
                <button 
                  onClick={() => {
                    setShowClosePurchaseModal(false);
                    setClosingPurchase(null);
                  }}
                  className="flex-1 py-4 bg-zinc-800 text-zinc-100 rounded-2xl font-bold hover:bg-zinc-700 transition-all border border-white/5"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => handleClosePurchase(closingPurchase)}
                  className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-xl shadow-emerald-600/20 hover:bg-emerald-500 transition-all flex items-center justify-center gap-2 focus:ring-4 focus:ring-emerald-500/50"
                  disabled={!closeMarketPrice || !closeUsdToBs}
                >
                  <CheckCircle2 className="w-5 h-5" />
                  Ejecutar Cierre y Recalcular Montos
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add/Edit Referrer Modal */}
      <AnimatePresence>
        {showAddReferrerModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowAddReferrerModal(false);
                setEditingReferrer(null);
                setReferrerFormData({ name: '', phone1: '', phone2: '', ci: '' });
              }}
              className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-zinc-900 rounded-[32px] border border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-white/5 bg-zinc-950 flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-zinc-100">{editingReferrer ? 'Editar Referido' : 'Nuevo Referido'}</h2>
                  <p className="text-sm text-zinc-400">Ingrese los datos básicos del referido</p>
                </div>
                <button onClick={() => {
                  setShowAddReferrerModal(false);
                  setEditingReferrer(null);
                  setReferrerFormData({ name: '', phone1: '', phone2: '', ci: '' });
                }} className="text-zinc-500 hover:text-zinc-300">
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>

              <form onSubmit={handleSaveReferrer} className="p-8 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">Nombre Completo</label>
                  <input 
                    required
                    type="text" 
                    value={referrerFormData.name}
                    onChange={e => setReferrerFormData({...referrerFormData, name: e.target.value})}
                    className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">CI / Identificación</label>
                  <div className="relative">
                    <input 
                      required
                      type="text" 
                      value={referrerFormData.ci}
                      onChange={e => setReferrerFormData({...referrerFormData, ci: e.target.value})}
                      className={`w-full p-3 bg-zinc-950 rounded-xl border ${isReferrerCiAlreadyUsed ? 'border-red-500/50 focus:ring-red-500/20' : 'border-white/5 focus:ring-indigo-500/20'} text-zinc-100 focus:outline-none focus:ring-2 font-mono`}
                    />
                    {isReferrerCiAlreadyUsed && (
                      <div className="absolute -bottom-5 left-0 flex items-center gap-1 text-[9px] text-red-500 font-bold animate-pulse">
                        <AlertCircle className="w-2.5 h-2.5" /> Este CI ya está registrado
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">Teléfono 1 (Principal)</label>
                  <input 
                    required
                    type="tel" 
                    value={referrerFormData.phone1}
                    onChange={e => setReferrerFormData({...referrerFormData, phone1: e.target.value})}
                    className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">Teléfono 2 (Opcional)</label>
                  <input 
                    type="tel" 
                    value={referrerFormData.phone2}
                    onChange={e => setReferrerFormData({...referrerFormData, phone2: e.target.value})}
                    className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <button 
                  type="submit"
                  disabled={isReferrerCiAlreadyUsed}
                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-xl shadow-indigo-600/20 hover:bg-indigo-500 transition-all mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingReferrer ? 'Guardar Cambios' : 'Registrar Referido'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Referrer Payout Modal */}
      <AnimatePresence>
        {showPayoutModal && payoutReferrer && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPayoutModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl bg-zinc-900 rounded-[32px] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-8 border-b border-white/5 flex justify-between items-start bg-zinc-950">
                <div>
                  <h3 className="text-2xl font-bold text-zinc-100 flex items-center gap-3 italic">
                    <Coins className="w-6 h-6 text-amber-500" /> Liquidar Comisiones
                  </h3>
                  <p className="text-zinc-500 text-sm mt-1">Nombre: <span className="text-zinc-100 font-bold">{payoutReferrer.name}</span></p>
                </div>
                <button onClick={() => setShowPayoutModal(false)} className="text-zinc-500 hover:text-zinc-300">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-hidden flex flex-col">
                <div className="p-8 overflow-y-auto">
                  <h4 className="text-[10px] font-bold uppercase text-zinc-500 mb-4 tracking-widest">Recibos Pendientes de Pago</h4>
                  <div className="bg-zinc-950/50 rounded-2xl border border-white/5 overflow-hidden">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-[10px] text-zinc-500 uppercase font-bold border-b border-white/5 bg-zinc-900/50">
                          <th className="px-6 py-3">Seleccionar</th>
                          <th className="px-6 py-3">Nro. Recibo</th>
                          <th className="px-6 py-3">Fecha</th>
                          <th className="px-6 py-3">Cliente</th>
                          <th className="px-6 py-3 text-right">Comisión</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {(() => {
                          const pending = goldPurchases.filter(p => p.referrerName === payoutReferrer.name && p.branchId === branchMode && !p.commissionPaid && (p.commission || 0) > 0);
                          if (pending.length === 0) return (
                            <tr>
                              <td colSpan={5} className="px-6 py-12 text-center text-zinc-600 italic">
                                No hay comisiones pendientes para pagar.
                              </td>
                            </tr>
                          );
                          return pending.map(p => (
                            <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                              <td className="px-6 py-3">
                                <input 
                                  type="checkbox"
                                  checked={selectedPurchasesForPayout.includes(p.id)}
                                  onChange={() => {
                                    setSelectedPurchasesForPayout(prev => 
                                      prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id]
                                    );
                                  }}
                                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500/20"
                                />
                              </td>
                              <td className="px-6 py-3 text-sm font-mono font-bold text-amber-500">#{p.receiptNumber}</td>
                              <td className="px-6 py-3 text-xs text-zinc-500">{new Date(p.createdAt).toLocaleDateString()}</td>
                              <td className="px-6 py-3 text-sm text-zinc-100">{clients.find(c => c.id === p.clientId)?.name}</td>
                              <td className="px-6 py-3 text-right text-sm font-mono font-bold text-blue-400">{formatNumber(p.commission || 0)} BS</td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="p-8 bg-zinc-950 border-t border-white/5 shrink-0 space-y-6">
                <div className="flex justify-between items-end gap-10">
                  <div className="flex-1 space-y-2">
                    <label className="text-[10px] font-bold uppercase text-zinc-500">Notas Adicionales</label>
                    <textarea 
                      value={payoutNotes}
                      onChange={e => setPayoutNotes(e.target.value)}
                      placeholder="Alguna observación sobre el pago..."
                      className="w-full p-4 bg-zinc-900 rounded-2xl border border-white/10 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-zinc-500 font-bold uppercase mb-1">Total a Liquidar</p>
                    <p className="text-4xl font-mono font-bold text-amber-500">
                      {formatNumber(goldPurchases.filter(p => selectedPurchasesForPayout.includes(p.id)).reduce((acc, curr) => acc + (curr.commission || 0), 0))} BS
                    </p>
                    <p className="text-[10px] text-zinc-600 font-bold uppercase mt-1 italic">Seleccionado: {selectedPurchasesForPayout.length} recibos</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => setShowPayoutModal(false)}
                    className="flex-1 py-4 bg-zinc-800 text-zinc-100 rounded-2xl font-bold hover:bg-zinc-700 transition-all border border-white/5"
                  >
                    Cancelar
                  </button>
                  <button 
                    disabled={selectedPurchasesForPayout.length === 0}
                    onClick={handleAddReferrerPayout}
                    className="flex-[2] py-4 bg-amber-500 text-zinc-950 rounded-2xl font-bold hover:bg-amber-400 transition-all shadow-xl shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                  >
                    <CheckCircle2 className="w-5 h-5" /> Registrar Pago y Generar PDF
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Referrer Payout History Modal */}
      <AnimatePresence>
        {showPayoutHistoryModal && payoutHistoryReferrer && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPayoutHistoryModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl bg-zinc-900 rounded-[32px] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-8 border-b border-white/5 flex justify-between items-start bg-zinc-950">
                <div>
                  <h3 className="text-2xl font-bold text-zinc-100 flex items-center gap-3 italic">
                    <History className="w-6 h-6 text-blue-500" /> Historial de Pagos
                  </h3>
                  <p className="text-zinc-500 text-sm mt-1">Referido: <span className="text-zinc-100 font-bold">{payoutHistoryReferrer.name}</span></p>
                </div>
                <button onClick={() => setShowPayoutHistoryModal(false)} className="text-zinc-500 hover:text-zinc-300">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8">
                <div className="space-y-4">
                  {(() => {
                    const history = referrerPayouts
                      .filter(p => p.referrerId === payoutHistoryReferrer.id && p.branchId === branchMode)
                      .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());

                    if (history.length === 0) return (
                      <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
                        <History className="w-12 h-12 mb-4 opacity-20" />
                        <p className="italic">No hay historial de pagos registrado.</p>
                      </div>
                    );

                    return history.map(payout => (
                      <div key={payout.id} className="bg-zinc-950/50 rounded-2xl border border-white/5 p-6 hover:bg-white/[0.02] transition-all group">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <div className="flex items-center gap-3 mb-1">
                              <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20">
                                Pago #{payout.id.slice(0, 8).toUpperCase()}
                              </span>
                              <span className="text-xs text-zinc-500 font-mono italic">
                                {new Date(payout.paidAt).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-sm text-zinc-400">Pagado por: <span className="text-zinc-200 font-bold">{payout.paidBy}</span></p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-[9px] text-zinc-500 font-bold uppercase mb-0.5">Total Pagado</p>
                              <p className="text-xl font-mono font-bold text-emerald-500">{formatNumber(payout.totalAmount)} BS</p>
                            </div>
                            <button 
                              onClick={() => handlePrintCommissionReceipt(payout)}
                              className="p-3 bg-zinc-800 text-zinc-400 rounded-xl hover:bg-zinc-700 hover:text-white transition-all border border-white/5 group-hover:scale-110 active:scale-95"
                              title="Re-descargar PDF"
                            >
                              <Download className="w-5 h-5" />
                            </button>
                          </div>
                        </div>

                        <div className="border-t border-white/5 pt-4">
                          <p className="text-[8px] text-zinc-500 uppercase font-bold mb-2 tracking-tighter">Recibos Relacionados</p>
                          <div className="flex flex-wrap gap-2">
                            {payout.purchaseReceipts.map(rec => (
                              <span key={rec} className="px-2 py-1 bg-zinc-900 text-amber-500 text-[10px] font-mono font-bold rounded-lg border border-amber-500/10 shadow-lg">
                                #{rec}
                              </span>
                            ))}
                          </div>
                          {payout.notes && (
                            <div className="mt-4 p-3 bg-white/[0.02] rounded-xl border border-white/5">
                              <p className="text-[9px] text-zinc-500 font-bold uppercase mb-1">Observaciones</p>
                              <p className="text-xs text-zinc-400 italic">{payout.notes}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              <div className="p-8 bg-zinc-950 border-t border-white/5 shrink-0">
                <button 
                  onClick={() => setShowPayoutHistoryModal(false)}
                  className="w-full py-4 bg-zinc-900 text-zinc-400 rounded-2xl font-bold hover:bg-zinc-800 transition-all border border-white/5"
                >
                  Cerrar Historial
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
 
      {/* Client Purchase History Modal */}
      <AnimatePresence>
        {showClientHistoryModal && historyClient && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowClientHistoryModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-5xl bg-zinc-900 rounded-[32px] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-8 border-b border-white/5 flex justify-between items-start bg-zinc-950">
                <div>
                  <h3 className="text-2xl font-bold text-zinc-100 flex items-center gap-3 italic">
                    <History className="w-6 h-6 text-amber-500" /> Historial de Compras
                  </h3>
                  <p className="text-zinc-500 text-sm mt-1">Cliente: <span className="text-zinc-100 font-bold">{historyClient.name}</span></p>
                </div>
                <button onClick={() => setShowClientHistoryModal(false)} className="text-zinc-500 hover:text-zinc-300">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8">
                <div className="bg-zinc-950/50 rounded-2xl border border-white/5 overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] text-zinc-500 uppercase font-bold border-b border-white/5 bg-zinc-900/50">
                        <th className="px-6 py-3">Recibo</th>
                        <th className="px-6 py-3">Fecha</th>
                        <th className="px-6 py-3 text-center">Estado</th>
                        <th className="px-6 py-3 text-center">Referido</th>
                        <th className="px-6 py-3 text-right">Peso Total</th>
                        <th className="px-6 py-3 text-right">Monto Total</th>
                        <th className="px-6 py-3 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {(() => {
                        const history = goldPurchases
                          .filter(p => p.clientId === historyClient.id)
                          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

                        if (history.length === 0) return (
                          <tr>
                            <td colSpan={7} className="px-6 py-12 text-center text-zinc-600 italic">
                              No hay historial de compras registrado.
                            </td>
                          </tr>
                        );

                        return history.map(payout => (
                          <tr key={payout.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="px-6 py-3 text-sm font-mono font-bold text-amber-500">#{payout.receiptNumber}</td>
                            <td className="px-6 py-3 text-xs text-zinc-500">{new Date(payout.createdAt).toLocaleDateString()}</td>
                            <td className="px-6 py-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase ${
                                payout.type === 'abierto' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                              }`}>
                                {payout.type}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-center text-[10px] text-zinc-400 font-bold uppercase tracking-tighter">
                              {payout.referrerName || '-'}
                            </td>
                            <td className="px-6 py-3 text-right font-mono text-zinc-300">
                              {formatNumber(payout.items?.reduce((acc, curr) => acc + curr.finalWeight, 0) || 0)}g
                            </td>
                            <td className="px-6 py-3 text-right font-mono font-bold text-emerald-500">
                              {formatNumber(payout.total)} BS
                            </td>
                            <td className="px-6 py-3 text-center">
                              <button 
                                onClick={() => handlePrintPurchaseReceipt(payout, payout.type === 'abierto' ? 'abierto' : 'cierre')}
                                className="p-2 bg-zinc-800 text-zinc-400 rounded-lg hover:bg-zinc-700 hover:text-white transition-all border border-white/5"
                                title="Re-imprimir"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-8 bg-zinc-950 border-t border-white/5 shrink-0 flex justify-end">
                <button 
                  onClick={() => setShowClientHistoryModal(false)}
                  className="px-8 py-4 bg-zinc-900 text-zinc-400 rounded-2xl font-bold hover:bg-zinc-800 transition-all border border-white/5"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
 
      {revaluationItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setRevaluationItem(null)}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-zinc-900 rounded-[40px] border border-white/5 shadow-2xl overflow-hidden"
          >
            <div className="p-8 border-b border-white/5 flex justify-between items-center bg-zinc-900/50">
              <div>
                <h3 className="text-xl font-bold text-zinc-100 italic">Otros Datos</h3>
                <p className="text-zinc-500 text-xs mt-1 uppercase tracking-widest font-bold font-mono">
                  {(revaluationItem.type || 'pieza').toUpperCase()}
                </p>
              </div>
              <button 
                onClick={() => setRevaluationItem(null)}
                className="p-2 hover:bg-white/5 rounded-full text-zinc-500 transition-colors"
              >
                <X />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold uppercase text-zinc-500 mb-1 block">Otro Peso Final (g)</label>
                  <input 
                    type="number"
                    step="0.01"
                    placeholder="Ingrese peso..."
                    defaultValue={revaluationItem.otherWeight || ''}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      revaluationItem.otherWeight = val;
                    }}
                    className="w-full p-4 bg-zinc-950 rounded-2xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-zinc-500 mb-1 block">Otra Ley (%)</label>
                  <input 
                    type="number"
                    step="0.01"
                    placeholder="Ingrese ley..."
                    defaultValue={revaluationItem.otherPurity || ''}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      revaluationItem.otherPurity = val;
                    }}
                    className="w-full p-4 bg-zinc-950 rounded-2xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  onClick={() => setRevaluationItem(null)}
                  className="flex-1 py-4 bg-zinc-800 text-zinc-400 rounded-2xl font-bold hover:bg-zinc-800/80 transition-all border border-white/5"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => handleUpdateRevaluation(revaluationItem.id, revaluationItem.otherWeight || 0, revaluationItem.otherPurity || 0)}
                  className="flex-1 py-4 bg-amber-500 text-amber-950 rounded-2xl font-bold hover:brightness-110 transition-all shadow-[0_0_20px_rgba(245,158,11,0.2)]"
                >
                  Guardar
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 bg-zinc-950 border-t border-white/5 px-6 py-4 md:hidden z-40">
        <div className="flex justify-around items-center">
          <button onClick={() => handleViewChange(branchMode ? 'branch_dashboard' : 'inventory')} className={`p-2 ${view === (branchMode ? 'branch_dashboard' : 'inventory') ? 'text-amber-500' : 'text-zinc-500'}`}>
            <Package className="w-6 h-6" />
          </button>
          <button onClick={() => handleViewChange(branchMode ? 'branch_purchases' : 'smelt')} className={`p-2 ${view === (branchMode ? 'branch_purchases' : 'smelt') ? 'text-amber-500' : 'text-zinc-500'}`}>
            {branchMode ? <Coins className="w-6 h-6" /> : <Flame className="w-6 h-6" />}
          </button>
          <button onClick={() => handleViewChange(branchMode ? 'branch_clients' : 'history')} className={`p-2 ${view === (branchMode ? 'branch_clients' : 'history') ? 'text-amber-500' : 'text-zinc-500'}`}>
            {branchMode ? <User className="w-6 h-6" /> : <History className="w-6 h-6" />}
          </button>
        </div>
      </nav>
    </div>
    </ErrorBoundary>
  );
}
