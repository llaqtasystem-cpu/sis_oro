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
  UserPlus,
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
  Eye,
  MessageCircle,
  Truck,
  ArrowRightLeft,
  ArrowUpRight,
  ArrowDownRight,
  Save,
  ExternalLink,
  CornerDownRight,
  Pencil,
  Clock,
  Camera,
  Upload,
  Database,
  AlertTriangle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { motion, AnimatePresence } from 'motion/react';
import { Material, MaterialType, MaterialStatus, SmeltingOperation, ExportOperation, User as SystemUser, UserRole, Branch, BranchBankAccount, SourceMaterialInfo, CompanySettings, Client, GoldPurchase, GoldPurchaseItem, Referrer, ReferrerPayout, GoldTransfer, AdvancePayment, BranchCashMove, BranchClosure } from './types';

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

  return `${(resultado || '').trim()} ${decimales.toString().padStart(2, '0')}/100 BOLIVIANOS`;
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
    
    const trimmedUsername = (username || '').trim();
    const trimmedPin = (pin || '').trim();
    
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
    const { finalWeight, marketPrice, purity, usdToBs, pricePerGram100: currentPrice100, pricePerGram: currentPrice, total: currentTotal } = formData;
    if (marketPrice > 0 && purity > 0 && usdToBs > 0) {
      const ppg100 = parseFloat((((marketPrice * (purity / 100)) / 31.1035) * usdToBs).toFixed(2));
      const ppg = parseFloat((ppg100 * 0.90).toFixed(2));
      const nextTotal = parseFloat((ppg * finalWeight).toFixed(2));

      if (Math.abs(ppg100 - (currentPrice100 || 0)) > 0.01 || Math.abs(ppg - currentPrice) > 0.01 || Math.abs(nextTotal - currentTotal) > 0.01) {
        setFormData(prev => ({
          ...prev,
          pricePerGram100: ppg100,
          pricePerGram: ppg,
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
            className="relative bg-zinc-900 w-full max-w-[1200px] rounded-3xl shadow-2xl overflow-hidden border border-white/5"
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
                  <label className="text-[10px] font-bold uppercase text-amber-500">Precio x Gr (100%)</label>
                  <input 
                    required
                    type="number" 
                    step="0.01"
                    value={formData.pricePerGram100 || ''}
                    onChange={e => {
                      const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                      const ppg = parseFloat((val * 0.90).toFixed(2));
                      setFormData({
                        ...formData, 
                        pricePerGram100: val,
                        pricePerGram: ppg,
                        total: parseFloat((ppg * formData.finalWeight).toFixed(2))
                      });
                    }}
                    className="w-full p-2 bg-zinc-950 rounded-xl border border-white/5 text-xs text-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">Precio por Gramo</label>
                  <input 
                    readOnly
                    type="number" 
                    step="0.01"
                    value={formData.pricePerGram || ''}
                    className="w-full p-2 bg-zinc-950/50 rounded-xl border border-white/5 text-xs text-amber-500/60 focus:outline-none cursor-not-allowed font-bold"
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
              <div key={`${sm.receiptNumber}-${idx}`} className="bg-zinc-800/50 p-2 rounded-lg text-[10px] border border-white/5">
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
  const [goldTransfers, setGoldTransfers] = useState<GoldTransfer[]>([]);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedTransferMaterials, setSelectedTransferMaterials] = useState<string[]>([]);
  const [isTransferring, setIsTransferring] = useState(false);
  const [showTransferHistoryModal, setShowTransferHistoryModal] = useState(false);
  const [showTransferItemsModal, setShowTransferItemsModal] = useState(false);
  const [showReceiveConfirmModal, setShowReceiveConfirmModal] = useState(false);
  const [transferToReceive, setTransferToReceive] = useState<GoldTransfer | null>(null);
  const [selectedTransferForItems, setSelectedTransferForItems] = useState<GoldTransfer | null>(null);
  const [selectedItemToVerify, setSelectedItemToVerify] = useState<any | null>(null);
  const [showVerifyItemModal, setShowVerifyItemModal] = useState(false);
  const [isVerifyingItem, setIsVerifyingItem] = useState(false);
  const [selectedPurchasesForPayout, setSelectedPurchasesForPayout] = useState<string[]>([]);
  const [payoutNotes, setPayoutNotes] = useState('');
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [showPayoutHistoryModal, setShowPayoutHistoryModal] = useState(false);
  const [payoutReferrer, setPayoutReferrer] = useState<Referrer | null>(null);
  const [payoutHistoryReferrer, setPayoutHistoryReferrer] = useState<Referrer | null>(null);
  const [historyTab, setHistoryTab] = useState<'smelting' | 'export'>('smelting');
  const [showClientHistoryModal, setShowClientHistoryModal] = useState(false);
  const [historyClient, setHistoryClient] = useState<Client | null>(null);
  const [branchBankAccounts, setBranchBankAccounts] = useState<BranchBankAccount[]>([]);
  const [showBranchBankAccountsModal, setShowBranchBankAccountsModal] = useState(false);
  const [selectedBranchForBanks, setSelectedBranchForBanks] = useState<Branch | null>(null);
  const [editingBranchBankAccount, setEditingBranchBankAccount] = useState<BranchBankAccount | null>(null);
  const [bankAccountFormData, setBankAccountFormData] = useState({ bankName: '', accountNumber: '' });

  const [branchCashMoves, setBranchCashMoves] = useState<BranchCashMove[]>([]);
  const [branchClosures, setBranchClosures] = useState<BranchClosure[]>([]);
  const [showAddCashMoveModal, setShowAddCashMoveModal] = useState(false);
  const [showAddClosureModal, setShowAddClosureModal] = useState(false);
  const [showViewClosureModal, setShowViewClosureModal] = useState(false);
  const [viewingClosure, setViewingClosure] = useState<BranchClosure | null>(null);
  const [closureMoves, setClosureMoves] = useState<BranchCashMove[]>([]);
  const [cashMoveFormData, setCashMoveFormData] = useState<Partial<BranchCashMove>>({
    amount: 0,
    type: 'ingreso',
    concept: '',
    category: 'manual',
    paymentType: 'efectivo',
    date: new Date().toISOString().split('T')[0]
  });
  const [closureFormData, setClosureFormData] = useState<Partial<BranchClosure>>({
    notes: ''
  });

  const [view, setView] = useState<'inventory' | 'smelt' | 'export' | 'users' | 'history' | 'settings' | 'deleted' | 'branches' | 'branch_dashboard' | 'branch_clients' | 'branch_purchases' | 'branch_referrers' | 'branch_transfers' | 'branch_cash'>('inventory');
  const [branchMode, setBranchMode] = useState<string | null>(null); // null means Warehouse mode, otherwise branchId

  const pendingLiquidationsAlerts = useMemo(() => {
    if (!branchMode) return [];
    return goldPurchases
      .filter(p => p.branchId === branchMode && p.type === 'abierto')
      .map(p => {
        const deadline = new Date(p.createdAt);
        deadline.setDate(deadline.getDate() + 15);
        const now = new Date();
        const diffTime = deadline.getTime() - now.getTime();
        const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return { ...p, daysRemaining };
      })
      .filter(p => p.daysRemaining <= 5)
      .sort((a, b) => a.daysRemaining - b.daysRemaining);
  }, [goldPurchases, branchMode]);
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
  const [editingCashMove, setEditingCashMove] = useState<BranchCashMove | null>(null);
  const [showEditCashMoveModal, setShowEditCashMoveModal] = useState(false);
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
    branchId: '',
    photo: ''
  });

  const [isUserCameraActive, setIsUserCameraActive] = useState(false);
  const userVideoRef = useRef<HTMLVideoElement | null>(null);

  const startUserCamera = async () => {
    try {
      setIsUserCameraActive(true);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 400, height: 400, facingMode: 'user' } });
      setTimeout(() => {
        if (userVideoRef.current) {
          userVideoRef.current.srcObject = stream;
          userVideoRef.current.play();
        }
      }, 150);
    } catch (err) {
      console.error("No se pudo acceder a la cámara:", err);
      alert("No se pudo iniciar la cámara. Por favor, verifique los permisos de acceso a la cámara.");
      setIsUserCameraActive(false);
    }
  };

  const stopUserCamera = () => {
    if (userVideoRef.current && userVideoRef.current.srcObject) {
      const stream = userVideoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      userVideoRef.current.srcObject = null;
    }
    setIsUserCameraActive(false);
  };

  const captureUserPhoto = () => {
    if (userVideoRef.current) {
      const video = userVideoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 400;
      canvas.height = video.videoHeight || 400;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const size = Math.min(canvas.width, canvas.height);
        const xOffset = (canvas.width - size) / 2;
        const yOffset = (canvas.height - size) / 2;
        canvas.width = 300;
        canvas.height = 300;
        ctx.drawImage(video, xOffset, yOffset, size, size, 0, 0, 300, 300);
        const base64Photo = canvas.toDataURL('image/jpeg', 0.85);
        setUserFormData(prev => ({ ...prev, photo: base64Photo }));
      }
      stopUserCamera();
    }
  };

  // Generic Camera states for Clients and Referrers
  const [activeCameraTarget, setActiveCameraTarget] = useState<'clientPhoto' | 'clientDoc' | 'referrerPhoto' | 'referrerDoc' | null>(null);
  const genericVideoRef = useRef<HTMLVideoElement | null>(null);

  const startGenericCamera = async (target: 'clientPhoto' | 'clientDoc' | 'referrerPhoto' | 'referrerDoc') => {
    try {
      setActiveCameraTarget(target);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } });
      setTimeout(() => {
        if (genericVideoRef.current) {
          genericVideoRef.current.srcObject = stream;
          genericVideoRef.current.play();
        }
      }, 150);
    } catch (err) {
      console.error("No se pudo acceder a la cámara:", err);
      alert("No se pudo iniciar la cámara. Por favor, verifique los permisos de acceso a la cámara.");
      setActiveCameraTarget(null);
    }
  };

  const stopGenericCamera = () => {
    if (genericVideoRef.current && genericVideoRef.current.srcObject) {
      const stream = genericVideoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      genericVideoRef.current.srcObject = null;
    }
    setActiveCameraTarget(null);
  };

  const captureGenericPhoto = () => {
    if (genericVideoRef.current) {
      const video = genericVideoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64Photo = canvas.toDataURL('image/jpeg', 0.85);
        if (activeCameraTarget === 'clientPhoto') {
          setClientFormData(prev => ({ ...prev, photo: base64Photo }));
        } else if (activeCameraTarget === 'clientDoc') {
          setClientFormData(prev => ({ ...prev, documentPhoto: base64Photo }));
        } else if (activeCameraTarget === 'referrerPhoto') {
          setReferrerFormData(prev => ({ ...prev, photo: base64Photo }));
        } else if (activeCameraTarget === 'referrerDoc') {
          setReferrerFormData(prev => ({ ...prev, documentPhoto: base64Photo }));
        }
      }
      stopGenericCamera();
    }
  };

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
    ci: '',
    photo: '',
    documentPhoto: ''
  });

  // Client Form State
  const [clientFormData, setClientFormData] = useState({
    name: '',
    phone: '',
    phoneCountryCode: '591',
    email: '',
    ci: '',
    workplace: '',
    isMineCooperative: false,
    recommendedBy: '',
    referentialPhone: '',
    referentialCountryCode: '591',
    photo: '',
    documentPhoto: ''
  });

  // Gold Purchase Form State
  const [purchaseHeader, setPurchaseHeader] = useState<{
    clientId: string;
    type: 'abierto' | 'cerrado';
    date: string;
    referrerName: string;
    commission: number;
    advancePayment: number;
    advancePaymentType?: 'efectivo' | 'transferencia' | 'mixto';
    advanceCashAmount?: number;
    advanceBankAmount?: number;
    advanceSourceBankAccountId?: string;
    advanceClientBank?: string;
    advanceClientAccountNumber?: string;
    isFullPayment?: boolean;
  }>({
    clientId: '',
    type: 'abierto',
    date: new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
    referrerName: '',
    commission: 0,
    advancePayment: 0,
    advancePaymentType: 'efectivo',
    advanceCashAmount: 0,
    advanceBankAmount: 0
  });

  const currentCycleMoves = useMemo(() => {
    if (!branchMode) return [];
    
    const latestClosure = [...branchClosures]
      .filter(c => c.branchId === branchMode)
      .sort((a,b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime())[0];

    if (!latestClosure) return branchCashMoves;

    const closureDate = new Date(latestClosure.closedAt).getTime();
    return branchCashMoves.filter(m => new Date(m.date).getTime() > closureDate);
  }, [branchCashMoves, branchClosures, branchMode]);

  const [clientSearch, setClientSearch] = useState('');
  const [referrerSearch, setReferrerSearch] = useState('');
  const [branchTransfersSearch, setBranchTransfersSearch] = useState('');
  const [purchaseTypeFilter, setPurchaseTypeFilter] = useState<'abierto' | 'cerrado'>('abierto');
  const [purchaseHistoryPage, setPurchaseHistoryPage] = useState(1);
  const [branchTransfersPage, setBranchTransfersPage] = useState(1);
  const [branchClientsPage, setBranchClientsPage] = useState(1);
  const [branchReferrersPage, setBranchReferrersPage] = useState(1);
  const [purchaseHistorySearch, setPurchaseHistorySearch] = useState('');
  const [cashMovesSearch, setCashMovesSearch] = useState('');
  const [cashMovesPage, setCashMovesPage] = useState(1);
  const [closuresPage, setClosuresPage] = useState(1);
  const PURCHASE_HISTORY_PER_PAGE = 10;
  const [expandedPurchases, setExpandedPurchases] = useState<string[]>([]);
  const [revaluationItem, setRevaluationItem] = useState<GoldPurchaseItem | null>(null);
  const [revalOtherQuotation, setRevalOtherQuotation] = useState<number>(0);
  const [revalOtherPurity, setRevalOtherPurity] = useState<number>(0);

  useEffect(() => {
    if (revaluationItem) {
      setRevalOtherQuotation(revaluationItem.otherQuotation || 0);
      setRevalOtherPurity(revaluationItem.otherPurity || 0);
    }
  }, [revaluationItem]);

  useEffect(() => {
    setPurchaseHistoryPage(1);
    setExpandedPurchases([]);
  }, [view, branchMode, purchaseTypeFilter]);

  useEffect(() => {
    setBranchTransfersPage(1);
    setBranchClientsPage(1);
    setBranchReferrersPage(1);
    setCashMovesPage(1);
    setClosuresPage(1);
    setPurchaseHistoryPage(1);
  }, [view, branchMode]);

  const filteredBranchTransfers = useMemo(() => {
    return goldTransfers
      .filter(t => t.branchId === branchMode)
      .filter(t => 
        t.status.toLowerCase().includes(branchTransfersSearch.toLowerCase()) ||
        t.totalWeight.toString().includes(branchTransfersSearch) ||
        (t.id || '').toLowerCase().includes(branchTransfersSearch.toLowerCase())
      )
      .sort((a,b) => new Date(b.sentAt || 0).getTime() - new Date(a.sentAt || 0).getTime());
  }, [goldTransfers, branchMode, branchTransfersSearch]);

  const paginatedBranchTransfers = useMemo(() => {
    const start = (branchTransfersPage - 1) * ITEMS_PER_PAGE;
    return filteredBranchTransfers.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredBranchTransfers, branchTransfersPage]);

  const filteredCurrentCycleMoves = useMemo(() => {
    return currentCycleMoves.filter(m => 
      m.concept.toLowerCase().includes(cashMovesSearch.toLowerCase()) ||
      m.amount.toString().includes(cashMovesSearch) ||
      m.category.toLowerCase().includes(cashMovesSearch.toLowerCase())
    ).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [currentCycleMoves, cashMovesSearch]);

  const paginatedCurrentCycleMoves = useMemo(() => {
    const start = (cashMovesPage - 1) * ITEMS_PER_PAGE;
    return filteredCurrentCycleMoves.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredCurrentCycleMoves, cashMovesPage]);

  const paginatedBranchClosures = useMemo(() => {
    const closures = [...branchClosures]
      .filter(c => c.branchId === branchMode)
      .sort((a,b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime());
    const start = (closuresPage - 1) * ITEMS_PER_PAGE;
    return closures.slice(start, start + ITEMS_PER_PAGE);
  }, [branchClosures, branchMode, closuresPage]);

  const filteredBranchClients = useMemo(() => {
    return clients
      .filter(c => c.branchId === branchMode)
      .filter(c => 
        c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
        (c.ci || '').toLowerCase().includes(clientSearch.toLowerCase()) ||
        (c.phone || '').toLowerCase().includes(clientSearch.toLowerCase())
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [clients, branchMode, clientSearch]);

  const paginatedBranchClients = useMemo(() => {
    const start = (branchClientsPage - 1) * ITEMS_PER_PAGE;
    return filteredBranchClients.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredBranchClients, branchClientsPage]);

  const filteredBranchReferrers = useMemo(() => {
    return referrers
      .filter(r => r.branchId === branchMode)
      .filter(r => 
        r.name.toLowerCase().includes(referrerSearch.toLowerCase()) ||
        (r.ci || '').toLowerCase().includes(referrerSearch.toLowerCase()) ||
        (r.phone1 || '').toLowerCase().includes(referrerSearch.toLowerCase())
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [referrers, branchMode, referrerSearch]);

  const paginatedBranchReferrers = useMemo(() => {
    const start = (branchReferrersPage - 1) * ITEMS_PER_PAGE;
    return filteredBranchReferrers.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredBranchReferrers, branchReferrersPage]);

  const filteredPurchaseHistory = useMemo(() => {
    return goldPurchases
      .filter(p => p.branchId === branchMode)
      .filter(p => p.type === purchaseTypeFilter)
      .filter(p => {
        const clientName = clients.find(c => c.id === p.clientId)?.name || '';
        const search = purchaseHistorySearch.toLowerCase();
        return (
          p.receiptNumber.toString().includes(search) ||
          clientName.toLowerCase().includes(search) ||
          (p.referrerName || '').toLowerCase().includes(search)
        );
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [goldPurchases, branchMode, purchaseTypeFilter, purchaseHistorySearch, clients]);

  const paginatedPurchaseHistory = useMemo(() => {
    const start = (purchaseHistoryPage - 1) * PURCHASE_HISTORY_PER_PAGE;
    return filteredPurchaseHistory.slice(start, start + PURCHASE_HISTORY_PER_PAGE);
  }, [filteredPurchaseHistory, purchaseHistoryPage]);

  // Helper to calculate total for a gold purchase item
  const recalculatePurchaseItem = (item: any, headerType: 'abierto' | 'cerrado') => {
    const marketPrice = parseFloat(item.marketPrice) || 0;
    const purity = parseFloat(item.purity) || 0;
    const usdToBs = parseFloat(item.usdToBs) || 0;
    const initialWeight = parseFloat(item.initialWeight) || 0;
    const finalWeight = parseFloat(item.finalWeight) || 0;
    const lossPercentage = parseFloat(item.lossPercentage) || 0;

    const val1 = marketPrice * (purity / 100);
    const val2 = val1 / 31.1035;
    const val3 = val2 * usdToBs; // Price per gram at 100%
    
    const ppg100 = parseFloat(val3.toFixed(2));
    const ppg = headerType === 'cerrado' ? ppg100 : parseFloat((ppg100 * 0.90).toFixed(2));
    
    const total100 = parseFloat((ppg100 * finalWeight).toFixed(2));
    // Calculate total based on the rounded unit price (ppg) to avoid the 0.03 discrepancy
    const total = parseFloat((ppg * finalWeight).toFixed(2));

    return {
      ...item,
      pricePerGram100: ppg100,
      pricePerGram: ppg,
      material100: total100,
      total: total
    };
  };

  const [purchaseItem, setPurchaseItem] = useState({
    type: 'pieza' as MaterialType,
    initialWeight: 0,
    finalWeight: 0,
    marketPrice: 0,
    purity: 100,
    pricePerGram: 0,
    pricePerGram100: 0,
    total: 0,
    usdToBs: 6.96,
    loss: 0,
    lossPercentage: 0,
    material100: 0
  });

  const [purchaseCart, setPurchaseCart] = useState<any[]>([]);

  useEffect(() => {
    const updatedItem = recalculatePurchaseItem(purchaseItem, purchaseHeader.type);
    
    // Only update if changes are significant (avoiding float jitter and infinite loops)
    if (
      Math.abs(updatedItem.pricePerGram - purchaseItem.pricePerGram) > 0.001 || 
      Math.abs(updatedItem.pricePerGram100 - purchaseItem.pricePerGram100) > 0.001 || 
      Math.abs(updatedItem.total - purchaseItem.total) > 0.01 || 
      Math.abs(updatedItem.material100 - purchaseItem.material100) > 0.01
    ) {
      setPurchaseItem(updatedItem);
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
  const [closePaymentType, setClosePaymentType] = useState<'efectivo' | 'transferencia' | 'mixto'>('efectivo');
  const [closeCashAmount, setCloseCashAmount] = useState<number>(0);
  const [closeBankAmount, setCloseBankAmount] = useState<number>(0);
  const [closeSourceBankAccountId, setCloseSourceBankAccountId] = useState<string>('');
  const [closeClientBank, setCloseClientBank] = useState<string>('');
  const [closeClientAccountNumber, setCloseClientAccountNumber] = useState<string>('');
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [viewingImageSrc, setViewingImageSrc] = useState<string | null>(null);
  const [viewingImageTitle, setViewingImageTitle] = useState<string>('');
  const [isManuallyEditingAdvance, setIsManuallyEditingAdvance] = useState(false);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [currentPurchaseForAdvance, setCurrentPurchaseForAdvance] = useState<GoldPurchase | null>(null);
  const [editingAdvanceId, setEditingAdvanceId] = useState<string | null>(null);
  const [advanceFormData, setAdvanceFormData] = useState({
    amount: 0,
    concept: '',
    paymentType: 'efectivo' as 'efectivo' | 'transferencia' | 'mixto',
    cashAmount: 0,
    bankAmount: 0,
    sourceBankAccountId: '',
    clientBank: '',
    clientAccountNumber: '',
    date: new Date().toISOString().split('T')[0]
  });

  // Validation state
  const isCiAlreadyUsed = useMemo(() => {
    if (!clientFormData.ci || !branchMode) return false;
    const cleanedCi = (clientFormData.ci || '').trim().toLowerCase();
    if (!cleanedCi) return false;
    
    return clients.some(c => 
      c.branchId === branchMode && 
      (c.ci || '').trim().toLowerCase() === cleanedCi && 
      c.id !== editingClient?.id
    );
  }, [clientFormData.ci, branchMode, clients, editingClient]);

  const isReferrerCiAlreadyUsed = useMemo(() => {
    if (!referrerFormData.ci || !branchMode) return false;
    const cleanedCi = (referrerFormData.ci || '').trim().toLowerCase();
    if (!cleanedCi) return false;

    return referrers.some(r => 
      r.branchId === branchMode && 
      (r.ci || '').trim().toLowerCase() === cleanedCi && 
      r.id !== editingReferrer?.id
    );
  }, [referrerFormData.ci, branchMode, referrers, editingReferrer]);

  // Auto-fill advancePayment for purchases
  useEffect(() => {
    if (!isManuallyEditingAdvance) {
      const totalAmount = parseFloat(purchaseCart.reduce((acc, curr) => acc + (curr.total || 0), 0).toFixed(2));
      if (purchaseHeader.type === 'abierto') {
        setPurchaseHeader(prev => ({
          ...prev,
          advancePayment: totalAmount,
          isFullPayment: false
        }));
      } else {
        // Para "cerrado", el pago es el total 100% por defecto
        setPurchaseHeader(prev => ({
          ...prev,
          advancePayment: totalAmount,
          isFullPayment: true
        }));
      }
    }
  }, [purchaseCart, purchaseHeader.type, isManuallyEditingAdvance]);

  const [editingPurchase, setEditingPurchase] = useState<GoldPurchase | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isVerifyingTransfer, setIsVerifyingTransfer] = useState(false);
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

  // Database Management State
  const [settingsSubTab, setSettingsSubTab] = useState<'company' | 'database'>('company');
  const [dbAccessPasswordInput, setDbAccessPasswordInput] = useState('');
  const [isDbUnlocked, setIsDbUnlocked] = useState(false);
  const [dbPasswordError, setDbPasswordError] = useState(false);
  const [dbConfig, setDbConfig] = useState({
    type: 'sqlite',
    mysql: {
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'llaqta_gold',
      port: 3306
    },
    sqlite: {
      path: 'database.sqlite'
    }
  });
  const [dbTargetBranch, setDbTargetBranch] = useState<string>('all');
  const [dbClearBeforeRestore, setDbClearBeforeRestore] = useState<boolean>(false);
  const [isTestingDbConnection, setIsTestingDbConnection] = useState<boolean>(false);
  const [dbTestResult, setDbTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSavingDbConfig, setIsSavingDbConfig] = useState<boolean>(false);
  const [isPerformingDbBackup, setIsPerformingDbBackup] = useState<boolean>(false);
  const [isPerformingDbRestore, setIsPerformingDbRestore] = useState<boolean>(false);
  const [isPerformingDbClear, setIsPerformingDbClear] = useState<boolean>(false);

  // New migration and statistics states
  const [dbStats, setDbStats] = useState<Record<string, { sqlite: number; mysql: number }> | null>(null);
  const [dbStatsMysqlError, setDbStatsMysqlError] = useState<string | null>(null);
  const [isFetchingDbStats, setIsFetchingDbStats] = useState<boolean>(false);
  const [isPerformingMigration, setIsPerformingMigration] = useState<boolean>(false);
  const [migrationResult, setMigrationResult] = useState<{ success: boolean; message: string; report?: any } | null>(null);

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
    pricePerGram100: 0,
    material100: 0,
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
      pricePerGram100: 0,
      material100: 0,
      total: 0,
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
        pricePerGram100: editingMaterial.pricePerGram100 || 0,
        material100: editingMaterial.material100 || 0,
        total: editingMaterial.total || 0,
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

  const handleAddCashMove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchMode || !cashMoveFormData.amount) return;

    try {
      await apiFetch(`/api/branches/${branchMode}/cash-moves`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...cashMoveFormData,
          date: cashMoveFormData.date || new Date().toISOString(),
          createdBy: user!.username
        })
      });
      setShowAddCashMoveModal(false);
      setCashMoveFormData({
        amount: 0,
        type: 'ingreso',
        concept: '',
        category: 'manual',
        paymentType: 'efectivo',
        date: new Date().toISOString().split('T')[0]
      });
      fetchData();
    } catch (error) {
      handleApiError(error, OperationType.CREATE, 'cashMove');
    }
  };

  const handleUpdateCashMove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchMode || !editingCashMove) return;

    try {
      await apiFetch(`/api/branches/${branchMode}/cash-moves/${editingCashMove.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: cashMoveFormData.amount,
          type: cashMoveFormData.type,
          concept: cashMoveFormData.concept,
          category: cashMoveFormData.category,
          paymentType: cashMoveFormData.paymentType,
          bankAccountId: cashMoveFormData.bankAccountId,
          date: cashMoveFormData.date || editingCashMove.date,
        })
      });
      setShowEditCashMoveModal(false);
      setEditingCashMove(null);
      setCashMoveFormData({
        amount: 0,
        type: 'ingreso',
        concept: '',
        category: 'manual',
        paymentType: 'efectivo',
        date: new Date().toISOString().split('T')[0]
      });
      fetchData();
    } catch (error) {
      handleApiError(error, OperationType.UPDATE, 'cashMove');
    }
  };

  const handleCreateClosure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchMode) return;

    try {
      await apiFetch(`/api/branches/${branchMode}/closures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...closureFormData,
          createdBy: user!.username,
          branchId: branchMode
        })
      });
      setShowAddClosureModal(false);
      setClosureFormData({ notes: '' });
      fetchData();
    } catch (error) {
      handleApiError(error, OperationType.CREATE, 'closure');
    }
  };

  const handleViewClosure = async (closure: BranchClosure) => {
    setViewingClosure(closure);
    setShowViewClosureModal(true);
    setClosureMoves([]);
    try {
      const data = await apiFetch(`/api/branches/${closure.branchId}/cash-moves?closureId=${closure.id}`);
      setClosureMoves(data || []);
    } catch (e) {
      console.error("Error fetching closure moves:", e);
    }
  };

  const handlePrintClosureReceipt = async (closure: BranchClosure) => {
    let moves: BranchCashMove[] = [];
    try {
      moves = await apiFetch(`/api/branches/${closure.branchId}/cash-moves?closureId=${closure.id}`);
    } catch (e) {
      console.error("Error loading moves for PDF:", e);
    }

    const purchasesInClosure = goldPurchases.filter(p => p.closureId === closure.id);

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const company = companySettings;
    const margin = 15;
    const pageWidth = 210;

    // Header
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(company?.name?.toUpperCase() || 'AURUM MANAGER', margin, 18);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`NIT: ${company?.taxId || ''}`, margin, 23);
    doc.text(`Dirección: ${company?.address || ''}`, margin, 27);
    doc.text(`Teléfono: ${company?.phone || ''}`, margin, 31);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('REPORTE DE CIERRE DIARIO', pageWidth - margin, 18, { align: 'right' });
    doc.setFontSize(10);
    doc.setFillColor(240, 240, 240);
    doc.rect(pageWidth - margin - 65, 21, 65, 10, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text(`CÓDIGO: ${closure.id.slice(0, 8).toUpperCase()}`, pageWidth - margin - 2, 27, { align: 'right' });

    doc.line(margin, 35, pageWidth - margin, 35);

    // Closure Info
    let currentY = 42;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('INFORMACIÓN GENERAL DEL CIERRE', margin, currentY);
    currentY += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Fecha Cierre: ${new Date(closure.closedAt || closure.date).toLocaleString()}`, margin, currentY);
    doc.text(`Responsable: ${closure.createdBy}`, margin + 90, currentY);
    currentY += 5;

    const branchName = branches.find(b => b.id === closure.branchId)?.name || 'Sucursal';
    doc.text(`Sucursal: ${branchName}`, margin, currentY);
    doc.text(`Estado: ${closure.status.toUpperCase()}`, margin + 90, currentY);
    currentY += 10;

    // Balances block
    doc.setFillColor(248, 249, 250);
    doc.rect(margin, currentY, pageWidth - (margin * 2), 20, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('BALANCE INICIAL', margin + 5, currentY + 8);
    doc.text('(+) TOTAL INGRESOS', margin + 45, currentY + 8);
    doc.text('(-) TOTAL EGRESOS', margin + 95, currentY + 8);
    doc.text('BALANCE FINAL (CAJA)', margin + 140, currentY + 8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`${formatNumber(closure.initialBalance)} BS`, margin + 5, currentY + 14);
    doc.setTextColor(0, 120, 0); // Green
    doc.text(`${formatNumber(closure.totalCashIn)} BS`, margin + 45, currentY + 14);
    doc.setTextColor(180, 0, 0); // Red
    doc.text(`${formatNumber(closure.totalCashOut)} BS`, margin + 95, currentY + 14);
    doc.setTextColor(0, 100, 200); // Blue
    doc.setFont('helvetica', 'bold');
    doc.text(`${formatNumber(closure.finalBalance)} BS`, margin + 140, currentY + 14);

    doc.setTextColor(0, 0, 0);
    currentY += 28;

    // List of movements
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('MOVIMIENTOS DE EFECTIVO (CAJA CHICA)', margin, currentY);
    currentY += 6;

    // Draw table headers
    doc.setFillColor(235, 235, 235);
    doc.rect(margin, currentY, pageWidth - (margin * 2), 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Concepto / Categoría', margin + 2, currentY + 4);
    doc.text('Mapeo Pago', margin + 115, currentY + 4);
    doc.text('Ingreso BS', margin + 145, currentY + 4, { align: 'right' });
    doc.text('Egreso BS', margin + 175, currentY + 4, { align: 'right' });
    currentY += 6;

    doc.setFont('helvetica', 'normal');
    const cashMovesInClosure = moves.filter(m => m.paymentType === 'efectivo');
    
    if (cashMovesInClosure.length === 0) {
      doc.text('Sin movimientos de efectivo en este ciclo.', margin + 2, currentY + 5);
      currentY += 10;
    } else {
      cashMovesInClosure.forEach(move => {
        if (currentY + 10 > 280) {
          doc.addPage();
          currentY = 20;
        }
        
        doc.text(`${move.concept} (${move.category.toUpperCase()})`, margin + 2, currentY + 4);
        doc.text(move.paymentType.toUpperCase(), margin + 115, currentY + 4);
        
        if (move.type === 'ingreso') {
          doc.text(`${formatNumber(move.amount)} BS`, margin + 145, currentY + 4, { align: 'right' });
        } else {
          doc.text(`${formatNumber(move.amount)} BS`, margin + 175, currentY + 4, { align: 'right' });
        }
        currentY += 6;
      });
      currentY += 4;
    }

    // Now, associated gold purchases
    if (currentY + 20 > 280) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('COMPRAS DE ORO ASOCIADAS', margin, currentY);
    currentY += 6;

    doc.setFillColor(235, 235, 235);
    doc.rect(margin, currentY, pageWidth - (margin * 2), 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Recibo Compra', margin + 2, currentY + 4);
    doc.text('Cliente', margin + 40, currentY + 4);
    doc.text('Tipo', margin + 90, currentY + 4);
    doc.text('Adelantos BS', margin + 110, currentY + 4);
    doc.text('Total Compra BS', margin + 175, currentY + 4, { align: 'right' });
    currentY += 6;

    doc.setFont('helvetica', 'normal');
    if (purchasesInClosure.length === 0) {
      doc.text('Sin compras asociadas directamente a este cierre.', margin + 2, currentY + 5);
      currentY += 12;
    } else {
      purchasesInClosure.forEach(p => {
        if (currentY + 10 > 280) {
          doc.addPage();
          currentY = 20;
        }

        const clientName = clients.find(c => c.id === p.clientId)?.name || 'Desconocido';
        doc.setFont('helvetica', 'bold');
        doc.text(p.receiptNumber, margin + 2, currentY + 4);
        doc.setFont('helvetica', 'normal');
        doc.text(clientName.substring(0, 25), margin + 40, currentY + 4);
        doc.text(p.type.toUpperCase(), margin + 90, currentY + 4);

        const totalExtraAdvances = p.advances?.reduce((sum, adv) => sum + adv.amount, 0) || 0;
        const totalAllAdvances = (p.advancePayment || 0) + totalExtraAdvances;
        doc.text(`${formatNumber(totalAllAdvances)} BS`, margin + 110, currentY + 4);

        const purchaseAmt = p.type === 'cerrado' ? (p.closeTotal || p.total) : p.total;
        doc.text(`${formatNumber(purchaseAmt)} BS`, margin + 175, currentY + 4, { align: 'right' });
        currentY += 6;
      });
      currentY += 6;
    }

    // Notes
    if (closure.notes) {
      if (currentY + 15 > 280) {
        doc.addPage();
        currentY = 20;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('OBSERVACIONES / NOTAS:', margin, currentY);
      currentY += 4;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const splitNotes = doc.splitTextToSize(closure.notes, pageWidth - (margin * 2));
      doc.text(splitNotes, margin, currentY);
      currentY += splitNotes.length * 4 + 4;
    }

    // Signatures
    const signY = 260;
    doc.setDrawColor(150, 150, 150);
    doc.line(margin + 5, signY, margin + 45, signY);
    doc.line(pageWidth - margin - 45, signY, pageWidth - margin - 5, signY);
    
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('FIRMA RESPONSABLE', margin + 25, signY + 4, { align: 'center' });
    doc.text(closure.createdBy.toUpperCase(), margin + 25, signY + 8, { align: 'center' });
    doc.text('CONTROL / AUDITORÍA', pageWidth - margin - 25, signY + 4, { align: 'center' });

    doc.save(`CIERRE_${branchName.toUpperCase().replace(/\s+/g, '_')}_${new Date(closure.closedAt || closure.date).toISOString().split('T')[0]}.pdf`);
  };

  const exportBranchInventoryToExcel = useCallback(() => {
    if (!branchMode) return;
    
    const branchItems: any[] = [];
    const branchPurchases = goldPurchases.filter(p => p.branchId === branchMode);
    
    branchPurchases.forEach(p => {
      if (!p.items) return;
      const unsentItems = p.items.filter(item => !item.isTransferred);
      unsentItems.forEach(item => {
        const client = clients.find(c => c.id === p.clientId);
        branchItems.push({
          'Recibo': p.receiptNumber,
          'Tipo': item.type || 'N/A',
          'Cliente': client?.name || 'Desconocido',
          'Usuario Registro': p.createdBy || p.registeredBy || 'N/A',
          'Peso Inicial (g)': item.initialWeight,
          'Peso Final (g)': item.finalWeight,
          'Ley (%)': item.purity,
          'Cotización': item.marketPrice,
          'Merma (g)': item.loss,
          'Fecha Registro': p.createdAt ? new Date(p.createdAt).toLocaleDateString() : 'N/A',
          'Precio Gramo (100%)': item.pricePerGram100 || (item.pricePerGram / (item.purity / 100 || 1)),
          'Total BS': item.total
        });
      });
    });

    if (branchItems.length === 0) {
      alert("No hay inventario pendiente de envío para exportar.");
      return;
    }

    const ws = XLSX.utils.json_to_sheet(branchItems);
    const wb = XLSX.utils.book_new();
    const branchName = branches.find(b => b.id === branchMode)?.name || 'Sucursal';
    XLSX.utils.book_append_sheet(wb, ws, "Inventario Pendiente");
    
    XLSX.writeFile(wb, `Inventario_${branchName}_${new Date().toISOString().split('T')[0]}.xlsx`);
  }, [branchMode, goldPurchases, clients, branches]);

  const fetchData = async () => {
    if (!user) return;
    setIsRefreshing(true);
    try {
      const endpoints: { path: string; setter: (data: any) => void }[] = [
        { path: '/api/materials', setter: setMaterials },
        { path: '/api/users', setter: setSystemUsers },
        { path: '/api/smelting', setter: setSmeltingOperations },
        { path: '/api/export', setter: setExportOperations },
        { path: '/api/settings', setter: (data) => {
          setCompanySettings(data);
          if (data) setCompanyFormData(data);
        }},
        { path: '/api/branches', setter: setBranches },
        { path: '/api/clients', setter: setClients },
        { path: '/api/gold-purchases', setter: setGoldPurchases },
        { path: '/api/referrers', setter: setReferrers },
        { path: '/api/referrer-payouts', setter: setReferrerPayouts },
        { path: '/api/gold-transfers', setter: setGoldTransfers },
      ];

      if (branchMode) {
        endpoints.push(
          { path: `/api/branches/${branchMode}/cash-moves`, setter: setBranchCashMoves },
          { path: `/api/branches/${branchMode}/closures`, setter: setBranchClosures },
          { path: `/api/branches/${branchMode}/bank-accounts`, setter: setBranchBankAccounts }
        );
      } else {
        // Warehouse mode / superadmin global bank accounts
        endpoints.push({ path: `/api/branch-bank-accounts-all`, setter: setBranchBankAccounts });
      }

      const results = await Promise.allSettled(
        endpoints.map(async (ep) => {
          const data = await apiFetch(ep.path);
          ep.setter(data);
        })
      );

      const failures = results.filter((r): r is PromiseSettledResult<void> & { status: 'rejected' } => r.status === 'rejected');
      if (failures.length > 0) {
        console.error("Some fetches failed:", failures.map(f => f.reason));
        // Only show error for major failures or if everything failed
        if (failures.length === endpoints.length) {
          throw new Error("Failed to fetch all data");
        }
      }
    } catch (error) {
      handleApiError(error, OperationType.LIST, 'all');
    } finally {
      setIsRefreshing(false);
    }
  };

  const fetchDatabaseConfig = async () => {
    try {
      const res = await apiFetch('/api/database/config');
      if (res) {
        setDbConfig(res);
      }
    } catch (err) {
      console.error("Error fetching database config:", err);
    }
  };

  const handleTestDatabaseConnection = async () => {
    setIsTestingDbConnection(true);
    setDbTestResult(null);
    try {
      const res = await fetch('/api/database/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dbConfig)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDbTestResult({ success: true, message: data.message });
      } else {
        setDbTestResult({ success: false, message: data.error || 'Error al conectar' });
      }
    } catch (err: any) {
      setDbTestResult({ success: false, message: 'Fallo al comunicarse: ' + err.message });
    } finally {
      setIsTestingDbConnection(false);
    }
  };

  const handleSaveDatabaseConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingDbConfig(true);
    try {
      const res = await fetch('/api/database/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dbConfig)
      });
      if (res.ok) {
        const data = await res.json();
        alert(data.message || 'Configuración guardada correctamente.');
        fetchDatabaseConfig();
        fetchDatabaseStats();
      } else {
        alert('Error al guardar la configuración.');
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setIsSavingDbConfig(false);
    }
  };

  const fetchDatabaseStats = async () => {
    setIsFetchingDbStats(true);
    setDbStatsMysqlError(null);
    try {
      const res = await apiFetch('/api/database/stats');
      if (res && res.success) {
        setDbStats(res.stats);
        if (res.mysqlError) {
          setDbStatsMysqlError(res.mysqlError);
        }
      }
    } catch (err: any) {
      console.error("Error fetching database stats:", err);
      setDbStatsMysqlError(err.message || 'Error de conexión general.');
    } finally {
      setIsFetchingDbStats(false);
    }
  };

  const handlePerformMigration = async (source: 'sqlite' | 'mysql', destination: 'sqlite' | 'mysql', clearDestination: boolean) => {
    const confirmation = window.confirm(
      `¿Está seguro de querer migrar TODOS sus registros desde ${source.toUpperCase()} hacia ${destination.toUpperCase()}?\n\n` +
      `${clearDestination ? '⚠️ ATENCIÓN: Se eliminarán TODOS los registros de la base de datos DESTINO antes de la carga, para que sea una copia exacta.' : 'Se añadirán/actualizarán los registros que no existan.'}\n\n` +
      `¿Desea continuar con esta operación?`
    );
    if (!confirmation) return;

    setIsPerformingMigration(true);
    setMigrationResult(null);
    try {
      const res = await fetch('/api/database/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, destination, clearDestination })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMigrationResult({ success: true, message: data.message, report: data.report });
        alert("¡Migración completada con éxito!");
        fetchDatabaseStats();
      } else {
        setMigrationResult({ success: false, message: data.error || 'Ocurrió un error al migrar.' });
        alert("Error de migración: " + (data.error || 'Por favor revise los parámetros.'));
      }
    } catch (err: any) {
      setMigrationResult({ success: false, message: 'Fallo de conexión: ' + err.message });
      alert("Error de conexión: " + err.message);
    } finally {
      setIsPerformingMigration(false);
    }
  };

  const handleDownloadBackup = async () => {
    setIsPerformingDbBackup(true);
    try {
      const res = await fetch('/api/database/backup');
      if (res.ok) {
        const data = await res.json();
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `respaldo_aurum_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        alert('Error al generar la descarga de la base de datos.');
      }
    } catch (err: any) {
      alert('Error en copia de seguridad: ' + err.message);
    } finally {
      setIsPerformingDbBackup(false);
    }
  };

  const handleUploadBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const json = JSON.parse(reader.result as string);
        if (!json || !json.tables) {
          alert('El archivo no tiene el formato de respaldo correcto (falta el campo principal "tables").');
          return;
        }

        const confirmRestore = window.confirm(
          `¿Está seguro de que desea restaurar los datos? Se aplicarán sobre:\n- ${
            dbTargetBranch === 'all' ? 'TODAS las sucursales' : 'Solo la sucursal seleccionada'
          }\n${
            dbClearBeforeRestore 
              ? '⚠️ ¡ATENCIÓN! Se VACIARÁN los datos correspondientes antes de realizar la carga.' 
              : 'Se fusionarán/actualizarán los datos existentes (sin borrar).'
          }\n\n¿Desea proceder?`
        );
        if (!confirmRestore) return;

        setIsPerformingDbRestore(true);
        const res = await fetch('/api/database/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tables: json.tables,
            branchId: dbTargetBranch,
            clearBefore: dbClearBeforeRestore
          })
        });

        if (res.ok) {
          const rData = await res.json();
          alert(rData.message || 'La base de datos se cargó correctamente.');
          fetchData();
        } else {
          const errData = await res.json();
          alert('Error al cargar base de datos: ' + (errData.error || 'Fallo de procesamiento'));
        }
      } catch (err: any) {
        alert('Error al leer el archivo de respaldo: ' + err.message);
      } finally {
        setIsPerformingDbRestore(false);
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleClearDatabase = async () => {
    const isAll = dbTargetBranch === 'all';
    const sucursalName = isAll ? 'COMPLETO' : (branches.find(b => b.id === dbTargetBranch)?.name || dbTargetBranch);
    
    const confirm1 = window.confirm(
      `⚠️ ALERTA DE SEGURIDAD ⚠️\n\n¿Está totalmente seguro de que desea vaciar los datos de la sucursal/base de datos: "${sucursalName}"?\nSe eliminarán de forma permanente compras, inventarios, cierres, traslados, etc.\nEsta acción NO se puede deshacer.`
    );
    if (!confirm1) return;

    const typedValue = window.prompt(`Para confirmar la eliminación permanente de los datos de "${sucursalName}", escriba "VACIAR" en mayúsculas:`);
    if (typedValue !== 'VACIAR') {
      alert('Confirmación incorrecta. Acción cancelada.');
      return;
    }

    setIsPerformingDbClear(true);
    try {
      const res = await fetch('/api/database/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: dbTargetBranch,
          keepSuperadmins: true
        })
      });

      if (res.ok) {
        const data = await res.json();
        alert(data.message || 'Base de datos vaciada con éxito.');
        fetchData();
      } else {
        const errData = await res.json();
        alert('Error al vaciar los datos: ' + (errData.error || 'Ocurrió un error'));
      }
    } catch (err: any) {
      alert('Error al realizar el vaciado: ' + err.message);
    } finally {
      setIsPerformingDbClear(false);
    }
  };

  useEffect(() => {
    if (view === 'settings') {
      fetchDatabaseConfig();
    } else {
      setIsDbUnlocked(false);
      setDbAccessPasswordInput('');
      setDbPasswordError(false);
    }
  }, [view]);

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
      setUserFormData({ name: '', username: '', email: '', pin: '', role: 'operator', branchId: '', photo: '' });
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
      branchId: u.branchId || '',
      photo: u.photo || ''
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
        name: '', phone: '', phoneCountryCode: '591', email: '', ci: '', 
        workplace: '', isMineCooperative: false, recommendedBy: '',
        referentialPhone: '', referentialCountryCode: '591',
        photo: '', documentPhoto: ''
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
    setPurchaseItem(recalculatePurchaseItem({
      ...purchaseItem,
      initialWeight: 0,
      finalWeight: 0,
      total: 0,
      loss: 0,
      lossPercentage: 0,
      material100: 0
    }, purchaseHeader.type));

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
        let updatedItem = { ...item, ...updates };
        
        // Recalculate total if pricePerGram is modified
        if (updates.hasOwnProperty('pricePerGram')) {
          const pricePerGram = updates.pricePerGram || 0;
          updatedItem.pricePerGram = parseFloat(pricePerGram.toFixed(2));
          updatedItem.pricePerGram100 = purchaseHeader.type === 'cerrado' ? updatedItem.pricePerGram : parseFloat((updatedItem.pricePerGram / 0.90).toFixed(2));
          updatedItem.total = parseFloat((item.finalWeight * updatedItem.pricePerGram).toFixed(2));
          updatedItem.material100 = parseFloat((item.finalWeight * updatedItem.pricePerGram100).toFixed(2));
        }
        
        // Recalculate pricePerGram and total if pricePerGram100 is modified
        if (updates.hasOwnProperty('pricePerGram100')) {
          const ppg100 = updates.pricePerGram100 || 0;
          updatedItem.pricePerGram100 = parseFloat(ppg100.toFixed(2));
          updatedItem.pricePerGram = purchaseHeader.type === 'cerrado' ? updatedItem.pricePerGram100 : parseFloat((updatedItem.pricePerGram100 * 0.90).toFixed(2));
          updatedItem.total = parseFloat((item.finalWeight * updatedItem.pricePerGram).toFixed(2));
          updatedItem.material100 = parseFloat((item.finalWeight * updatedItem.pricePerGram100).toFixed(2));
        }
        
        // Recalculate pricePerGram if total is modified (optional but useful)
        if (updates.hasOwnProperty('total')) {
          const total = updates.total || 0;
          updatedItem.total = parseFloat(total.toFixed(2));
          updatedItem.pricePerGram = item.finalWeight > 0 ? parseFloat((total / item.finalWeight).toFixed(2)) : 0;
          updatedItem.pricePerGram100 = purchaseHeader.type === 'cerrado' ? updatedItem.pricePerGram : parseFloat((updatedItem.pricePerGram / 0.90).toFixed(2));
          updatedItem.material100 = parseFloat((item.finalWeight * updatedItem.pricePerGram100).toFixed(2));
        }

        return updatedItem;
      }
      return item;
    }));
  };

  const handleUpdateRevaluation = (id: string, otherQuotation: number, otherPurity: number) => {
    setPurchaseCart(purchaseCart.map(item => 
      item.id === id ? { ...item, otherQuotation, otherPurity } : item
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
      setReferrerFormData({ name: '', phone1: '', phone2: '', ci: '', photo: '', documentPhoto: '' });
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

    if ((purchaseHeader.advancePaymentType === 'transferencia' || purchaseHeader.advancePaymentType === 'mixto') && !purchaseHeader.advanceSourceBankAccountId) {
      alert('Por favor seleccione la cuenta bancaria de origen para el adelanto.');
      return;
    }

    try {
      const totalAmount = purchaseCart.reduce((acc, curr) => acc + curr.total, 0);
      
      // Combine selected date with current time for precise registration
      const registrationDate = new Date(purchaseHeader.date);
      const currentTime = new Date();
      registrationDate.setHours(currentTime.getHours(), currentTime.getMinutes(), currentTime.getSeconds());

      const response = await fetch('/api/gold-purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...purchaseHeader,
          date: registrationDate.toISOString(),
          branchId: branchMode,
          createdBy: user.id,
          total: totalAmount,
          items: purchaseCart.map(({ id, ...rest }) => rest)
        })
      });

      if (response.ok) {
        const savedPurchase = await response.json();
        
        // Print receipts as needed
        if (purchaseHeader.advancePayment > 0) {
          handlePrintAdvanceReceipt({
            ...purchaseHeader,
            id: savedPurchase.id,
            receiptNumber: savedPurchase.receiptNumber,
            branchId: branchMode,
            createdBy: user.id,
            createdAt: new Date().toISOString(),
            total: totalAmount,
            items: [] // not needed for receipt
          } as any);
        }

        setPurchaseCart([]);
        setPurchaseHeader({ 
          clientId: '', 
          type: 'abierto',
          date: new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
          referrerName: '',
          commission: 0,
          advancePayment: 0,
          advancePaymentType: 'efectivo',
          advanceCashAmount: 0,
          advanceBankAmount: 0,
          advanceSourceBankAccountId: '',
          advanceClientBank: '',
          advanceClientAccountNumber: '',
          isFullPayment: false
        });
        setIsManuallyEditingAdvance(false);
        setShowAddPurchaseModal(false);
        fetchData();
        alert('Compra registrada con éxito');
      }
    } catch (error) {
      handleApiError(error, OperationType.CREATE, 'goldPurchases');
    }
  };

  const handlePrintAdvanceReceipt = (purchase: GoldPurchase | null, specificAdvance?: AdvancePayment) => {
    if (!purchase) return;
    
    const amount = specificAdvance ? specificAdvance.amount : (purchase.advancePayment || 0);
    if (amount <= 0 && !specificAdvance) return;

    // Si es tipo cerrado o es pago total, el concepto cambia
    const isFull = purchase.isFullPayment || purchase.type === 'cerrado';
    const title = specificAdvance ? 'COMPROBANTE DE ADELANTO' : (isFull ? 'COMPROBANTE DE PAGO (100%)' : 'COMPROBANTE DE ADELANTO');
    const concept = specificAdvance ? specificAdvance.concept : (isFull 
      ? `Pago total (100%) correspondiente a la Compra de Oro #${purchase.receiptNumber}`
      : `Adelanto correspondiente a la Compra de Oro #${purchase.receiptNumber}`);

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

    // Header Borders
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(margin, 10, pageWidth - margin, 10); // Top line

    // Header - Company Info
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
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
    doc.text(title, pageWidth - margin, 18, { align: 'right' });
    doc.setFontSize(12);
    doc.setTextColor(180, 0, 0);
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
        [concept, formatNumber(amount)],
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
    const totalBoxWidth = 65;
    doc.setLineWidth(0.5);
    doc.line(pageWidth - margin - totalBoxWidth, totalY - 4, pageWidth - margin, totalY - 4);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    const footerTotalLabel = isFull ? 'TOTAL PAGADO:' : 'TOTAL RECIBIDO:';
    doc.text(footerTotalLabel, pageWidth - margin - totalBoxWidth, totalY + 2);
    
    doc.setFontSize(12);
    doc.text(`${formatNumber(purchase.advancePayment)} BS`, pageWidth - margin, totalY + 2, { align: 'right' });
    
    doc.setLineWidth(0.5);
    doc.line(pageWidth - margin - totalBoxWidth, totalY + 5, pageWidth - margin, totalY + 5);

    // Bank Details if transfer or mixed
    if (purchase.advancePaymentType === 'transferencia' || purchase.advancePaymentType === 'mixto') {
      const sourceBank = branchBankAccounts.find(acc => acc.id === purchase.advanceSourceBankAccountId);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('DETALLES DE PAGO BANCARIO:', margin, totalY + 12);
      doc.setFont('helvetica', 'normal');
      if (purchase.advancePaymentType === 'mixto') {
        doc.text(`Desglosé: Efectivo: ${formatNumber(purchase.advanceCashAmount || 0)} BS | Banco: ${formatNumber(purchase.advanceBankAmount || 0)} BS`, margin, totalY + 16);
      }
      doc.text(`Origen (Sucursal): ${sourceBank ? `${sourceBank.bankName} - ${sourceBank.accountNumber}` : 'Transferencia Bancaria'}`, margin, totalY + (purchase.advancePaymentType === 'mixto' ? 20 : 16));
      doc.text(`Destino (Cliente): ${purchase.advanceClientBank || ''} - ${purchase.advanceClientAccountNumber || ''}`, margin, totalY + (purchase.advancePaymentType === 'mixto' ? 24 : 20));
    }

    // Signatures
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    
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
    
    // Global Border
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.rect(5, 5, pageWidth - 10, 200);

    doc.save(`${isFull ? 'Recibo_Pago' : 'Recibo_Adelanto'}_${purchase.receiptNumber}.pdf`);
  };

  const handlePrintLiquidationReceipt = (purchase: GoldPurchase | null) => {
    if (!purchase) return;
    
    // Determines if it is a direct closed purchase (no recalculation closure total)
    const isDirectClosed = !purchase.closeTotal || purchase.closeTotal <= 0;
    
    let finalTotal = 0;
    let totalAllAdvances = 0;
    let amount = 0;
    let closedAtDateString = "";
    let closedByUsername = "";
    let conceptDescription = "";
    
    let paymentType = 'efectivo';
    let cashAmount = 0;
    let bankAmount = 0;
    let sourceBankAccountId = '';
    let clientBank = '';
    let clientAccountNumber = '';

    if (isDirectClosed) {
      finalTotal = purchase.total;
      totalAllAdvances = 0;
      amount = purchase.total;
      closedAtDateString = purchase.createdAt;
      closedByUsername = purchase.createdBy;
      conceptDescription = `Pago total (100%) correspondiente a la Compra de Oro Directa Cerrada #${purchase.receiptNumber}.`;
      
      paymentType = purchase.advancePaymentType || 'efectivo';
      cashAmount = purchase.advanceCashAmount || 0;
      bankAmount = purchase.advanceBankAmount || 0;
      sourceBankAccountId = purchase.advanceSourceBankAccountId || '';
      clientBank = purchase.advanceClientBank || '';
      clientAccountNumber = purchase.advanceClientAccountNumber || '';
    } else {
      const totalExtraAdvances = purchase.advances?.reduce((sum, adv) => sum + adv.amount, 0) || 0;
      totalAllAdvances = (purchase.advancePayment || 0) + totalExtraAdvances;
      finalTotal = purchase.closeTotal || purchase.total;
      amount = parseFloat((finalTotal - totalAllAdvances).toFixed(2));
      closedAtDateString = purchase.closedAt || purchase.createdAt;
      closedByUsername = purchase.closedBy || purchase.createdBy;
      conceptDescription = `Liquidación final de saldo correspondiente a la Compra de Oro Cerrada #${purchase.receiptNumber}. Detalle de Cierre a Cotización.`;
      
      paymentType = purchase.closePaymentType || 'efectivo';
      cashAmount = purchase.closeCashAmount || 0;
      bankAmount = purchase.closeBankAmount || 0;
      sourceBankAccountId = purchase.closeSourceBankAccountId || '';
      clientBank = purchase.closeClientBank || '';
      clientAccountNumber = purchase.closeClientAccountNumber || '';
    }

    if (amount <= 0 && !isDirectClosed) {
      alert("No hay un saldo pendiente a pagar para esta liquidación (el total de adelantos cubre el total de cierre).");
      return;
    }

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a5'
    });

    const company = companySettings;
    const branch = branches.find(b => b.id === purchase.branchId);
    const client = clients.find(c => c.id === purchase.clientId);
    const closedDate = new Date(closedAtDateString);
    const opUser = systemUsers.find(u => u.id === closedByUsername || u.username === closedByUsername || u.email === closedByUsername);

    const margin = 15;
    const pageWidth = 148;
    const contentWidth = pageWidth - (margin * 2);

    // Header Borders
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(margin, 10, pageWidth - margin, 10); // Top line

    // Header - Company Info
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(company?.name?.toUpperCase() || 'AURUM MANAGER', margin, 18);
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(company?.address || '', margin, 23);
    doc.text(`Tel: ${company?.phone || ''} | NIT: ${company?.taxId || ''}`, margin, 27);
    doc.text(`Email: ${company?.email || ''}`, margin, 31);

    // Branch/Payment Info (Top Right)
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const documentTitle = isDirectClosed ? 'COMPROBANTE DE COMPRA (PAGO 100%)' : 'COMPROBANTE DE CIERRE - LIQUIDACIÓN';
    doc.text(documentTitle, pageWidth - margin, 18, { align: 'right' });
    doc.setFontSize(12);
    doc.setTextColor(0, 100, 0);
    const receiptCode = isDirectClosed ? purchase.receiptNumber : `LIQ-${purchase.receiptNumber}`;
    doc.text(receiptCode, pageWidth - margin, 24, { align: 'right' });
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Sucursal: ${branch?.name || 'Central'}`, pageWidth - margin, 31, { align: 'right' });

    doc.line(margin, 35, pageWidth - margin, 35); // Divider

    // Date and Operator Info
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text(`Fecha Emisión: ${closedDate.toLocaleDateString()} ${closedDate.toLocaleTimeString()}`, margin, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(`Usuario: ${opUser?.name || closedByUsername || 'Sistema'}`, pageWidth - margin, 42, { align: 'right' });

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
    doc.text(`Fecha Pago: ${closedDate.toLocaleDateString()}`, pageWidth - margin - 45, 68);

    // Details table
    autoTable(doc, {
      startY: 80,
      margin: { left: margin, right: margin },
      head: [['Descripción del Concepto', 'Importe (BS)']],
      body: [
        [conceptDescription, formatNumber(amount)],
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
    const literal = numeroALetras(amount);
    // Wrap text if literal is too long
    const splitLiteral = doc.splitTextToSize(literal, contentWidth - 15);
    doc.text(splitLiteral, margin + 12, finalY);

    const literalHeight = splitLiteral.length * 4;
    const totalY = finalY + literalHeight + 5;

    // Total highlight block based on the situation
    if (isDirectClosed) {
      const totalBoxWidth = 65;
      doc.setLineWidth(0.5);
      doc.line(pageWidth - margin - totalBoxWidth, totalY - 4, pageWidth - margin, totalY - 4);
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 100, 0);
      doc.text('LIQUIDACIÓN PAGADA:', pageWidth - margin - totalBoxWidth, totalY + 2);
      doc.setFontSize(11);
      doc.text(`${formatNumber(finalTotal)} BS`, pageWidth - margin, totalY + 2, { align: 'right' });
    } else {
      const totalBoxWidth = 65;
      doc.setLineWidth(0.5);
      doc.line(pageWidth - margin - totalBoxWidth, totalY - 4, pageWidth - margin, totalY - 4);
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('TOTAL RECALCULADO:', pageWidth - margin - totalBoxWidth, totalY + 2);
      doc.setFontSize(10);
      doc.text(`${formatNumber(finalTotal)} BS`, pageWidth - margin, totalY + 2, { align: 'right' });
      
      const secondTotalY = totalY + 6;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('(-) ADELANTOS PREVIOS:', pageWidth - margin - totalBoxWidth, secondTotalY + 2);
      doc.setFontSize(10);
      doc.text(`${formatNumber(totalAllAdvances)} BS`, pageWidth - margin, secondTotalY + 2, { align: 'right' });

      const thirdTotalY = secondTotalY + 6;
      doc.line(pageWidth - margin - totalBoxWidth, thirdTotalY - 1, pageWidth - margin, thirdTotalY - 1);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 100, 0);
      doc.text('LIQUIDACIÓN PAGADA:', pageWidth - margin - totalBoxWidth, thirdTotalY + 2);
      doc.setFontSize(11);
      doc.text(`${formatNumber(amount)} BS`, pageWidth - margin, thirdTotalY + 2, { align: 'right' });
    }

    let runningY = (isDirectClosed ? totalY : (totalY + 12)) + 8;

    // Bank Details if transfer or mixed
    if (paymentType === 'transferencia' || paymentType === 'mixto') {
      const sourceBank = branchBankAccounts.find(acc => acc.id === sourceBankAccountId);
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('DETALLES DE PAGO BANCARIO:', margin, runningY);
      doc.setFont('helvetica', 'normal');
      runningY += 4;
      if (paymentType === 'mixto') {
        doc.text(`Desglose: Efectivo: ${formatNumber(cashAmount || 0)} BS | Banco: ${formatNumber(bankAmount || 0)} BS`, margin, runningY);
        runningY += 4;
      }
      doc.text(`Origen (Sucursal): ${sourceBank ? `${sourceBank.bankName} - ${sourceBank.accountNumber}` : 'Transferencia Bancaria'}`, margin, runningY);
      runningY += 4;
      doc.text(`Destino (Cliente): ${clientBank || ''} - ${clientAccountNumber || ''}`, margin, runningY);
    }
    
    // Signatures Area
    const finalSignY = 185;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.setLineWidth(0.2);
    doc.setDrawColor(0, 0, 0);
    
    doc.line(margin + 5, finalSignY, margin + 45, finalSignY);
    doc.text('RECIBÍ CONFORME', margin + 25, finalSignY + 5, { align: 'center' });
    
    doc.setFontSize(8);
    doc.line(pageWidth - margin - 45, finalSignY, pageWidth - margin - 5, finalSignY);
    doc.text('RESPONSABLE CAJA', pageWidth - margin - 25, finalSignY + 5, { align: 'center' });
    doc.setFontSize(7);
    doc.text(opUser?.name || closedByUsername || 'Sistema', pageWidth - margin - 25, finalSignY + 9, { align: 'center' });

    // Global Border
    doc.rect(5, 5, pageWidth - 10, 200);

    doc.save(`LIQUIDACION_Saldo_${purchase.receiptNumber}.pdf`);
  };

  const handlePrintExportReceipt = (op: ExportOperation) => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const company = companySettings;
    const creatorUser = systemUsers.find(u => u.id === op.createdBy || u.username === op.createdBy || u.email === op.createdBy);
    
    // We might need to handle both string array and parsed array if the backend sometimes returns JSON strings
    let sourceIds: string[] = [];
    if (Array.isArray(op.sourceMaterialIds)) {
      sourceIds = op.sourceMaterialIds;
    } else {
      try {
        sourceIds = JSON.parse(op.sourceMaterialIds as any);
      } catch (e) {
        sourceIds = [];
      }
    }
    
    const sourceMaterials = materials.filter(m => sourceIds.includes(m.id!));

    const margin = 15;
    const pageWidth = 210;
    const contentWidth = pageWidth - (margin * 2);

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
    doc.text('COMPROBANTE DE VENTA / EXPORTACIÓN', pageWidth - margin, 20, { align: 'right' });
    doc.setFontSize(14);
    doc.setTextColor(16, 185, 129); // Emerald-500
    doc.text(`#${op.receiptNumber}`, pageWidth - margin, 27, { align: 'right' });
    
    doc.setTextColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(margin, 38, pageWidth - margin, 38);

    // Summary Info Grid
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('DATOS DE LA OPERACIÓN', margin, 48);
    
    doc.setFont('helvetica', 'normal');
    doc.text(`Fecha: ${new Date(op.date).toLocaleString()}`, margin, 54);
    doc.text(`Operador: ${creatorUser?.name || op.createdBy || 'Sistema'}`, margin, 58);
    doc.text(`Cotización Oro: $${formatNumber(op.marketPrice)}`, margin, 62);
    doc.text(`Precio Venta x Gramo: ${formatNumber(op.pricePerGram)} BS`, margin, 66);

    // Client/Buyer Info (Right Side)
    doc.setFont('helvetica', 'bold');
    doc.text('DATOS DEL COMPRADOR / DESTINO', pageWidth / 2 + 10, 48);
    doc.setFont('helvetica', 'normal');
    doc.text(`Nombre/Empresa: ${op.client || 'Desconocido'}`, pageWidth / 2 + 10, 54);

    // Items Table
    autoTable(doc, {
      startY: 75,
      margin: { left: margin, right: margin },
      head: [['#', 'Recibo Origen', 'Cliente Origen', 'Tipo', 'Peso (g)', 'Ley (%)', 'Valor Compra (BS)']],
      body: sourceMaterials.map((m, idx) => [
        idx + 1,
        `#${m.receiptNumber}`,
        m.client,
        m.type || 'pieza',
        `${formatNumber(m.finalWeight)}g`,
        `${formatNumber(m.purity)}%`,
        `${formatNumber(m.total)} BS`
      ]),
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold', fontSize: 8, halign: 'center' },
      styles: { fontSize: 8, cellPadding: 2, font: 'helvetica' },
      columnStyles: { 0: { halign: 'center', cellWidth: 10 }, 4: { halign: 'right' }, 5: { halign: 'center' }, 6: { halign: 'right' } }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;

    // Totals Box
    const boxWidth = 70;
    const boxX = pageWidth - margin - boxWidth;
    
    doc.setFillColor(245, 245, 245);
    doc.rect(boxX, finalY, boxWidth, 25, 'F');
    doc.setDrawColor(200, 200, 200);
    doc.rect(boxX, finalY, boxWidth, 25, 'S');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('PESO TOTAL:', boxX + 5, finalY + 8);
    doc.setFont('helvetica', 'bold');
    doc.text(`${formatNumber(op.totalWeight)}g`, pageWidth - margin - 5, finalY + 8, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.text('VALOR TOTAL VENTA:', boxX + 5, finalY + 18);
    doc.setFontSize(12);
    doc.setTextColor(16, 185, 129);
    doc.setFont('helvetica', 'bold');
    doc.text(`${formatCurrency(op.salePrice)} BS`, pageWidth - margin - 5, finalY + 18, { align: 'right' });

    // Amount in words
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text(`Son: ${numeroALetras(op.salePrice)} BS`, margin, finalY + 35, { maxWidth: contentWidth - boxWidth - 10 });

    // Signatures
    const signY = 250;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.line(margin + 20, signY, margin + 70, signY);
    doc.text('RESPONSABLE OPERACIÓN', margin + 45, signY + 5, { align: 'center' });
    
    doc.line(pageWidth - margin - 70, signY, pageWidth - margin - 20, signY);
    doc.text('RECIBIDO CONFORME (COMPRADOR)', pageWidth - margin - 45, signY + 5, { align: 'center' });

    doc.save(`Venta_${op.receiptNumber}_${op.client}.pdf`);
  };

  const sendWhatsAppReceipt = (purchase: any) => {
    const client = clients.find(c => c.id === purchase.clientId);
    if (!client || !client.phone) {
      alert("El cliente no tiene un número de teléfono registrado.");
      return;
    }

    const itemsCount = purchase.items?.length || 0;
    const totalWeight = purchase.items?.reduce((acc: number, curr: any) => acc + curr.finalWeight, 0) || 0;
    const totalAmount = purchase.type === 'cerrado' ? (purchase.closeTotal || purchase.total) : purchase.total;
    
    const typeText = purchase.type === 'abierto' ? 'COMPRA ABIERTA' : 'CIERRE DE COMPRA';
    
    let message = `*RECIBO DE ${typeText}*\n\n`;
    message += `*Nº Recibo:* ${purchase.receiptNumber}\n`;
    message += `*Cliente:* ${client.name}\n`;
    message += `*Fecha:* ${new Date(purchase.type === 'cerrado' && purchase.closedAt ? purchase.closedAt : purchase.createdAt).toLocaleString()}\n\n`;
    message += `*Detalles:*\n`;
    message += `- Ítems: ${itemsCount}\n`;
    message += `- Peso Total: ${formatNumber(totalWeight)}g\n`;
    message += `- Total: ${formatNumber(totalAmount)} BS\n\n`;
    
    if (purchase.type === 'abierto' && (purchase.advancePayment > 0 || (purchase.advances?.length > 0))) {
      const totalAdvances = (purchase.advancePayment || 0) + (purchase.advances?.reduce((sum: number, a: any) => sum + a.amount, 0) || 0);
      message += `*Adelantos:* ${formatNumber(totalAdvances)} BS\n\n`;
    }

    message += `Gracias por confiar en *Aurum Manager*.`;

    // Format phone: use country code if available, otherwise fallback to auto-detection
    const countryCode = client.phoneCountryCode || '591';
    let cleanPhone = client.phone.replace(/\D/g, '');
    
    // If it already starts with country code, don't prepend
    if (!cleanPhone.startsWith(countryCode)) {
      cleanPhone = countryCode + cleanPhone;
    }

    const url = `https://wa.me/${cleanPhone}/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const handlePrintPurchaseReceipt = (purchase: GoldPurchase | null, mode: 'abierto' | 'cerrado' | 'combined' | 'cierre' = 'combined') => {
    if (!purchase) return;
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
        head: [['#', 'Tipo', 'Peso Inicial', 'Peso Final', 'Merma (%)', 'Cotización', 'Ley (%)', 'Precio x Gramo', 'Total (100%) BS', 'Total (BS)']],
        body: purchase.items?.map((item, idx) => [
          idx + 1,
          item.type || 'pieza',
          `${formatNumber(item.initialWeight)}g`,
          `${formatNumber(item.finalWeight)}g`,
          `${formatNumber(item.lossPercentage, 1)}%`,
          formatNumber(item.marketPrice),
          `${formatNumber(item.purity)}%`,
          formatNumber(item.pricePerGram),
          `${formatNumber(item.material100 || 0)} BS`,
          `${formatNumber(item.total)} BS`
        ]) || [],
        theme: 'grid',
        headStyles: { fillColor: [60, 60, 60], textColor: 255, fontStyle: 'bold', fontSize: 6.5, halign: 'center' },
        styles: { fontSize: 6.5, cellPadding: 1.5, font: 'helvetica' },
        columnStyles: { 0: { halign: 'center', cellWidth: 8 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'center' }, 7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right', fontStyle: 'bold' } }
      });
    } else if (isPrintingClosedPart) {
      // Only Liquidation Table
      autoTable(doc, {
        startY: 85,
        margin: { left: margin, right: margin },
        head: [['#', 'Tipo', 'Peso Inicial', 'Peso Final', 'Merma (%)', 'Cotización', 'Ley (%)', 'Precio x Gramo', 'Total (100%) BS', 'Total de Cierre']],
        body: purchase.items?.map((item, idx) => [
          idx + 1,
          item.type || 'pieza',
          `${formatNumber(item.initialWeight)}g`,
          `${formatNumber(item.finalWeight)}g`,
          `${formatNumber(item.lossPercentage, 1)}%`,
          formatNumber(item.closeMarketPrice || item.marketPrice),
          `${formatNumber(item.purity)}%`,
          formatNumber(item.closePricePerGram || item.pricePerGram),
          `${formatNumber(item.material100 || 0)} BS`,
          `${formatNumber(item.closeTotal || 0)} BS`
        ]) || [],
        theme: 'grid',
        headStyles: { fillColor: [0, 100, 0], textColor: 255, fontStyle: 'bold', fontSize: 6.5, halign: 'center' },
        styles: { fontSize: 6.5, cellPadding: 1.5, font: 'helvetica' },
        columnStyles: { 0: { halign: 'center', cellWidth: 8 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'center' }, 7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right', fontStyle: 'bold' } }
      });
    } else {
      // Combined Detail (Two tables)
      doc.text('1. DETALLE DE REGISTRO ORIGINAL (ABIERTO)', margin, 92);

      autoTable(doc, {
        startY: 96,
        margin: { left: margin, right: margin },
        head: [['#', 'Tipo', 'Peso Inicial', 'Peso Final', 'Merma (%)', 'Cotización', 'Ley (%)', 'Precio x Gramo', 'Total (100%) BS', 'Subtotal (Origen)']],
        body: purchase.items?.map((item, idx) => [
          idx + 1,
          item.type || 'pieza',
          `${formatNumber(item.initialWeight)}g`,
          `${formatNumber(item.finalWeight)}g`,
          `${formatNumber(item.lossPercentage, 1)}%`,
          formatNumber(item.marketPrice),
          `${formatNumber(item.purity)}%`,
          formatNumber(item.pricePerGram),
          `${formatNumber(item.material100 || 0)} BS`,
          `${formatNumber(item.total)} BS`
        ]) || [],
        theme: 'grid',
        headStyles: { fillColor: [80, 80, 80], textColor: 255, fontStyle: 'bold', fontSize: 6.5, halign: 'center' },
        styles: { fontSize: 6.5, cellPadding: 1.5, font: 'helvetica' },
        columnStyles: { 0: { halign: 'center', cellWidth: 8 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'center' }, 7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right', fontStyle: 'bold' } }
      });

      let nextY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('2. DETALLE DE LIQUIDACIÓN FINAL (CIERRE)', margin, nextY);

      autoTable(doc, {
        startY: nextY + 4,
        margin: { left: margin, right: margin },
        head: [['#', 'Tipo', 'Peso Inicial', 'Peso Final', 'Merma (%)', 'Cotización', 'Ley (%)', 'Precio x Gramo', 'Total (100%) BS', 'Subtotal de Cierre']],
        body: purchase.items?.map((item, idx) => [
          idx + 1,
          item.type || 'pieza',
          `${formatNumber(item.initialWeight)}g`,
          `${formatNumber(item.finalWeight)}g`,
          `${formatNumber(item.lossPercentage, 1)}%`,
          formatNumber(item.closeMarketPrice || item.marketPrice),
          `${formatNumber(item.purity)}%`,
          formatNumber(item.closePricePerGram || item.pricePerGram),
          `${formatNumber(item.material100 || 0)} BS`,
          `${formatNumber(item.closeTotal || 0)} BS`
        ]) || [],
        theme: 'grid',
        headStyles: { fillColor: [0, 100, 0], textColor: 255, fontStyle: 'bold', fontSize: 6.5, halign: 'center' },
        styles: { fontSize: 6.5, cellPadding: 1.5, font: 'helvetica' },
        columnStyles: { 0: { halign: 'center', cellWidth: 8 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'center' }, 7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right', fontStyle: 'bold' } }
      });
    }

    let currentY = (doc as any).lastAutoTable.finalY + 10;
    
    const totalExtraAdvances = purchase.advances?.reduce((sum, adv) => sum + adv.amount, 0) || 0;
    const totalAllAdvances = (purchase.advancePayment || 0) + totalExtraAdvances;

    // Financial Summary
    const originalTotal = purchase.total;
    const finalTotal = isActuallyClosed && !isPrintingOpenPart ? (purchase.closeTotal || purchase.total) : purchase.total;
    const totalsWidth = 100;
    const totalsX = pageWidth - margin - totalsWidth;

    if (currentY + 65 > 280) {
      doc.addPage();
      currentY = 20;
    }

    const summaryBoxHeight = 40;
    doc.setFillColor(240, 240, 240);
    doc.rect(totalsX - 5, currentY - 5, totalsWidth + 5, summaryBoxHeight + (totalExtraAdvances > 0 ? 10 : 0), 'F');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(50, 50, 50);
    doc.text('RESUMEN DE PAGO', totalsX, currentY);
    currentY += 6;
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    
    const totalMat100 = (purchase.items || []).reduce((acc, curr) => acc + (curr.material100 || 0), 0);
    doc.setFont('helvetica', 'bold');
    doc.text('SUBTOTAL COMPRA (100%):', totalsX, currentY);
    doc.text(`${formatNumber(totalMat100)} BS`, pageWidth - margin, currentY, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    currentY += 6;

    if (isActuallyClosed && isPrintingCombined) {
      doc.text('TOTAL ORIGINAL (Abierto):', totalsX, currentY);
      doc.text(`${formatNumber(originalTotal)} BS`, pageWidth - margin, currentY, { align: 'right' });
      currentY += 5;
      
      doc.setFont('helvetica', 'bold');
      doc.text('TOTAL RECALCULADO (Cierre):', totalsX, currentY);
      doc.text(`${formatNumber(finalTotal)} BS`, pageWidth - margin, currentY, { align: 'right' });
      doc.setFont('helvetica', 'normal');
    } else {
      doc.text(isPrintingClosedPart ? 'TOTAL CIERRE:' : 'SUBTOTAL COMPRA (90%):', totalsX, currentY);
      doc.text(`${formatNumber(finalTotal)} BS`, pageWidth - margin, currentY, { align: 'right' });
    }
    currentY += 5;

    if (purchase.advancePayment > 0) {
      doc.text('(-) ADELANTO INICIAL:', totalsX, currentY);
      doc.text(`${formatNumber(purchase.advancePayment)} BS`, pageWidth - margin, currentY, { align: 'right' });
      currentY += 5;
    }

    if (totalExtraAdvances > 0) {
      doc.text(`(-) OTROS ADELANTOS (${purchase.advances?.length || 0}):`, totalsX, currentY);
      doc.text(`${formatNumber(totalExtraAdvances)} BS`, pageWidth - margin, currentY, { align: 'right' });
      currentY += 5;
    }
    
    doc.setLineWidth(0.3);
    doc.setDrawColor(0, 0, 0);
    doc.line(totalsX, currentY - 2, pageWidth - margin, currentY - 2);
    currentY += 4;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 100, 0); 
    const balance = finalTotal - totalAllAdvances;
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

    // Second page for "Abierto" & "Cierre" case (Para Cliente)
    if (isPrintingOpenPart || isPrintingClosedPart) {
      doc.addPage();
      
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

      // Receipt Title
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      const clientTitle = isPrintingClosedPart 
        ? 'COMPROBANTE DE COMPRA (CIERRE) (PARA CLIENTE)' 
        : 'COMPROBANTE DE COMPRA (PARA CLIENTE)';
      doc.text(clientTitle, pageWidth - margin, 20, { align: 'right' });
      doc.setFontSize(14);
      doc.setTextColor(180, 0, 0);
      doc.text(`#${purchase.receiptNumber}`, pageWidth - margin, 27, { align: 'right' });
      
      doc.setTextColor(0, 0, 0);
      doc.setLineWidth(0.5);
      doc.line(margin, 38, pageWidth - margin, 38);
      
      // Summary Info Grid
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      const clientRegDate = new Date(purchase.createdAt);
      doc.text('DATOS DE LA OPERACIÓN', margin, 48);
      doc.setFont('helvetica', 'normal');
      
      if (isPrintingClosedPart) {
        doc.text(`Estado: CERRADO`, margin, 54);
        doc.text(`Fecha Registro Orig: ${clientRegDate.toLocaleDateString()}`, margin, 58);
        if (purchase.closedAt) {
          const closedDate = new Date(purchase.closedAt);
          doc.setFont('helvetica', 'bold');
          doc.text(`FECHA CIERRE: ${closedDate.toLocaleDateString()} ${closedDate.toLocaleTimeString()}`, margin, 64);
          doc.setFont('helvetica', 'normal');
        }
      } else {
        doc.text(`Estado: ${purchase.type.toUpperCase()}`, margin, 54);
        doc.text(`Fecha: ${clientRegDate.toLocaleDateString()} ${clientRegDate.toLocaleTimeString()}`, margin, 58);
      }
      doc.text(`Sucursal: ${branch?.name || 'Central'}`, margin, isPrintingClosedPart ? 70 : 62);
      
      doc.setFont('helvetica', 'bold');
      doc.text('DATOS DEL CLIENTE', pageWidth / 2 + 10, 48);
      doc.setFont('helvetica', 'normal');
      doc.text(`Nombre: ${client?.name || 'Desconocido'}`, pageWidth / 2 + 10, 54);
      doc.text(`C.I./NIT: ${client?.ci || 'S/N'}`, pageWidth / 2 + 10, 58);
      doc.text(`Teléfono: ${client?.phone || 'S/N'}`, pageWidth / 2 + 10, 62);

      // Client Table (Formatted dynamically based on open vs close)
      const tableHead = isPrintingClosedPart 
        ? [['#', 'Tipo', 'Peso Inicial', 'Peso Final', 'Cotización (Cierre)', 'Ley (%)', 'Precio x Gramo (Cierre)', 'Total de Cierre (BS)']]
        : [['#', 'Tipo', 'Peso Inicial', 'Peso Final', 'Cotización', 'Ley (%)', 'Precio x Gramo (100%)', 'Total (BS)']];

      const tableBody = purchase.items?.map((item, idx) => {
        if (isPrintingClosedPart) {
          return [
            idx + 1,
            item.type || 'pieza',
            `${formatNumber(item.initialWeight)}g`,
            `${formatNumber(item.finalWeight)}g`,
            formatNumber(item.closeMarketPrice || item.marketPrice),
            `${formatNumber(item.purity)}%`,
            formatNumber(item.closePricePerGram || item.pricePerGram),
            `${formatNumber(item.closeTotal || 0)} BS`
          ];
        } else {
          return [
            idx + 1,
            item.type || 'pieza',
            `${formatNumber(item.initialWeight)}g`,
            `${formatNumber(item.finalWeight)}g`,
            formatNumber(item.marketPrice),
            `${formatNumber(item.purity)}%`,
            formatNumber(item.pricePerGram100 || 0),
            `${formatNumber(item.total)} BS`
          ];
        }
      }) || [];

      autoTable(doc, {
        startY: isPrintingClosedPart ? 78 : 72,
        margin: { left: margin, right: margin },
        head: tableHead,
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: isPrintingClosedPart ? [0, 100, 0] : [60, 60, 60], textColor: 255, fontStyle: 'bold', fontSize: 6.5, halign: 'center' },
        styles: { fontSize: 6.5, cellPadding: 1.5, font: 'helvetica' },
        columnStyles: { 
          0: { halign: 'center', cellWidth: 8 }, 
          2: { halign: 'right' }, 
          3: { halign: 'right' }, 
          4: { halign: 'right' }, 
          5: { halign: 'center' }, 
          6: { halign: 'right' }, 
          7: { halign: 'right', fontStyle: 'bold' } 
        }
      });

      let clientY = (doc as any).lastAutoTable.finalY + 10;
      
      // Note requested by user - ONLY printed for open purchase (not for cierre!)
      if (!isPrintingClosedPart) {
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(180, 0, 0);
        doc.text('IMPORTANTE:', margin, clientY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        doc.text('Todo material abierto tiene un plazo maximo de un 15 dias para ser cerrado.', margin + 24, clientY);
        clientY += 6;
        doc.text(`El material actual se cerrara a la cotizacion de momento el ${clientRegDate.toLocaleDateString()}`, margin, clientY);
        clientY += 12;
      }

      if (clientY + 65 > 280) {
        doc.addPage();
        clientY = 20;
      }

      const clientSummaryBoxHeight = 40;
      const clientTotalsWidth = 100;
      const clientTotalsX = pageWidth - margin - clientTotalsWidth;

      doc.setFillColor(240, 240, 240);
      doc.rect(clientTotalsX - 5, clientY - 5, clientTotalsWidth + 5, clientSummaryBoxHeight + (totalExtraAdvances > 0 ? 10 : 0), 'F');

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(50, 50, 50);
      doc.text('RESUMEN DE PAGO', clientTotalsX, clientY);
      clientY += 6;
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      
      const clientTotalMat100 = (purchase.items || []).reduce((acc, curr) => acc + (curr.material100 || 0), 0);
      doc.setFont('helvetica', 'bold');
      doc.text('SUBTOTAL COMPRA (100%):', clientTotalsX, clientY);
      doc.text(`${formatNumber(clientTotalMat100)} BS`, pageWidth - margin, clientY, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      clientY += 6;

      doc.text(isPrintingClosedPart ? 'TOTAL CIERRE:' : 'SUBTOTAL COMPRA (90%):', clientTotalsX, clientY);
      doc.text(`${formatNumber(finalTotal)} BS`, pageWidth - margin, clientY, { align: 'right' });
      clientY += 5;

      if (purchase.advancePayment > 0) {
        doc.text('(-) ADELANTO INICIAL:', clientTotalsX, clientY);
        doc.text(`${formatNumber(purchase.advancePayment)} BS`, pageWidth - margin, clientY, { align: 'right' });
        clientY += 5;
      }

      if (totalExtraAdvances > 0) {
        doc.text(`(-) OTROS ADELANTOS (${purchase.advances?.length || 0}):`, clientTotalsX, clientY);
        doc.text(`${formatNumber(totalExtraAdvances)} BS`, pageWidth - margin, clientY, { align: 'right' });
        clientY += 5;
      }
      
      doc.setLineWidth(0.3);
      doc.setDrawColor(0, 0, 0);
      doc.line(clientTotalsX, clientY - 2, pageWidth - margin, clientY - 2);
      clientY += 4;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 100, 0); 
      const clientBalance = finalTotal - totalAllAdvances;
      doc.text((isActuallyClosed && !isPrintingOpenPart) ? 'SALDO FINAL A PAGAR:' : 'LÍQUIDO A PAGAR:', clientTotalsX, clientY);
      doc.text(`${formatNumber(clientBalance)} BS`, pageWidth - margin, clientY, { align: 'right' });

      // Amount in Literal
      clientY += 12;
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('SON:', margin, clientY);
      doc.setFont('helvetica', 'normal');
      const clientLiteral = numeroALetras(clientBalance);
      const clientSplitLiteral = doc.splitTextToSize(clientLiteral, (pageWidth - margin) - (margin + 12));
      doc.text(clientSplitLiteral, margin + 12, clientY);
      
      // Signatures
      const clientSignY = 260;
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(8);
      doc.setLineWidth(0.2);
      doc.setDrawColor(150, 150, 150);
      doc.line(margin + 15, clientSignY, margin + 70, clientSignY);
      doc.text('FIRMA CLIENTE', margin + 42.5, clientSignY + 5, { align: 'center' });
      doc.line(pageWidth - margin - 70, clientSignY, pageWidth - margin - 15, clientSignY);
      doc.text('RESPONSABLE CAJA', pageWidth - margin - 42.5, clientSignY + 5, { align: 'center' });
    }

    const fileName = isPrintingOpenPart ? `Abierto` : (isPrintingClosedPart ? `Cierre` : `Detalle_Completo`);
    doc.save(`${fileName}_Compra_${purchase.receiptNumber}.pdf`);
  };

  const handleSaveAdvancePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !currentPurchaseForAdvance) return;

    // Filter out the current advance if editing to correctly calculate existing total
    const existingAdvancesExceptCurrent = currentPurchaseForAdvance.advances?.filter(adv => adv.id !== editingAdvanceId) || [];
    
    const totalAdvancesSoFar = existingAdvancesExceptCurrent.reduce((sum, adv) => sum + adv.amount, 0) + 
                                (currentPurchaseForAdvance.advancePayment || 0);
    
    // Calculate total to limit advances (using item total which handles aberto/cerrado)
    const totalLimit = currentPurchaseForAdvance.items?.reduce((acc: number, curr: any) => acc + (curr.total || 0), 0) || 0;
    
    if (totalAdvancesSoFar + advanceFormData.amount > totalLimit) {
      alert(`El total de adelantos (${formatNumber(totalAdvancesSoFar + advanceFormData.amount)} BS) no puede exceder el Valor Material (${formatNumber(totalLimit)} BS)`);
      return;
    }

    let updatedAdvances: AdvancePayment[] = [];
    let newAdvanceToPrint: AdvancePayment | null = null;

    if (editingAdvanceId) {
      // UPATING EXISTING
      updatedAdvances = (currentPurchaseForAdvance.advances || []).map(adv => {
        if (adv.id === editingAdvanceId) {
          const updated = {
            ...adv,
            amount: advanceFormData.amount,
            concept: advanceFormData.concept,
            date: advanceFormData.date,
            paymentType: advanceFormData.paymentType,
            cashAmount: advanceFormData.cashAmount,
            bankAmount: advanceFormData.bankAmount,
            sourceBankAccountId: advanceFormData.sourceBankAccountId,
            clientBank: advanceFormData.clientBank,
            clientAccountNumber: advanceFormData.clientAccountNumber,
            updatedBy: user.username || user.name
          };
          newAdvanceToPrint = updated;
          return updated;
        }
        return adv;
      });
    } else {
      // CREATING NEW
      const newAdvance: AdvancePayment = {
        id: crypto.randomUUID(),
        amount: advanceFormData.amount,
        concept: advanceFormData.concept || `Adelanto de la compra #${currentPurchaseForAdvance.receiptNumber}`,
        date: advanceFormData.date,
        paymentType: advanceFormData.paymentType,
        cashAmount: advanceFormData.cashAmount,
        bankAmount: advanceFormData.bankAmount,
        sourceBankAccountId: advanceFormData.sourceBankAccountId,
        clientBank: advanceFormData.clientBank,
        clientAccountNumber: advanceFormData.clientAccountNumber,
        createdBy: user.username || user.name
      };
      updatedAdvances = [...(currentPurchaseForAdvance.advances || []), newAdvance];
      newAdvanceToPrint = newAdvance;
    }
    
    try {
      const res = await apiFetch(`/api/gold-purchases/${currentPurchaseForAdvance.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          advances: updatedAdvances
        })
      });

      if (res.success) {
        setShowAdvanceModal(false);
        setEditingAdvanceId(null);
        fetchData();
        // Option to print immediately
        if (newAdvanceToPrint && confirm(`¿Desea imprimir el comprobante de adelanto (${editingAdvanceId ? 'actualizado' : 'nuevo'}) ahora?`)) {
          handlePrintAdvanceReceipt(currentPurchaseForAdvance, newAdvanceToPrint);
        }
      }
    } catch (error) {
      console.error("Error saving advance payment:", error);
      alert("Error al guardar el adelanto");
    }
  };

  const handleAddPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    handleAddToCart(e);
  };

  const handleClosePurchase = async (p: GoldPurchase | null) => {
    if (!user || !p) return;
    
    // Recalculate items for closure
    const recalculatedItems = p.items?.map(item => {
      const pricePerGram = parseFloat(((closeMarketPrice / 31.1035) * (item.purity / 100) * closeUsdToBs).toFixed(2));
      const total = parseFloat((item.finalWeight * pricePerGram).toFixed(2));
      return {
        ...item,
        material100: total,
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
          items: recalculatedItems,
          closePaymentType,
          closeCashAmount,
          closeBankAmount,
          closeSourceBankAccountId,
          closeClientBank,
          closeClientAccountNumber
        })
      });
      if (res.success) {
        setShowClosePurchaseModal(false);
        setClosingPurchase(null);
        fetchData();
        const closedPurchaseObj = {
          ...p,
          type: 'cerrado' as const,
          closedAt: new Date().toISOString(),
          closedBy: user.id || user.username,
          closeMarketPrice,
          closeUsdToBs,
          closeTotal,
          items: recalculatedItems,
          closePaymentType,
          closeCashAmount,
          closeBankAmount,
          closeSourceBankAccountId,
          closeClientBank,
          closeClientAccountNumber
        };
        
        setTimeout(() => {
          if (confirm('Compra cerrada correctamente con los nuevos valores recalculados. ¿Desea imprimir el Comprobante de Liquidación de Saldo ahora?')) {
            handlePrintLiquidationReceipt(closedPurchaseObj);
          }
        }, 500);
      }
    } catch (error) {
      handleApiError(error, OperationType.UPDATE, `gold-purchases/${p.id}/close`);
    }
  };

  const handleReceiveTransfer = (transfer: GoldTransfer) => {
    console.log("handleReceiveTransfer called for transfer:", transfer.id);
    if (!user) {
      console.error("No user found when trying to receive transfer");
      alert("Error: Usuario no identificado. Por favor refresque la página.");
      return;
    }
    setTransferToReceive(transfer);
    setShowReceiveConfirmModal(true);
  };

  const confirmReceiveTransfer = async () => {
    if (!user || !transferToReceive) return;
    setIsVerifyingTransfer(true);

    try {
      await apiFetch(`/api/gold-transfers/${transferToReceive.id}/receive`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receivedBy: user.name })
      });
      
      // Update local state immediately to show the items modal
      setSelectedTransferForItems({ ...transferToReceive, status: 'recibido' });
      setShowTransferItemsModal(true);
      setShowReceiveConfirmModal(false);
      setTransferToReceive(null);
      
      await fetchData();
    } catch (error) {
      handleApiError(error, OperationType.UPDATE, `gold-transfers/${transferToReceive.id}/receive`);
    } finally {
      setIsVerifyingTransfer(false);
    }
  };

  const handleVerifyItem = async (itemId: string, validatedData: any) => {
    if (!user) return;
    
    setIsVerifyingItem(true);
    try {
      await apiFetch('/api/gold-transfers/verify-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          validatedData,
          verifiedBy: user.name
        })
      });
      setShowVerifyItemModal(false);
      setSelectedItemToVerify(null);
      fetchData();
      alert('Material verificado y registrado en inventario central exitosamente.');
    } catch (error) {
      handleApiError(error, OperationType.CREATE, 'gold-transfers/verify-item');
    } finally {
      setIsVerifyingItem(false);
    }
  };

  const handleTransfer = async () => {
    if (!user || !branchMode || selectedTransferMaterials.length === 0) return;
    
    setIsTransferring(true);
    try {
      const selectedItems = goldPurchases
        .filter(p => p.branchId === branchMode)
        .flatMap(p => p.items || [])
        .filter(item => selectedTransferMaterials.includes(item.id!));
      
      const totalWeight = selectedItems.reduce((acc, item) => acc + (item.finalWeight || 0), 0);
      const totalGrams100 = selectedItems.reduce((acc, item) => acc + (item.finalWeight * (item.purity / 100)), 0);

      await apiFetch('/api/gold-transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: branchMode,
          materialIds: selectedTransferMaterials,
          totalWeight,
          totalGrams100,
          sentBy: user.name,
          notes: ''
        })
      });
      
      setShowTransferModal(false);
      setSelectedTransferMaterials([]);
      fetchData();
      alert('Transferencia iniciada correctamente. Los materiales están ahora en tránsito.');
    } catch (error) {
      handleApiError(error, OperationType.CREATE, 'gold-transfers');
    } finally {
      setIsTransferring(false);
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
    }).sort((a, b) => new Date(b.registrationDate).getTime() - new Date(a.registrationDate).getTime());
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

  const handleAddBranchBankAccount = async (branchId: string) => {
    if (!bankAccountFormData.bankName || !bankAccountFormData.accountNumber) return;
    try {
      if (editingBranchBankAccount) {
        await fetch(`/api/branch-bank-accounts/${editingBranchBankAccount.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bankAccountFormData)
        });
      } else {
        await fetch('/api/branch-bank-accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...bankAccountFormData, branchId })
        });
      }
      setBankAccountFormData({ bankName: '', accountNumber: '' });
      setEditingBranchBankAccount(null);
      fetchData();
    } catch (error) {
      handleApiError(error, editingBranchBankAccount ? OperationType.UPDATE : OperationType.CREATE, 'branchBankAccounts');
    }
  };

  const handleDeleteBranchBankAccount = async (id: string) => {
    if (!window.confirm('¿Eliminar esta cuenta bancaria?')) return;
    try {
      await fetch(`/api/branch-bank-accounts/${id}`, {
        method: 'DELETE'
      });
      fetchData();
    } catch (error) {
      handleApiError(error, OperationType.DELETE, 'branchBankAccounts');
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
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: { ...exportFormData, createdBy: user.id },
          materialIds: selectedForExport
        })
      });

      if (response.ok) {
        const savedExport = await response.json();
        handlePrintExportReceipt({
          ...exportFormData,
          id: savedExport.opId,
          sourceMaterialIds: selectedForExport,
          date: new Date().toISOString(),
          createdBy: user.id
        } as ExportOperation);

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
      }
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
        <div className="max-w-[1750px] mx-auto flex justify-between items-center">
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
              <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center text-white text-[10px] font-bold overflow-hidden shrink-0">
                {user.photo ? (
                  <img src={user.photo} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  user.name[0]
                )}
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

      <main className="max-w-[1750px] mx-auto px-6 pt-8">
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
                <button 
                  onClick={() => setShowTransferHistoryModal(true)}
                  className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap text-zinc-500 hover:bg-zinc-800`}
                >
                  <Truck className="w-4 h-4" /> Transitos
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
                  onClick={() => handleViewChange('branch_transfers')}
                  className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap ${view === 'branch_transfers' ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'text-zinc-500 hover:bg-zinc-800'}`}
                >
                  <Truck className="w-4 h-4" /> Envíos Central
                </button>
                <button 
                  onClick={() => handleViewChange('branch_referrers')}
                  className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap ${view === 'branch_referrers' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-zinc-500 hover:bg-zinc-800'}`}
                >
                  <Users className="w-4 h-4" /> Referidos
                </button>
                {(user.role === 'admin' || user.role === 'superadmin') && (
                  <button 
                    onClick={() => handleViewChange('branch_cash')}
                    className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap ${view === 'branch_cash' ? 'bg-zinc-100 text-zinc-900 shadow-lg' : 'text-zinc-500 hover:bg-zinc-800'}`}
                  >
                    <Scale className="w-4 h-4" /> Caja Chica
                  </button>
                )}
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
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
                <div>
                  <h2 className="text-2xl font-bold text-zinc-100 italic">Historial de Operaciones</h2>
                  <p className="text-zinc-500 text-xs font-medium">Consulte el registro histórico de fundiciones y ventas.</p>
                </div>
                <div className="flex bg-zinc-900 p-1 rounded-2xl border border-white/5">
                  <button 
                    onClick={() => setHistoryTab('smelting')}
                    className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${historyTab === 'smelting' ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    Fundiciones ({smeltingOperations.length})
                  </button>
                  <button 
                    onClick={() => setHistoryTab('export')}
                    className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${historyTab === 'export' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    Ventas ({exportOperations.length})
                  </button>
                </div>
              </div>

              {historyTab === 'smelting' ? (
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
                                    <span key={`${sm.id || sm.receiptNumber}-${idx}`} className="px-2 py-0.5 bg-zinc-950 text-[9px] font-bold text-zinc-500 rounded-full border border-white/5">
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
                                <p className="text-sm font-medium">No hay operaciones de fundición registradas</p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-zinc-900 rounded-3xl border border-white/5 shadow-sm overflow-hidden text-white">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-zinc-950 border-b border-white/5">
                          <th className="px-6 py-4 text-[10px] font-bold uppercase text-zinc-500 tracking-widest">Nº Recibo</th>
                          <th className="px-6 py-4 text-[10px] font-bold uppercase text-zinc-500 tracking-widest">Fecha</th>
                          <th className="px-6 py-4 text-[10px] font-bold uppercase text-zinc-500 tracking-widest">Cliente / Destino</th>
                          <th className="px-6 py-4 text-[10px] font-bold uppercase text-zinc-500 tracking-widest text-right">Peso Total</th>
                          <th className="px-6 py-4 text-[10px] font-bold uppercase text-zinc-500 tracking-widest text-right">Cotización</th>
                          <th className="px-6 py-4 text-[10px] font-bold uppercase text-zinc-500 tracking-widest text-right">Total Venta</th>
                          <th className="px-6 py-4 text-[10px] font-bold uppercase text-zinc-500 tracking-widest text-center">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {exportOperations.map(op => (
                          <tr key={op.id} className="hover:bg-zinc-800/50 transition-colors">
                            <td className="px-6 py-4">
                              <span className="text-sm font-bold text-emerald-500 font-mono">#{op.receiptNumber}</span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className="text-sm font-bold text-zinc-100">
                                  {new Date(op.date).toLocaleDateString()}
                                </span>
                                <span className="text-[10px] text-zinc-500 italic">
                                  {new Date(op.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-sm font-bold text-zinc-300 uppercase tracking-tight">{op.client}</span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="text-sm font-mono font-bold text-zinc-100 italic">{formatNumber(op.totalWeight)}g</span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="text-sm font-mono font-medium text-zinc-500">${formatNumber(op.marketPrice)}</span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="text-sm font-mono font-black text-amber-500">{formatCurrency(op.salePrice)}</span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex justify-center">
                                <button 
                                  onClick={() => handlePrintExportReceipt(op)}
                                  className="p-2 text-zinc-500 hover:text-emerald-500 transition-colors group relative"
                                  title="Reimprimir Comprobante"
                                >
                                  <FileText className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {exportOperations.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-6 py-12 text-center">
                              <div className="flex flex-col items-center gap-2 text-zinc-500">
                                <TrendingUp className="w-8 h-8 opacity-20" />
                                <p className="text-sm font-medium italic underline decoration-white/5 underline-offset-8">No hay ventas registradas</p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <Pagination 
                totalItems={historyTab === 'smelting' ? smeltingOperations.length : exportOperations.length} 
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
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold text-xl overflow-hidden shrink-0 border border-white/5">
                      {u.photo ? (
                        <img src={u.photo} alt={u.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        u.name[0]
                      )}
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
                        onClick={() => {
                          setSelectedBranchForBanks(b);
                          setShowBranchBankAccountsModal(true);
                        }}
                        className="text-[10px] font-bold text-blue-400 hover:bg-blue-500/10 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                      >
                        <Building2 className="w-3 h-3" /> Cuentas
                      </button>
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
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-500">
                        <TrendingUp className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-[10px] text-zinc-500 uppercase font-bold">Inventario en Sucursal (g)</p>
                        <p className="text-2xl font-bold text-zinc-100 italic">
                          {formatNumber(goldPurchases.filter(p => p.branchId === branchMode).reduce((acc, curr) => acc + (curr.items?.filter(item => !item.isTransferred).reduce((iAcc, item) => iAcc + item.finalWeight, 0) || 0), 0))}g
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={exportBranchInventoryToExcel}
                      className="p-3 bg-emerald-500/10 text-emerald-500 rounded-2xl hover:bg-emerald-500 hover:text-white transition-all border border-emerald-500/20 group/btn"
                      title="Descargar detalle Excel"
                    >
                      <Download className="w-5 h-5 group-hover/btn:scale-110 transition-transform" />
                    </button>
                  </div>
                  <div className="text-[10px] text-zinc-500 font-bold uppercase underline decoration-amber-500/10 underline-offset-4">Material Pendiente de Envío</div>
                </div>

                <div className="bg-zinc-900 p-6 rounded-3xl border border-white/5 shadow-sm">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-500">
                      <Truck className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-500 uppercase font-bold">Transferir Material</p>
                      <p className="text-2xl font-bold text-zinc-100 italic">Central</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button 
                      onClick={() => setShowTransferModal(true)}
                      className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                    >
                      <ArrowRightLeft className="w-4 h-4" /> Enviar a Central
                    </button>
                    <button 
                      onClick={() => setView('branch_transfers')}
                      className="w-full py-2 bg-zinc-950/50 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl text-[10px] uppercase font-black transition-all flex items-center justify-center gap-2 border border-white/5"
                    >
                      <History className="w-3.5 h-3.5" /> Historial de Envíos
                    </button>
                  </div>
                </div>
              </div>

              {/* Alert Notifications for Pending Liquidations */}
              {pendingLiquidationsAlerts.length > 0 && (
                <div className="bg-zinc-900 rounded-[32px] border border-red-500/20 overflow-hidden shadow-xl shadow-red-500/5">
                  <div className="bg-red-500/10 px-6 py-4 border-b border-red-500/20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-red-500 rounded-xl">
                        <Clock className="w-5 h-5 text-white animate-pulse" />
                      </div>
                      <div>
                        <h3 className="text-zinc-100 font-bold italic text-sm">Alertas de Liquidación Pendiente</h3>
                        <p className="text-[10px] text-red-500 font-bold uppercase tracking-tight">Vencimiento menor a 5 días o Vencidos</p>
                      </div>
                    </div>
                    <span className="px-3 py-1 bg-red-500 text-white text-[10px] font-black rounded-full">
                      {pendingLiquidationsAlerts.length} PENDIENTES
                    </span>
                  </div>
                  <div className="p-2 max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800">
                    <table className="w-full text-left border-separate border-spacing-0">
                      <thead>
                        <tr>
                          <th className="px-6 py-4 text-[10px] font-bold uppercase text-zinc-500 tracking-wider">Recibo</th>
                          <th className="px-6 py-4 text-[10px] font-bold uppercase text-zinc-500 tracking-wider">Cliente</th>
                          <th className="px-6 py-4 text-[10px] font-bold uppercase text-zinc-500 tracking-wider">Fecha Registro</th>
                          <th className="px-6 py-4 text-[10px] font-bold uppercase text-zinc-500 tracking-wider">Estado</th>
                          <th className="px-6 py-4 text-[10px] font-bold uppercase text-zinc-500 tracking-wider text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {pendingLiquidationsAlerts.map(p => (
                          <tr key={p.id} className="hover:bg-white/[0.02] transition-colors group">
                            <td className="px-6 py-4">
                              <span className="text-sm font-mono font-bold text-amber-500">#{p.receiptNumber}</span>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-sm font-bold text-zinc-100">{clients.find(c => c.id === p.clientId)?.name || 'Desconocido'}</p>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-[10px] text-zinc-500 font-mono">{new Date(p.createdAt).toLocaleString()}</p>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 w-fit ${
                                p.daysRemaining <= 0 
                                  ? 'bg-red-500/20 text-red-500 border border-red-500/40 animate-pulse' 
                                  : 'bg-orange-500/20 text-orange-500 border border-orange-500/40'
                              }`}>
                                <Clock className="w-3 h-3" />
                                {p.daysRemaining <= 0 ? `VENCIDO (${Math.abs(p.daysRemaining)} días)` : `FALTAN ${p.daysRemaining} DÍAS`}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button 
                                onClick={() => {
                                  setViewingPurchase(p);
                                  setShowViewPurchaseModal(true);
                                }}
                                className="px-4 py-2 bg-zinc-800 hover:bg-white text-zinc-400 hover:text-zinc-950 rounded-xl text-[10px] font-black uppercase transition-all border border-white/5"
                              >
                                Ver Detalle
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

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
                      {goldPurchases
                        .filter(p => p.branchId === branchMode)
                        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                        .slice(0, 5)
                        .map(p => (
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
                                  <span className="text-[7px] text-amber-500 font-bold uppercase">Adelanto</span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-3 font-mono">{formatNumber(p.items?.reduce((acc, curr) => acc + curr.finalWeight, 0) || 0)}g</td>
                            <td className="px-6 py-3 font-mono text-emerald-500">{formatNumber(p.total)} BS</td>
                            <td className="px-6 py-3 text-xs text-zinc-500">{new Date(p.createdAt).toLocaleString()}</td>
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
              <div className="flex justify-between items-center bg-zinc-900/50 p-6 rounded-3xl border border-white/5">
                <div>
                  <h2 className="text-2xl font-black text-white tracking-tight">Gestión de Clientes</h2>
                  <p className="text-zinc-500 text-sm mt-1">Administra y registra los clientes de la sucursal</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-amber-500 transition-colors" />
                    <input 
                      type="text"
                      placeholder="Buscar por nombre, CI o teléfono..."
                      value={clientSearch}
                      onChange={e => {
                        setClientSearch(e.target.value);
                        setBranchClientsPage(1);
                      }}
                      className="bg-zinc-950 text-white pl-11 pr-6 py-3 rounded-2xl border border-white/5 focus:border-amber-500/50 focus:outline-none w-[350px] text-sm transition-all shadow-inner"
                    />
                  </div>
                  <button 
                    onClick={() => {
                      setEditingClient(null);
                      setClientFormData({ 
                        name: '', phone: '', phoneCountryCode: '591', email: '', ci: '', 
                        workplace: '', isMineCooperative: false, recommendedBy: '',
                        referentialPhone: '', referentialCountryCode: '591'
                      });
                      setShowAddClientModal(true);
                    }}
                    className="bg-blue-600 text-white px-6 py-3 rounded-2xl text-sm font-bold shadow-lg shadow-blue-600/20 hover:bg-blue-500 transition-all flex items-center gap-2 transform active:scale-95"
                  >
                    <Plus className="w-5 h-5" /> Nuevo Cliente
                  </button>
                </div>
              </div>

              <div className="bg-zinc-900 rounded-3xl border border-white/5 overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full min-w-[1100px]">
                  <thead>
                    <tr className="text-[10px] text-zinc-500 uppercase font-bold border-b border-white/5 bg-zinc-900/50">
                      <th className="px-6 py-4 text-left">Cliente</th>
                      <th className="px-6 py-4 text-left">CI / Trabajo</th>
                      <th className="px-6 py-4 text-left">Contacto</th>
                      <th className="px-6 py-4 text-left">Referencia</th>
                      <th className="px-6 py-4 text-left">Registro</th>
                      <th className="px-6 py-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                     {paginatedBranchClients.map(c => (
                      <tr key={c.id} className="group hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="relative w-8 h-8 rounded-full border border-white/10 bg-zinc-950 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                              {c.photo ? (
                                <img 
                                  src={c.photo} 
                                  alt={c.name} 
                                  className="w-full h-full object-cover cursor-pointer hover:scale-110 transition-transform duration-200" 
                                  onClick={() => {
                                    setViewingImageTitle(`Foto de Perfil - ${c.name}`);
                                    setViewingImageSrc(c.photo!);
                                  }}
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <span className="text-[10px] font-bold text-zinc-500 uppercase">
                                  {c.name.split(' ').slice(0,2).map(n => n[0]).join('')}
                                </span>
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-bold text-zinc-100">{c.name}</p>
                                {c.isMineCooperative && (
                                  <span className="px-2 py-0.5 bg-amber-500/10 text-amber-500 text-[8px] font-bold uppercase rounded-full border border-amber-500/20">
                                    Coop. Mina
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-bold text-zinc-300">CI: {c.ci || 'N/A'}</p>
                              {c.documentPhoto && (
                                <button
                                  onClick={() => {
                                    setViewingImageTitle(`Documento de Identidad - ${c.name}`);
                                    setViewingImageSrc(c.documentPhoto!);
                                  }}
                                  className="p-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 rounded border border-emerald-500/20 transition-all cursor-pointer"
                                  title="Ver Documento"
                                >
                                  <ImageIcon className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                            <p className="text-[10px] text-zinc-500">{c.workplace || 'N/A'}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                              <Phone className="w-3 h-3" /> {((c as any).phoneCountryCode && !c.phone.startsWith('+')) ? `+${(c as any).phoneCountryCode} ${c.phone}` : c.phone}
                            </div>
                            {c.referentialPhone && (
                              <div className="flex items-center gap-2 text-[9px] text-zinc-500">
                                <Phone className="w-2.5 h-2.5" /> Ref: {((c as any).referentialCountryCode && !c.referentialPhone.startsWith('+')) ? `+${(c as any).referentialCountryCode} ${c.referentialPhone}` : c.referentialPhone}
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
                                  phone: c.phone || '',
                                  phoneCountryCode: (c as any).phoneCountryCode || '591',
                                  email: c.email || '',
                                  ci: c.ci || '',
                                  workplace: c.workplace || '',
                                  isMineCooperative: !!c.isMineCooperative,
                                  recommendedBy: c.recommendedBy || '',
                                  referentialPhone: c.referentialPhone || '',
                                  referentialCountryCode: (c as any).referentialCountryCode || '591',
                                  photo: c.photo || '',
                                  documentPhoto: c.documentPhoto || ''
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
              <Pagination 
                totalItems={filteredBranchClients.length}
                currentPage={branchClientsPage}
                onPageChange={setBranchClientsPage}
                itemsPerPage={ITEMS_PER_PAGE}
              />

              {filteredBranchClients.length === 0 && (
                <div className="px-6 py-12 text-center text-zinc-600">
                  <User className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p className="text-sm font-bold uppercase tracking-widest">No se encontraron clientes</p>
                </div>
              )}
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
              <div className="flex justify-between items-center bg-zinc-900/50 p-6 rounded-3xl border border-white/5">
                <div>
                  <h2 className="text-2xl font-black text-white tracking-tight italic">Gestión de Referidos</h2>
                  <p className="text-zinc-500 text-sm mt-1">Administra los referidores y sus comisiones</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-amber-500 transition-colors" />
                    <input 
                      type="text"
                      placeholder="Buscar por nombre, CI o teléfono..."
                      value={referrerSearch}
                      onChange={e => {
                        setReferrerSearch(e.target.value);
                        setBranchReferrersPage(1);
                      }}
                      className="bg-zinc-950 text-white pl-11 pr-6 py-3 rounded-2xl border border-white/5 focus:border-amber-500/50 focus:outline-none w-[350px] text-sm transition-all shadow-inner"
                    />
                  </div>
                  <button 
                    onClick={() => {
                      setEditingReferrer(null);
                      setReferrerFormData({ 
                        name: '', phone1: '', phone2: '', ci: ''
                      });
                      setShowAddReferrerModal(true);
                    }}
                    className="bg-indigo-600 text-white px-6 py-3 rounded-2xl text-sm font-bold shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 transition-all flex items-center gap-2 transform active:scale-95"
                  >
                    <Plus className="w-5 h-5" /> Nuevo Referido
                  </button>
                </div>
              </div>

              <div className="bg-zinc-900 rounded-3xl border border-white/5 overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full min-w-[1000px]">
                  <thead>
                    <tr className="text-[10px] text-zinc-500 uppercase font-bold border-b border-white/5 bg-zinc-900/50">
                      <th className="px-6 py-4 text-left">Nombre</th>
                      <th className="px-6 py-4 text-left">CI</th>
                      <th className="px-6 py-4 text-left">Teléfonos</th>
                      <th className="px-6 py-4 text-left">Comisiones Pendientes</th>
                      <th className="px-6 py-4 text-left">Registro</th>
                      <th className="px-6 py-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                     {paginatedBranchReferrers.map(r => (
                      <tr key={r.id} className="group hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="relative w-8 h-8 rounded-full border border-white/10 bg-zinc-950 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                              {r.photo ? (
                                <img 
                                  src={r.photo} 
                                  alt={r.name} 
                                  className="w-full h-full object-cover cursor-pointer hover:scale-110 transition-transform duration-200" 
                                  onClick={() => {
                                    setViewingImageTitle(`Foto de Perfil - ${r.name}`);
                                    setViewingImageSrc(r.photo!);
                                  }}
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <span className="text-[10px] font-bold text-zinc-500 uppercase">
                                  {r.name.split(' ').slice(0,2).map(n => n[0]).join('')}
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-bold text-zinc-100">{r.name}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-zinc-300">{r.ci || 'N/A'}</span>
                            {r.documentPhoto && (
                              <button
                                onClick={() => {
                                  setViewingImageTitle(`Documento de Identidad - ${r.name}`);
                                  setViewingImageSrc(r.documentPhoto!);
                                }}
                                className="p-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 rounded border border-emerald-500/20 transition-all cursor-pointer"
                                title="Ver Documento"
                              >
                                <ImageIcon className="w-3 h-3" />
                              </button>
                            )}
                          </div>
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
                                  ci: r.ci,
                                  photo: r.photo || '',
                                  documentPhoto: r.documentPhoto || ''
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
              </div>
              <Pagination 
                totalItems={filteredBranchReferrers.length}
                currentPage={branchReferrersPage}
                onPageChange={setBranchReferrersPage}
                itemsPerPage={ITEMS_PER_PAGE}
              />

              {filteredBranchReferrers.length === 0 && (
                <div className="px-6 py-12 text-center text-zinc-600">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p className="text-sm font-bold uppercase tracking-widest">No se encontraron referidos</p>
                </div>
              )}
            </div>
            </motion.div>
          )}

          {view === 'branch_transfers' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="flex justify-between items-center bg-zinc-900/50 p-6 rounded-3xl border border-white/5">
                <div>
                  <h2 className="text-2xl font-black text-white tracking-tight">Historial de Transferencias</h2>
                  <p className="text-zinc-500 text-sm mt-1">Sigue el estado de los materiales enviados al Almacén Central</p>
                </div>
                <div className="flex items-center gap-6">
                  <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-amber-500 transition-colors" />
                    <input 
                      type="text"
                      placeholder="Buscar por referencia o peso..."
                      value={branchTransfersSearch}
                      onChange={e => {
                        setBranchTransfersSearch(e.target.value);
                        setBranchTransfersPage(1);
                      }}
                      className="bg-zinc-950 text-white pl-11 pr-6 py-3 rounded-2xl border border-white/5 focus:border-amber-500/50 focus:outline-none w-[300px] text-sm transition-all shadow-inner"
                    />
                  </div>
                  <div className="flex bg-zinc-950 p-1 rounded-xl border border-white/5 shadow-inner">
                    <div className="px-5 py-2 flex flex-col items-center border-r border-white/5">
                      <span className="text-[10px] uppercase text-zinc-500 font-bold">Enviadas</span>
                      <span className="text-lg font-black text-white">{goldTransfers.filter(t => t.branchId === branchMode).length}</span>
                    </div>
                    <div className="px-5 py-2 flex flex-col items-center">
                      <span className="text-[10px] uppercase text-zinc-500 font-bold">Tránsito</span>
                      <span className="text-lg font-black text-amber-500">{goldTransfers.filter(t => t.branchId === branchMode && t.status === 'en_transito').length}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900 rounded-3xl border border-white/5 overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full min-w-[1000px]">
                    <thead>
                      <tr className="text-[10px] text-zinc-500 uppercase font-bold border-b border-white/5 bg-zinc-900/50">
                        <th className="px-6 py-4 text-left">Fecha</th>
                        <th className="px-6 py-4 text-left">Referencia</th>
                        <th className="px-6 py-4 text-center">Ítems</th>
                        <th className="px-6 py-4 text-right">Peso Neto Total</th>
                        <th className="px-6 py-4 text-center">Estado</th>
                        <th className="px-6 py-4 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {paginatedBranchTransfers.map((transfer) => (
                        <tr key={transfer.id} className="hover:bg-white/[0.02] transition-colors group">
                          <td className="px-6 py-4">
                            <div className="text-sm text-zinc-300">{new Date(transfer.sentAt).toLocaleDateString()}</div>
                            <div className="text-[10px] text-zinc-500">{new Date(transfer.sentAt).toLocaleTimeString()}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-bold text-white">#{transfer.id.slice(0, 8).toUpperCase()}</div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="bg-zinc-800 text-zinc-400 px-2 py-1 rounded-lg text-xs font-bold ring-1 ring-white/5 group-hover:ring-amber-500/30 transition-all">
                              {transfer.materialIds.length} materiales
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="text-sm font-black text-white">{transfer.totalWeight.toFixed(2)}g</div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              transfer.status === 'recibido' 
                                ? 'bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20' 
                                : 'bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20 animate-pulse'
                            }`}>
                              {transfer.status === 'recibido' ? <CheckCircle2 className="w-3 h-3" /> : <Truck className="w-3 h-3" />}
                              {transfer.status === 'recibido' ? 'Recibido en Central' : 'En Tránsito'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button
                              onClick={() => {
                                setSelectedTransferForItems(transfer);
                                setShowTransferItemsModal(true);
                              }}
                              className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl transition-all"
                              title="Ver Detalles"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  <Pagination 
                    totalItems={filteredBranchTransfers.length}
                    currentPage={branchTransfersPage}
                    onPageChange={setBranchTransfersPage}
                    itemsPerPage={ITEMS_PER_PAGE}
                  />

                  {filteredBranchTransfers.length === 0 && (
                    <div className="px-6 py-12 text-center text-zinc-600">
                      <Truck className="w-12 h-12 mx-auto mb-4 opacity-20" />
                      <p className="text-sm">No se han realizado transferencias a central todavía.</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {view === 'branch_cash' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-zinc-900/50 p-8 rounded-[40px] border border-white/5">
                <div>
                  <h2 className="text-3xl font-black text-white italic tracking-tighter flex items-center gap-3">
                    <Scale className="w-8 h-8 text-amber-500" /> Caja Chica y Cierres
                  </h2>
                  <p className="text-zinc-500 text-sm mt-1">Gestión de movimientos de efectivo y cierres diarios de sucursal</p>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setShowAddCashMoveModal(true)}
                    className="px-6 py-3 bg-amber-500 text-zinc-950 rounded-2xl font-bold hover:bg-amber-400 transition-all flex items-center gap-2 shadow-xl shadow-amber-500/20"
                  >
                    <Plus className="w-5 h-5" /> Nuevo Movimiento
                  </button>
                  <button 
                    onClick={() => {
                        const latestClosure = [...branchClosures]
                          .filter(c => c.branchId === branchMode)
                          .sort((a,b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime())[0];
                        
                        const initBal = latestClosure ? latestClosure.finalBalance : 0;
                        const delta = currentCycleMoves
                          .filter(m => m.paymentType === 'efectivo')
                          .reduce((acc, m) => m.type === 'ingreso' ? acc + m.amount : acc - m.amount, 0);
                        const finalBal = initBal + delta;
                        
                        setClosureFormData({ initialBalance: initBal, finalBalance: finalBal, notes: '' });
                        setShowAddClosureModal(true);
                    }}
                    className="px-6 py-3 bg-zinc-100 text-zinc-900 rounded-2xl font-bold hover:bg-white transition-all flex items-center gap-2 shadow-xl"
                  >
                    <Lock className="w-5 h-5" /> Realizar Cierre
                  </button>
                </div>
              </div>

              {/* Cash Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {(() => {
                  const latestClosure = [...branchClosures]
                    .filter(c => c.branchId === branchMode)
                    .sort((a,b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime())[0];
                  
                  const initBal = latestClosure ? latestClosure.finalBalance : 0;
                  
                  // Cash Cycle Moves (since closure)
                  const cashIncomes = currentCycleMoves.filter(m => m.type === 'ingreso' && m.paymentType === 'efectivo').reduce((acc, m) => acc + m.amount, 0);
                  const cashExpenses = currentCycleMoves.filter(m => m.type === 'egreso' && m.paymentType === 'efectivo').reduce((acc, m) => acc + m.amount, 0);
                  const cashBalance = initBal + cashIncomes - cashExpenses;

                  // Bank Total Balances (Calculated from all moves as there is no bank closure yet)
                  // In a real app we'd have initial bank balances per branch account
                  const bankMoves = branchCashMoves.filter(m => m.branchId === branchMode && m.paymentType === 'transferencia');
                  const bankIncomes = bankMoves.filter(m => m.type === 'ingreso').reduce((acc, m) => acc + m.amount, 0);
                  const bankExpenses = bankMoves.filter(m => m.type === 'egreso').reduce((acc, m) => acc + m.amount, 0);
                  const totalBankBalance = bankIncomes - bankExpenses;

                  return (
                    <>
                      {/* Cash Summary Card */}
                      <div className="bg-zinc-900/50 p-8 rounded-[32px] border border-white/5 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full -mr-16 -mt-16 blur-3xl transition-all group-hover:bg-amber-500/10" />
                        <div className="flex justify-between items-start mb-6">
                          <div>
                            <p className="text-[10px] text-zinc-500 uppercase font-black tracking-[0.2em] mb-1">Efectivo en Caja</p>
                            <h4 className="text-4xl font-mono font-black text-white">{formatNumber(cashBalance)} <span className="text-sm font-sans text-zinc-500 ml-1">BS</span></h4>
                          </div>
                          <div className="p-3 bg-amber-500/10 rounded-2xl border border-amber-500/20">
                            <Coins className="w-6 h-6 text-amber-500" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                          <div>
                            <p className="text-[10px] text-emerald-500/70 uppercase font-bold tracking-wider mb-1 flex items-center gap-1">
                              <Plus className="w-3 h-3" /> Ingresos
                            </p>
                            <p className="text-lg font-mono font-bold text-emerald-500">{formatNumber(cashIncomes)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-red-500/70 uppercase font-bold tracking-wider mb-1 flex items-center gap-1">
                              <History className="w-3 h-3 rotate-180" /> Egresos
                            </p>
                            <p className="text-lg font-mono font-bold text-red-400">{formatNumber(cashExpenses)}</p>
                          </div>
                        </div>
                      </div>

                      {/* Bank Summary Card */}
                      <div className="bg-zinc-900/50 p-8 rounded-[32px] border border-white/5 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full -mr-16 -mt-16 blur-3xl transition-all group-hover:bg-blue-500/10" />
                        <div className="flex justify-between items-start mb-6">
                          <div>
                            <p className="text-[10px] text-zinc-500 uppercase font-black tracking-[0.2em] mb-1">Cuentas Bancarias</p>
                            <h4 className="text-4xl font-mono font-black text-white">{formatNumber(totalBankBalance)} <span className="text-sm font-sans text-zinc-500 ml-1">BS</span></h4>
                          </div>
                          <div className="p-3 bg-blue-500/10 rounded-2xl border border-blue-500/20">
                            <Building2 className="w-6 h-6 text-blue-500" />
                          </div>
                        </div>
                        
                        <div className="space-y-4 pt-4 border-t border-white/5">
                          {branchBankAccounts.filter(acc => acc.branchId === branchMode).map(account => {
                            // Cumulative balance
                            const allAccMoves = branchCashMoves.filter(m => m.branchId === branchMode && m.paymentType === 'transferencia' && m.bankAccountId === account.id);
                            const totalAccIn = allAccMoves.filter(m => m.type === 'ingreso').reduce((sum, m) => sum + m.amount, 0);
                            const totalAccOut = allAccMoves.filter(m => m.type === 'egreso').reduce((sum, m) => sum + m.amount, 0);
                            const accBal = totalAccIn - totalAccOut;

                            // Current cycle stats (since last closure)
                            const cycleAccMoves = currentCycleMoves.filter(m => m.paymentType === 'transferencia' && m.bankAccountId === account.id);
                            const cycleAccIn = cycleAccMoves.filter(m => m.type === 'ingreso').reduce((sum, m) => sum + m.amount, 0);
                            const cycleAccOut = cycleAccMoves.filter(m => m.type === 'egreso').reduce((sum, m) => sum + m.amount, 0);

                            return (
                              <div key={account.id} className="bg-white/[0.02] p-4 rounded-2xl border border-white/5 group/acc hover:bg-white/[0.04] transition-all">
                                <div className="flex justify-between items-center mb-2">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                                    <p className="text-[10px] font-black text-zinc-300 uppercase tracking-wider">{account.bankName}</p>
                                  </div>
                                  <p className="text-xs font-mono font-black text-white">{formatNumber(accBal)} <span className="text-[10px] text-zinc-500 uppercase">BS</span></p>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <div className="flex justify-between items-center mb-1">
                                      <span className="text-[8px] text-emerald-500/70 font-bold uppercase tracking-widest flex items-center gap-1">
                                        <ArrowUpRight className="w-2 h-2" /> Ingreso Ciclo
                                      </span>
                                      <span className="text-[10px] font-mono text-emerald-500">{formatNumber(cycleAccIn)}</span>
                                    </div>
                                    <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                                      <div 
                                        className="h-full bg-emerald-500/30 rounded-full" 
                                        style={{ width: `${cycleAccIn > 0 ? (cycleAccIn / (cycleAccIn + cycleAccOut || 1)) * 100 : 0}%` }}
                                      />
                                    </div>
                                  </div>
                                  <div>
                                    <div className="flex justify-between items-center mb-1">
                                      <span className="text-[8px] text-red-500/70 font-bold uppercase tracking-widest flex items-center gap-1">
                                        <ArrowDownRight className="w-2 h-2" /> Egreso Ciclo
                                      </span>
                                      <span className="text-[10px] font-mono text-red-400">{formatNumber(cycleAccOut)}</span>
                                    </div>
                                    <div className="h-1 bg-zinc-800 rounded-full overflow-hidden text-right">
                                      <div 
                                        className="h-full bg-red-400/30 rounded-full ml-auto" 
                                        style={{ width: `${cycleAccOut > 0 ? (cycleAccOut / (cycleAccIn + cycleAccOut || 1)) * 100 : 0}%` }}
                                      />
                                    </div>
                                  </div>
                                </div>
                                <div className="flex justify-between items-center mt-2 border-t border-white/[0.02] pt-2">
                                  <p className="text-[8px] text-zinc-600 font-mono">Cuenta: {account.accountNumber}</p>
                                  {(cycleAccIn > 0 || cycleAccOut > 0) && (
                                    <span className="text-[7px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded uppercase font-black tracking-tighter">
                                      Activo Hoy
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          
                          {branchBankAccounts.filter(acc => acc.branchId === branchMode).length === 0 && (
                            <p className="text-center text-[10px] text-zinc-500 italic py-4">No hay cuentas bancarias registradas</p>
                          )}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Moves List */}
                <div className="bg-zinc-900 rounded-[32px] border border-white/5 overflow-hidden flex flex-col h-[600px]">
                  <div className="p-6 border-b border-white/5 bg-zinc-900/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <h3 className="font-bold text-zinc-100 flex items-center gap-2">
                       <History className="w-4 h-4 text-amber-500" /> Movimientos Recientes
                    </h3>
                    <div className="relative group w-full md:w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 group-focus-within:text-amber-500 transition-colors" />
                      <input 
                        type="text"
                        placeholder="Buscar concepto o monto..."
                        value={cashMovesSearch}
                        onChange={e => {
                          setCashMovesSearch(e.target.value);
                          setCashMovesPage(1);
                        }}
                        className="w-full bg-zinc-950 text-white pl-9 pr-4 py-2 rounded-xl border border-white/5 focus:border-amber-500/50 focus:outline-none text-xs transition-all"
                      />
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left">
                      <thead className="sticky top-0 bg-zinc-900 z-10">
                        <tr className="text-[10px] text-zinc-500 uppercase font-bold border-b border-white/5 bg-zinc-900/50">
                          <th className="px-6 py-4">Fecha</th>
                          <th className="px-6 py-4">Concepto</th>
                          <th className="px-6 py-4 text-right">Monto</th>
                          <th className="px-6 py-4 text-center">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {paginatedCurrentCycleMoves.map(move => (
                          <tr key={move.id} className="hover:bg-white/[0.02] transition-colors group">
                            <td className="px-6 py-4">
                              <div className="text-xs text-zinc-300">{new Date(move.date).toLocaleDateString()}</div>
                              <div className="text-[10px] text-zinc-500 font-mono">{new Date(move.date).toLocaleTimeString()}</div>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-sm text-zinc-100 font-medium">{move.concept}</p>
                              {move.paymentType === 'transferencia' && move.bankAccountId && (
                                <p className="text-[10px] text-blue-400 font-bold uppercase tracking-tight flex items-center gap-1 mt-0.5">
                                  <Building2 className="w-3 h-3" />
                                  {branchBankAccounts.find(acc => acc.id === move.bankAccountId)?.bankName || 'Banco Desconocido'}
                                </p>
                              )}
                              <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-tighter">Por: {move.createdBy}</p>
                            </td>
                            <td className="px-6 py-4">
                              <span className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400 text-[9px] font-bold uppercase border border-white/5">
                                {move.category}
                              </span>
                            </td>
                            <td className={`px-6 py-4 text-right font-mono font-bold ${move.type === 'ingreso' ? 'text-emerald-500' : 'text-red-400'}`}>
                              {move.type === 'ingreso' ? '+' : '-'}{formatNumber(move.amount)} BS
                            </td>
                            <td className="px-6 py-4 text-center">
                              <button 
                                onClick={() => {
                                  setEditingCashMove(move);
                                  setCashMoveFormData({
                                    amount: move.amount,
                                    type: move.type as any,
                                    concept: move.concept,
                                    category: move.category as any,
                                    paymentType: move.paymentType as any,
                                    bankAccountId: move.bankAccountId,
                                    date: move.date
                                  });
                                  setShowEditCashMoveModal(true);
                                }}
                                className="p-2 text-zinc-500 hover:text-amber-500 hover:bg-amber-500/10 rounded-xl transition-all"
                                title="Editar Movimiento"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {paginatedCurrentCycleMoves.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-6 py-20 text-center text-zinc-600 italic text-xs">No se encontraron movimientos.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="p-4 border-t border-white/5 bg-zinc-900/30">
                    <Pagination 
                      totalItems={filteredCurrentCycleMoves.length}
                      currentPage={cashMovesPage}
                      onPageChange={setCashMovesPage}
                      itemsPerPage={ITEMS_PER_PAGE}
                    />
                  </div>
                </div>

                {/* Closures History */}
                <div className="bg-zinc-900 rounded-[32px] border border-white/5 overflow-hidden flex flex-col h-[600px]">
                  <div className="p-6 border-b border-white/5 bg-zinc-900/50 flex justify-between items-center">
                    <h3 className="font-bold text-zinc-100 flex items-center gap-2">
                       <Lock className="w-4 h-4 text-blue-500" /> Historial de Cierres
                    </h3>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                     <table className="w-full text-left">
                        <thead className="sticky top-0 bg-zinc-900 z-10">
                          <tr className="text-[10px] text-zinc-500 uppercase font-bold border-b border-white/5 bg-zinc-900/50">
                            <th className="px-6 py-4">Código / Fecha</th>
                            <th className="px-6 py-4">Saldos</th>
                            <th className="px-6 py-4">Responsable</th>
                            <th className="px-6 py-4 text-right">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                              {paginatedBranchClosures.map(closure => (
                            <tr key={closure.id} className="hover:bg-white/[0.02] transition-colors group">
                               <td className="px-6 py-4">
                                  <div className="text-xs font-mono font-bold text-amber-500">#{closure.id.slice(0, 8).toUpperCase()}</div>
                                  <div className="text-sm font-bold text-zinc-300 italic">{new Date(closure.closedAt || closure.date).toLocaleDateString()}</div>
                                  <div className="text-[10px] text-zinc-500 font-mono">{new Date(closure.closedAt || closure.date).toLocaleTimeString()}</div>
                               </td>
                               <td className="px-6 py-4 space-y-1">
                                  <div className="flex justify-between text-[10px]">
                                     <span className="text-zinc-500 font-bold uppercase">Inicial:</span>
                                     <span className="text-zinc-300 font-mono">{formatNumber(closure.initialBalance)}</span>
                                  </div>
                                  <div className="flex justify-between text-[10px]">
                                     <span className="text-zinc-500 font-bold uppercase">Final:</span>
                                     <span className="text-white font-mono font-bold underline decoration-blue-500/30">{formatNumber(closure.finalBalance)}</span>
                                  </div>
                               </td>
                               <td className="px-6 py-4">
                                  <span className="text-xs font-bold text-zinc-400 uppercase italic tracking-tighter">{closure.createdBy}</span>
                                </td>
                                <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                                  <button 
                                    onClick={() => handleViewClosure(closure)}
                                    className="inline-flex items-center gap-1 bg-zinc-800 text-zinc-100 hover:bg-zinc-700 hover:text-white px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-colors"
                                    title="Ver Datos"
                                  >
                                    <Eye className="w-3.5 h-3.5 text-blue-400" /> Ver Datos
                                  </button>
                                  <button 
                                    onClick={() => handlePrintClosureReceipt(closure)}
                                    className="inline-flex items-center gap-1 bg-zinc-800 text-zinc-100 hover:bg-zinc-700 hover:text-white px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-colors"
                                    title="Ver PDF"
                                  >
                                    <FileText className="w-3.5 h-3.5 text-emerald-400" /> Ver PDF
                                  </button>
                                </td>
                             </tr>
                           ))}
                           {paginatedBranchClosures.length === 0 && (
                             <tr>
                               <td colSpan={4} className="px-6 py-20 text-center text-zinc-600 italic text-xs">No hay cierres registrados.</td>
                             </tr>
                           )}
                         </tbody>
                      </table>
                  </div>
                  <div className="p-4 border-t border-white/5 bg-zinc-900/30">
                    <Pagination 
                      totalItems={branchClosures.filter(c => c.branchId === branchMode).length}
                      currentPage={closuresPage}
                      onPageChange={setClosuresPage}
                      itemsPerPage={ITEMS_PER_PAGE}
                    />
                  </div>
                </div>
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
                  <h2 className="text-xl font-bold text-zinc-100 uppercase tracking-tighter italic">Registro de Compras</h2>
                  <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 group-focus-within:text-amber-500 transition-colors" />
                    <input 
                      type="text"
                      placeholder="Buscar por recibo o cliente..."
                      value={purchaseHistorySearch}
                      onChange={e => {
                        setPurchaseHistorySearch(e.target.value);
                        setPurchaseHistoryPage(1);
                      }}
                      className="bg-zinc-950 text-white pl-9 pr-4 py-2 rounded-xl border border-white/5 focus:border-amber-500/50 focus:outline-none w-[250px] text-[10px] uppercase font-bold transition-all shadow-inner"
                    />
                  </div>
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
                      commission: 0,
                      advancePayment: 0,
                      advancePaymentType: 'efectivo',
                      advanceCashAmount: 0,
                      advanceBankAmount: 0,
                      advanceSourceBankAccountId: '',
                      advanceClientBank: '',
                      advanceClientAccountNumber: '',
                      isFullPayment: false
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
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full min-w-[1200px]">
                  <thead>
                    <tr className="text-[10px] text-zinc-500 uppercase font-bold border-b border-white/5">
                      <th className="px-6 py-4 text-left">Recibo</th>
                      <th className="px-6 py-4 text-left">Cliente</th>
                      <th className="px-6 py-4 text-left">Items</th>
                      <th className="px-6 py-4 text-left">Tipo</th>
                      <th className="px-6 py-4 text-left">Adelanto</th>
                      <th className="px-6 py-4 text-left">Total BS</th>
                      <th className="px-6 py-4 text-left">Fecha</th>
                      <th className="px-6 py-4 text-left">Operador</th>
                      <th className="px-6 py-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {paginatedPurchaseHistory.map(p => {
                      const isExpanded = expandedPurchases.includes(p.id);
                      const hasOpeningDetails = p.type === 'cerrado' && p.closedAt && p.closeMarketPrice && p.closeMarketPrice > 0;
                      const hasAdvances = (p.advances && p.advances.length > 0);
                      const isDirectClosed = p.type === 'cerrado' && (!p.closeMarketPrice || p.closeMarketPrice === 0);
                      const canExpand = hasOpeningDetails || hasAdvances;

                      // Deadline calculation for open purchases
                      let daysRemaining = null;
                      let isDeadlineNear = false;
                      let isDeadlineExceeded = false;

                      if (p.type === 'abierto') {
                        const deadline = new Date(p.createdAt);
                        deadline.setDate(deadline.getDate() + 15);
                        const now = new Date();
                        const diffTime = deadline.getTime() - now.getTime();
                        daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        isDeadlineNear = daysRemaining <= 5 && daysRemaining > 0;
                        isDeadlineExceeded = daysRemaining <= 0;
                      }
                      
                      return (
                        <React.Fragment key={p.id}>
                          <tr 
                            className={`group hover:bg-white/[0.02] transition-colors ${canExpand ? 'cursor-pointer' : ''}`}
                            onClick={() => canExpand && setExpandedPurchases(prev => prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id])}
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                {canExpand && (
                                  <div className="text-zinc-600">
                                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                  </div>
                                )}
                                <div>
                                  <p className="text-sm font-mono font-bold text-amber-500">#{p.receiptNumber}</p>
                                  {hasOpeningDetails && (
                                    <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-tight">Cierre (Expandible)</p>
                                  )}
                                  {!hasOpeningDetails && hasAdvances && (
                                    <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-tight">Adelantos (Expandible)</p>
                                  )}
                                  {p.closureId && (
                                    <div className="mt-1 flex items-center gap-1">
                                      <span className="text-[8px] bg-blue-500/10 text-blue-400 border border-blue-500/15 px-1.5 py-0.5 rounded font-mono font-bold uppercase tracking-widest">
                                        CIERRE: {p.closureId.slice(0, 8).toUpperCase()}
                                      </span>
                                    </div>
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
                                <span className="text-[10px] text-blue-500/70 font-mono font-bold">
                                  {formatNumber(p.items?.reduce((acc: number, curr: any) => acc + (curr.material100 || 0), 0) || 0, 3)}g fino
                                </span>
                                {p.items?.some((i: any) => i.isTransferred) && (
                                  <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[8px] font-bold uppercase flex items-center gap-1">
                                    <Truck className="w-2 h-2" /> Transferido
                                  </span>
                                )}
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

                                {/* Deadline Tracker */}
                                {p.type === 'abierto' && daysRemaining !== null && (
                                  <span className={`px-2 py-0.5 rounded-md text-[8px] font-bold uppercase border w-fit flex items-center gap-1 ${
                                    isDeadlineExceeded 
                                      ? 'bg-red-500/20 text-red-500 border-red-500/40 animate-pulse' 
                                      : isDeadlineNear 
                                        ? 'bg-orange-500/20 text-orange-500 border-orange-500/40' 
                                        : 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'
                                  }`}>
                                    <Clock className="w-2 h-2" />
                                    {isDeadlineExceeded 
                                      ? `VENCIDO (${Math.abs(daysRemaining)} DÍAS)` 
                                      : `FALTAN ${daysRemaining} DÍAS`
                                    }
                                  </span>
                                )}

                                {p.advancePayment > 0 && p.type === 'abierto' && (
                                  <span className="px-2 py-0.5 bg-amber-500/10 text-amber-500 text-[8px] font-bold uppercase rounded-md border border-amber-500/20 w-fit">
                                    Adelanto entregado
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-sm font-mono font-bold text-amber-500">
                                {formatNumber(p.type === 'cerrado' && p.closedAt ? 0 : 
                                  ((p.advancePayment || 0) + (p.advances?.reduce((sum, a) => sum + a.amount, 0) || 0))
                                )} BS
                              </p>
                              {p.advances && p.advances.length > 0 && (
                                <p className="text-[8px] text-zinc-500 font-bold uppercase tracking-tight">
                                  {p.advances.length} adelanto(s) extra
                                </p>
                              )}
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

                                <button 
                                  onClick={() => sendWhatsAppReceipt(p)}
                                  className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl hover:bg-emerald-500 hover:text-white transition-all border border-emerald-500/20"
                                  title="Enviar comprobante por WhatsApp"
                                >
                                  <MessageCircle className="w-4 h-4" />
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
                                      setCurrentPurchaseForAdvance(p);
                                      setEditingAdvanceId(null);
                                      setAdvanceFormData({
                                        amount: 0,
                                        concept: `Adelanto de la compra #${p.receiptNumber}`,
                                        paymentType: 'efectivo',
                                        cashAmount: 0,
                                        bankAmount: 0,
                                        sourceBankAccountId: '',
                                        clientBank: '',
                                        clientAccountNumber: '',
                                        date: new Date().toISOString().split('T')[0]
                                      });
                                      setShowAdvanceModal(true);
                                    }}
                                    className="p-2 bg-blue-500/10 text-blue-500 rounded-xl hover:bg-blue-500 hover:text-white transition-all border border-blue-500/20"
                                    title="Registrar Adelanto"
                                  >
                                    <CornerDownRight className="w-4 h-4" />
                                  </button>
                                )}
                                
                                {p.type === 'abierto' && (
                                  <button 
                                    onClick={() => {
                                      setClosingPurchase(p);
                                      const firstItem = p.items?.[0];
                                      setCloseMarketPrice(firstItem?.marketPrice || 0);
                                      setCloseUsdToBs(firstItem?.usdToBs || 6.96);
                                      setClosePaymentType('efectivo');
                                      setCloseCashAmount(0);
                                      setCloseBankAmount(0);
                                      setCloseSourceBankAccountId('');
                                      setCloseClientBank('');
                                      setCloseClientAccountNumber('');
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
                            {isExpanded && canExpand && (
                              <motion.tr 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="bg-zinc-950/50"
                              >
                                <td colSpan={10} className="px-6 py-4">
                                  <div className="pl-10 border-l-2 border-amber-500/30 py-4 space-y-6">
                                    {(hasOpeningDetails || p.type === 'abierto' || isDirectClosed) && (
                                      <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                          <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                            {isDirectClosed ? "Información de Compra Directa (100%)" : "Información General"}
                                          </h4>
                                          {!isDirectClosed && (
                                            <button 
                                              onClick={() => handlePrintPurchaseReceipt(p, 'abierto')}
                                              className="px-3 py-1 bg-zinc-800 text-zinc-300 rounded-lg text-[10px] font-bold hover:bg-zinc-700 transition-all flex items-center gap-2"
                                            >
                                              <Printer className="w-3 h-3" /> Imprimir Origen
                                            </button>
                                          )}
                                        </div>

                                        <div className="grid grid-cols-5 gap-4">
                                          {isDirectClosed ? (
                                            <>
                                              <div className="bg-zinc-900/50 p-3 rounded-xl border border-white/5">
                                                <p className="text-[8px] text-zinc-500 uppercase font-bold mb-1 col-span-1 md:col-span-1">Método de Pago</p>
                                                <p className="text-xs font-bold text-zinc-100 uppercase">
                                                  {p.advancePaymentType === 'transferencia' ? '🏦 Transferencia' : 
                                                   p.advancePaymentType === 'mixto' ? '⚖️ Mixto' : '💵 Efectivo'}
                                                </p>
                                              </div>
                                              <div className="bg-zinc-900/50 p-3 rounded-xl border border-white/5">
                                                <p className="text-[8px] text-zinc-500 uppercase font-bold mb-1">Monto Pagado</p>
                                                <p className="text-sm font-mono font-bold text-amber-500">{formatNumber(p.total)} BS</p>
                                              </div>
                                              <div className="bg-zinc-900/50 p-3 rounded-xl border border-white/5">
                                                <p className="text-[8px] text-zinc-500 uppercase font-bold mb-1">Fecha Registro</p>
                                                <p className="text-[10px] font-mono text-zinc-400">{new Date(p.createdAt).toLocaleString()}</p>
                                              </div>
                                              <div className="bg-zinc-900/50 p-3 rounded-xl border border-white/5">
                                                <p className="text-[8px] text-zinc-500 uppercase font-bold mb-1">Operador</p>
                                                <p className="text-[10px] font-bold text-zinc-400 uppercase">
                                                  {systemUsers.find(u => u.id === p.createdBy || u.username === p.createdBy || u.email === p.createdBy)?.name || p.createdBy || 'Sistema'}
                                                </p>
                                              </div>
                                              <div className="bg-zinc-900/50 p-3 rounded-xl border border-white/5 border-emerald-500/10">
                                                <p className="text-[8px] text-emerald-500 uppercase font-bold mb-1">Estado</p>
                                                <p className="text-sm font-mono font-bold text-emerald-500">
                                                  CERRADO 100%
                                                </p>
                                              </div>
                                            </>
                                          ) : (
                                            <>
                                              <div className="bg-zinc-900/50 p-3 rounded-xl border border-white/5">
                                                <p className="text-[8px] text-zinc-500 uppercase font-bold mb-1">Monto al 90% (Ref)</p>
                                                <p className="text-sm font-mono font-bold text-zinc-100">{formatNumber(p.total)} BS</p>
                                              </div>
                                              <div className="bg-zinc-900/50 p-3 rounded-xl border border-white/5">
                                                <p className="text-[8px] text-zinc-500 uppercase font-bold mb-1">Primer Adelanto</p>
                                                <p className="text-sm font-mono font-bold text-amber-500">{formatNumber(p.advancePayment || 0)} BS</p>
                                              </div>
                                              <div className="bg-zinc-900/50 p-3 rounded-xl border border-white/5">
                                                <p className="text-[8px] text-zinc-500 uppercase font-bold mb-1">Fecha Registro</p>
                                                <p className="text-[10px] font-mono text-zinc-400">{new Date(p.createdAt).toLocaleString()}</p>
                                              </div>
                                              <div className="bg-zinc-900/50 p-3 rounded-xl border border-white/5">
                                                <p className="text-[8px] text-zinc-500 uppercase font-bold mb-1">Operador</p>
                                                <p className="text-[10px] font-bold text-zinc-400 uppercase">{systemUsers.find(u => u.id === p.createdBy || u.username === p.createdBy || u.email === p.createdBy)?.name || p.createdBy}</p>
                                              </div>
                                              <div className="bg-zinc-900/50 p-3 rounded-xl border border-white/5 border-emerald-500/10">
                                                <p className="text-[8px] text-emerald-500 uppercase font-bold mb-1">{p.type === 'cerrado' ? 'Total Liquidado' : 'Total BS (90%)'}</p>
                                                <p className="text-sm font-mono font-bold text-emerald-500">
                                                  {formatNumber(p.type === 'cerrado' ? p.closeTotal || p.total : p.total || p.items?.reduce((acc: number, curr: any) => acc + (curr.total || 0), 0) || 0)} BS
                                                </p>
                                              </div>
                                            </>
                                          )}
                                        </div>

                                        {isDirectClosed && (p.advancePaymentType === 'transferencia' || p.advancePaymentType === 'mixto') && (
                                          <div className="bg-blue-600/5 p-4 rounded-2xl border border-blue-500/10">
                                            <p className="text-[10px] font-bold uppercase text-blue-500 mb-2">
                                              Detalles de Pago Bancario/Mixto (100% Directo)
                                            </p>
                                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                                              {p.advancePaymentType === 'mixto' && (
                                                <>
                                                  <div>
                                                    <p className="text-[8px] text-zinc-500 uppercase font-bold text-amber-500">Monto Efectivo</p>
                                                    <p className="text-xs text-zinc-100 font-bold">{formatNumber(p.advanceCashAmount || 0)} BS</p>
                                                  </div>
                                                  <div>
                                                    <p className="text-[8px] text-zinc-500 uppercase font-bold text-blue-500">Monto Banco</p>
                                                    <p className="text-xs text-zinc-100 font-bold">{formatNumber(p.advanceBankAmount || 0)} BS</p>
                                                  </div>
                                                </>
                                              )}
                                              <div>
                                                <p className="text-[8px] text-zinc-500 uppercase font-bold">Banco Origen (Nuestro)</p>
                                                <p className="text-xs text-zinc-100 font-bold">
                                                  {branchBankAccounts.find(acc => acc.id === p.advanceSourceBankAccountId)?.bankName || 'Banco Sucursal'}
                                                </p>
                                              </div>
                                              <div>
                                                <p className="text-[8px] text-zinc-500 uppercase font-bold">Banco Cliente</p>
                                                <p className="text-xs text-zinc-100 font-bold">{p.advanceClientBank || '-'}</p>
                                              </div>
                                              <div>
                                                <p className="text-[8px] text-zinc-500 uppercase font-bold">Cuenta Cliente</p>
                                                <p className="text-xs text-zinc-100 font-bold">{p.advanceClientAccountNumber || '-'}</p>
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {hasAdvances && (
                                      <div className="space-y-3">
                                        <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                          <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                          Historial de Adelantos Extras
                                        </h4>
                                        <div className="grid grid-cols-1 gap-2">
                                          {p.advances?.map((adv: AdvancePayment) => (
                                            <div key={adv.id} className="flex items-center justify-between p-3 bg-zinc-900/40 rounded-xl border border-white/5 hover:border-amber-500/20 transition-all">
                                              <div className="flex items-center gap-4">
                                                <div className="w-8 h-8 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold text-[10px]">
                                                  {adv.paymentType === 'efectivo' ? 'EF' : (adv.paymentType === 'transferencia' ? 'TR' : 'MX')}
                                                </div>
                                                <div>
                                                  <p className="text-[10px] font-bold text-zinc-100">{adv.concept}</p>
                                                  <p className="text-[8px] text-zinc-500 uppercase font-bold">{new Date(adv.date).toLocaleDateString()} - Por: {adv.createdBy}</p>
                                                </div>
                                              </div>
                                              <div className="flex items-center gap-2">
                                                <p className="text-xs font-mono font-bold text-amber-500">+{formatNumber(adv.amount)} BS</p>
                                                {p.type === 'abierto' && (
                                                  <button 
                                                    onClick={() => {
                                                      setCurrentPurchaseForAdvance(p);
                                                      setEditingAdvanceId(adv.id);
                                                      setAdvanceFormData({
                                                        amount: adv.amount,
                                                        concept: adv.concept,
                                                        paymentType: adv.paymentType,
                                                        cashAmount: adv.cashAmount || 0,
                                                        bankAmount: adv.bankAmount || 0,
                                                        sourceBankAccountId: adv.sourceBankAccountId || '',
                                                        clientBank: adv.clientBank || '',
                                                        clientAccountNumber: adv.clientAccountNumber || '',
                                                        date: adv.date
                                                      });
                                                      setShowAdvanceModal(true);
                                                    }}
                                                    className="p-1.5 bg-zinc-800 text-zinc-400 rounded-lg hover:text-blue-400 transition-all"
                                                    title="Editar Adelanto"
                                                  >
                                                    <Pencil className="w-3.5 h-3.5" />
                                                  </button>
                                                )}
                                                <button 
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handlePrintAdvanceReceipt(p, adv);
                                                  }}
                                                  className="p-1.5 bg-zinc-800 text-zinc-400 rounded-lg hover:text-zinc-200 transition-all"
                                                  title="Imprimir"
                                                >
                                                  <Printer className="w-3.5 h-3.5" />
                                                </button>
                                              </div>
                                            </div>
                                          ))}
                                          <div className="flex justify-end items-center gap-6 pt-2 border-t border-white/5">
                                            <p className="text-[10px] font-bold text-zinc-400 uppercase">
                                              Total Adelantos: <span className="text-amber-500 ml-2">{formatNumber((p.advancePayment || 0) + (p.advances?.reduce((sum, a) => sum + a.amount, 0) || 0))} BS</span>
                                            </p>
                                            {p.type === 'abierto' && (
                                              <p className="text-[10px] font-bold text-zinc-400 uppercase">
                                                Saldo Pendiente: <span className="text-red-500 ml-2">
                                                  {formatNumber(
                                                    (p.type === 'cerrado' ? p.closeTotal || p.total : p.total || p.items?.reduce((acc: number, curr: any) => acc + (curr.total || 0), 0) || 0) - 
                                                    ((p.advancePayment || 0) + (p.advances?.reduce((sum, a) => sum + a.amount, 0) || 0))
                                                  )} BS
                                                </span>
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    )}
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
              </div>

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
              className="max-w-3xl mx-auto"
            >
              <div className="bg-zinc-900 p-8 rounded-3xl border border-white/5 shadow-sm">
                
                {/* Header SubTabs Switcher */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 border-b border-white/5 pb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                      {settingsSubTab === 'company' ? (
                        <Building2 className="w-6 h-6" />
                      ) : (
                        <Database className="w-6 h-6" />
                      )}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-zinc-100">
                        {settingsSubTab === 'company' ? 'Configuración de Empresa' : 'Administrar Base de Datos'}
                      </h2>
                      <p className="text-sm text-zinc-400">
                        {settingsSubTab === 'company' 
                          ? 'Estos datos aparecerán en los reportes y el encabezado.' 
                          : 'Configuración de conexión, copias de seguridad de SQLite/MySQL y operaciones de limpieza.'}
                      </p>
                    </div>
                  </div>

                  {/* Navigation Tabs */}
                  <div className="flex bg-zinc-950 p-1.5 rounded-2xl border border-white/5 gap-1 self-start sm:self-auto">
                    <button
                      onClick={() => setSettingsSubTab('company')}
                      className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                        settingsSubTab === 'company'
                          ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.02] border border-transparent'
                      }`}
                    >
                      Empresa
                    </button>
                    <button
                      onClick={() => setSettingsSubTab('database')}
                      className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                        settingsSubTab === 'database'
                          ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.02] border border-transparent'
                      }`}
                    >
                      <span>Bases de Datos</span>
                      {isDbUnlocked ? (
                        <LockOpen className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Lock className="w-3.5 h-3.5 text-zinc-500" />
                      )}
                    </button>
                  </div>
                </div>

                {settingsSubTab === 'company' && (
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
                )}

                {settingsSubTab === 'database' && !isDbUnlocked && (
                  <div className="max-w-md mx-auto py-10 px-4 flex flex-col items-center text-center space-y-6">
                    <div className="w-16 h-16 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20 shadow-inner">
                      <Lock className="w-8 h-8" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-lg font-bold text-zinc-100">Sección Protegida</h3>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        Esta sección contiene configuraciones de infraestructura de datos. Por favor, introduzca la contraseña de seguridad para continuar.
                      </p>
                    </div>

                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (dbAccessPasswordInput === 'bakuman123') {
                          setIsDbUnlocked(true);
                          setDbPasswordError(false);
                          setDbAccessPasswordInput('');
                          fetchDatabaseStats();
                        } else {
                          setDbPasswordError(true);
                          setDbAccessPasswordInput('');
                        }
                      }} 
                      className="w-full space-y-4"
                    >
                      <div className="space-y-1.5 text-left">
                        <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider">Contraseña de Acceso</label>
                        <div className="relative">
                          <input 
                            type="password"
                            required
                            autoFocus
                            value={dbAccessPasswordInput}
                            onChange={(e) => {
                              setDbAccessPasswordInput(e.target.value);
                              if (dbPasswordError) setDbPasswordError(false);
                            }}
                            placeholder="••••••••••••"
                            className={`w-full p-3 bg-zinc-950 rounded-xl border text-sm text-zinc-100 font-mono focus:outline-none focus:ring-2 ${
                              dbPasswordError 
                                ? 'border-rose-500/50 focus:ring-rose-500/20' 
                                : 'border-white/5 focus:ring-indigo-500/20'
                            }`}
                          />
                        </div>
                        {dbPasswordError && (
                          <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1.5 font-medium">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Contraseña incorrecta. Inténtelo de nuevo.
                          </p>
                        )}
                      </div>

                      <button
                        type="submit"
                        className="w-full py-3 bg-indigo-500 hover:bg-slate-600 text-white rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2"
                      >
                        <LockOpen className="w-4 h-4" /> Desbloquear Acceso
                      </button>
                    </form>
                  </div>
                )}

                {settingsSubTab === 'database' && isDbUnlocked && (
                  <div className="space-y-8">
                    
                    {/* Database Engine Settings */}
                    <form onSubmit={handleSaveDatabaseConfig} className="space-y-6">
                      <div className="space-y-4 bg-zinc-950/40 p-6 rounded-2xl border border-white/5">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2">
                            <Database className="w-4 h-4 text-indigo-400" /> Motor Activo de Base de Datos
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setIsDbUnlocked(false);
                              setSettingsSubTab('company');
                            }}
                            className="px-2.5 py-1 bg-zinc-900 border border-white/5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all"
                            title="Volver a bloquear sección"
                          >
                            <Lock className="w-3 h-3 text-zinc-500" />
                            Bloquear Acceso
                          </button>
                        </h3>
                        <div className="flex flex-col sm:flex-row gap-4">
                          <label className="flex-1 flex items-center gap-3 p-4 bg-zinc-950 rounded-xl border border-white/5 cursor-pointer hover:bg-white/[0.02] transition-colors">
                            <input 
                              type="radio" 
                              name="db_type" 
                              checked={dbConfig.type === 'sqlite'} 
                              onChange={() => setDbConfig(prev => ({ ...prev, type: 'sqlite' }))}
                              className="text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                            />
                            <div>
                              <p className="text-xs font-bold text-zinc-200">SQLite (Por Defecto / Local)</p>
                              <p className="text-[10px] text-zinc-500">Usa archivo embebido local rápido sin servidor.</p>
                            </div>
                          </label>
                          <label className="flex-1 flex items-center gap-3 p-4 bg-zinc-950 rounded-xl border border-white/5 cursor-pointer hover:bg-white/[0.02] transition-colors">
                            <input 
                              type="radio" 
                              name="db_type" 
                              checked={dbConfig.type === 'mysql'} 
                              onChange={() => setDbConfig(prev => ({ ...prev, type: 'mysql' }))}
                              className="text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                            />
                            <div>
                              <p className="text-xs font-bold text-zinc-200">MySQL / MariaDB</p>
                              <p className="text-[10px] text-zinc-500">Conecte a una base de datos distribuida/en la nube.</p>
                            </div>
                          </label>
                        </div>

                        {dbConfig.type === 'sqlite' ? (
                          <div className="space-y-2 pt-2 border-t border-white/5">
                            <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider">Ruta del archivo SQLite</label>
                            <input 
                              type="text" 
                              value={dbConfig.sqlite?.path || 'database.sqlite'} 
                              onChange={e => setDbConfig(prev => ({ ...prev, sqlite: { ...prev.sqlite, path: e.target.value } }))}
                              className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-xs text-zinc-100 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            />
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-white/5">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider">Servidor (Host)</label>
                              <input 
                                type="text"
                                required
                                value={dbConfig.mysql?.host || ''} 
                                onChange={e => setDbConfig(prev => ({ ...prev, mysql: { ...prev.mysql, host: e.target.value } }))}
                                className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-xs text-zinc-100 font-mono focus:outline-none"
                                placeholder="localhost o IP del host"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider">Puerto</label>
                              <input 
                                type="number"
                                required
                                value={dbConfig.mysql?.port || ''} 
                                onChange={e => setDbConfig(prev => ({ ...prev, mysql: { ...prev.mysql, port: Number(e.target.value) } }))}
                                className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-xs text-zinc-100 font-mono focus:outline-none"
                                placeholder="3306"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider">Usuario (User)</label>
                              <input 
                                type="text"
                                required
                                value={dbConfig.mysql?.user || ''} 
                                onChange={e => setDbConfig(prev => ({ ...prev, mysql: { ...prev.mysql, user: e.target.value } }))}
                                className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-xs text-zinc-100 font-mono focus:outline-none"
                                placeholder="root"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider">Contraseña</label>
                              <input 
                                type="password" 
                                value={dbConfig.mysql?.password || ''} 
                                onChange={e => setDbConfig(prev => ({ ...prev, mysql: { ...prev.mysql, password: e.target.value } }))}
                                className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-xs text-zinc-100 font-mono focus:outline-none"
                                placeholder="(Venta o blanco)"
                              />
                            </div>
                            <div className="space-y-1 sm:col-span-2">
                              <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider">Nombre de Base de Datos (Database Name)</label>
                              <input 
                                type="text"
                                required
                                value={dbConfig.mysql?.database || ''} 
                                onChange={e => setDbConfig(prev => ({ ...prev, mysql: { ...prev.mysql, database: e.target.value } }))}
                                className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-xs text-zinc-100 font-mono focus:outline-none"
                                placeholder="llaqta_gold"
                              />
                            </div>
                          </div>
                        )}

                        {/* Test Connection Display */}
                        {dbTestResult && (
                          <div className={`p-4 rounded-xl border text-xs flex items-center gap-3 ${
                            dbTestResult.success 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                          }`}>
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <div>
                              <p className="font-bold">{dbTestResult.success ? 'Conexión Exitosa' : 'Fallo en la Conexión'}</p>
                              <p className="opacity-80">{dbTestResult.message}</p>
                            </div>
                          </div>
                        )}

                        {/* Action buttons inside config box */}
                        <div className="flex flex-wrap gap-2 pt-2 justify-end">
                          <button
                            type="button"
                            disabled={isTestingDbConnection}
                            onClick={handleTestDatabaseConnection}
                            className="px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 rounded-xl text-xs font-bold transition-all border border-white/5 flex items-center gap-2"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isTestingDbConnection ? 'animate-spin' : ''}`} />
                            {isTestingDbConnection ? 'Probando...' : 'Probar Conexión'}
                          </button>
                          <button
                            type="submit"
                            disabled={isSavingDbConfig}
                            className="px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-500/10 transition-all flex items-center gap-2"
                          >
                            <Save className="w-3.5 h-3.5" />
                            {isSavingDbConfig ? 'Guardando...' : 'Aplicar Configuración'}
                          </button>
                        </div>
                        <p className="text-[10px] text-zinc-500 italic mt-1">
                          Nota: Al aplicar la configuración, se escribirá la elección en db-config.json. Se recomienda reiniciar la aplicación si cambia de base de datos para levantar el pool de conexiones de forma segura.
                        </p>
                      </div>
                    </form>

                    {/* DATABASE MONITOR AND MIGRATION PANEL */}
                    <div className="space-y-6 bg-zinc-950/40 p-6 rounded-2xl border border-white/5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                            <Coins className="w-4 h-4 text-indigo-400" /> Monitoreo de Registros y Migración Activa
                          </h3>
                          <p className="text-[11px] text-zinc-500 mt-0.5">
                            Compare el recuento de registros guardados en SQLite vs MySQL y migre la información entre ambos motores en tiempo real.
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={isFetchingDbStats}
                          onClick={fetchDatabaseStats}
                          className="self-start sm:self-auto px-3 py-1.5 bg-zinc-900 border border-white/5 hover:bg-zinc-800 text-zinc-300 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isFetchingDbStats ? 'animate-spin' : ''}`} />
                          {isFetchingDbStats ? 'Actualizando...' : 'Actualizar Conteos'}
                        </button>
                      </div>

                      {/* STATS MATRIX TABLE */}
                      {dbStatsMysqlError && (
                        <div className="p-3.5 bg-rose-500/10 border border-rose-500/25 text-rose-400 rounded-xl text-xs flex items-start gap-2.5">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold block">⚠️ Estado de Conexión MySQL: Desconectado o Inalcanzable</span>
                            <p className="opacity-90 mt-0.5 font-mono text-[11px] bg-black/25 p-1.5 rounded border border-white/5 mt-1">{dbStatsMysqlError}</p>
                            <span className="text-[10px] text-zinc-500 block mt-1.5">
                              Llaqta Gold continúa funcionando correctamente en modo local usando SQLite. El contador de MySQL muestra 0 registros debido a que no responde a la prueba de conexión (Timeout o Credenciales pendientes).
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="overflow-hidden border border-white/5 rounded-xl bg-zinc-950/60 shadow-inner">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-zinc-950/90 text-zinc-400 text-[10px] font-bold uppercase tracking-wider border-b border-white/5">
                              <th className="p-4">Tabla del Sistema</th>
                              <th className="p-4 text-center">Registros SQLite</th>
                              <th className="p-4 text-center">Registros MySQL</th>
                              <th className="p-4 text-center">Diferencia</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5 text-xs">
                            {dbStats ? (
                              Object.entries(dbStats).map(([table, rawCounts]) => {
                                const counts = rawCounts as { sqlite: number; mysql: number };
                                const diff = Math.abs(counts.sqlite - counts.mysql);
                                const isSynched = diff === 0;
                                const tableLabels: Record<string, string> = {
                                  companySettings: "Configuración de la Empresa",
                                  branches: "Sucursales",
                                  users: "Usuarios del Sistema",
                                  clients: "Clientes",
                                  branchBankAccounts: "Cuentas Bancarias",
                                  referrers: "Recomendantes/Socios",
                                  referrerPayouts: "Pagos a Recomendantes",
                                  materials: "Materiales Registrados",
                                  smeltingOperations: "Operaciones de Fundición",
                                  exportOperations: "Operaciones de Exportación",
                                  goldPurchases: "Compras de Oro",
                                  goldPurchaseItems: "Detalles de Compra (Items)",
                                  branchCashMoves: "Movimientos de Caja",
                                  branchClosures: "Cierres Diarios de Caja",
                                  goldTransfers: "Transferencias en Tránsito"
                                };
                                return (
                                  <tr key={table} className="hover:bg-white/[0.01] transition-colors">
                                    <td className="p-4 font-medium text-zinc-300">
                                      {tableLabels[table] || table}
                                      <span className="block font-mono text-[9px] text-zinc-500">{table}</span>
                                    </td>
                                    <td className="p-4 text-center font-mono text-zinc-200">
                                      {counts.sqlite}
                                    </td>
                                    <td className="p-4 text-center font-mono text-zinc-200">
                                      {counts.mysql}
                                    </td>
                                    <td className="p-4 text-center">
                                      {isSynched ? (
                                        <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[9px] font-bold rounded-full">
                                          Sincronizado
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 text-[9px] font-bold rounded-full">
                                          +{diff} desajuste
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })
                            ) : (
                              <tr>
                                <td colSpan={4} className="p-8 text-center text-zinc-500 text-xs">
                                  {isFetchingDbStats ? 'Cargando estadísticas de BD...' : 'Debe desbloquear la sección o hacer clic en "Actualizar Conteos" para ver el estado de las tablas.'}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* MIGRATION WIZARD CONTROLS */}
                      <div className="p-5 bg-indigo-500/5 rounded-xl border border-indigo-500/10 space-y-4">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                          <div>
                            <h4 className="text-xs font-bold text-indigo-300">Asistente de Migración de Base de Datos</h4>
                            <p className="text-[11px] text-zinc-400 leading-relaxed mt-0.5">
                              Esta herramienta le permite clonar de manera segura todas las filas que tiene en una base de datos hacia la otra. Esto es sumamente útil al dar de alta una nueva base de datos en MySQL y querer subir todo el historial acumulado en SQLite.
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                          {/* Opción A: SQLite -> MySQL */}
                          <div className="p-4 bg-zinc-950/60 rounded-xl border border-white/5 space-y-3 flex flex-col justify-between">
                            <div>
                              <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-400 px-2 py-0.5 bg-indigo-500/10 rounded-md">
                                Caso más común En Llaqta Gold
                              </span>
                              <h5 className="text-xs font-bold text-zinc-200 mt-2">Migrar SQLite ➡️ MySQL</h5>
                              <p className="text-[10px] text-zinc-400 leading-snug mt-1">
                                Envía todos los registros creados localmente en el archivo SQLite hacia el servidor MySQL configurado.
                              </p>
                            </div>
                            <div className="space-y-2 pt-2">
                              <button
                                type="button"
                                disabled={isPerformingMigration || isFetchingDbStats}
                                onClick={() => handlePerformMigration('sqlite', 'mysql', true)}
                                className="w-full py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-500/20 disabled:text-indigo-400 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                {isPerformingMigration ? 'Migrando...' : 'Iniciar Copia Limpia (Wipe)'}
                              </button>
                              <button
                                type="button"
                                disabled={isPerformingMigration || isFetchingDbStats}
                                onClick={() => handlePerformMigration('sqlite', 'mysql', false)}
                                className="w-full py-2 bg-zinc-950 hover:bg-zinc-900 border border-white/5 text-zinc-300 disabled:text-zinc-600 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                                title="Migra sin borrar los registros previamente existentes de la base de datos destino."
                              >
                                Copiar Solo Faltantes (Merge)
                              </button>
                            </div>
                          </div>

                          {/* Opción B: MySQL -> SQLite */}
                          <div className="p-4 bg-zinc-950/60 rounded-xl border border-white/5 space-y-3 flex flex-col justify-between">
                            <div>
                              <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 px-2 py-0.5 bg-zinc-100/5 rounded-md">
                                Caso de respaldo
                              </span>
                              <h5 className="text-xs font-bold text-zinc-200 mt-2">Migrar MySQL ➡️ SQLite</h5>
                              <p className="text-[10px] text-zinc-400 leading-snug mt-1">
                                Descarga todos los registros del servidor remoto MySQL y los escribe en su copia SQLite local.
                              </p>
                            </div>
                            <div className="space-y-2 pt-2">
                              <button
                                type="button"
                                disabled={isPerformingMigration || isFetchingDbStats}
                                onClick={() => handlePerformMigration('mysql', 'sqlite', true)}
                                className="w-full py-2 bg-zinc-805 hover:bg-zinc-700 text-zinc-200 disabled:text-zinc-600 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                {isPerformingMigration ? 'Migrando...' : 'Descargar Copia Limpia'}
                              </button>
                              <button
                                type="button"
                                disabled={isPerformingMigration || isFetchingDbStats}
                                onClick={() => handlePerformMigration('mysql', 'sqlite', false)}
                                className="w-full py-2 bg-zinc-950 hover:bg-zinc-900 border border-white/5 text-zinc-300 disabled:text-zinc-600 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                Descargar Solo Faltantes
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Migration Results Box */}
                        {migrationResult && (
                          <div className={`p-4 rounded-xl border text-xs space-y-2 ${
                            migrationResult.success 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                          }`}>
                            <div className="flex items-center gap-2 font-bold">
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Resultado del Proceso de Migración</span>
                            </div>
                            <p className="opacity-90">{migrationResult.message}</p>
                            
                            {migrationResult.report && (
                              <div className="pt-2 border-t border-white/5 space-y-1 font-mono text-[10px] text-zinc-300 max-h-48 overflow-y-auto">
                                <p className="font-bold text-zinc-400 uppercase tracking-widest text-[9px] mb-1 font-sans">Resumen de Filas Procesadas:</p>
                                {Object.entries(migrationResult.report).map(([table, details]: any) => (
                                  <div key={table} className="flex justify-between border-b border-white/[0.02] py-0.5">
                                    <span className="opacity-80 font-sans">{table}:</span>
                                    <span>Leídos: {details.read} | Insertados: {details.inserted} {details.errors > 0 ? `| Errores: ${details.errors}` : ''}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* DB Actions with branch scope (Cargar / Subir / Vaciar) */}
                    <div className="space-y-6 bg-zinc-950/40 p-6 rounded-2xl border border-white/5">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                        <Save className="w-4 h-4 text-emerald-400" /> Carga y Mantenimiento de Datos (JSON)
                      </h3>

                      {/* Unified branch filter for restoration & clear as requested */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-b border-white/5">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider">Contemplar por Sucursal</label>
                          <select
                            value={dbTargetBranch}
                            onChange={(e) => setDbTargetBranch(e.target.value)}
                            className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          >
                            <option value="all">Filtro: Todas las Sucursales (Global)</option>
                            {branches.map(b => (
                              <option key={b.id} value={b.id}>Filtro: Sucursal {b.name}</option>
                            ))}
                          </select>
                          <p className="text-[9px] text-zinc-500">
                            Las cargas y vaciados se aplicarán únicamente para la sucursal seleccionada. Las demás sucursales no sufrirán alteraciones.
                          </p>
                        </div>

                        <div className="space-y-2 flex flex-col justify-center">
                          <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer py-1 select-none">
                            <input
                              type="checkbox"
                              checked={dbClearBeforeRestore}
                              onChange={(e) => setDbClearBeforeRestore(e.target.checked)}
                              className="text-indigo-600 focus:ring-indigo-500 h-4 w-4 rounded bg-zinc-950 border-white/5 focus:outline-none"
                            />
                            <span>Vaciar datos antes de subir</span>
                          </label>
                          <p className="text-[9px] text-zinc-500">
                            Si está marcado, antes de insertar la información del archivo de respaldo se limpiará la sucursal o base de datos correspondiente para evitar claves duplicadas.
                          </p>
                        </div>
                      </div>

                      {/* Core actions grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                        
                        {/* Action 1: Export/Backup */}
                        <div className="p-4 bg-zinc-950 rounded-xl border border-white/5 flex flex-col justify-between space-y-4">
                          <div>
                            <p className="text-xs font-bold text-zinc-200">1. Descargar Respaldo</p>
                            <p className="text-[10px] text-zinc-500 mt-1">Exporta la totalidad de la base de datos actual en un archivo de intercambio JSON.</p>
                          </div>
                          <button
                            type="button"
                            disabled={isPerformingDbBackup}
                            onClick={handleDownloadBackup}
                            className="w-full py-2.5 bg-zinc-900 border border-white/5 hover:bg-zinc-800 text-zinc-200 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all"
                          >
                            <Download className="w-4 h-4 text-indigo-400" />
                            {isPerformingDbBackup ? 'Generando...' : 'Descargar JSON'}
                          </button>
                        </div>

                        {/* Action 2: Import Backup / Cargar */}
                        <div className="p-4 bg-zinc-950 rounded-xl border border-white/5 flex flex-col justify-between space-y-4">
                          <div>
                            <p className="text-xs font-bold text-zinc-200">2. Cargar / Subir Datos</p>
                            <p className="text-[10px] text-zinc-500 mt-1">Restaura la información desde un archivo JSON, aplicando el filtro de sucursal arriba configurado.</p>
                          </div>
                          <div className="relative">
                            <label className={`w-full py-2.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all ${
                              isPerformingDbRestore ? 'opacity-50 pointer-events-none' : ''
                            }`}>
                              <Upload className="w-4 h-4" />
                              {isPerformingDbRestore ? 'Procesando...' : 'Cargar JSON'}
                              <input 
                                type="file" 
                                accept=".json"
                                onChange={handleUploadBackup}
                                className="hidden"
                                disabled={isPerformingDbRestore}
                              />
                            </label>
                          </div>
                        </div>

                        {/* Action 3: Clear / Empty */}
                        <div className="p-4 bg-zinc-950 rounded-xl border border-white/5 flex flex-col justify-between space-y-4">
                          <div>
                            <p className="text-xs font-bold text-zinc-200">3. Vaciar Datos</p>
                            <p className="text-[10px] text-zinc-500 mt-1">Limpia permanentemente los registros de transacciones para la sucursal seleccionada.</p>
                          </div>
                          <button
                            type="button"
                            disabled={isPerformingDbClear}
                            onClick={handleClearDatabase}
                            className="w-full py-2.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all"
                          >
                            <Trash2 className="w-4 h-4 text-rose-400" />
                            {isPerformingDbClear ? 'Vaciando...' : 'Vaciar Registros'}
                          </button>
                        </div>
                      </div>

                    </div>
                  </div>
                )}

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
              onClick={() => {
                stopUserCamera();
                setShowAddUserModal(false);
                setEditingUser(null);
                setUserFormData({ name: '', username: '', email: '', pin: '', role: 'operator', branchId: '', photo: '' });
              }}
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
                  stopUserCamera();
                  setShowAddUserModal(false);
                  setEditingUser(null);
                  setUserFormData({ name: '', username: '', email: '', pin: '', role: 'operator', branchId: '', photo: '' });
                }} className="text-zinc-500 hover:text-zinc-300">
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>

              <form onSubmit={handleAddUser} className="p-8 space-y-6">
                {/* Foto / Perfil */}
                <div className="flex flex-col items-center justify-center space-y-3 pb-4 border-b border-white/5">
                  <div className="relative w-28 h-28 rounded-full border border-white/10 bg-zinc-950 flex items-center justify-center overflow-hidden group shadow-inner">
                    {isUserCameraActive ? (
                      <video 
                        ref={userVideoRef} 
                        className="w-full h-full object-cover scale-x-[-1]" 
                        playsInline 
                        muted 
                      />
                    ) : userFormData.photo ? (
                      <img 
                        src={userFormData.photo} 
                        alt="Preview" 
                        className="w-full h-full object-cover" 
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-zinc-600">
                        <User className="w-10 h-10 stroke-[1.5]" />
                        <span className="text-[8px] uppercase tracking-wider font-bold mt-1 text-zinc-500">Sin Foto</span>
                      </div>
                    )}

                    {!isUserCameraActive && (
                      <div 
                        onClick={() => {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = 'image/*';
                          input.onchange = (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = () => {
                                setUserFormData(prev => ({ ...prev, photo: reader.result as string }));
                              };
                              reader.readAsDataURL(file);
                            }
                          };
                          input.click();
                        }}
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity duration-200 cursor-pointer"
                      >
                        <Upload className="w-5 h-5 text-white mb-1" />
                        <span className="text-[9px] text-white font-black uppercase tracking-tight">Cargar Foto</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isUserCameraActive ? (
                      <>
                        <button
                          type="button"
                          onClick={captureUserPhoto}
                          className="px-3 py-1.5 bg-emerald-600 text-[10px] hover:bg-emerald-500 font-bold uppercase text-white rounded-lg transition-colors"
                        >
                          Capturar
                        </button>
                        <button
                          type="button"
                          onClick={stopUserCamera}
                          className="px-3 py-1.5 bg-zinc-800 text-[10px] hover:bg-zinc-700 font-bold uppercase text-zinc-300 rounded-lg transition-colors"
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = 'image/*';
                            input.onchange = (e) => {
                              const file = (e.target as HTMLInputElement).files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = () => {
                                  setUserFormData(prev => ({ ...prev, photo: reader.result as string }));
                                };
                                reader.readAsDataURL(file);
                              }
                            };
                            input.click();
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 text-[10px] hover:bg-zinc-700 font-bold uppercase text-white rounded-lg transition-colors inline-flex"
                        >
                          <Upload className="w-3 h-3" /> Subir Imagen
                        </button>

                        <button
                          type="button"
                          onClick={startUserCamera}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 text-[10px] text-blue-400 hover:bg-blue-600/30 font-bold uppercase rounded-lg transition-colors border border-blue-500/10 inline-flex"
                        >
                          <Camera className="w-3 h-3" /> Usar Cámara
                        </button>

                        {userFormData.photo && (
                          <button
                            type="button"
                            onClick={() => setUserFormData(prev => ({ ...prev, photo: '' }))}
                            className="flex items-center justify-center p-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors border border-red-500/10"
                            title="Eliminar Foto"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

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
                          <SourceHistoryRow key={`${sm.id || sm.receiptNumber}-${idx}`} sm={sm} />
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
              className="relative w-full max-w-[1650px] bg-zinc-900 rounded-[32px] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[95vh]"
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
                      value={purchaseHeader.date.split('T')[0]}
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
                          onChange={e => {
                            if (e.target.value === 'new') {
                              setEditingClient(null);
                              setClientFormData({ 
                                name: clientSearch,
                                phone: '', email: '', ci: '', 
                                workplace: '', isMineCooperative: false, recommendedBy: '',
                                referentialPhone: '' 
                              });
                              setShowAddClientModal(true);
                            } else {
                              setPurchaseHeader({...purchaseHeader, clientId: e.target.value});
                            }
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (e.currentTarget.value === 'new') {
                                setEditingClient(null);
                                setClientFormData({ 
                                  name: clientSearch,
                                  phone: '', email: '', ci: '', 
                                  workplace: '', isMineCooperative: false, recommendedBy: '',
                                  referentialPhone: '' 
                                });
                                setShowAddClientModal(true);
                              } else {
                                purchaseInitialWeightRef.current?.focus();
                              }
                            }
                          }}
                          className="p-1.5 bg-transparent text-xs text-zinc-100 focus:outline-none min-w-[180px] cursor-pointer"
                        >
                          <option value="" className="bg-zinc-900">Seleccionar Cliente</option>
                          {(() => {
                            const filtered = clients
                            .filter(c => c.branchId === branchMode)
                            .filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()));
                            
                            if (filtered.length === 0 && clientSearch.length > 0) {
                              return <option value="new" className="bg-amber-500/20 text-amber-500 font-bold italic">No encontrado. ¿Registrar "{clientSearch}"?</option>;
                            }
                            
                            return filtered.map(c => (
                              <option key={c.id} value={c.id} className="bg-zinc-900">{c.name}</option>
                            ));
                          })()}
                        </select>
                        <button 
                          type="button"
                          onClick={() => {
                            setEditingClient(null);
                            setClientFormData({ 
                              name: clientSearch, // Autofill with search term if any
                              phone: '', email: '', ci: '', 
                              workplace: '', isMineCooperative: false, recommendedBy: '',
                              referentialPhone: '' 
                            });
                            setShowAddClientModal(true);
                          }}
                          className="p-2 text-amber-500 bg-amber-500/10 hover:bg-amber-500 hover:text-zinc-950 rounded-lg transition-all border border-amber-500/30"
                          title="Registrar Nuevo Cliente"
                        >
                          <UserPlus className="w-4 h-4" />
                        </button>
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
                          <th className="px-6 py-4 text-left text-red-500">Merma (%)</th>
                          <th className="px-6 py-4 text-left">Cotización</th>
                          <th className="px-6 py-4 text-left text-amber-500">Ley (%)</th>
                          <th className="px-6 py-4 text-left">Precio x Gramo</th>
                          <th className="px-6 py-4 text-left text-amber-500">Precio x Gr (100%)</th>
                          <th className="px-6 py-4 text-left text-blue-500">Total (100%) BS</th>
                          <th className="px-6 py-4 text-left text-emerald-500">Total (BS)</th>
                          <th className="px-6 py-4 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {purchaseCart.length === 0 ? (
                          <tr>
                            <td colSpan={12} className="px-6 py-12 text-center text-zinc-600">
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
                              <td className="px-6 py-4">
                                <input 
                                  readOnly
                                  type="number"
                                  step="0.01"
                                  value={item.pricePerGram}
                                  className="w-20 p-1 bg-zinc-900/50 border border-white/10 rounded text-[10px] font-mono text-amber-500/60 focus:outline-none cursor-not-allowed"
                                />
                              </td>
                              <td className="px-6 py-4">
                                <input 
                                  type="number"
                                  step="0.01"
                                  value={item.pricePerGram100 || 0}
                                  onChange={e => handleUpdateCartItem(item.id, { pricePerGram100: parseFloat(e.target.value) || 0 })}
                                  className="w-20 p-1 bg-zinc-900 border border-white/10 rounded text-[10px] font-mono text-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                                />
                              </td>
                              <td className="px-6 py-4 text-xs font-mono font-bold text-blue-400">{formatCurrency(item.material100 || 0)}</td>
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
                            <td colSpan={2} className="px-6 py-4 text-[10px] font-bold uppercase text-zinc-500 text-center">Totales</td>
                            <td className="px-6 py-4 text-xs font-mono font-bold text-zinc-100 italic">
                                {formatNumber(purchaseCart.reduce((acc, curr) => acc + curr.initialWeight, 0))}g
                            </td>
                            <td className="px-6 py-4 text-xs font-mono font-bold text-zinc-100">
                              {formatNumber(purchaseCart.reduce((acc, curr) => acc + curr.finalWeight, 0))}g
                            </td>
                            <td className="px-6 py-4 text-xs font-mono font-bold text-red-400">
                              {(() => {
                                const totalInitial = purchaseCart.reduce((acc, curr) => acc + curr.initialWeight, 0);
                                const totalLoss = purchaseCart.reduce((acc, curr) => acc + curr.loss, 0);
                                const totalPercentage = totalInitial > 0 ? (totalLoss * 100) / totalInitial : 0;
                                return `${formatNumber(totalPercentage)}% (-${formatNumber(totalLoss)}g)`;
                              })()}
                            </td>
                            <td colSpan={4}></td>
                            <td className="px-6 py-4 text-xs font-mono font-bold text-blue-400 bg-blue-500/5">
                              {formatCurrency(purchaseCart.reduce((acc, curr) => acc + (curr.material100 || 0), 0))}
                            </td>
                            <td className="px-6 py-4 text-sm font-mono font-bold text-emerald-500 bg-emerald-500/5">
                              {formatNumber(purchaseCart.reduce((acc, curr) => acc + (purchaseHeader.type === 'cerrado' ? (curr.material100 || 0) : curr.total), 0))} BS
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
                          setPurchaseItem(recalculatePurchaseItem({
                            ...purchaseItem, 
                            initialWeight: val, 
                            loss: loss > 0 ? loss : 0,
                            finalWeight: finalWeight > 0 ? finalWeight : 0
                          }, purchaseHeader.type));
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
                          setPurchaseItem(recalculatePurchaseItem({
                            ...purchaseItem, 
                            finalWeight: val, 
                            loss: loss > 0 ? loss : 0,
                            lossPercentage: parseFloat(percentage.toFixed(2))
                          }, purchaseHeader.type));
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
                          setPurchaseItem(recalculatePurchaseItem({
                            ...purchaseItem,
                            purity
                          }, purchaseHeader.type));
                        }}
                        className="w-full p-2.5 bg-zinc-900 rounded-xl border border-white/5 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>
                    <div className="flex-1 min-w-[100px] space-y-1">
                      <label className="text-[10px] font-bold uppercase text-zinc-500">Cotización</label>
                      <input 
                        disabled={purchaseCart.length > 0}
                        required
                        type="number" 
                        step="0.01"
                        value={purchaseItem.marketPrice || ''}
                        onChange={e => {
                          const marketPrice = parseFloat(e.target.value) || 0;
                          setPurchaseItem(recalculatePurchaseItem({
                            ...purchaseItem,
                            marketPrice
                          }, purchaseHeader.type));
                        }}
                        className={`w-full p-2.5 bg-zinc-900 rounded-xl border border-white/5 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20 ${purchaseCart.length > 0 ? 'opacity-50 cursor-not-allowed bg-zinc-950' : ''}`}
                      />
                    </div>
                    <div className="flex-1 min-w-[90px] space-y-1">
                      <label className="text-[10px] font-bold uppercase text-zinc-500">Dólar (BS)</label>
                      <input 
                        disabled={purchaseCart.length > 0}
                        required
                        type="number" 
                        step="0.01"
                        value={purchaseItem.usdToBs || ''}
                        onChange={e => {
                          const usdToBs = parseFloat(e.target.value) || 0;
                          setPurchaseItem(recalculatePurchaseItem({
                            ...purchaseItem,
                            usdToBs
                          }, purchaseHeader.type));
                        }}
                        className={`w-full p-2.5 bg-zinc-900 rounded-xl border border-white/5 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20 ${purchaseCart.length > 0 ? 'opacity-50 cursor-not-allowed bg-zinc-950' : ''}`}
                      />
                    </div>
                    <div className="flex-1 min-w-[110px] space-y-1">
                      <label className="text-[10px] font-bold uppercase text-amber-500">Precio x Gr (100%)</label>
                      <input 
                        required
                        type="number" 
                        step="0.01"
                        value={purchaseItem.pricePerGram100 || ''}
                        onChange={e => {
                          const pricePerGram100 = parseFloat(e.target.value) || 0;
                          const ppg = purchaseHeader.type === 'cerrado' ? pricePerGram100 : parseFloat((pricePerGram100 * 0.90).toFixed(2));
                          const total = parseFloat((ppg * purchaseItem.finalWeight).toFixed(2));
                          const total100 = parseFloat((pricePerGram100 * purchaseItem.finalWeight).toFixed(2));

                          setPurchaseItem({
                            ...purchaseItem,
                            pricePerGram100,
                            pricePerGram: ppg,
                            total: total,
                            material100: total100
                          });
                        }}
                        className="w-full p-2.5 bg-zinc-900 rounded-xl border border-white/5 text-xs text-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 font-bold"
                      />
                    </div>
                    <div className="flex-1 min-w-[110px] space-y-1">
                      <label className="text-[10px] font-bold uppercase text-zinc-500">Precio x Gr</label>
                      <input 
                        readOnly
                        type="number" 
                        step="0.01"
                        value={purchaseItem.pricePerGram || ''}
                        className="w-full p-2.5 bg-zinc-900/50 rounded-xl border border-white/5 text-xs text-amber-500/60 focus:outline-none cursor-not-allowed font-bold"
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
                          setPurchaseItem(recalculatePurchaseItem({
                            ...purchaseItem, 
                            lossPercentage: percentage, 
                            loss: loss, 
                            finalWeight: finalWeight > 0 ? finalWeight : 0
                          }, purchaseHeader.type));
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
                          <button 
                            type="button"
                            onClick={() => {
                              setEditingReferrer(null);
                              setReferrerFormData({ 
                                name: referrerSearch,
                                phone1: '', phone2: '', ci: '' 
                              });
                              setShowAddReferrerModal(true);
                            }}
                            className="p-2 text-zinc-400 hover:text-indigo-500 hover:bg-white/5 rounded-lg transition-all"
                            title="Registrar Nuevo Referido"
                          >
                            <UserPlus className="w-4 h-4" />
                          </button>
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
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold uppercase text-zinc-500">
                          {purchaseHeader.type === 'abierto' ? 'Adelanto (BS)' : 'Total a Pagar (BS)'}
                        </label>
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <div className="relative">
                              <input 
                                disabled={purchaseHeader.type === 'cerrado'}
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={purchaseHeader.advancePayment || ''}
                                onChange={e => {
                                  const totalAmount = purchaseCart.reduce((acc, curr) => acc + (curr.total || 0), 0);
                                  let val = parseFloat(parseFloat(e.target.value).toFixed(2)) || 0;
                                  if (val > totalAmount) val = parseFloat(totalAmount.toFixed(2));
                                  if (val < 0) val = 0;
                                  setPurchaseHeader({...purchaseHeader, advancePayment: val});
                                  setIsManuallyEditingAdvance(true);
                                }}
                                className={`p-2.5 bg-zinc-950 rounded-xl border border-white/5 text-xs text-zinc-100 focus:outline-none focus:ring-2 w-32 font-mono font-bold ${
                                  purchaseHeader.type === 'abierto' ? 'focus:ring-amber-500/20 text-amber-500' : 'focus:ring-emerald-500/20 text-emerald-500'
                                } ${purchaseHeader.type === 'cerrado' ? 'opacity-70 cursor-not-allowed' : ''}`}
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
                            <div className="flex bg-zinc-950 p-1 rounded-xl border border-white/5">
                              <button 
                                onClick={() => setPurchaseHeader({...purchaseHeader, advancePaymentType: 'efectivo'})}
                                className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase transition-all ${purchaseHeader.advancePaymentType === 'efectivo' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
                              >
                                Efectivo
                              </button>
                              <button 
                                onClick={() => setPurchaseHeader({...purchaseHeader, advancePaymentType: 'transferencia'})}
                                className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase transition-all ${purchaseHeader.advancePaymentType === 'transferencia' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                              >
                                Banco
                              </button>
                              <button 
                                onClick={() => setPurchaseHeader({...purchaseHeader, advancePaymentType: 'mixto'})}
                                className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase transition-all ${purchaseHeader.advancePaymentType === 'mixto' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                              >
                                Mixto
                              </button>
                            </div>
                          </div>
                          
                          {purchaseHeader.advancePaymentType === 'mixto' && (
                            <motion.div 
                              initial={{ opacity: 0, y: -10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="grid grid-cols-2 gap-4 bg-purple-500/5 p-4 rounded-xl border border-purple-500/10"
                            >
                              <div className="space-y-1">
                                <label className="text-[8px] font-bold uppercase text-zinc-500">Monto Efectivo</label>
                                <input 
                                  type="number"
                                  placeholder="0.00"
                                  value={purchaseHeader.advanceCashAmount || ''}
                                  onChange={e => {
                                    const cash = parseFloat(parseFloat(e.target.value).toFixed(2)) || 0;
                                    const limit = purchaseHeader.advancePayment || 0;
                                    const finalCash = Math.min(cash, limit);
                                    setPurchaseHeader({
                                      ...purchaseHeader, 
                                      advanceCashAmount: finalCash,
                                      advanceBankAmount: parseFloat(Math.max(0, limit - finalCash).toFixed(2))
                                    });
                                    setIsManuallyEditingAdvance(true);
                                  }}
                                  className="w-full p-2 bg-zinc-900 border border-white/5 rounded-lg text-[10px] text-zinc-100 focus:outline-none"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[8px] font-bold uppercase text-zinc-500">Monto Banco</label>
                                <input 
                                  type="number"
                                  placeholder="0.00"
                                  value={purchaseHeader.advanceBankAmount || ''}
                                  onChange={e => {
                                    const bank = parseFloat(parseFloat(e.target.value).toFixed(2)) || 0;
                                    const limit = purchaseHeader.advancePayment || 0;
                                    const finalBank = Math.min(bank, limit);
                                    setPurchaseHeader({
                                      ...purchaseHeader, 
                                      advanceBankAmount: finalBank,
                                      advanceCashAmount: parseFloat(Math.max(0, limit - finalBank).toFixed(2))
                                    });
                                    setIsManuallyEditingAdvance(true);
                                  }}
                                  className="w-full p-2 bg-zinc-900 border border-white/5 rounded-lg text-[10px] text-zinc-100 focus:outline-none"
                                />
                              </div>
                            </motion.div>
                          )}

                          {(purchaseHeader.advancePaymentType === 'transferencia' || purchaseHeader.advancePaymentType === 'mixto') && (
                            <motion.div 
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="flex items-center gap-2 bg-blue-500/5 p-2 rounded-xl border border-blue-500/10"
                            >
                              <select 
                                value={purchaseHeader.advanceSourceBankAccountId || ''}
                                onChange={e => setPurchaseHeader({...purchaseHeader, advanceSourceBankAccountId: e.target.value})}
                                className={`p-2 bg-zinc-900 border rounded-lg text-[10px] text-zinc-100 focus:outline-none w-32 ${
                                  !purchaseHeader.advanceSourceBankAccountId ? 'border-red-500/50 text-red-400' : 'border-white/5'
                                }`}
                              >
                                <option value="">⚠️ Banco Requerido</option>
                                {branchBankAccounts.filter(acc => acc.branchId === branchMode).map(acc => (
                                  <option key={acc.id} value={acc.id}>{acc.bankName} ({acc.accountNumber.slice(-4)})</option>
                                ))}
                              </select>
                              <input 
                                type="text"
                                placeholder="Banco Cliente"
                                value={purchaseHeader.advanceClientBank || ''}
                                onChange={e => setPurchaseHeader({...purchaseHeader, advanceClientBank: e.target.value})}
                                className="p-2 bg-zinc-900 border border-white/5 rounded-lg text-[10px] text-zinc-100 focus:outline-none w-28"
                              />
                              <input 
                                type="text"
                                placeholder="Cuenta Cliente"
                                value={purchaseHeader.advanceClientAccountNumber || ''}
                                onChange={e => setPurchaseHeader({...purchaseHeader, advanceClientAccountNumber: e.target.value})}
                                className="p-2 bg-zinc-900 border border-white/5 rounded-lg text-[10px] text-zinc-100 focus:outline-none w-32"
                              />
                            </motion.div>
                          )}
                        </div>
                      </div>

                      {purchaseHeader.type === 'cerrado' && (
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold uppercase text-zinc-500">Estado de Pago</label>
                          <div className="flex items-center gap-2 p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-500">
                             <CheckCircle2 className="w-4 h-4" />
                             <span className="text-[10px] font-bold uppercase tracking-widest">Liquidación Total (100%)</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-8 border-l border-white/10 pl-8">
                      <div className="flex flex-col border-r border-white/10 pr-8">
                        <span className="text-[10px] font-bold uppercase text-zinc-500">Total Material</span>
                        <span className="text-2xl font-mono font-bold text-zinc-100">{formatNumber(purchaseCart.reduce((acc, curr) => acc + curr.total, 0))} BS</span>
                      </div>
                      <div className="flex flex-col border-r border-white/10 pr-8">
                        <span className="text-[10px] font-bold uppercase text-blue-500">Total Material (100%)</span>
                        <span className="text-2xl font-mono font-bold text-blue-400">{formatCurrency(purchaseCart.reduce((acc, curr) => acc + (curr.material100 || 0), 0))}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase text-zinc-500">
                          {purchaseHeader.advancePayment > 0 ? (purchaseHeader.advancePayment === (purchaseCart.reduce((acc, curr) => acc + curr.total, 0)) ? 'Pago Total Hoy' : 'A Pagar Hoy (Adelanto)') : 'Neto a Pagar'}
                        </span>
                        <span className="text-2xl font-mono font-bold text-emerald-500">
                          {purchaseHeader.advancePayment > 0 
                            ? formatNumber(purchaseHeader.advancePayment) 
                            : formatNumber(purchaseCart.reduce((acc, curr) => acc + curr.total, 0))
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
                      {purchaseHeader.advancePayment > 0 && purchaseHeader.advancePayment < (purchaseCart.reduce((acc, curr) => acc + curr.total, 0)) && (
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold uppercase text-amber-500">Saldo Pendiente</span>
                          <span className="text-xl font-mono font-bold text-amber-500">
                            {formatNumber(purchaseCart.reduce((acc, curr) => acc + curr.total, 0) - purchaseHeader.advancePayment)} BS
                          </span>
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
              className="relative w-full max-w-[1550px] bg-zinc-900 rounded-[32px] border border-white/10 shadow-2xl overflow-hidden"
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
                  {(() => {
                    const isClosed = viewingPurchase.type === 'cerrado';
                    if (!isClosed) {
                      return (
                        <div className="bg-zinc-950 p-4 rounded-2xl border border-white/5">
                          <p className="text-[10px] font-bold uppercase text-zinc-500 mb-1">
                            TOTAL BS (90%)
                          </p>
                          <p className="text-2xl font-mono font-bold text-emerald-500">
                            {formatNumber(viewingPurchase.total)} BS
                          </p>
                        </div>
                      );
                    }

                    // For cerrados:
                    const isDirectClosed = !viewingPurchase.closeTotal || viewingPurchase.closeTotal <= 0;
                    let finalTotal = 0;
                    let totalAllAdvances = 0;
                    let liquidacionPagada = 0;

                    if (isDirectClosed) {
                      finalTotal = viewingPurchase.total;
                      totalAllAdvances = 0;
                      liquidacionPagada = viewingPurchase.total;
                    } else {
                      const totalExtraAdvances = viewingPurchase.advances?.reduce((sum, adv) => sum + adv.amount, 0) || 0;
                      totalAllAdvances = (viewingPurchase.advancePayment || 0) + totalExtraAdvances;
                      finalTotal = viewingPurchase.closeTotal || viewingPurchase.total;
                      liquidacionPagada = parseFloat((finalTotal - totalAllAdvances).toFixed(2));
                    }

                    return (
                      <div className="bg-emerald-950/25 border border-emerald-500/40 rounded-2xl p-4 shadow-lg shadow-emerald-500/5 ring-1 ring-emerald-500/30 md:col-span-2">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-1">
                              LIQUIDACIÓN PAGADA
                            </p>
                            <p className="text-3xl font-mono font-extrabold text-emerald-400">
                              {formatNumber(liquidacionPagada)} BS
                            </p>
                          </div>
                          
                          {!isDirectClosed ? (
                            <div className="border-t md:border-t-0 md:border-l border-emerald-500/20 pt-3 md:pt-0 md:pl-6 space-y-1 font-mono text-xs">
                              <div className="flex justify-between md:gap-8">
                                <span className="text-emerald-500/60 uppercase text-[9px]">Total Recalculado:</span>
                                <span className="text-zinc-300 font-bold">{formatNumber(finalTotal)} BS</span>
                              </div>
                              <div className="flex justify-between md:gap-8">
                                <span className="text-emerald-500/60 uppercase text-[9px]">(-) Adelantos Totales:</span>
                                <span className="text-zinc-400">-{formatNumber(totalAllAdvances)} BS</span>
                              </div>
                              <div className="flex justify-between md:gap-8 border-t border-emerald-500/20 pt-1 font-bold">
                                <span className="text-emerald-400 uppercase text-[9px]">Neto Entregado:</span>
                                <span className="text-emerald-400">{formatNumber(liquidacionPagada)} BS</span>
                              </div>
                            </div>
                          ) : (
                            <div className="border-t md:border-t-0 md:border-l border-emerald-500/20 pt-3 md:pt-0 md:pl-6 space-y-1 font-mono text-xs">
                              <div className="flex justify-between md:gap-8">
                                <span className="text-emerald-500/60 uppercase text-[9px]">Compra Directa 100%:</span>
                                <span className="text-emerald-400 font-bold">{formatNumber(liquidacionPagada)} BS</span>
                              </div>
                            </div>
                          )}
                        </div>
                        {viewingPurchase.closeMarketPrice && (
                          <div className="border-t border-emerald-500/10 mt-3 pt-2">
                            <p className="text-[8px] text-emerald-500/80 font-bold uppercase tracking-[0.05em]">
                              Cerrado con Kot. {formatNumber(viewingPurchase.closeMarketPrice)} USD | TC {formatNumber(viewingPurchase.closeUsdToBs || 0)}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {viewingPurchase.referrerName && (
                    <div className="bg-zinc-950 p-4 rounded-2xl border border-white/5">
                      <p className="text-[10px] font-bold uppercase text-zinc-500 mb-1">Referido por</p>
                      <p className="text-lg font-bold text-blue-400 italic">{viewingPurchase.referrerName}</p>
                    </div>
                  )}
                  {/* Commission hidden from details as per user request */}
                  {/* {viewingPurchase.commission !== undefined && viewingPurchase.commission > 0 && (
                    <div className="bg-zinc-950 p-4 rounded-2xl border border-white/5">
                      <p className="text-[10px] font-bold uppercase text-zinc-500 mb-1">Comisión pagada</p>
                      <p className="text-lg font-mono font-bold text-blue-400">{formatNumber(viewingPurchase.commission)} BS</p>
                    </div>
                  )} */}
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
                    {viewingPurchase.type === 'cerrado' ? (
                      <div className="flex flex-col items-end gap-2">
                        <button 
                          onClick={() => handlePrintLiquidationReceipt(viewingPurchase)}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-xs shadow-lg shadow-emerald-500/20 hover:bg-emerald-500 transition-all border border-emerald-500/30"
                        >
                          <Download className="w-4 h-4" /> Imprimir Recibo Liquidación
                        </button>
                        {(viewingPurchase.closePaymentType || viewingPurchase.advancePaymentType) && (
                          <span className={`text-[8px] font-bold uppercase px-2 py-0.5 rounded ${
                            (viewingPurchase.closePaymentType || viewingPurchase.advancePaymentType) === 'transferencia' ? 'bg-blue-500/20 text-blue-400' : 
                            (viewingPurchase.closePaymentType || viewingPurchase.advancePaymentType) === 'mixto' ? 'bg-purple-500/20 text-purple-400' : 
                            'bg-zinc-800 text-zinc-500'
                          }`}>
                            {(viewingPurchase.closePaymentType || viewingPurchase.advancePaymentType) === 'transferencia' ? '🏦 Transferencia' : 
                             (viewingPurchase.closePaymentType || viewingPurchase.advancePaymentType) === 'mixto' ? '⚖️ Mixto' : '💵 Efectivo'}
                          </span>
                        )}
                      </div>
                    ) : (
                      viewingPurchase.advancePayment !== undefined && viewingPurchase.advancePayment > 0 && (
                        <div className="flex flex-col items-end gap-2">
                          <button 
                            onClick={() => handlePrintAdvanceReceipt(viewingPurchase)}
                            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-zinc-950 rounded-xl font-bold text-xs shadow-lg shadow-amber-500/20 hover:bg-amber-400 transition-all"
                          >
                            <Download className="w-4 h-4" /> Imprimir Recibo Adelanto
                          </button>
                          <span className={`text-[8px] font-bold uppercase px-2 py-0.5 rounded ${
                            viewingPurchase.advancePaymentType === 'transferencia' ? 'bg-blue-500/20 text-blue-400' : 
                            viewingPurchase.advancePaymentType === 'mixto' ? 'bg-purple-500/20 text-purple-400' : 
                            'bg-zinc-800 text-zinc-500'
                          }`}>
                            {viewingPurchase.advancePaymentType === 'transferencia' ? '🏦 Transferencia' : 
                             viewingPurchase.advancePaymentType === 'mixto' ? '⚖️ Mixto' : '💵 Efectivo'}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                  {(() => {
                    const isClosed = viewingPurchase.type === 'cerrado';
                    const hasLiquidationTotal = viewingPurchase.closeTotal && viewingPurchase.closeTotal > 0;
                    
                    const showBankInfo = isClosed
                      ? (hasLiquidationTotal 
                         ? (viewingPurchase.closePaymentType === 'transferencia' || viewingPurchase.closePaymentType === 'mixto')
                         : (viewingPurchase.advancePaymentType === 'transferencia' || viewingPurchase.advancePaymentType === 'mixto'))
                      : (viewingPurchase.advancePaymentType === 'transferencia' || viewingPurchase.advancePaymentType === 'mixto');
                      
                    if (!showBankInfo) return null;
                    
                    const paymentType = isClosed 
                      ? (hasLiquidationTotal ? viewingPurchase.closePaymentType : viewingPurchase.advancePaymentType) 
                      : viewingPurchase.advancePaymentType;
                      
                    const cashAmount = isClosed 
                      ? (hasLiquidationTotal ? viewingPurchase.closeCashAmount : viewingPurchase.advanceCashAmount) 
                      : viewingPurchase.advanceCashAmount;
                      
                    const bankAmount = isClosed 
                      ? (hasLiquidationTotal ? viewingPurchase.closeBankAmount : viewingPurchase.advanceBankAmount) 
                      : viewingPurchase.advanceBankAmount;
                      
                    const sourceBankAccountId = isClosed 
                      ? (hasLiquidationTotal ? viewingPurchase.closeSourceBankAccountId : viewingPurchase.advanceSourceBankAccountId) 
                      : viewingPurchase.advanceSourceBankAccountId;
                      
                    const clientBank = isClosed 
                      ? (hasLiquidationTotal ? viewingPurchase.closeClientBank : viewingPurchase.advanceClientBank) 
                      : viewingPurchase.advanceClientBank;
                      
                    const clientAccountNumber = isClosed 
                      ? (hasLiquidationTotal ? viewingPurchase.closeClientAccountNumber : viewingPurchase.advanceClientAccountNumber) 
                      : viewingPurchase.advanceClientAccountNumber;

                    return (
                      <div className="bg-blue-600/5 p-4 rounded-2xl border border-blue-500/10 col-span-1 md:col-span-3">
                        <p className="text-[10px] font-bold uppercase text-blue-500 mb-2">
                          Detalles de Pago de {isClosed && hasLiquidationTotal ? 'Liquidación' : 'Adelanto'} ({paymentType === 'mixto' ? 'Pago Mixto' : 'Transferencia'})
                        </p>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                          {paymentType === 'mixto' && (
                            <>
                              <div>
                                <p className="text-[8px] text-zinc-500 uppercase font-bold text-amber-500">Monto Efectivo</p>
                                <p className="text-xs text-zinc-100 font-bold">{formatNumber(cashAmount || 0)} BS</p>
                              </div>
                              <div>
                                <p className="text-[8px] text-zinc-500 uppercase font-bold text-blue-500">Monto Banco</p>
                                <p className="text-xs text-zinc-100 font-bold">{formatNumber(bankAmount || 0)} BS</p>
                              </div>
                            </>
                          )}
                          <div>
                            <p className="text-[8px] text-zinc-500 uppercase font-bold">Banco Origen (Nuestro)</p>
                            <p className="text-xs text-zinc-100 font-bold">
                              {branchBankAccounts.find(acc => acc.id === sourceBankAccountId)?.bankName || 'Banco Sucursal'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[8px] text-zinc-500 uppercase font-bold">Banco Cliente</p>
                            <p className="text-xs text-zinc-100 font-bold">{clientBank || '-'}</p>
                          </div>
                          <div>
                            <p className="text-[8px] text-zinc-500 uppercase font-bold">Cuenta Cliente</p>
                            <p className="text-xs text-zinc-100 font-bold">{clientAccountNumber || '-'}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  {viewingPurchase.type === 'abierto' && viewingPurchase.advancePayment !== undefined && (
                    <div className="bg-zinc-950 p-4 rounded-2xl border border-white/10 border-dashed border-amber-500/20">
                    <p className="text-[10px] font-bold uppercase text-amber-500 mb-1">Adelanto entregado</p>
                      <p className="text-2xl font-mono font-bold text-amber-500">{formatNumber(viewingPurchase.advancePayment)} BS</p>
                    </div>
                  )}
                  {viewingPurchase.type === 'abierto' && viewingPurchase.advancePayment !== undefined && (
                    <div className="bg-zinc-950 p-4 rounded-2xl border border-white/5">
                      <p className="text-[10px] font-bold uppercase text-zinc-500 mb-1">Saldo Final</p>
                      <p className="text-2xl font-mono font-bold text-zinc-100">
                        {formatNumber(viewingPurchase.total - viewingPurchase.advancePayment)} BS
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
                        <th className="px-6 py-3 text-left">P.Gramo (100%)</th>
                        <th className="px-6 py-3 text-left text-blue-500">Total (100%) BS</th>
                        <th className="px-6 py-3 text-left">Cotización Otros</th>
                        <th className="px-6 py-3 text-left">Ley Otros</th>
                        <th className="px-6 py-3 text-left">Precio/g</th>
                        <th className="px-6 py-3 text-left">Transferido</th>
                        <th className="px-6 py-3 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {viewingPurchase.items?.map((item, idx) => (
                        <tr key={item.id || `${item.type}-${idx}`} className="text-sm">
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
                          <td className="px-6 py-4 text-amber-400 font-bold">{formatNumber(item.pricePerGram100 || 0, 2)}</td>
                          <td className="px-6 py-4 text-blue-400 font-bold">{formatCurrency(item.material100 || 0)}</td>
                          <td className="px-6 py-4 text-zinc-400">
                            {item.otherQuotation ? `${formatNumber(item.otherQuotation)} BS` : '-'}
                          </td>
                          <td className="px-6 py-4 text-zinc-400">
                            {item.otherPurity ? `${formatNumber(item.otherPurity)}%` : '-'}
                          </td>
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
                          <td className="px-6 py-4">
                            {item.isTransferred ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="px-2 py-0.5 bg-blue-600 text-white rounded-md text-[8px] font-bold uppercase flex items-center gap-1 w-fit">
                                  <Truck className="w-2.5 h-2.5" /> SÍ
                                </span>
                                {item.transferId && (
                                  <span className="text-[7px] text-zinc-500 font-mono">ID: {item.transferId.slice(0, 8)}</span>
                                )}
                              </div>
                            ) : (
                              <span className="px-2 py-0.5 bg-zinc-800 text-zinc-500 rounded-md text-[8px] font-bold uppercase w-fit">
                                NO
                              </span>
                            )}
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
                            {formatNumber(viewingPurchase.items?.reduce((acc: number, curr: any) => acc + curr.initialWeight, 0) || 0)}g
                          </td>
                          <td className="px-6 py-4 text-sm font-mono font-bold text-zinc-100">
                            {formatNumber(viewingPurchase.items?.reduce((acc: number, curr: any) => acc + curr.finalWeight, 0) || 0)}g
                          </td>
                          <td className="px-6 py-4 text-sm font-mono text-red-400">
                            {(() => {
                              const totalInitial = viewingPurchase.items?.reduce((acc: number, curr: any) => acc + curr.initialWeight, 0) || 0;
                              const totalLoss = viewingPurchase.items?.reduce((acc: number, curr: any) => acc + curr.loss, 0) || 0;
                              const totalPercentage = totalInitial > 0 ? (totalLoss * 100) / totalInitial : 0;
                              return `${totalPercentage > 0 ? '-' : ''}${formatNumber(Math.abs(totalPercentage), 1)}% (${totalLoss > 0 ? '-' : ''}${formatNumber(Math.abs(totalLoss))}g)`;
                            })()}
                          </td>
                          <td colSpan={2}></td>
                          <td className="px-6 py-4 text-sm font-mono font-bold text-blue-400">
                            {formatCurrency(viewingPurchase.items?.reduce((acc: number, curr: any) => acc + (curr.material100 || 0), 0) || 0)}
                          </td>
                          <td colSpan={4}></td>
                          <td className="px-6 py-4 text-right text-sm font-mono font-bold">
                            <div className="flex flex-col items-end">
                              <span className="text-emerald-500">
                                {formatNumber(viewingPurchase.items?.reduce((acc: number, curr: any) => acc + (viewingPurchase.type === 'cerrado' ? (curr.closeTotal || curr.total) : curr.total), 0) || 0)} BS
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

              <div className="p-6 bg-zinc-950/50 border-t border-white/5 flex justify-end gap-3">
                <button 
                  onClick={() => sendWhatsAppReceipt(viewingPurchase)}
                  className="px-6 py-2 bg-emerald-500 text-black rounded-xl font-bold hover:bg-emerald-400 transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                >
                  <MessageCircle className="w-4 h-4" /> Enviar WhatsApp
                </button>
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
              className="relative w-full max-w-[1550px] bg-zinc-900 rounded-[32px] border border-white/10 shadow-2xl overflow-hidden"
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
                              readOnly
                              className="w-full pl-4 pr-12 py-4 bg-zinc-950/50 rounded-2xl border border-white/5 text-zinc-500 font-mono text-2xl focus:outline-none transition-all font-bold placeholder:text-zinc-800 cursor-not-allowed"
                              placeholder="0.00"
                            />
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-end pointer-events-none opacity-50 group-focus-within:opacity-100 transition-opacity">
                              <span className="text-[10px] font-bold text-zinc-400">BS</span>
                              <span className="text-[8px] text-zinc-500 uppercase tracking-tighter">TC Original</span>
                            </div>
                          </div>
                          <p className="text-[9px] text-zinc-600 italic ml-1">* El tipo de cambio se mantiene igual al original.</p>
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
                        const pricePerGram = parseFloat(((closeMarketPrice / 31.1035) * (item.purity / 100) * closeUsdToBs).toFixed(2));
                        const total = parseFloat((item.finalWeight * pricePerGram).toFixed(2));
                        return { ...item, closeTotal: total };
                      });
                      const newTotal = recalculatedItems.reduce((acc, curr) => acc + curr.closeTotal, 0);
                      const totalAdvances = (closingPurchase.advancePayment || 0) + (closingPurchase.advances?.reduce((sum, a) => sum + a.amount, 0) || 0);
                      const balance = newTotal - totalAdvances;

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
                                    <div className="w-1 h-1 bg-amber-500 rounded-full" /> (+) Adelanto Inicial
                                  </span>
                                  <span className="text-xs font-mono font-bold text-amber-500">-{formatNumber(closingPurchase.advancePayment)} <span className="text-[9px]">BS</span></span>
                                </div>
                              )}
                              {closingPurchase.advances?.map((adv: AdvancePayment, idx: number) => (
                                <div key={idx} className="flex justify-between items-center group">
                                  <span className="text-[10px] uppercase font-bold text-zinc-600 flex items-center gap-2">
                                    <div className="w-1 h-1 bg-zinc-600 rounded-full" /> (+) Adelanto Extra
                                  </span>
                                  <span className="text-xs font-mono font-bold text-amber-500/80">-{formatNumber(adv.amount)} <span className="text-[9px]">BS</span></span>
                                </div>
                              ))}
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
                            <th className="px-6 py-5 text-left text-amber-400 font-bold">P.Gramo 100%</th>
                            <th className="px-6 py-5 text-left text-blue-500 font-bold">Total (100%) BS</th>
                            <th className="px-6 py-5 text-left">Ley (%)</th>
                            <th className="px-6 py-5 text-left text-zinc-500 font-mono">Cotización O.</th>
                            <th className="px-6 py-5 text-left text-zinc-500 font-mono">L. Otros</th>
                            <th className="px-6 py-5 text-left">P.Gramo Orig.</th>
                            <th className="px-6 py-5 text-left bg-emerald-500/5 text-emerald-400 border-x border-emerald-500/10">P.Gramo Cierre</th>
                            <th className="px-6 py-5 text-right">Subtotal Orig.</th>
                            <th className="px-6 py-5 text-right bg-emerald-500/10 text-emerald-400 font-black">Subtotal Cierre</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {(closingPurchase.items || []).map((item, idx) => {
                            const closePricePerGram = parseFloat(((closeMarketPrice / 31.1035) * (item.purity / 100) * closeUsdToBs).toFixed(2));
                            const subtotalOrig = item.total;
                            const subtotalClose = parseFloat((item.finalWeight * closePricePerGram).toFixed(2));
                            return (
                              <tr key={item.id || `${item.type}-${idx}`} className="hover:bg-white/[0.02] transition-colors group">
                                <td className="px-6 py-5">
                                  <div className="flex items-center gap-3">
                                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500/50 group-hover:bg-amber-500 transition-colors" />
                                    <span className="text-xs font-bold text-zinc-300 uppercase">{item.type || 'pieza'}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-5 text-sm font-mono text-zinc-400">{formatNumber(item.finalWeight)}g</td>
                                <td className="px-6 py-5 text-sm font-mono text-amber-400 font-bold">{formatNumber(item.pricePerGram100 || 0, 2)}</td>
                                <td className="px-6 py-5 text-sm font-mono text-blue-400 font-bold">{formatCurrency(item.material100 || 0)}</td>
                                <td className="px-6 py-5">
                                  <span className="px-2 py-0.5 bg-amber-500/10 text-amber-500 rounded text-[10px] font-mono font-bold border border-amber-500/20">{formatNumber(item.purity)}%</span>
                                </td>
                                <td className="px-6 py-5 text-xs font-mono text-zinc-500">
                                  {item.otherQuotation ? `${formatNumber(item.otherQuotation)} BS` : '-'}
                                </td>
                                <td className="px-6 py-5 text-xs font-mono text-zinc-500">
                                  {item.otherPurity ? `${formatNumber(item.otherPurity)}%` : '-'}
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
                        {(closingPurchase.items || []).length > 0 && (
                          <tfoot>
                            <tr className="bg-zinc-900/50 border-t border-white/10">
                              <td className="px-6 py-4 text-[10px] font-bold uppercase text-zinc-500">Totales</td>
                              <td className="px-6 py-4 text-sm font-mono font-bold text-zinc-100">
                                {formatNumber((closingPurchase.items || []).reduce((acc: number, curr: any) => acc + curr.finalWeight, 0))}g
                              </td>
                              <td className="px-6 py-4"></td>
                              <td className="px-6 py-4 text-sm font-mono font-bold text-blue-400">
                                {formatCurrency((closingPurchase.items || []).reduce((acc: number, curr: any) => acc + (curr.material100 || 0), 0))}
                              </td>
                              <td colSpan={5}></td>
                              <td className="px-6 py-4 text-right text-xs font-mono font-bold text-zinc-400 italic">
                                {formatNumber((closingPurchase.items || []).reduce((acc: number, curr: any) => acc + curr.total, 0))} BS
                              </td>
                              <td className="px-6 py-4 text-right bg-emerald-500/10">
                                <span className="text-sm font-mono text-emerald-400 font-black">
                                  {(() => {
                                    const recalculatedItems = (closingPurchase.items || []).map(item => {
                                      const pricePerGram = parseFloat(((closeMarketPrice / 31.1035) * (item.purity / 100) * closeUsdToBs).toFixed(2));
                                      return { ...item, closeTotal: parseFloat((item.finalWeight * pricePerGram).toFixed(2)) };
                                    });
                                    return formatNumber(recalculatedItems.reduce((acc, curr) => acc + curr.closeTotal, 0));
                                  })()} BS
                                </span>
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                </div>

                {/* Registro del Pago (Liquidación) */}
                <div className="p-6 bg-zinc-900/40 rounded-[32px] border border-white/5 space-y-4 mt-6">
                  <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-3">
                    <div className="p-1.5 bg-zinc-800 rounded-lg">
                      <Coins className="w-3.5 h-3.5 text-zinc-400" />
                    </div>
                    REGISTRO DE PAGO DE SALDO FINAL DE LIQUIDACIÓN
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <label className="text-[10px] font-bold uppercase text-zinc-400 tracking-widest block font-bold">Método de Pago Liquidación</label>
                      <div className="flex gap-2">
                        {(['efectivo', 'transferencia', 'mixto'] as const).map(type => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => {
                              setClosePaymentType(type);
                              const recalculatedItems = (closingPurchase.items || []).map(item => {
                                const pricePerGram = parseFloat(((closeMarketPrice / 31.1035) * (item.purity / 100) * closeUsdToBs).toFixed(2));
                                return { ...item, closeTotal: parseFloat((item.finalWeight * pricePerGram).toFixed(2)) };
                              });
                              const newTotal = recalculatedItems.reduce((acc, curr) => acc + curr.closeTotal, 0);
                              const totalAdvances = (closingPurchase.advancePayment || 0) + (closingPurchase.advances?.reduce((sum, a) => sum + a.amount, 0) || 0);
                              const balance = Math.max(0, newTotal - totalAdvances);

                              setCloseCashAmount(type === 'efectivo' ? balance : 0);
                              setCloseBankAmount(type === 'transferencia' ? balance : 0);
                            }}
                            className={`flex-1 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all border ${closePaymentType === type ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-600/20' : 'bg-zinc-950 text-zinc-500 border-white/5 hover:text-zinc-300'}`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>

                      {closePaymentType === 'mixto' && (
                        <div className="grid grid-cols-2 gap-4 p-4 bg-zinc-950 rounded-2xl border border-white/5">
                          <div className="space-y-1">
                            <label className="text-[8px] font-bold uppercase text-zinc-500">Monto Efectivo</label>
                            <input 
                              type="number"
                              step="0.01"
                              value={closeCashAmount || ''}
                              onChange={e => {
                                const recalculatedItems = (closingPurchase.items || []).map(item => {
                                  const pricePerGram = parseFloat(((closeMarketPrice / 31.1035) * (item.purity / 100) * closeUsdToBs).toFixed(2));
                                  return { ...item, closeTotal: parseFloat((item.finalWeight * pricePerGram).toFixed(2)) };
                                });
                                const newTotal = recalculatedItems.reduce((acc, curr) => acc + curr.closeTotal, 0);
                                const totalAdvances = (closingPurchase.advancePayment || 0) + (closingPurchase.advances?.reduce((sum, a) => sum + a.amount, 0) || 0);
                                const balance = Math.max(0, newTotal - totalAdvances);

                                const cash = parseFloat(parseFloat(e.target.value).toFixed(2)) || 0;
                                setCloseCashAmount(cash);
                                setCloseBankAmount(parseFloat(Math.max(0, balance - cash).toFixed(2)));
                              }}
                              className="w-full p-2 bg-zinc-900 rounded-lg border border-white/5 text-xs text-zinc-100 font-mono font-bold"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[8px] font-bold uppercase text-zinc-500">Monto Banco</label>
                            <input 
                              type="number"
                              step="0.01"
                              value={closeBankAmount || ''}
                              onChange={e => {
                                const recalculatedItems = (closingPurchase.items || []).map(item => {
                                  const pricePerGram = parseFloat(((closeMarketPrice / 31.1035) * (item.purity / 100) * closeUsdToBs).toFixed(2));
                                  return { ...item, closeTotal: parseFloat((item.finalWeight * pricePerGram).toFixed(2)) };
                                });
                                const newTotal = recalculatedItems.reduce((acc, curr) => acc + curr.closeTotal, 0);
                                const totalAdvances = (closingPurchase.advancePayment || 0) + (closingPurchase.advances?.reduce((sum, a) => sum + a.amount, 0) || 0);
                                const balance = Math.max(0, newTotal - totalAdvances);

                                const bank = parseFloat(parseFloat(e.target.value).toFixed(2)) || 0;
                                setCloseBankAmount(bank);
                                setCloseCashAmount(parseFloat(Math.max(0, balance - bank).toFixed(2)));
                              }}
                              className="w-full p-2 bg-zinc-900 rounded-lg border border-white/5 text-xs text-zinc-100 font-mono font-bold"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      {(closePaymentType === 'transferencia' || closePaymentType === 'mixto') && (
                        <div className="space-y-4 p-4 bg-zinc-950 rounded-2xl border border-white/5 animate-in fade-in slide-in-from-top-1 duration-200">
                          <div className="space-y-2">
                            <label className="text-[8px] font-bold uppercase text-zinc-500">Cuenta de Origen (Nuestra)</label>
                            <select 
                              required
                              value={closeSourceBankAccountId}
                              onChange={e => setCloseSourceBankAccountId(e.target.value)}
                              className="w-full p-2.5 bg-zinc-900 rounded-xl border border-white/5 text-xs text-zinc-100 italic font-medium"
                            >
                              <option value="">Seleccione cuenta...</option>
                              {branchBankAccounts.filter(acc => acc.branchId === closingPurchase.branchId).map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.bankName} - {acc.accountNumber}</option>
                              ))}
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-[8px] font-bold uppercase text-zinc-500">Banco Cliente</label>
                              <input 
                                type="text" 
                                placeholder="Ej: BCP"
                                value={closeClientBank}
                                onChange={e => setCloseClientBank(e.target.value)}
                                className="w-full p-2.5 bg-zinc-900 rounded-xl border border-white/5 text-xs text-zinc-100 font-medium"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[8px] font-bold uppercase text-zinc-500">Nº Cuenta Cliente</label>
                              <input 
                                type="text" 
                                placeholder="Opcional"
                                value={closeClientAccountNumber}
                                onChange={e => setCloseClientAccountNumber(e.target.value)}
                                className="w-full p-2.5 bg-zinc-900 rounded-xl border border-white/5 text-xs text-zinc-100 font-medium"
                              />
                            </div>
                          </div>
                        </div>
                      )}
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


      {/* Transfer Modal - Only for Branches */}
      <AnimatePresence>
        {showTransferModal && branchMode && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowTransferModal(false);
                setSelectedTransferMaterials([]);
              }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-[1500px] bg-zinc-900 rounded-[32px] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[95vh]"
            >
              <div className="p-8 border-b border-white/5 bg-zinc-950 flex justify-between items-start">
                <div>
                  <h3 className="text-2xl font-bold text-zinc-100 flex items-center gap-3 italic">
                    <Truck className="w-6 h-6 text-blue-500" /> Transferir a Almacén Central
                  </h3>
                  <p className="text-zinc-500 text-sm mt-1">Seleccione los materiales para enviar al inventario central</p>
                </div>
                <button 
                  onClick={() => {
                    setShowTransferModal(false);
                    setSelectedTransferMaterials([]);
                  }} 
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-hidden flex flex-col">
                <div className="p-8 overflow-y-auto custom-scrollbar">
                  <div className="bg-zinc-950/50 rounded-2xl border border-white/5 overflow-hidden">
                    <div className="overflow-x-auto custom-scrollbar">
                      <table className="w-full text-left min-w-[1300px]">
                      <thead>
                        <tr className="text-[10px] text-zinc-500 uppercase font-bold border-b border-white/5 bg-zinc-900/50">
                          <th className="px-6 py-4">Seleccionar</th>
                          <th className="px-6 py-4">Índice</th>
                          <th className="px-6 py-4">Recibo</th>
                          <th className="px-6 py-4">Tipo</th>
                          <th className="px-6 py-4">Cliente</th>
                          <th className="px-6 py-4">Peso Final</th>
                          <th className="px-6 py-4">Ley (%)</th>
                          <th className="px-6 py-4">Cotización</th>
                          <th className="px-6 py-4">Merma (g)</th>
                          <th className="px-6 py-4 text-right">Total BS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {(() => {
                          const available = goldPurchases
                            .filter(p => p.branchId === branchMode)
                            .flatMap(p => (p.items || []).map(i => ({
                              ...i, 
                              receiptNumber: p.receiptNumber, 
                              clientId: p.clientId,
                              // Ensure values come from item or parent if missing
                              marketPrice: i.marketPrice || p.closeMarketPrice,
                              usdToBs: i.usdToBs || p.closeUsdToBs
                            })))
                            .filter(item => !item.isTransferred);
                          
                          if (available.length === 0) return (
                            <tr>
                              <td colSpan={11} className="px-6 py-12 text-center text-zinc-600 italic">
                                No hay materiales disponibles para transferencia.
                              </td>
                            </tr>
                          );
                          
                          return available.map((item, idx) => (
                            <tr key={item.id} className="hover:bg-white/[0.02] transition-colors group">
                              <td className="px-6 py-4">
                                <input 
                                  type="checkbox"
                                  checked={selectedTransferMaterials.includes(item.id!)}
                                  onChange={() => {
                                    setSelectedTransferMaterials(prev => 
                                      prev.includes(item.id!) ? prev.filter(id => id !== item.id) : [...prev, item.id!]
                                    );
                                  }}
                                  className="w-5 h-5 rounded-lg border-zinc-700 bg-zinc-900 text-blue-500 focus:ring-blue-500/20 cursor-pointer"
                                />
                              </td>
                              <td className="px-6 py-4 text-xs font-bold text-zinc-500">{idx + 1}</td>
                              <td className="px-6 py-4 text-sm font-mono font-bold text-amber-500">#{item.receiptNumber}</td>
                              <td className="px-6 py-4">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${item.type === 'barra' ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-500'}`}>
                                  {item.type || 'pieza'}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-sm text-zinc-100">{clients.find(c => c.id === item.clientId)?.name}</td>
                              <td className="px-6 py-4 text-sm font-mono font-bold text-zinc-300">{formatNumber(item.finalWeight)}g</td>
                              <td className="px-6 py-4 text-sm font-mono font-bold text-amber-500">{formatNumber(item.purity)}%</td>
                              <td className="px-6 py-4 text-sm font-mono text-zinc-500">{formatNumber(item.marketPrice || 0)}</td>
                              <td className="px-6 py-4 text-sm font-mono text-red-500/70">{formatNumber(item.loss || 0)}g</td>
                              <td className="px-6 py-4 text-right text-sm font-mono font-bold text-zinc-100">{formatNumber(item.total)} BS</td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="p-8 bg-zinc-950 border-t border-white/5 flex justify-between items-center">
                  <div className="flex gap-8">
                    <div>
                      <p className="text-[10px] font-bold uppercase text-zinc-500 mb-1">Items Seleccionados</p>
                      <p className="text-2xl font-bold text-zinc-100">{selectedTransferMaterials.length}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-zinc-500 mb-1">Peso Total (g)</p>
                      <p className="text-2xl font-mono font-bold text-blue-500">
                        {formatNumber(
                          goldPurchases
                            .filter(p => p.branchId === branchMode)
                            .flatMap(p => p.items || [])
                            .filter(item => selectedTransferMaterials.includes(item.id!))
                            .reduce((acc, item) => acc + item.finalWeight, 0)
                        )}g
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => {
                        setShowTransferModal(false);
                        setSelectedTransferMaterials([]);
                      }}
                      className="px-8 py-3 bg-zinc-800 text-zinc-300 rounded-2xl font-bold hover:bg-zinc-700 transition-all"
                    >
                      Cancelar
                    </button>
                    <button 
                      disabled={selectedTransferMaterials.length === 0 || isTransferring}
                      onClick={handleTransfer}
                      className="px-12 py-3 bg-blue-600 text-white rounded-2xl font-bold shadow-xl shadow-blue-600/20 hover:bg-blue-500 disabled:opacity-50 transition-all flex items-center gap-2"
                    >
                      {isTransferring ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      ) : (
                        <Truck className="w-5 h-5" />
                      )}
                      Iniciar Transferencia
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Transfer History Modal - Warehouse / Global */}
      <AnimatePresence>
        {showTransferHistoryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTransferHistoryModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-[1550px] bg-zinc-900 rounded-[32px] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[95vh]"
            >
              <div className="p-8 border-b border-white/5 bg-zinc-950 flex justify-between items-start">
                <div>
                  <h3 className="text-2xl font-bold text-zinc-100 flex items-center gap-3 italic">
                    <Truck className="w-6 h-6 text-amber-500" /> Historial de Transferencias y Tránsitos
                  </h3>
                  <p className="text-zinc-500 text-sm mt-1">Gestation de envíos entre sucursales y recepción en central</p>
                </div>
                <button onClick={() => setShowTransferHistoryModal(false)} className="text-zinc-500 hover:text-zinc-300">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-x-auto p-8 custom-scrollbar">
                <div className="bg-zinc-950/50 rounded-2xl border border-white/5 overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] text-zinc-500 uppercase font-bold border-b border-white/5 bg-zinc-900/50">
                        <th className="px-6 py-4">Sucursal Origen</th>
                        <th className="px-6 py-4">Fecha Envío</th>
                        <th className="px-6 py-4">Enviado Por</th>
                        <th className="px-6 py-4">Items</th>
                        <th className="px-6 py-4">Peso Total</th>
                        <th className="px-6 py-4">Gramos 100%</th>
                        <th className="px-6 py-4">Estado</th>
                        <th className="px-6 py-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {goldTransfers.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-6 py-12 text-center text-zinc-600 italic">
                            No hay registros de transferencias.
                          </td>
                        </tr>
                      ) : (
                        goldTransfers
                          .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
                          .map(t => (
                          <tr key={t.id} className="hover:bg-white/[0.02] transition-colors group">
                            <td className="px-6 py-4">
                              <span className="text-sm font-bold text-zinc-100">{branches.find(b => b.id === t.branchId)?.name || 'Sucursal'}</span>
                            </td>
                            <td className="px-6 py-4 text-xs font-mono text-zinc-400">{new Date(t.sentAt).toLocaleString()}</td>
                            <td className="px-6 py-4 text-xs font-bold text-zinc-300 uppercase italic">{t.sentBy}</td>
                            <td className="px-6 py-4">
                              <span className="px-2 py-1 bg-zinc-800 text-zinc-400 rounded-lg text-[10px] font-bold">
                                {t.materialIds.length} materiales
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm font-mono font-bold text-blue-400">{formatNumber(t.totalWeight)}g</td>
                            <td className="px-6 py-4 text-sm font-mono font-bold text-amber-500">{formatNumber(t.totalGrams100)}g</td>
                            <td className="px-6 py-4">
                              <span className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase flex items-center gap-1.5 w-fit ${t.status === 'en_transito' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'}`}>
                                {t.status === 'en_transito' ? (
                                  <>
                                    <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                                    EN TRÁNSITO
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="w-1.5 h-1.5" />
                                    RECIBIDO
                                  </>
                                )}
                              </span>
                              {t.status === 'recibido' && (
                                <div className="mt-1 flex flex-col gap-0.5">
                                  <p className="text-[8px] text-zinc-500 uppercase font-bold tracking-tight">Recibido por: {t.receivedBy}</p>
                                  <p className="text-[8px] text-zinc-600 font-mono italic">{new Date(t.receivedAt!).toLocaleString()}</p>
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex justify-end gap-2">
                                {t.status === 'en_transito' && !branchMode && (
                                  <button 
                                    onClick={() => handleReceiveTransfer(t)}
                                    className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2"
                                  >
                                    <CheckCircle2 className="w-4 h-4" /> Recibir en Central
                                  </button>
                                )}
                                {t.status === 'recibido' && !branchMode && (
                                  <button 
                                    onClick={() => {
                                      setSelectedTransferForItems(t);
                                      setShowTransferItemsModal(true);
                                    }}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2"
                                  >
                                    <Eye className="w-4 h-4" /> Verificar Items
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Transfer Items Verification Modal */}
      <AnimatePresence>
        {showTransferItemsModal && selectedTransferForItems && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTransferItemsModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 20 }}
               className="relative w-full max-w-[1600px] bg-zinc-900 rounded-[32px] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
             >
               <div className="p-8 border-b border-white/5 bg-zinc-950 flex justify-between items-start">
                  <div>
                    <h3 className="text-2xl font-bold text-zinc-100 flex items-center gap-3 italic">
                      <Truck className="w-6 h-6 text-amber-500" /> Verificar Materiales de Transferencia
                  </h3>
                  <p className="text-zinc-500 text-sm mt-1">Sucursal: {branches.find(b => b.id === selectedTransferForItems.branchId)?.name}</p>
                </div>
                <button onClick={() => setShowTransferItemsModal(false)} className="text-zinc-500 hover:text-zinc-300">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
                <div className="bg-zinc-950/50 rounded-2xl border border-white/5 overflow-hidden overflow-x-auto">
                  <table className="w-full text-left min-w-[1200px]">
                    <thead>
                      <tr className="text-[10px] text-zinc-500 uppercase font-bold border-b border-white/5 bg-zinc-900/50">
                        <th className="px-6 py-4">Recibo</th>
                        <th className="px-6 py-4">Cliente</th>
                        <th className="px-6 py-4">Peso</th>
                        <th className="px-6 py-4">Ley</th>
                        <th className="px-6 py-4">Cotización</th>
                        <th className="px-6 py-4">Precio/g</th>
                        <th className="px-6 py-4">Merma (g)</th>
                        <th className="px-6 py-4">Total BS</th>
                        <th className="px-6 py-4">Estado</th>
                        <th className="px-6 py-4 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {goldPurchases
                        .flatMap(p => (p.items || []).map(i => ({
                          ...i, 
                          receiptNumber: p.receiptNumber, 
                          clientId: p.clientId, 
                          clientName: clients.find(c => c.id === p.clientId)?.name,
                          marketPrice: i.marketPrice || p.closeMarketPrice,
                          usdToBs: i.usdToBs || p.closeUsdToBs
                        })))
                        .filter(item => selectedTransferForItems.materialIds.includes(item.id!))
                        .map((item) => (
                        <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-6 py-4 text-sm font-mono font-bold text-amber-500">#{item.receiptNumber}</td>
                          <td className="px-6 py-4 text-sm text-zinc-100">{item.clientName}</td>
                          <td className="px-6 py-4 text-sm font-mono text-zinc-300">{formatNumber(item.finalWeight)}g</td>
                          <td className="px-6 py-4 text-sm font-mono text-amber-500">{formatNumber(item.purity)}%</td>
                          <td className="px-6 py-4 text-sm font-mono text-zinc-500">{formatNumber(item.marketPrice || 0)}</td>
                          <td className="px-6 py-4 text-sm font-mono text-zinc-500">{formatNumber(item.pricePerGram || 0)}</td>
                          <td className="px-6 py-4 text-sm font-mono text-red-500/70">{formatNumber(item.loss || 0)}g</td>
                          <td className="px-6 py-4 text-sm font-mono text-zinc-100">{formatNumber(item.total)} BS</td>
                          <td className="px-6 py-4">
                            {item.isVerifiedInCentral ? (
                              <span className="px-2 py-1 bg-emerald-500/10 text-emerald-500 rounded text-[9px] font-bold uppercase">Verificado</span>
                            ) : (
                              <span className="px-2 py-1 bg-amber-500/10 text-amber-500 rounded text-[9px] font-bold uppercase">Pendiente</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {!item.isVerifiedInCentral && (
                              <button 
                                onClick={() => {
                                  setSelectedItemToVerify({
                                    ...item,
                                    loss: item.initialWeight - item.finalWeight,
                                    lossPercentage: item.initialWeight > 0 ? ((item.initialWeight - item.finalWeight) / item.initialWeight) * 100 : 0
                                  });
                                  setShowVerifyItemModal(true);
                                }}
                                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold transition-all"
                              >
                                Verificar y Registrar
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Receive Transfer Confirmation Modal */}
      <AnimatePresence>
        {showReceiveConfirmModal && transferToReceive && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowReceiveConfirmModal(false);
                setTransferToReceive(null);
              }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-zinc-900 rounded-[32px] border border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="p-8 text-center space-y-4">
                <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-zinc-100">Confirmar Recepción</h3>
                  <p className="text-zinc-500 text-sm mt-2">
                    ¿Marcar el material enviado por <span className="text-zinc-100 font-bold uppercase italic">{transferToReceive.sentBy}</span> como recibido en Almacén Central?
                  </p>
                </div>
                <div className="flex gap-4 pt-4">
                  <button 
                    onClick={() => {
                      setShowReceiveConfirmModal(false);
                      setTransferToReceive(null);
                    }}
                    className="flex-1 py-3 bg-zinc-800 text-zinc-300 rounded-2xl font-bold hover:bg-zinc-700 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={confirmReceiveTransfer}
                    disabled={isVerifyingTransfer}
                    className="flex-1 py-3 bg-emerald-600 text-white rounded-2xl font-bold shadow-xl shadow-emerald-600/20 hover:bg-emerald-500 transition-all flex items-center justify-center gap-2"
                  >
                    {isVerifyingTransfer ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'Confirmar'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Item Verification Detail Modal */}
      <AnimatePresence>
        {showVerifyItemModal && selectedItemToVerify && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowVerifyItemModal(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-zinc-900 rounded-[32px] border border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-white/5 bg-zinc-950 flex justify-between items-center">
                <h3 className="text-xl font-bold text-zinc-100 italic flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Confirmar Datos Material
                </h3>
                <button onClick={() => setShowVerifyItemModal(false)} className="text-zinc-500 hover:text-zinc-300">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="bg-zinc-950/50 p-4 rounded-2xl border border-white/5">
                  <p className="text-[10px] font-bold uppercase text-zinc-500 mb-1">Cliente Origen</p>
                  <p className="text-zinc-100 font-bold">{selectedItemToVerify.clientName}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-zinc-500">Recibo</label>
                    <input 
                      type="text" 
                      defaultValue={selectedItemToVerify.receiptNumber}
                      onBlur={(e) => setSelectedItemToVerify({...selectedItemToVerify, receiptNumber: e.target.value})}
                      className="w-full p-2.5 bg-zinc-950 rounded-xl border border-white/5 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-amber-500/50 transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-zinc-500">Tipo</label>
                    <input 
                      type="text" 
                      defaultValue={selectedItemToVerify.type}
                      onBlur={(e) => setSelectedItemToVerify({...selectedItemToVerify, type: e.target.value})}
                      className="w-full p-2.5 bg-zinc-950 rounded-xl border border-white/5 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-amber-500/50 transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-zinc-500">Peso Inicial</label>
                    <input 
                      type="number" 
                      step="0.01"
                      defaultValue={selectedItemToVerify.initialWeight}
                      onBlur={(e) => {
                        const initial = parseFloat(e.target.value);
                        const final = selectedItemToVerify.finalWeight;
                        const loss = initial - final;
                        const lossPct = initial > 0 ? (loss / initial) * 100 : 0;
                        setSelectedItemToVerify({
                          ...selectedItemToVerify, 
                          initialWeight: initial,
                          loss: loss,
                          lossPercentage: lossPct
                        });
                      }}
                      className="w-full p-2.5 bg-zinc-950 rounded-xl border border-white/5 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-amber-500/50 transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-zinc-500">Peso Final</label>
                    <input 
                      type="number" 
                      step="0.01"
                      defaultValue={selectedItemToVerify.finalWeight}
                      onBlur={(e) => {
                        const final = parseFloat(e.target.value);
                        const initial = selectedItemToVerify.initialWeight;
                        const loss = initial - final;
                        const lossPct = initial > 0 ? (loss / initial) * 100 : 0;
                        setSelectedItemToVerify({
                          ...selectedItemToVerify, 
                          finalWeight: final,
                          loss: loss,
                          lossPercentage: lossPct
                        });
                      }}
                      className="w-full p-2.5 bg-zinc-950 rounded-xl border border-white/5 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-amber-500/50 transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-zinc-500">Merma (g)</label>
                    <input 
                      type="text" 
                      value={formatNumber(selectedItemToVerify.loss || 0)}
                      disabled
                      className="w-full p-2.5 bg-zinc-900 rounded-xl border border-white/5 text-sm text-zinc-500 outline-none cursor-not-allowed"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-zinc-500">Merma (%)</label>
                    <input 
                      type="text" 
                      value={formatNumber(selectedItemToVerify.lossPercentage || 0) + '%'}
                      disabled
                      className="w-full p-2.5 bg-zinc-900 rounded-xl border border-white/5 text-sm text-zinc-500 outline-none cursor-not-allowed"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-zinc-500">Ley (%)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      defaultValue={selectedItemToVerify.purity}
                      onBlur={(e) => setSelectedItemToVerify({...selectedItemToVerify, purity: parseFloat(e.target.value)})}
                      className="w-full p-2.5 bg-zinc-950 rounded-xl border border-white/5 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-amber-500/50 transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-zinc-500">Cotización</label>
                    <input 
                      type="number" 
                      step="0.01"
                      defaultValue={selectedItemToVerify.marketPrice}
                      onBlur={(e) => setSelectedItemToVerify({...selectedItemToVerify, marketPrice: parseFloat(e.target.value)})}
                      className="w-full p-2.5 bg-zinc-950 rounded-xl border border-white/5 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-amber-500/50 transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-zinc-500">Dolar (Bs)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      defaultValue={selectedItemToVerify.usdToBs}
                      onBlur={(e) => setSelectedItemToVerify({...selectedItemToVerify, usdToBs: parseFloat(e.target.value)})}
                      className="w-full p-2.5 bg-zinc-950 rounded-xl border border-white/5 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-amber-500/50 transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-zinc-500">Precio/g</label>
                    <input 
                      type="number" 
                      step="0.01"
                      defaultValue={selectedItemToVerify.pricePerGram}
                      onBlur={(e) => setSelectedItemToVerify({...selectedItemToVerify, pricePerGram: parseFloat(e.target.value)})}
                      className="w-full p-2.5 bg-zinc-950 rounded-xl border border-white/5 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-amber-500/50 transition-all"
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <label className="text-[10px] font-bold uppercase text-zinc-500">Total BS</label>
                    <input 
                      type="number" 
                      step="0.01"
                      defaultValue={selectedItemToVerify.total}
                      onBlur={(e) => setSelectedItemToVerify({...selectedItemToVerify, total: parseFloat(e.target.value)})}
                      className="w-full p-2.5 bg-zinc-950 rounded-xl border border-white/5 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-amber-500/50 transition-all"
                    />
                  </div>
                </div>
                
                <button 
                  disabled={isVerifyingItem}
                  onClick={() => handleVerifyItem(selectedItemToVerify.id, selectedItemToVerify)}
                  className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-500 transition-all flex items-center justify-center gap-2 shadow-xl shadow-emerald-900/20"
                >
                  {isVerifyingItem ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  Confirmar y Registrar en Inventario
                </button>
              </div>
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
                              <td className="px-6 py-3 text-xs text-zinc-500">{new Date(p.createdAt).toLocaleString()}</td>
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
                            {payout.purchaseReceipts.map((rec, idx) => (
                              <span key={`${rec}-${idx}`} className="px-2 py-1 bg-zinc-900 text-amber-500 text-[10px] font-mono font-bold rounded-lg border border-amber-500/10 shadow-lg">
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
              className="relative w-full max-w-[1300px] bg-zinc-900 rounded-[32px] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[95vh]"
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
                  <label className="text-[10px] font-bold uppercase text-zinc-500 mb-1 block">Otra Cotización(Bs)</label>
                  <input 
                    type="number"
                    step="0.01"
                    placeholder="Ingrese cotización..."
                    value={revalOtherQuotation || ''}
                    onChange={(e) => setRevalOtherQuotation(parseFloat(e.target.value) || 0)}
                    className="w-full p-4 bg-zinc-950 rounded-2xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-zinc-500 mb-1 block">Otra Ley (%)</label>
                  <input 
                    type="number"
                    step="0.01"
                    placeholder="Ingrese ley..."
                    value={revalOtherPurity || ''}
                    onChange={(e) => setRevalOtherPurity(parseFloat(e.target.value) || 0)}
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
                  onClick={() => handleUpdateRevaluation(revaluationItem.id, revalOtherQuotation, revalOtherPurity)}
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
      {/* Advance Payment Modal */}
      <AnimatePresence>
        {showAdvanceModal && currentPurchaseForAdvance && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAdvanceModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-zinc-900 w-full max-w-lg rounded-[32px] border border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-white/5 bg-zinc-950 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold text-zinc-100 flex items-center gap-3">
                    <CornerDownRight className="w-5 h-5 text-blue-500" /> {editingAdvanceId ? 'Editar Adelanto' : 'Registrar Adelanto'}
                  </h3>
                  <p className="text-xs text-zinc-500 mt-1">Compra #{currentPurchaseForAdvance.receiptNumber}</p>
                </div>
                <button onClick={() => setShowAdvanceModal(false)} className="text-zinc-500 hover:text-zinc-300">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSaveAdvancePayment} className="p-8 space-y-6">
                <div className="p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Total BS (Material)</p>
                    <p className="text-sm font-mono font-bold text-zinc-300">
                      {formatNumber(currentPurchaseForAdvance.items?.reduce((acc: number, curr: any) => acc + (curr.total || 0), 0) || 0)} BS
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Saldo Pendiente</p>
                    <p className="text-xl font-mono font-bold text-emerald-500">
                      {formatNumber(
                        (currentPurchaseForAdvance.items?.reduce((acc: number, curr: any) => acc + (curr.total || 0), 0) || 0) - 
                        ((currentPurchaseForAdvance.advancePayment || 0) + (currentPurchaseForAdvance.advances?.filter(adv => adv.id !== editingAdvanceId).reduce((sum, adv) => sum + adv.amount, 0) || 0))
                      )} BS
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest">Fecha</label>
                    <input 
                      type="date"
                      required
                      value={advanceFormData.date}
                      onChange={e => setAdvanceFormData({...advanceFormData, date: e.target.value})}
                      className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-sm text-zinc-100 focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest text-emerald-500">Monto Adelanto (BS)</label>
                    <input 
                      type="number"
                      step="0.01"
                      required
                      autoFocus
                      placeholder="0.00"
                      value={advanceFormData.amount || ''}
                      onChange={e => {
                        const val = parseFloat(parseFloat(e.target.value).toFixed(2)) || 0;
                        setAdvanceFormData({
                          ...advanceFormData, 
                          amount: val,
                          cashAmount: advanceFormData.paymentType === 'efectivo' ? val : (advanceFormData.paymentType === 'mixto' ? advanceFormData.cashAmount : 0),
                          bankAmount: advanceFormData.paymentType === 'transferencia' ? val : (advanceFormData.paymentType === 'mixto' ? advanceFormData.bankAmount : 0)
                        });
                      }}
                      className="w-full p-3 bg-zinc-950 rounded-xl border border-emerald-500/30 text-emerald-500 font-mono font-bold text-lg focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest">Concepto / Glosa</label>
                  <input 
                    type="text"
                    required
                    placeholder="Ej: Adelanto por materiales..."
                    value={advanceFormData.concept}
                    onChange={e => setAdvanceFormData({...advanceFormData, concept: e.target.value})}
                    className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-sm text-zinc-100 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <div className="space-y-4 pt-4 border-t border-white/5">
                  <div className="flex gap-2">
                    {(['efectivo', 'transferencia', 'mixto'] as const).map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          setAdvanceFormData({
                            ...advanceFormData,
                            paymentType: type,
                            cashAmount: type === 'efectivo' ? advanceFormData.amount : 0,
                            bankAmount: type === 'transferencia' ? advanceFormData.amount : 0
                          });
                        }}
                        className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border ${advanceFormData.paymentType === type ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-600/20' : 'bg-zinc-900 text-zinc-500 border-white/5 hover:text-zinc-300'}`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>

                  {advanceFormData.paymentType === 'mixto' && (
                    <div className="grid grid-cols-2 gap-4 p-4 bg-zinc-950 rounded-2xl border border-white/5">
                      <div className="space-y-1">
                        <label className="text-[8px] font-bold uppercase text-zinc-500">Monto Efectivo</label>
                        <input 
                          type="number"
                          step="0.01"
                          value={advanceFormData.cashAmount || ''}
                          onChange={e => {
                            const cash = parseFloat(parseFloat(e.target.value).toFixed(2)) || 0;
                            setAdvanceFormData({...advanceFormData, cashAmount: cash, bankAmount: parseFloat(Math.max(0, advanceFormData.amount - cash).toFixed(2))});
                          }}
                          className="w-full p-2 bg-zinc-900 rounded-lg border border-white/5 text-xs text-zinc-100"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-bold uppercase text-zinc-500">Monto Banco</label>
                        <input 
                          type="number"
                          step="0.01"
                          value={advanceFormData.bankAmount || ''}
                          onChange={e => {
                            const bank = parseFloat(parseFloat(e.target.value).toFixed(2)) || 0;
                            setAdvanceFormData({...advanceFormData, bankAmount: bank, cashAmount: parseFloat(Math.max(0, advanceFormData.amount - bank).toFixed(2))});
                          }}
                          className="w-full p-2 bg-zinc-900 rounded-lg border border-white/5 text-xs text-zinc-100"
                        />
                      </div>
                    </div>
                  )}

                  {(advanceFormData.paymentType === 'transferencia' || advanceFormData.paymentType === 'mixto') && (
                    <div className="space-y-4 p-4 bg-zinc-950 rounded-2xl border border-white/5 animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="space-y-2">
                        <label className="text-[8px] font-bold uppercase text-zinc-500">Cuenta de Origen (Nuestra)</label>
                        <select 
                          required
                          value={advanceFormData.sourceBankAccountId}
                          onChange={e => setAdvanceFormData({...advanceFormData, sourceBankAccountId: e.target.value})}
                          className="w-full p-2.5 bg-zinc-900 rounded-xl border border-white/5 text-xs text-zinc-100 italic"
                        >
                          <option value="">Seleccione cuenta...</option>
                          {branchBankAccounts.filter(acc => acc.branchId === currentPurchaseForAdvance.branchId).map(acc => (
                            <option key={acc.id} value={acc.id}>{acc.bankName} - {acc.accountNumber}</option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[8px] font-bold uppercase text-zinc-500">Banco Cliente</label>
                          <input 
                            type="text" 
                            placeholder="Ej: BCP"
                            value={advanceFormData.clientBank}
                            onChange={e => setAdvanceFormData({...advanceFormData, clientBank: e.target.value})}
                            className="w-full p-2.5 bg-zinc-900 rounded-xl border border-white/5 text-xs text-zinc-100"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[8px] font-bold uppercase text-zinc-500">Nº Cuenta Cliente</label>
                          <input 
                            type="text" 
                            placeholder="Opcional"
                            value={advanceFormData.clientAccountNumber}
                            onChange={e => setAdvanceFormData({...advanceFormData, clientAccountNumber: e.target.value})}
                            className="w-full p-2.5 bg-zinc-900 rounded-xl border border-white/5 text-xs text-zinc-100"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setShowAdvanceModal(false)}
                    className="flex-1 py-4 bg-zinc-800 text-zinc-400 rounded-2xl font-bold hover:bg-zinc-800/80 transition-all border border-white/5"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-5 h-5" /> {editingAdvanceId ? 'Guardar Cambios' : 'Confirmar Adelanto'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Branch Bank Accounts Modal */}
      <AnimatePresence>
        {showBranchBankAccountsModal && selectedBranchForBanks && (
          <div key="branch-bank-accounts-modal-container" className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              key="branch-bank-accounts-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowBranchBankAccountsModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              key="branch-bank-accounts-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-zinc-900 rounded-[32px] border border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-white/5 bg-zinc-950 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold text-zinc-100 flex items-center gap-3 italic">
                    <Building2 className="w-5 h-5 text-orange-500" /> Cuentas Bancarias - {selectedBranchForBanks.name}
                  </h3>
                  <p className="text-xs text-zinc-500 mt-1">Gestione las cuentas bancarias autorizadas para esta sucursal.</p>
                </div>
                <button 
                  onClick={() => {
                    setShowBranchBankAccountsModal(false);
                    setEditingBranchBankAccount(null);
                    setBankAccountFormData({ bankName: '', accountNumber: '' });
                  }} 
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAddBranchBankAccount(selectedBranchForBanks.id);
                  }}
                  className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-zinc-950 p-6 rounded-2xl border border-white/5"
                >
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-zinc-500">Nombre del Banco</label>
                    <input 
                      required
                      type="text" 
                      placeholder="Ej: Banco Unión"
                      value={bankAccountFormData.bankName}
                      onChange={e => setBankAccountFormData({...bankAccountFormData, bankName: e.target.value})}
                      className="w-full p-2.5 bg-zinc-900 rounded-xl border border-white/5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500/20 shadow-inner"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-zinc-500">Número de Cuenta</label>
                    <input 
                      required
                      type="text" 
                      placeholder="Ej: 123456789"
                      value={bankAccountFormData.accountNumber}
                      onChange={e => setBankAccountFormData({...bankAccountFormData, accountNumber: e.target.value})}
                      className="w-full p-2.5 bg-zinc-900 rounded-xl border border-white/5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500/20 shadow-inner"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <button 
                      type="submit"
                      className="w-full py-3 bg-orange-600 text-white rounded-xl font-bold hover:bg-orange-500 transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-600/20"
                    >
                      {editingBranchBankAccount ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                      {editingBranchBankAccount ? 'Actualizar Cuenta' : 'Agregar Cuenta'}
                    </button>
                    {editingBranchBankAccount && (
                      <button 
                        type="button"
                        onClick={() => {
                          setEditingBranchBankAccount(null);
                          setBankAccountFormData({ bankName: '', accountNumber: '' });
                        }}
                        className="w-full mt-2 py-2 bg-zinc-800 text-zinc-400 rounded-xl font-bold hover:bg-zinc-700 transition-all text-xs"
                      >
                        Cancelar Edición
                      </button>
                    )}
                  </div>
                </form>

                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest px-2">Cuentas Registradas</h4>
                  <div className="max-h-[300px] overflow-y-auto custom-scrollbar space-y-2">
                    {branchBankAccounts.filter(acc => acc.branchId === selectedBranchForBanks.id).map(acc => (
                      <div key={acc.id} className="flex justify-between items-center p-4 bg-zinc-900/50 rounded-2xl border border-white/5 group hover:bg-white/[0.02] transition-all">
                        <div>
                          <p className="text-sm font-bold text-zinc-100">{acc.bankName}</p>
                          <p className="text-xs font-mono text-zinc-500">{acc.accountNumber}</p>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              setEditingBranchBankAccount(acc);
                              setBankAccountFormData({ bankName: acc.bankName, accountNumber: acc.accountNumber });
                            }}
                            className="p-2 text-zinc-600 hover:text-blue-400 hover:bg-blue-400/10 rounded-xl transition-all"
                            title="Editar"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDeleteBranchBankAccount(acc.id)}
                            className="p-2 text-zinc-600 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {branchBankAccounts.filter(acc => acc.branchId === selectedBranchForBanks.id).length === 0 && (
                      <div className="text-center py-10 text-zinc-600 italic text-sm">
                        No hay cuentas registradas.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-8 bg-zinc-950 border-t border-white/5">
                <button 
                  onClick={() => {
                    setShowBranchBankAccountsModal(false);
                    setEditingBranchBankAccount(null);
                    setBankAccountFormData({ bankName: '', accountNumber: '' });
                  }}
                  className="w-full py-4 bg-zinc-900 text-zinc-400 rounded-2xl font-bold hover:bg-zinc-800 transition-all border border-white/5"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddCashMoveModal && (
          <div key="add-cash-move-modal-container" className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              key="add-move-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddCashMoveModal(false)}
              className="absolute inset-0 bg-zinc-950/80 backdrop-blur-md"
            />
            <motion.div 
              key="add-move-modal"
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-zinc-900 rounded-[32px] border border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-white/5 bg-zinc-900/50 flex justify-between items-center">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Plus className="w-5 h-5 text-amber-500" /> Nuevo Movimiento de Caja
                </h3>
                <button onClick={() => setShowAddCashMoveModal(false)} className="text-zinc-500 hover:text-white transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleAddCashMove} className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest px-1">Tipo de Movimiento</label>
                    <div className="flex bg-zinc-950 p-1 rounded-xl border border-white/5">
                      <button 
                        type="button"
                        onClick={() => setCashMoveFormData({...cashMoveFormData, type: 'ingreso'})}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all ${cashMoveFormData.type === 'ingreso' ? 'bg-emerald-500 text-zinc-950 shadow-lg shadow-emerald-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >
                        Ingreso
                      </button>
                      <button 
                        type="button"
                        onClick={() => setCashMoveFormData({...cashMoveFormData, type: 'egreso'})}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all ${cashMoveFormData.type === 'egreso' ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >
                        Egreso
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest px-1">Monto (BS)</label>
                    <input 
                      required
                      type="number"
                      step="0.01"
                      value={cashMoveFormData.amount || ''}
                      onChange={e => setCashMoveFormData({...cashMoveFormData, amount: parseFloat(e.target.value) || 0})}
                      className="w-full p-2.5 bg-zinc-950 rounded-xl border border-white/5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20 font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest px-1">Concepto</label>
                  <input 
                    required
                    type="text"
                    placeholder="Ej: Pago de servicios, Venta de material..."
                    value={cashMoveFormData.concept || ''}
                    onChange={e => setCashMoveFormData({...cashMoveFormData, concept: e.target.value})}
                    className="w-full p-2.5 bg-zinc-950 rounded-xl border border-white/5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest px-1">Categoría</label>
                    <select
                      value={cashMoveFormData.category}
                      onChange={e => setCashMoveFormData({...cashMoveFormData, category: e.target.value as any})}
                      className="w-full p-2.5 bg-zinc-950 rounded-xl border border-white/5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    >
                      <option value="manual">Manual / Varios</option>
                      <option value="compra">Compra Oro</option>
                      <option value="pago">Pago Proveedores</option>
                      <option value="adelanto">Adelanto</option>
                      <option value="servicio">Servicios / Gastos</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest px-1">Tipo de Pago</label>
                    <select
                      value={cashMoveFormData.paymentType}
                      onChange={e => setCashMoveFormData({...cashMoveFormData, paymentType: e.target.value as any})}
                      className="w-full p-2.5 bg-zinc-950 rounded-xl border border-white/5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    >
                      <option value="efectivo">Efectivo</option>
                      <option value="transferencia">Transferencia</option>
                    </select>
                  </div>
                </div>

                {cashMoveFormData.paymentType === 'transferencia' && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest px-1">Cuenta Bancaria de Sucursal</label>
                    <select
                      required
                      value={cashMoveFormData.bankAccountId || ''}
                      onChange={e => setCashMoveFormData({...cashMoveFormData, bankAccountId: e.target.value})}
                      className="w-full p-2.5 bg-zinc-950 rounded-xl border border-white/5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    >
                      <option value="">Seleccione una cuenta...</option>
                      {branchBankAccounts
                        .filter(acc => acc.branchId === branchMode)
                        .map(acc => (
                          <option key={acc.id} value={acc.id}>{acc.bankName} - {acc.accountNumber}</option>
                        ))
                      }
                    </select>
                    {branchBankAccounts.filter(acc => acc.branchId === branchMode).length === 0 && (
                      <p className="text-[10px] text-red-400 mt-1">No hay cuentas bancarias registradas en esta sucursal.</p>
                    )}
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest px-1">Fecha</label>
                  <input 
                    required
                    type="date"
                    value={cashMoveFormData.date?.split('T')[0] || ''}
                    onChange={e => setCashMoveFormData({...cashMoveFormData, date: e.target.value})}
                    className="w-full p-2.5 bg-zinc-950 rounded-xl border border-white/5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>

                <div className="pt-4">
                  <button 
                    type="submit"
                    className="w-full py-4 bg-amber-500 text-zinc-950 rounded-2xl font-black uppercase tracking-widest hover:bg-amber-400 transition-all shadow-xl shadow-amber-500/20"
                  >
                    Registrar Movimiento
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showEditCashMoveModal && (
          <div key="edit-cash-move-modal-container" className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              key="edit-move-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowEditCashMoveModal(false);
                setEditingCashMove(null);
                setCashMoveFormData({
                  amount: 0,
                  type: 'ingreso',
                  concept: '',
                  category: 'manual',
                  paymentType: 'efectivo'
                });
              }}
              className="absolute inset-0 bg-zinc-950/80 backdrop-blur-md"
            />
            <motion.div 
              key="edit-move-modal"
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-zinc-900 rounded-[32px] border border-white/10 shadow-2xl overflow-hidden"
            >
                <div className="p-8 border-b border-white/5 bg-zinc-900/50 flex justify-between items-center">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Edit2 className="w-5 h-5 text-amber-500" /> Editar Movimiento de Caja
                  </h3>
                  <button onClick={() => {
                    setShowEditCashMoveModal(false);
                    setEditingCashMove(null);
                    setCashMoveFormData({
                      amount: 0,
                      type: 'ingreso',
                      concept: '',
                      category: 'manual',
                      paymentType: 'efectivo'
                    });
                  }} className="text-zinc-500 hover:text-white transition-colors">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <form onSubmit={handleUpdateCashMove} className="p-8 space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest px-1">Tipo de Movimiento</label>
                      <div className="flex bg-zinc-950 p-1 rounded-xl border border-white/5">
                        <button 
                          type="button"
                          onClick={() => setCashMoveFormData({...cashMoveFormData, type: 'ingreso'})}
                          className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all ${cashMoveFormData.type === 'ingreso' ? 'bg-emerald-500 text-zinc-950 shadow-lg shadow-emerald-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                          Ingreso
                        </button>
                        <button 
                          type="button"
                          onClick={() => setCashMoveFormData({...cashMoveFormData, type: 'egreso'})}
                          className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all ${cashMoveFormData.type === 'egreso' ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                          Egreso
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest px-1">Monto (BS)</label>
                      <input 
                        required
                        type="number"
                        step="0.01"
                        value={cashMoveFormData.amount || ''}
                        onChange={e => setCashMoveFormData({...cashMoveFormData, amount: parseFloat(e.target.value) || 0})}
                        className="w-full p-2.5 bg-zinc-950 rounded-xl border border-white/5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20 font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest px-1">Concepto</label>
                    <input 
                      required
                      type="text"
                      placeholder="Ej: Pago de servicios, Venta de material..."
                      value={cashMoveFormData.concept || ''}
                      onChange={e => setCashMoveFormData({...cashMoveFormData, concept: e.target.value})}
                      className="w-full p-2.5 bg-zinc-950 rounded-xl border border-white/5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest px-1">Categoría</label>
                      <select
                        value={cashMoveFormData.category}
                        onChange={e => setCashMoveFormData({...cashMoveFormData, category: e.target.value as any})}
                        className="w-full p-2.5 bg-zinc-950 rounded-xl border border-white/5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      >
                        <option value="manual">Manual / Varios</option>
                        <option value="compra">Compra Oro</option>
                        <option value="pago">Pago Proveedores</option>
                        <option value="adelanto">Adelanto</option>
                        <option value="servicio">Servicios / Gastos</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest px-1">Tipo de Pago</label>
                      <select
                        value={cashMoveFormData.paymentType}
                        onChange={e => setCashMoveFormData({...cashMoveFormData, paymentType: e.target.value as any})}
                        className="w-full p-2.5 bg-zinc-950 rounded-xl border border-white/5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      >
                        <option value="efectivo">Efectivo</option>
                        <option value="transferencia">Transferencia</option>
                      </select>
                    </div>
                  </div>

                  {cashMoveFormData.paymentType === 'transferencia' && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest px-1">Cuenta Bancaria de Sucursal</label>
                      <select
                        required
                        value={cashMoveFormData.bankAccountId || ''}
                        onChange={e => setCashMoveFormData({...cashMoveFormData, bankAccountId: e.target.value})}
                        className="w-full p-2.5 bg-zinc-950 rounded-xl border border-white/5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      >
                        <option value="">Seleccione una cuenta...</option>
                        {branchBankAccounts
                          .filter(acc => acc.branchId === branchMode)
                          .map(acc => (
                            <option key={acc.id} value={acc.id}>{acc.bankName} - {acc.accountNumber}</option>
                          ))
                        }
                      </select>
                      {branchBankAccounts.filter(acc => acc.branchId === branchMode).length === 0 && (
                        <p className="text-[10px] text-red-400 mt-1">No hay cuentas bancarias registradas en esta sucursal.</p>
                      )}
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest px-1">Fecha</label>
                    <input 
                      required
                      type="date"
                      value={cashMoveFormData.date?.split('T')[0] || ''}
                      onChange={e => setCashMoveFormData({...cashMoveFormData, date: e.target.value})}
                      className="w-full p-2.5 bg-zinc-950 rounded-xl border border-white/5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>

                  <div className="pt-4">
                    <button 
                      type="submit"
                      className="w-full py-4 bg-amber-500 text-zinc-950 rounded-2xl font-black uppercase tracking-widest hover:bg-amber-400 transition-all shadow-xl shadow-amber-500/20"
                    >
                      Guardar Cambios
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Add Closure Modal */}
      <AnimatePresence>
        {showAddClosureModal && (
          <div key="add-closure-modal-container" className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div 
                key="add-closure-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowAddClosureModal(false)}
                className="absolute inset-0 bg-zinc-950/80 backdrop-blur-md"
              />
              <motion.div 
                key="add-closure-modal"
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="relative w-full max-w-lg bg-zinc-900 rounded-[32px] border border-white/10 shadow-2xl overflow-hidden"
              >
              <div className="p-8 border-b border-white/5 bg-zinc-900/50 flex justify-between items-center">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Lock className="w-5 h-5 text-blue-500" /> Realizar Cierre de Sucursal
                </h3>
                <button onClick={() => setShowAddClosureModal(false)} className="text-zinc-500 hover:text-white transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleCreateClosure} className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                   <div className="bg-zinc-950 p-4 rounded-2xl border border-white/5 space-y-1">
                      <p className="text-[10px] text-zinc-500 uppercase font-bold">Saldo Inicial</p>
                      <p className="text-xl font-mono font-bold text-zinc-300">{formatNumber(closureFormData.initialBalance || 0)} BS</p>
                   </div>
                   <div className="bg-zinc-950 p-4 rounded-2xl border border-white/5 space-y-1">
                      <p className="text-[10px] text-emerald-500/70 uppercase font-bold">Saldo Final (Calculado)</p>
                      <p className="text-xl font-mono font-bold text-emerald-500">{formatNumber(closureFormData.finalBalance || 0)} BS</p>
                   </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest px-1">Observaciones</label>
                  <textarea 
                    rows={3}
                    placeholder="Notas adicionales sobre el cierre del día..."
                    value={closureFormData.notes || ''}
                    onChange={e => setClosureFormData({...closureFormData, notes: e.target.value})}
                    className="w-full p-4 bg-zinc-950 rounded-xl border border-white/5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                  />
                </div>

                <div className="bg-amber-500/5 p-4 rounded-2xl border border-amber-500/10 flex gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                  <p className="text-[10px] text-amber-500/70 font-medium leading-relaxed italic">
                    Al realizar el cierre, se registrará el balance final de la caja para la sucursal. 
                    Asegúrese de haber conciliado todos los movimientos del día.
                  </p>
                </div>

                <div className="pt-4">
                  <button 
                    type="submit"
                    className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-blue-500 transition-all shadow-xl shadow-blue-600/20"
                  >
                    Confirmar Cierre Diario
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* View Closure Details Modal */}
      <AnimatePresence>
        {showViewClosureModal && viewingClosure && (
          <div key="view-closure-modal-container" className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div 
                key="view-closure-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowViewClosureModal(false)}
                className="absolute inset-0 bg-zinc-950/80 backdrop-blur-md"
              />
              <motion.div 
                key="view-closure-modal"
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="relative w-full max-w-4xl bg-zinc-900 rounded-[32px] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
              >
              <div className="p-6 border-b border-white/5 bg-zinc-900/50 flex justify-between items-center shrink-0">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Lock className="w-5 h-5 text-amber-500" /> Detalle de Cierre Diario
                  </h3>
                  <p className="text-[10px] text-zinc-500 font-mono mt-1">CÓDIGO DE CIERRE: {viewingClosure.id.toUpperCase()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => handlePrintClosureReceipt(viewingClosure)}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg transition-all"
                  >
                    <FileText className="w-4 h-4" /> Exportar PDF
                  </button>
                  <button onClick={() => setShowViewClosureModal(false)} className="text-zinc-500 hover:text-white transition-colors">
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
                {/* General Info & Balances */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-zinc-950 p-4 rounded-2xl border border-white/5 space-y-1">
                    <p className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest">Información General</p>
                    <div className="text-xs text-zinc-300 space-y-1 mt-2">
                      <p><span className="text-zinc-500 font-bold uppercase">Fecha:</span> {new Date(viewingClosure.closedAt || viewingClosure.date).toLocaleString()}</p>
                      <p><span className="text-zinc-500 font-bold uppercase">Responsable:</span> {viewingClosure.createdBy}</p>
                      <p><span className="text-zinc-500 font-bold uppercase">Estado:</span> <span className="text-amber-500 font-black">{viewingClosure.status.toUpperCase()}</span></p>
                    </div>
                  </div>

                  <div className="md:col-span-2 bg-zinc-950 p-4 rounded-2xl border border-white/5">
                    <p className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest mb-3">Conciliación de Saldos (Caja)</p>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="p-2.5 bg-zinc-900 rounded-xl border border-white/5">
                        <span className="text-[10px] text-zinc-500 font-bold uppercase block">Inicial</span>
                        <span className="text-sm font-mono font-bold text-zinc-300 mt-1 block">{formatNumber(viewingClosure.initialBalance || 0)} BS</span>
                      </div>
                      <div className="p-2.5 bg-zinc-900 rounded-xl border border-white/5">
                        <span className="text-[10px] text-emerald-500/70 font-bold uppercase block">Ingresos (+)</span>
                        <span className="text-sm font-mono font-bold text-emerald-500 mt-1 block">+{formatNumber(viewingClosure.totalCashIn || 0)} BS</span>
                      </div>
                      <div className="p-2.5 bg-zinc-900 rounded-xl border border-white/5">
                        <span className="text-[10px] text-red-500/70 font-bold uppercase block">Egresos (-)</span>
                        <span className="text-sm font-mono font-bold text-red-400 mt-1 block">-{formatNumber(viewingClosure.totalCashOut || 0)} BS</span>
                      </div>
                      <div className="p-2.5 bg-zinc-900 rounded-xl border border-white/5 shadow-inner">
                        <span className="text-[10px] text-blue-400 font-black uppercase block">Final Neto</span>
                        <span className="text-sm font-mono font-bold text-blue-400 mt-1 block underline decoration-blue-500/20">{formatNumber(viewingClosure.finalBalance || 0)} BS</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Notes if any */}
                {viewingClosure.notes && (
                  <div className="bg-zinc-950 p-4 rounded-2xl border border-white/5 space-y-1">
                    <p className="text-[9px] text-zinc-400 uppercase font-bold tracking-widest">Observaciones</p>
                    <p className="text-xs text-zinc-300 italic leading-relaxed">{viewingClosure.notes}</p>
                  </div>
                )}

                {/* Closed Cash Move lists */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <Coins className="w-4 h-4 text-emerald-500" /> Movimientos de Caja Chica Conciliados ({closureMoves.length})
                  </h4>
                  <div className="bg-zinc-950 rounded-2xl border border-white/5 overflow-hidden">
                    <div className="max-h-[220px] overflow-y-auto custom-scrollbar">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="text-[9px] text-zinc-500 uppercase font-bold border-b border-white/5 bg-zinc-900/50 sticky top-0">
                            <th className="px-5 py-3">Concepto / Categoría</th>
                            <th className="px-5 py-3">Tipo Pago</th>
                            <th className="px-5 py-3">Fecha</th>
                            <th className="px-5 py-3">Operador</th>
                            <th className="px-5 py-3 text-right">Monto BS</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {closureMoves.map(move => (
                            <tr key={move.id} className="hover:bg-white/[0.01] transition-colors text-xs">
                              <td className="px-5 py-3">
                                <div className="font-bold text-zinc-200">{move.concept}</div>
                                <span className="text-[9px] px-1.5 py-0.5 bg-zinc-900 border border-white/5 rounded text-zinc-400 uppercase font-mono font-bold">
                                  {move.category}
                                </span>
                              </td>
                              <td className="px-5 py-3">
                                <span className="text-[9px] font-bold uppercase text-zinc-400">{move.paymentType}</span>
                              </td>
                              <td className="px-5 py-3 text-[10px] text-zinc-500">
                                {new Date(move.date).toLocaleDateString()} {new Date(move.date).toLocaleTimeString()}
                              </td>
                              <td className="px-5 py-3 font-medium text-zinc-400">{move.createdBy}</td>
                              <td className={`px-5 py-3 text-right font-mono font-black ${move.type === 'ingreso' ? 'text-emerald-500' : 'text-red-400'}`}>
                                {move.type === 'ingreso' ? '+' : '-'}{formatNumber(move.amount)} BS
                              </td>
                            </tr>
                          ))}
                          {closureMoves.length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-5 py-10 text-center text-zinc-600 italic">No hay movimientos cargados en este cierre.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Closed Associated Purchases */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <Package className="w-4 h-4 text-amber-500" /> Compras de Oro Asociadas ({goldPurchases.filter(p => p.closureId === viewingClosure.id).length})
                  </h4>
                  <div className="bg-zinc-950 rounded-2xl border border-white/5 overflow-hidden">
                    <div className="max-h-[220px] overflow-y-auto custom-scrollbar">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="text-[9px] text-zinc-500 uppercase font-bold border-b border-white/5 bg-zinc-900/50 sticky top-0">
                            <th className="px-5 py-3">Recibo Compra</th>
                            <th className="px-5 py-3">Cliente</th>
                            <th className="px-5 py-3">Tipo</th>
                            <th className="px-5 py-3">Adelantos / Pagos</th>
                            <th className="px-5 py-3 text-right">Total Liquidación BS</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {goldPurchases.filter(p => p.closureId === viewingClosure.id).map(p => {
                            const clientName = clients.find(c => c.id === p.clientId)?.name || 'Desconocido';
                            const totalExtraAdvances = p.advances?.reduce((sum, adv) => sum + adv.amount, 0) || 0;
                            const totalAllAdvances = (p.advancePayment || 0) + totalExtraAdvances;
                            const purchaseAmt = p.type === 'cerrado' ? (p.closeTotal || p.total) : p.total;
                            
                            return (
                              <tr key={p.id} className="hover:bg-white/[0.01] transition-colors text-xs">
                                <td className="px-5 py-3 font-mono font-bold text-amber-500">
                                  #{p.receiptNumber}
                                </td>
                                <td className="px-5 py-3 font-medium text-zinc-200">
                                  {clientName}
                                </td>
                                <td className="px-5 py-3">
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${p.type === 'cerrado' ? 'bg-blue-500/10 text-blue-400' : 'bg-amber-500/10 text-amber-500'}`}>
                                    {p.type}
                                  </span>
                                </td>
                                <td className="px-5 py-3 font-mono text-zinc-400">
                                  {formatNumber(totalAllAdvances)} BS
                                </td>
                                <td className="px-5 py-3 text-right font-mono font-bold text-emerald-500">
                                  {formatNumber(purchaseAmt)} BS
                                </td>
                              </tr>
                            );
                          })}
                          {goldPurchases.filter(p => p.closureId === viewingClosure.id).length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-5 py-10 text-center text-zinc-600 italic">No hay compras asociadas a este cierre.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

              </div>

              <div className="p-6 border-t border-white/5 bg-zinc-950 flex justify-end shrink-0">
                <button 
                  onClick={() => setShowViewClosureModal(false)}
                  className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl text-xs font-bold uppercase transition-all"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Client Modal */}
      <AnimatePresence mode="wait">
        {showAddClientModal && (
          <div key="add-client-modal" className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                stopGenericCamera();
                setShowAddClientModal(false);
                setEditingClient(null);
                setClientFormData({ name: '', phone: '', phoneCountryCode: '591', referentialPhone: '', referentialCountryCode: '591', email: '', ci: '', workplace: '', recommendedBy: '', isMineCooperative: false, photo: '', documentPhoto: '' });
              }}
              className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl bg-zinc-900 rounded-[32px] border border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-white/5 bg-zinc-950 flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-zinc-100">{editingClient ? 'Editar Cliente' : 'Nuevo Cliente'}</h2>
                  <p className="text-sm text-zinc-400">Ingrese los datos para el registro o edición del cliente.</p>
                </div>
                <button 
                  type="button" 
                  onClick={() => {
                    stopGenericCamera();
                    setShowAddClientModal(false);
                    setEditingClient(null);
                    setClientFormData({ name: '', phone: '', phoneCountryCode: '591', referentialPhone: '', referentialCountryCode: '591', email: '', ci: '', workplace: '', recommendedBy: '', isMineCooperative: false, photo: '', documentPhoto: '' });
                  }} 
                  className="text-zinc-500 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6 hover:rotate-90 transition-all" />
                </button>
              </div>
              <form onSubmit={handleAddClient} className="p-8 space-y-6 max-h-[85vh] overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                  
                  {/* Left Column: Personal & Contact Information */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-blue-500 uppercase tracking-widest border-b border-white/5 pb-2">Información Personal y Contacto</h3>
                    
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-zinc-500">Nombre Completo</label>
                      <input 
                        required
                        type="text" 
                        placeholder="Ej. Juan Perez"
                        value={clientFormData.name}
                        onChange={e => setClientFormData({...clientFormData, name: e.target.value})}
                        className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-sm"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase text-zinc-500">CI / Documento</label>
                        <div className="relative">
                          <input 
                            required
                            type="text" 
                            placeholder="1234567 LP"
                            value={clientFormData.ci}
                            onChange={e => setClientFormData({...clientFormData, ci: e.target.value})}
                            className={`w-full p-3 bg-zinc-950 rounded-xl border ${isCiAlreadyUsed ? 'border-red-500/50 focus:ring-red-500/20' : 'border-white/5 focus:ring-blue-500/20'} text-zinc-100 focus:outline-none focus:ring-2 transition-all text-sm`}
                          />
                          {isCiAlreadyUsed && (
                            <div className="absolute -bottom-5 left-0 flex items-center gap-1 text-[9px] text-red-500 font-bold animate-pulse">
                              <AlertCircle className="w-2.5 h-2.5" /> Este CI ya está registrado
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-[11px] bg-zinc-950 rounded-xl border border-white/5 h-[46px] mt-6">
                        <input 
                          type="checkbox"
                          id="isMineCooperative"
                          checked={clientFormData.isMineCooperative}
                          onChange={e => setClientFormData({...clientFormData, isMineCooperative: e.target.checked})}
                          className="w-5 h-5 rounded border-white/10 bg-zinc-900 text-blue-600 focus:ring-blue-500/20 cursor-pointer"
                        />
                        <label htmlFor="isMineCooperative" className="text-xs text-zinc-400 font-bold uppercase cursor-pointer select-none">
                          ¿Es Coop. de Mina?
                        </label>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-zinc-500">Teléfono principal</label>
                      <div className="flex gap-2">
                        <select
                          value={clientFormData.phoneCountryCode}
                          onChange={e => setClientFormData({...clientFormData, phoneCountryCode: e.target.value})}
                          className="w-24 p-3 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-sm"
                        >
                          <option value="591">+591 (BO)</option>
                          <option value="1">+1 (US/CA)</option>
                          <option value="34">+34 (ES)</option>
                          <option value="51">+51 (PE)</option>
                          <option value="54">+54 (AR)</option>
                          <option value="55">+55 (BR)</option>
                          <option value="56">+56 (CL)</option>
                          <option value="57">+57 (CO)</option>
                          <option value="58">+58 (VE)</option>
                          <option value="593">+593 (EC)</option>
                          <option value="595">+595 (PY)</option>
                          <option value="598">+598 (UY)</option>
                        </select>
                        <input 
                          required
                          type="text" 
                          placeholder="7XXXXXXX"
                          value={clientFormData.phone}
                          onChange={e => setClientFormData({...clientFormData, phone: e.target.value})}
                          className="flex-1 p-3 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-sm"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-zinc-500">Teléfono Referencial</label>
                      <div className="flex gap-2">
                        <select
                          value={clientFormData.referentialCountryCode}
                          onChange={e => setClientFormData({...clientFormData, referentialCountryCode: e.target.value})}
                          className="w-24 p-3 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-sm"
                        >
                          <option value="591">+591 (BO)</option>
                          <option value="1">+1 (US/CA)</option>
                          <option value="34">+34 (ES)</option>
                          <option value="51">+51 (PE)</option>
                          <option value="54">+54 (AR)</option>
                          <option value="55">+55 (BR)</option>
                          <option value="56">+56 (CL)</option>
                          <option value="57">+57 (CO)</option>
                          <option value="58">+58 (VE)</option>
                          <option value="593">+593 (EC)</option>
                          <option value="595">+595 (PY)</option>
                          <option value="598">+598 (UY)</option>
                        </select>
                        <input 
                          type="text" 
                          placeholder="7XXXXXXX"
                          value={clientFormData.referentialPhone}
                          onChange={e => setClientFormData({...clientFormData, referentialPhone: e.target.value})}
                          className="flex-1 p-3 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Right Column: References and Complementary Data */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-amber-500 uppercase tracking-widest border-b border-white/5 pb-2">Información de Referencia y Laboral</h3>
                    
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-zinc-500">Email (Opcional)</label>
                      <input 
                        type="email" 
                        placeholder="correo@ejemplo.com"
                        value={clientFormData.email}
                        onChange={e => setClientFormData({...clientFormData, email: e.target.value})}
                        className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-zinc-500">Lugar de Trabajo</label>
                      <input 
                        type="text" 
                        placeholder="Empresa o ubicación"
                        value={clientFormData.workplace}
                        onChange={e => setClientFormData({...clientFormData, workplace: e.target.value})}
                        className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-zinc-500">Recomendado por</label>
                      <input 
                        type="text" 
                        placeholder="Nombre del referente"
                        value={clientFormData.recommendedBy}
                        onChange={e => setClientFormData({...clientFormData, recommendedBy: e.target.value})}
                        className="w-full p-3 bg-zinc-950 rounded-xl border border-white/5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-sm"
                      />
                    </div>

                    {/* Photos Section */}
                    <h3 className="text-xs font-bold text-emerald-500 uppercase tracking-widest border-b border-white/5 pb-2 pt-2">Fotografías e Identificación</h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                      {/* Foto de Perfil */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-zinc-500">Foto de Perfil</label>
                        <div className="relative h-28 rounded-2xl border border-white/5 bg-zinc-950 flex flex-col items-center justify-center overflow-hidden group shadow-inner">
                          {activeCameraTarget === 'clientPhoto' ? (
                            <div className="w-full h-full relative">
                              <video 
                                ref={genericVideoRef} 
                                className="w-full h-full object-cover scale-x-[-1]" 
                                playsInline 
                                muted 
                              />
                              <div className="absolute bottom-2 inset-x-2 flex gap-1 justify-center">
                                <button
                                  type="button"
                                  onClick={captureGenericPhoto}
                                  className="px-2 py-1 bg-emerald-600 text-[9px] hover:bg-emerald-500 font-bold uppercase text-white rounded-lg transition-colors shadow-lg"
                                >
                                  Capturar
                                </button>
                                <button
                                  type="button"
                                  onClick={stopGenericCamera}
                                  className="px-2 py-1 bg-zinc-800 text-[9px] hover:bg-zinc-700 font-bold uppercase text-zinc-300 rounded-lg transition-colors"
                                >
                                  X
                                </button>
                              </div>
                            </div>
                          ) : clientFormData.photo ? (
                            <div className="w-full h-full relative group">
                              <img 
                                src={clientFormData.photo} 
                                alt="Perfil" 
                                className="w-full h-full object-cover" 
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity duration-200">
                                <button
                                  type="button"
                                  onClick={() => setClientFormData(prev => ({ ...prev, photo: '' }))}
                                  className="p-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/40 rounded-lg transition-colors border border-red-500/20"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center text-zinc-650 p-2 text-center h-full">
                              <User className="w-6 h-6 stroke-[1.2] mb-1 text-zinc-500" />
                              <div className="flex gap-1.5 mt-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const input = document.createElement('input');
                                    input.type = 'file';
                                    input.accept = 'image/*';
                                    input.onchange = (e) => {
                                      const file = (e.target as HTMLInputElement).files?.[0];
                                      if (file) {
                                        const reader = new FileReader();
                                        reader.onload = () => {
                                          setClientFormData(prev => ({ ...prev, photo: reader.result as string }));
                                        };
                                        reader.readAsDataURL(file);
                                      }
                                    };
                                    input.click();
                                  }}
                                  className="text-[9px] font-bold text-zinc-400 hover:text-zinc-200 uppercase bg-zinc-900 border border-white/5 px-2 py-1 rounded"
                                >
                                  Subir
                                </button>
                                <button
                                  type="button"
                                  onClick={() => startGenericCamera('clientPhoto')}
                                  className="text-[9px] font-bold text-teal-400 hover:text-teal-200 uppercase bg-teal-950/40 px-2 py-1 rounded border border-teal-500/10"
                                >
                                  Cámara
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Foto de Documento / CI */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-zinc-500">Foto Documento / CI</label>
                        <div className="relative h-28 rounded-2xl border border-white/5 bg-zinc-950 flex flex-col items-center justify-center overflow-hidden group shadow-inner">
                          {activeCameraTarget === 'clientDoc' ? (
                            <div className="w-full h-full relative">
                              <video 
                                ref={genericVideoRef} 
                                className="w-full h-full object-cover scale-x-[-1]" 
                                playsInline 
                                muted 
                              />
                              <div className="absolute bottom-2 inset-x-2 flex gap-1 justify-center">
                                <button
                                  type="button"
                                  onClick={captureGenericPhoto}
                                  className="px-2 py-1 bg-emerald-600 text-[9px] hover:bg-emerald-500 font-bold uppercase text-white rounded-lg transition-colors shadow-lg"
                                >
                                  Capturar
                                </button>
                                <button
                                  type="button"
                                  onClick={stopGenericCamera}
                                  className="px-2 py-1 bg-zinc-800 text-[9px] hover:bg-zinc-700 font-bold uppercase text-zinc-300 rounded-lg transition-colors"
                                >
                                  X
                                </button>
                              </div>
                            </div>
                          ) : clientFormData.documentPhoto ? (
                            <div className="w-full h-full relative group">
                              <img 
                                src={clientFormData.documentPhoto} 
                                alt="Documento" 
                                className="w-full h-full object-cover" 
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity duration-200">
                                <button
                                  type="button"
                                  onClick={() => setClientFormData(prev => ({ ...prev, documentPhoto: '' }))}
                                  className="p-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/40 rounded-lg transition-colors border border-red-500/20"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center text-zinc-650 p-2 text-center h-full">
                              <ImageIcon className="w-6 h-6 stroke-[1.2] mb-1 text-zinc-500" />
                              <div className="flex gap-1.5 mt-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const input = document.createElement('input');
                                    input.type = 'file';
                                    input.accept = 'image/*';
                                    input.onchange = (e) => {
                                      const file = (e.target as HTMLInputElement).files?.[0];
                                      if (file) {
                                        const reader = new FileReader();
                                        reader.onload = () => {
                                          setClientFormData(prev => ({ ...prev, documentPhoto: reader.result as string }));
                                        };
                                        reader.readAsDataURL(file);
                                      }
                                    };
                                    input.click();
                                  }}
                                  className="text-[9px] font-bold text-zinc-400 hover:text-zinc-200 uppercase bg-zinc-900 border border-white/5 px-2 py-1 rounded"
                                >
                                  Subir
                                </button>
                                <button
                                  type="button"
                                  onClick={() => startGenericCamera('clientDoc')}
                                  className="text-[9px] font-bold text-teal-400 hover:text-teal-200 uppercase bg-teal-950/40 px-2 py-1 rounded border border-teal-500/10"
                                >
                                  Cámara
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                </div>

                <div className="pt-6 border-t border-white/5 flex gap-4">
                  <button 
                    type="button"
                    onClick={() => {
                      stopGenericCamera();
                      setShowAddClientModal(false);
                      setEditingClient(null);
                      setClientFormData({ name: '', phone: '', phoneCountryCode: '591', referentialPhone: '', referentialCountryCode: '591', email: '', ci: '', workplace: '', recommendedBy: '', isMineCooperative: false, photo: '', documentPhoto: '' });
                    }}
                    className="flex-1 py-4 bg-zinc-850 text-zinc-300 rounded-2xl font-bold hover:bg-zinc-800 transition-all border border-white/10"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={isCiAlreadyUsed}
                    className="flex-[2] py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm transform active:scale-95"
                  >
                    {editingClient ? 'Guardar Cambios' : 'Registrar Cliente'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add/Edit Referrer Modal */}
      <AnimatePresence>
        {showAddReferrerModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                stopGenericCamera();
                setShowAddReferrerModal(false);
                setEditingReferrer(null);
                setReferrerFormData({ name: '', phone1: '', phone2: '', ci: '', photo: '', documentPhoto: '' });
              }}
              className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl bg-zinc-900 rounded-[32px] border border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-white/5 bg-zinc-950 flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-zinc-100">{editingReferrer ? 'Editar Referido' : 'Nuevo Referido'}</h2>
                  <p className="text-sm text-zinc-400">Ingrese los datos básicos del referido</p>
                </div>
                <button onClick={() => {
                  stopGenericCamera();
                  setShowAddReferrerModal(false);
                  setEditingReferrer(null);
                  setReferrerFormData({ name: '', phone1: '', phone2: '', ci: '', photo: '', documentPhoto: '' });
                }} className="text-zinc-500 hover:text-white transition-colors">
                  <X className="w-6 h-6 hover:rotate-90 transition-all" />
                </button>
              </div>

              <form onSubmit={handleSaveReferrer} className="p-8 space-y-4 max-h-[85vh] overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-4">
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
                  </div>

                  <div className="space-y-4">
                    {/* Photos Section */}
                    <div className="p-4 bg-zinc-950/40 rounded-2xl border border-white/5 space-y-4">
                      <h3 className="text-[10px] font-bold uppercase text-emerald-500 tracking-wider">Fotografías e Identificación</h3>
                      
                      {/* Foto de Perfil */}
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold uppercase text-zinc-500">Foto de Perfil</label>
                        <div className="relative h-24 rounded-2xl border border-white/5 bg-zinc-950 flex flex-col items-center justify-center overflow-hidden group shadow-inner">
                          {activeCameraTarget === 'referrerPhoto' ? (
                            <div className="w-full h-full relative">
                              <video 
                                ref={genericVideoRef} 
                                className="w-full h-full object-cover scale-x-[-1]" 
                                playsInline 
                                muted 
                              />
                              <div className="absolute bottom-2 inset-x-2 flex gap-1 justify-center">
                                <button
                                  type="button"
                                  onClick={captureGenericPhoto}
                                  className="px-2 py-0.5 bg-emerald-600 text-[8px] hover:bg-emerald-500 font-bold uppercase text-white rounded transition-colors shadow-lg"
                                >
                                  Capturar
                                </button>
                                <button
                                  type="button"
                                  onClick={stopGenericCamera}
                                  className="px-2 py-0.5 bg-zinc-800 text-[8px] hover:bg-zinc-700 font-bold uppercase text-zinc-300 rounded transition-colors"
                                >
                                  X
                                </button>
                              </div>
                            </div>
                          ) : referrerFormData.photo ? (
                            <div className="w-full h-full relative group">
                              <img 
                                src={referrerFormData.photo} 
                                alt="Perfil" 
                                className="w-full h-full object-cover" 
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity duration-200">
                                <button
                                  type="button"
                                  onClick={() => setReferrerFormData(prev => ({ ...prev, photo: '' }))}
                                  className="p-1 bg-red-500/20 text-red-400 hover:bg-red-500/40 rounded transition-colors border border-red-500/20"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center text-zinc-650 p-2 text-center h-full">
                              <User className="w-5 h-5 stroke-[1.2] mb-0.5 text-zinc-500" />
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const input = document.createElement('input');
                                    input.type = 'file';
                                    input.accept = 'image/*';
                                    input.onchange = (e) => {
                                      const file = (e.target as HTMLInputElement).files?.[0];
                                      if (file) {
                                        const reader = new FileReader();
                                        reader.onload = () => {
                                          setReferrerFormData(prev => ({ ...prev, photo: reader.result as string }));
                                        };
                                        reader.readAsDataURL(file);
                                      }
                                    };
                                    input.click();
                                  }}
                                  className="text-[8px] font-bold text-zinc-400 hover:text-zinc-200 uppercase bg-zinc-900 border border-white/5 px-1.5 py-0.5 rounded"
                                >
                                  Subir
                                </button>
                                <button
                                  type="button"
                                  onClick={() => startGenericCamera('referrerPhoto')}
                                  className="text-[8px] font-bold text-teal-400 hover:text-teal-200 uppercase bg-teal-950/40 px-1.5 py-0.5 rounded border border-teal-500/10"
                                >
                                  Cámara
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Foto de Documento / CI */}
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold uppercase text-zinc-500">Foto Documento / CI</label>
                        <div className="relative h-24 rounded-2xl border border-white/5 bg-zinc-950 flex flex-col items-center justify-center overflow-hidden group shadow-inner">
                          {activeCameraTarget === 'referrerDoc' ? (
                            <div className="w-full h-full relative">
                              <video 
                                ref={genericVideoRef} 
                                className="w-full h-full object-cover scale-x-[-1]" 
                                playsInline 
                                muted 
                              />
                              <div className="absolute bottom-2 inset-x-2 flex gap-1 justify-center">
                                <button
                                  type="button"
                                  onClick={captureGenericPhoto}
                                  className="px-2 py-0.5 bg-emerald-600 text-[8px] hover:bg-emerald-500 font-bold uppercase text-white rounded transition-colors shadow-lg"
                                >
                                  Capturar
                                </button>
                                <button
                                  type="button"
                                  onClick={stopGenericCamera}
                                  className="px-2 py-0.5 bg-zinc-800 text-[8px] hover:bg-zinc-700 font-bold uppercase text-zinc-300 rounded transition-colors"
                                >
                                  X
                                </button>
                              </div>
                            </div>
                          ) : referrerFormData.documentPhoto ? (
                            <div className="w-full h-full relative group">
                              <img 
                                src={referrerFormData.documentPhoto} 
                                alt="Documento" 
                                className="w-full h-full object-cover" 
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity duration-200">
                                <button
                                  type="button"
                                  onClick={() => setReferrerFormData(prev => ({ ...prev, documentPhoto: '' }))}
                                  className="p-1 bg-red-500/20 text-red-400 hover:bg-red-500/40 rounded transition-colors border border-red-500/20"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center text-zinc-650 p-2 text-center h-full">
                              <ImageIcon className="w-5 h-5 stroke-[1.2] mb-0.5 text-zinc-500" />
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const input = document.createElement('input');
                                    input.type = 'file';
                                    input.accept = 'image/*';
                                    input.onchange = (e) => {
                                      const file = (e.target as HTMLInputElement).files?.[0];
                                      if (file) {
                                        const reader = new FileReader();
                                        reader.onload = () => {
                                          setReferrerFormData(prev => ({ ...prev, documentPhoto: reader.result as string }));
                                        };
                                        reader.readAsDataURL(file);
                                      }
                                    };
                                    input.click();
                                  }}
                                  className="text-[8px] font-bold text-zinc-400 hover:text-zinc-200 uppercase bg-zinc-900 border border-white/5 px-1.5 py-0.5 rounded"
                                >
                                  Subir
                                </button>
                                <button
                                  type="button"
                                  onClick={() => startGenericCamera('referrerDoc')}
                                  className="text-[8px] font-bold text-teal-400 hover:text-teal-200 uppercase bg-teal-950/40 px-1.5 py-0.5 rounded border border-teal-500/10"
                                >
                                  Cámara
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      stopGenericCamera();
                      setShowAddReferrerModal(false);
                      setEditingReferrer(null);
                      setReferrerFormData({ name: '', phone1: '', phone2: '', ci: '', photo: '', documentPhoto: '' });
                    }}
                    className="flex-1 py-4 bg-zinc-850 text-zinc-300 rounded-2xl font-bold hover:bg-zinc-850 transition-all border border-white/10 text-sm"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={isReferrerCiAlreadyUsed}
                    className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-xl shadow-indigo-600/20 hover:bg-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {editingReferrer ? 'Guardar Cambios' : 'Registrar Referido'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Lightbox Image Preview Modal */}
      <AnimatePresence>
        {viewingImageSrc && (
          <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setViewingImageSrc(null)}
              className="absolute inset-0 bg-zinc-950/95 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative max-w-3xl max-h-[85vh] bg-zinc-900 rounded-[24px] border border-white/10 shadow-2xl overflow-hidden flex flex-col z-10"
            >
              <div className="p-5 border-b border-white/5 bg-zinc-950 flex justify-between items-center shrink-0">
                <span className="text-sm font-bold text-zinc-200 tracking-wide">{viewingImageTitle}</span>
                <button 
                  onClick={() => setViewingImageSrc(null)}
                  className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 overflow-auto flex items-center justify-center bg-zinc-950/40">
                <img 
                  src={viewingImageSrc} 
                  alt="Previsualización" 
                  className="max-w-full max-h-[60vh] object-contain rounded-lg border border-white/5"
                  referrerPolicy="no-referrer"
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ErrorBoundary>
  );
}
