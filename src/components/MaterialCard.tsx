import * as React from "react";
import { useMemo } from "react";
import { motion } from "motion/react";
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Line,
} from "recharts";
import {
  Edit,
  Trash2,
  Package,
  Coins,
  CheckCircle2,
  Hash,
  Scale,
  TrendingUp,
  AlertCircle,
  Calendar,
  User,
  History,
} from "lucide-react";
import { Material, User as SystemUser } from "../types";

export interface MaterialCardProps {
  key?: any;
  material: Material;
  systemUsers: SystemUser[];
  onSelect?: (id: string) => void;
  onViewSource?: (m: Material) => void;
  onEdit?: (m: Material) => void;
  onDelete?: (m: Material) => void;
  isSelected?: boolean;
  selectable?: boolean;
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

export const MaterialCard = ({
  material,
  systemUsers,
  onSelect,
  onViewSource,
  onEdit,
  onDelete,
  isSelected,
  selectable,
  canEdit,
  allMaterials = [],
}: MaterialCardProps) => {
  const sameTypeHistory = useMemo(() => {
    if (!allMaterials || allMaterials.length === 0) return [];

    const filtered = allMaterials
      .filter(
        (m) =>
          m.type === material.type && m.pricePerGram > 0 && m.registrationDate,
      )
      .sort(
        (a, b) =>
          new Date(b.registrationDate).getTime() -
          new Date(a.registrationDate).getTime(),
      )
      .slice(0, 5)
      .reverse();

    return filtered.map((m) => ({
      receiptNumber: `#${m.receiptNumber}`,
      price: m.pricePerGram,
      date: new Date(m.registrationDate).toLocaleDateString("es-ES", {
        month: "short",
        day: "numeric",
      }),
    }));
  }, [allMaterials, material.type]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`p-5 rounded-2xl border transition-all cursor-pointer relative group ${
        isSelected
          ? "bg-amber-950/40 border-amber-500 shadow-md ring-2 ring-amber-500/20"
          : "bg-zinc-900 border-white/5 hover:border-amber-500/50 hover:shadow-sm"
      }`}
      onClick={() => {
        if (selectable && onSelect && material.id) {
          onSelect(material.id);
        }
      }}
    >
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all z-10">
        {canEdit && material.status === "disponible" && (
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
        {canEdit && material.status === "disponible" && (
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
          <div
            className={`p-2 rounded-lg ${
              material.type === "barra"
                ? "bg-amber-500/10 text-amber-500"
                : material.type === "puro"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : material.type === "cerrado"
                    ? "bg-indigo-500/10 text-indigo-400"
                    : "bg-blue-500/10 text-blue-400"
            }`}
          >
            {material.type === "barra" ? (
              <Package className="w-4 h-4" />
            ) : material.type === "puro" ? (
              <Coins className="w-4 h-4" />
            ) : material.type === "cerrado" ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Hash className="w-4 h-4" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <h3 className="font-bold text-zinc-100 leading-none">
                #{material.receiptNumber}
              </h3>
              <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                material.type === "barra"
                  ? "bg-amber-500/10 text-amber-500"
                  : material.type === "puro"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : material.type === "cerrado"
                      ? "bg-indigo-500/10 text-indigo-400"
                      : "bg-blue-500/10 text-blue-400"
              }`}>
                {material.type === "pieza" ? "Pieza" : material.type === "barra" ? "Barra" : material.type === "puro" ? "Puro" : "Cerrado"}
              </span>
            </div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">
              {material.client}
            </p>
          </div>
        </div>
        <span
          className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-tighter ${
            material.status === "disponible"
              ? "bg-emerald-500/10 text-emerald-400"
              : material.status === "exportado"
                ? "bg-blue-500/10 text-blue-400"
                : material.status === "no disponible"
                  ? "bg-red-500/10 text-red-500"
                  : "bg-zinc-800 text-zinc-500"
          }`}
        >
          {material.status === "exportado" ? "Vendido" : material.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="space-y-1">
          <p className="text-[10px] text-zinc-500 uppercase font-bold flex items-center gap-1">
            <Scale className="w-3 h-3" /> Peso Inicial
          </p>
          <p className="text-sm font-mono font-bold text-zinc-400">
            {formatNumber(material.initialWeight)}g
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-zinc-500 uppercase font-bold flex items-center gap-1">
            <Scale className="w-3 h-3" /> Peso Final
          </p>
          <p className="text-sm font-mono font-bold text-zinc-100">
            {formatNumber(material.finalWeight)}g
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-zinc-500 uppercase font-bold flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> Cotización
          </p>
          <p className="text-sm font-mono font-bold text-zinc-400">
            {formatCurrency(material.marketPrice)}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-zinc-500 uppercase font-bold flex items-center gap-1">
            <Coins className="w-3 h-3" /> Precio/g
          </p>
          <p className="text-sm font-mono font-bold text-zinc-400">
            {formatCurrency(material.pricePerGram)}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-zinc-500 uppercase font-bold flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Merma
          </p>
          <p className="text-sm font-mono font-bold text-red-400">
            {material.lossPercentage
              ? `${formatNumber(material.lossPercentage)}%`
              : `${formatNumber((material.loss / material.initialWeight) * 100)}%`}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-zinc-500 uppercase font-bold flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Ley
          </p>
          <p className="text-sm font-mono font-bold text-emerald-400">
            {formatNumber(material.purity)}%
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-zinc-500 uppercase font-bold flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> USD/BS
          </p>
          <p className="text-sm font-mono font-bold text-blue-400">
            {formatNumber(material.usdToBs)}
          </p>
        </div>
      </div>

      {sameTypeHistory.length >= 2 ? (
        <div className="mt-2 mb-4 p-3 bg-zinc-950/50 rounded-xl border border-white/5 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[9px] text-amber-500 uppercase font-extrabold tracking-wider flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Evolución Precio/g (
              {material.type === "barra" ? "Barras" : "Piezas"})
            </span>
            <span className="text-[8px] text-zinc-500 font-bold">
              Últimos {sameTypeHistory.length} registros
            </span>
          </div>
          <div className="h-[75px] w-full mt-1">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={sameTypeHistory}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#27272a"
                  vertical={false}
                />
                <XAxis
                  dataKey="receiptNumber"
                  tick={{ fill: "#71717a", fontSize: 8, fontWeight: "bold" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis domain={["auto", "auto"]} hide />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-zinc-900/95 backdrop-blur-sm border border-white/10 p-2 rounded-lg shadow-xl text-[9px] font-mono leading-normal">
                          <p className="font-bold text-zinc-200">
                            {data.receiptNumber}
                          </p>
                          <p className="text-zinc-400 font-medium">
                            {data.date}
                          </p>
                          <p className="text-amber-500 font-extrabold mt-0.5">
                            {formatCurrency(data.price)}/g
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                  cursor={{
                    stroke: "#f59e0b",
                    strokeWidth: 0.5,
                    strokeDasharray: "2 2",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{
                    r: 3,
                    stroke: "#18181b",
                    strokeWidth: 1.5,
                    fill: "#f59e0b",
                  }}
                  activeDot={{
                    r: 5,
                    stroke: "#18181b",
                    strokeWidth: 1.5,
                    fill: "#f5a623",
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="mt-2 mb-4 p-3 bg-zinc-950/30 rounded-xl border border-white/5 flex flex-col items-center justify-center h-[75px] text-zinc-500 select-none">
          <TrendingUp className="w-4 h-4 mb-1 opacity-25 text-amber-500" />
          <p className="text-[9px] uppercase tracking-wider font-bold opacity-45">
            Evolución Precio/g
          </p>
          <p className="text-[8px] opacity-40">
            Se requieren al menos 2 registros
          </p>
        </div>
      )}

      <div className="bg-amber-950/20 p-3 rounded-xl border border-amber-500/20 mb-4">
        <p className="text-[10px] text-zinc-500 uppercase font-bold flex items-center gap-1 mb-1">
          <Coins className="w-3 h-3" /> Total
        </p>
        <p className="text-xl font-mono font-bold text-amber-500">
          {formatCurrency(material.total)}
        </p>
      </div>

      <div className="flex flex-col gap-3 pt-4 border-t border-white/5">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1 text-zinc-500">
            <Calendar className="w-3 h-3" />
            <span className="text-[10px] font-medium">
              {new Date(material.registrationDate).toLocaleDateString()}
            </span>
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
            Res:{" "}
            {systemUsers.find(
              (u) =>
                u.id === material.createdBy ||
                u.username === material.createdBy,
            )?.name ||
              material.createdBy ||
              "Sistema"}
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
              <div
                key={`${sm.receiptNumber}-${idx}`}
                className="bg-zinc-800/50 p-2 rounded-lg text-[10px] border border-white/5"
              >
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
