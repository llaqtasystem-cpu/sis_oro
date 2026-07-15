import * as React from "react";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronDown,
  ChevronUp,
  Scale,
  TrendingUp,
  History,
  User,
  Edit,
  Trash2,
  Package,
  Coins,
  CheckCircle2,
  Hash,
  Calendar,
  AlertCircle,
  Clock,
  ArrowRight,
} from "lucide-react";
import { Material, User as SystemUser } from "../types";

export interface MaterialTableProps {
  materials: Material[];
  systemUsers: SystemUser[];
  onEdit?: (m: Material) => void;
  onDelete?: (m: Material) => void;
  canEdit?: boolean;
  allMaterials?: Material[];
}

const formatNumber = (num: number, decimals: number = 2) => {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
};

const formatCurrency = (num: number) => {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

export const MaterialTable = ({
  materials,
  systemUsers,
  onEdit,
  onDelete,
  canEdit,
  allMaterials = [],
}: MaterialTableProps) => {
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const toggleRow = (id: string) => {
    setExpandedRowId(expandedRowId === id ? null : id);
  };

  return (
    <div className="bg-zinc-900 rounded-3xl border border-white/5 shadow-sm overflow-hidden text-white">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-zinc-950 border-b border-white/5 text-[10px] uppercase font-bold text-zinc-500 tracking-widest">
              <th className="px-6 py-4 text-center w-12"></th>
              <th className="px-6 py-4">Nº Recibo</th>
              <th className="px-6 py-4">Fecha</th>
              <th className="px-6 py-4">Cliente / Origen</th>
              <th className="px-6 py-4">Tipo</th>
              <th className="px-6 py-4 text-right">Peso Final</th>
              <th className="px-6 py-4 text-right">Ley</th>
              <th className="px-6 py-4 text-right">Total Bs.</th>
              <th className="px-6 py-4 text-center">Estado</th>
              <th className="px-6 py-4 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {materials.map((m) => {
              const isExpanded = expandedRowId === m.id;
              const hasSources = m.sourceMaterials && m.sourceMaterials.length > 0;
              const calculatedLossPct = m.initialWeight > 0 
                ? (m.loss / m.initialWeight) * 100 
                : 0;
              const lossPct = m.lossPercentage ?? calculatedLossPct;

              // Find registered user
              const operatorName = systemUsers.find(
                (u) => u.id === m.createdBy || u.username === m.createdBy
              )?.name || m.createdBy || "Sistema";

              return (
                <React.Fragment key={m.id}>
                  {/* Primary Row */}
                  <tr
                    onClick={() => m.id && toggleRow(m.id)}
                    className={`cursor-pointer transition-colors ${
                      isExpanded
                        ? "bg-amber-950/20 hover:bg-amber-950/30"
                        : "hover:bg-zinc-800/50"
                    }`}
                  >
                    <td className="px-6 py-4 text-center">
                      <div className="flex justify-center text-zinc-500">
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-amber-500" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono font-bold text-amber-500">
                        #{m.receiptNumber}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-zinc-100">
                          {new Date(m.registrationDate).toLocaleDateString()}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {new Date(m.registrationDate).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-bold text-zinc-300 uppercase truncate max-w-[150px] block">
                        {m.client}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        <div
                          className={`p-1 rounded ${
                            m.type === "barra"
                              ? "bg-amber-500/10 text-amber-500"
                              : m.type === "puro"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : m.type === "cerrado"
                                  ? "bg-indigo-500/10 text-indigo-400"
                                  : "bg-blue-500/10 text-blue-400"
                          }`}
                        >
                          {m.type === "barra" ? (
                            <Package className="w-3 h-3" />
                          ) : m.type === "puro" ? (
                            <Coins className="w-3 h-3" />
                          ) : m.type === "cerrado" ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <Hash className="w-3 h-3" />
                          )}
                        </div>
                        <span className="text-xs capitalize font-medium text-zinc-300">
                          {m.type === "pieza" ? "Pieza" : m.type === "barra" ? "Barra" : m.type === "puro" ? "Puro" : "Cerrado"}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-bold text-zinc-100">
                      {formatNumber(m.finalWeight)}g
                      <span className="text-[10px] text-zinc-500 block font-normal">
                        Ini: {formatNumber(m.initialWeight)}g
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-bold text-emerald-400">
                      {formatNumber(m.purity)}%
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-bold text-amber-500">
                      {formatCurrency(m.total)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`text-[9px] px-2 py-1 rounded-full font-bold uppercase tracking-tight ${
                          m.status === "disponible"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : m.status === "exportado"
                              ? "bg-blue-500/10 text-blue-400"
                              : m.status === "no disponible"
                                ? "bg-red-500/10 text-red-500"
                                : "bg-zinc-800 text-zinc-500"
                        }`}
                      >
                        {m.status === "exportado" ? "Vendido" : m.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center gap-1">
                        {canEdit && m.status === "disponible" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onEdit && onEdit(m);
                            }}
                            className="p-1.5 bg-zinc-800 text-zinc-400 rounded-lg hover:bg-amber-500/10 hover:text-amber-500 border border-white/5 transition-colors"
                            title="Editar Registro"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canEdit && m.status === "disponible" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete && onDelete(m);
                            }}
                            className="p-1.5 bg-zinc-800 text-zinc-400 rounded-lg hover:bg-red-500/10 hover:text-red-500 border border-white/5 transition-colors"
                            title="Eliminar Registro"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Expanded Quick View Panel */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <tr>
                        <td colSpan={10} className="px-8 py-5 bg-zinc-950/60 border-t border-b border-white/5">
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-zinc-100">
                              
                              {/* Weight Change History & Analysis */}
                              <div className="bg-zinc-900/50 p-4 rounded-2xl border border-white/5 space-y-3">
                                <h4 className="text-xs font-extrabold uppercase text-amber-500 flex items-center gap-2 tracking-wider">
                                  <Scale className="w-4 h-4 text-amber-500" />
                                  Análisis & Historial de Peso
                                </h4>
                                <div className="space-y-2 text-xs">
                                  <div className="flex justify-between items-center py-1 border-b border-white/5">
                                    <span className="text-zinc-400 font-medium">Peso Inicial:</span>
                                    <span className="font-mono font-bold text-zinc-300">{formatNumber(m.initialWeight)} g</span>
                                  </div>
                                  <div className="flex justify-between items-center py-1 border-b border-white/5">
                                    <span className="text-zinc-400 font-medium">Merma / Pérdida:</span>
                                    <span className="font-mono font-bold text-red-400">
                                      -{formatNumber(m.loss)} g ({formatNumber(lossPct)}%)
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center py-1 border-b border-white/5">
                                    <span className="text-zinc-400 font-medium">Peso Final Obtenido:</span>
                                    <span className="font-mono font-bold text-emerald-400">{formatNumber(m.finalWeight)} g</span>
                                  </div>
                                </div>

                                {/* Graphical Weight Comparison */}
                                <div className="pt-2">
                                  <div className="flex justify-between text-[10px] text-zinc-500 mb-1 font-bold">
                                    <span>PÉRDIDA ({formatNumber(lossPct)}%)</span>
                                    <span>PESO FINAL ({formatNumber(100 - lossPct)}%)</span>
                                  </div>
                                  <div className="w-full h-3 bg-zinc-950 rounded-full overflow-hidden flex border border-white/5">
                                    <div 
                                      className="h-full bg-red-500/80 transition-all duration-500" 
                                      style={{ width: `${Math.min(100, Math.max(1, lossPct))}%` }}
                                      title={`Merma: ${formatNumber(lossPct)}%`}
                                    />
                                    <div 
                                      className="h-full bg-emerald-500 transition-all duration-500 flex-1" 
                                      title={`Peso Final: ${formatNumber(100 - lossPct)}%`}
                                    />
                                  </div>
                                  <p className="text-[10px] text-zinc-500 mt-2 italic leading-snug">
                                    Muestra el cambio de peso durante el proceso de fundido o registro. Una merma baja indica mayor eficiencia.
                                  </p>
                                </div>
                              </div>

                              {/* Source Smelting History */}
                              <div className="bg-zinc-900/50 p-4 rounded-2xl border border-white/5 space-y-3 lg:col-span-1">
                                <h4 className="text-xs font-extrabold uppercase text-amber-500 flex items-center gap-2 tracking-wider">
                                  <History className="w-4 h-4 text-amber-500" />
                                  Materiales de Origen (Fundición)
                                </h4>
                                
                                {hasSources ? (
                                  <div className="space-y-2">
                                    <div className="max-h-[140px] overflow-y-auto space-y-1.5 pr-1 scrollbar-thin scrollbar-thumb-zinc-800">
                                      {m.sourceMaterials?.map((sm, idx) => (
                                        <div
                                          key={`${sm.receiptNumber}-${idx}`}
                                          className="bg-zinc-950 p-2 rounded-xl text-[10px] border border-white/5 hover:border-zinc-800 transition-all"
                                        >
                                          <div className="flex justify-between font-bold text-zinc-300">
                                            <span>#{sm.receiptNumber}</span>
                                            <span className="font-mono text-zinc-400">{formatNumber(sm.finalWeight)}g</span>
                                          </div>
                                          <div className="flex justify-between text-zinc-500 mt-0.5 font-medium">
                                            <span className="truncate max-w-[120px]">{sm.client}</span>
                                            <span className="font-mono text-emerald-500/80">{formatNumber(sm.purity)}% Ley</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="pt-2 border-t border-white/5 flex justify-between items-center text-[10px] text-zinc-400 font-bold">
                                      <span>CONSOLIDADO DE {m.sourceMaterials?.length} LOTES</span>
                                      <span className="font-mono text-amber-500">
                                        Total: {formatNumber(m.sourceMaterials?.reduce((acc, curr) => acc + curr.finalWeight, 0) || 0)}g
                                      </span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center justify-center h-[140px] text-center p-4 bg-zinc-950/40 rounded-xl border border-white/5 border-dashed">
                                    <AlertCircle className="w-5 h-5 text-zinc-600 mb-1.5" />
                                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Compra Directa</p>
                                    <p className="text-[9px] text-zinc-600 mt-1 max-w-[180px]">
                                      Este material fue registrado directamente en caja. No proviene de una fundición de otros lotes.
                                    </p>
                                  </div>
                                )}
                              </div>

                              {/* Valuation & Transaction Details */}
                              <div className="bg-zinc-900/50 p-4 rounded-2xl border border-white/5 space-y-3">
                                <h4 className="text-xs font-extrabold uppercase text-amber-500 flex items-center gap-2 tracking-wider">
                                  <TrendingUp className="w-4 h-4 text-amber-500" />
                                  Valoración & Operación
                                </h4>
                                <div className="space-y-2 text-xs">
                                  <div className="flex justify-between items-center py-1 border-b border-white/5">
                                    <span className="text-zinc-400 font-medium">Cotización Internacional:</span>
                                    <span className="font-mono font-bold text-zinc-300">${formatCurrency(m.marketPrice)}</span>
                                  </div>
                                  <div className="flex justify-between items-center py-1 border-b border-white/5">
                                    <span className="text-zinc-400 font-medium">Precio por Gramo:</span>
                                    <span className="font-mono font-bold text-zinc-300">Bs. {formatCurrency(m.pricePerGram)}</span>
                                  </div>
                                  <div className="flex justify-between items-center py-1 border-b border-white/5">
                                    <span className="text-zinc-400 font-medium">Tipo de Cambio (USD/BS):</span>
                                    <span className="font-mono font-bold text-blue-400">{formatNumber(m.usdToBs)} Bs</span>
                                  </div>
                                  <div className="flex justify-between items-center py-1 border-b border-white/5">
                                    <span className="text-zinc-400 font-medium">Responsable de Caja:</span>
                                    <span className="font-bold text-zinc-300 truncate max-w-[150px] uppercase tracking-wider text-[10px] flex items-center gap-1">
                                      <User className="w-3 h-3 text-zinc-500" /> {operatorName}
                                    </span>
                                  </div>
                                </div>

                                <div className="bg-amber-500/5 p-3 rounded-xl border border-amber-500/10 flex justify-between items-center">
                                  <div>
                                    <span className="text-[9px] text-amber-500/75 uppercase font-extrabold block">VALOR LIQUIDADO TOTAL</span>
                                    <span className="text-lg font-mono font-black text-amber-500">{formatCurrency(m.total)} Bs.</span>
                                  </div>
                                  <div className="p-1.5 bg-amber-500/10 rounded-lg text-amber-500 text-[10px] font-bold uppercase font-mono">
                                    {m.type === "pieza" ? "18k-24k" : "Oro Puro"}
                                  </div>
                                </div>
                              </div>

                            </div>
                          </motion.div>
                        </td>
                      </tr>
                    )}
                  </AnimatePresence>
                </React.Fragment>
              );
            })}

            {materials.length === 0 && (
              <tr>
                <td colSpan={10} className="px-6 py-20 text-center">
                  <div className="flex flex-col items-center gap-2 text-zinc-500">
                    <AlertCircle className="w-8 h-8 opacity-20 text-amber-500" />
                    <p className="text-sm font-medium">
                      No hay materiales en el listado para mostrar.
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
