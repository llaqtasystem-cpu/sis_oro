import React, { useState, useMemo } from "react";
import { motion } from "motion/react";
import {
  Building2,
  Clock,
  Search,
  AlertCircle,
  Scale,
  Flame,
  Download,
  Package,
  Coins,
  CheckCircle2,
  Hash,
} from "lucide-react";
import * as XLSX from "xlsx";
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
} from "recharts";
import { Material, Branch, GoldPurchase } from "../types";

// Self-contained format helpers
const formatNumber = (num: number, decimals: number = 2) => {
  return (num || 0).toLocaleString("es-VE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const formatCurrency = (num: number) => {
  return (
    (num || 0).toLocaleString("es-VE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " BS"
  );
};

interface BranchSmeltingAuditPanelProps {
  materials: Material[];
  branches: Branch[];
  goldPurchases: GoldPurchase[];
}

export function BranchSmeltingAuditPanel({
  materials,
  branches,
  goldPurchases,
}: BranchSmeltingAuditPanelProps) {
  const [selectedBranchId, setSelectedBranchId] = useState<string>("all");
  const [timeRange, setTimeRange] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [expandedBars, setExpandedBars] = useState<string[]>([]);

  const toggleExpandBar = (id: string) => {
    if (expandedBars.includes(id)) {
      setExpandedBars(expandedBars.filter((barId) => barId !== id));
    } else {
      setExpandedBars([...expandedBars, id]);
    }
  };

  // Compile all completed smelting operations (bar materials and their components)
  const auditedBars = useMemo(() => {
    return materials
      .filter((m) => m.type === "barra" && m.status !== "eliminado")
      .map((m) => {
        const sourceMaterials = m.sourceMaterials || [];

        // Sum final weights of raw materials because final weight is what was logged at purchase
        const inputWeight = sourceMaterials.reduce(
          (acc, src) => acc + (src.finalWeight || 0),
          0,
        );

        // Weighted average purity of source materials
        const totalWeightedPurity = sourceMaterials.reduce(
          (acc, src) => acc + (src.finalWeight || 0) * (src.purity || 0),
          0,
        );
        const weightedSrcPurity =
          inputWeight > 0 ? totalWeightedPurity / inputWeight : 0;

        // Final Weight of the bar
        const finalWeight = m.finalWeight || m.initialWeight || 0;

        // Loss (Merma) in grams
        const lossAmount = Math.max(0, inputWeight - finalWeight);

        // Loss percentage
        const lossPercentage =
          inputWeight > 0 ? (lossAmount / inputWeight) * 100 : 0;

        // Final Purity of the bar after refinement/smelting
        const finalPurity = m.purity || 0;

        // Ley (Purity) concentration gain
        const purityGain = finalPurity - weightedSrcPurity;

        // Trace back the branch of origin
        let branchId = "unknown";
        let branchName = "Depósito Central";

        if (sourceMaterials.length > 0) {
          for (const src of sourceMaterials) {
            const purchase = goldPurchases.find(
              (p) => p.receiptNumber === src.receiptNumber,
            );
            if (purchase) {
              branchId = purchase.branchId;
              const b = branches.find((br) => br.id === purchase.branchId);
              if (b) branchName = b.name;
              break;
            }
          }
        } else {
          // Check if bar itself matches any purchase receipt directly
          const purchase = goldPurchases.find(
            (p) => p.receiptNumber === m.receiptNumber,
          );
          if (purchase) {
            branchId = purchase.branchId;
            const b = branches.find((br) => br.id === purchase.branchId);
            if (b) branchName = b.name;
          }
        }

        return {
          id: m.id || `bar-${m.receiptNumber}`,
          receiptNumber: m.receiptNumber,
          date: m.registrationDate,
          inputWeight,
          finalWeight,
          lossAmount,
          lossPercentage,
          weightedSrcPurity,
          finalPurity,
          purityGain,
          branchId,
          branchName,
          sourceCount: sourceMaterials.length,
          sourceMaterials,
          createdBy: m.createdBy || "system",
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [materials, goldPurchases, branches]);

  // Apply selectors (branch, time and search term)
  const filteredBars = useMemo(() => {
    return auditedBars.filter((bar) => {
      if (selectedBranchId !== "all" && bar.branchId !== selectedBranchId) {
        return false;
      }

      if (timeRange !== "all") {
        const barDate = new Date(bar.date);
        const now = new Date();
        const limit = new Date();

        if (timeRange === "30days") {
          limit.setDate(now.getDate() - 30);
          if (barDate < limit) return false;
        } else if (timeRange === "90days") {
          limit.setDate(now.getDate() - 90);
          if (barDate < limit) return false;
        }
      }

      if (searchTerm.trim() !== "") {
        const term = searchTerm.toLowerCase();
        const receiptMatch = bar.receiptNumber?.toLowerCase().includes(term);
        const creatorMatch = bar.createdBy?.toLowerCase().includes(term);
        const branchMatch = bar.branchName?.toLowerCase().includes(term);
        if (!receiptMatch && !creatorMatch && !branchMatch) return false;
      }

      return true;
    });
  }, [auditedBars, selectedBranchId, timeRange, searchTerm]);

  // Compute aggregate statistics
  const metrics = useMemo(() => {
    const totalBars = filteredBars.length;
    if (totalBars === 0) {
      return {
        totalInputsWeight: 0,
        totalOutputsWeight: 0,
        totalLoss: 0,
        averageLossPercentage: 0,
        avgSrcPurity: 0,
        avgFinalPurity: 0,
        avgPurityGain: 0,
      };
    }

    let totalInputsWeight = 0;
    let totalOutputsWeight = 0;
    let sumSrcPurity = 0;
    let sumFinalPurity = 0;

    filteredBars.forEach((bar) => {
      totalInputsWeight += bar.inputWeight;
      totalOutputsWeight += bar.finalWeight;
      sumSrcPurity += bar.weightedSrcPurity;
      sumFinalPurity += bar.finalPurity;
    });

    const totalLoss = Math.max(0, totalInputsWeight - totalOutputsWeight);
    const averageLossPercentage =
      totalInputsWeight > 0 ? (totalLoss / totalInputsWeight) * 100 : 0;
    const avgSrcPurity = sumSrcPurity / totalBars;
    const avgFinalPurity = sumFinalPurity / totalBars;
    const avgPurityGain = avgFinalPurity - avgSrcPurity;

    return {
      totalInputsWeight,
      totalOutputsWeight,
      totalLoss,
      averageLossPercentage,
      avgSrcPurity,
      avgFinalPurity,
      avgPurityGain,
    };
  }, [filteredBars]);

  // Gather chart data formatted correctly for Recharts (limit to last 12 chronological for clarity)
  const chartData = useMemo(() => {
    return [...filteredBars]
      .reverse()
      .slice(-12)
      .map((bar) => ({
        name: bar.receiptNumber.startsWith("F-")
          ? bar.receiptNumber
          : `F-${bar.receiptNumber.slice(0, 6)}`,
        "Peso Origen (g)": parseFloat(bar.inputWeight.toFixed(2)),
        "Peso Barra (g)": parseFloat(bar.finalWeight.toFixed(2)),
        "Ley Origen (%)": parseFloat(bar.weightedSrcPurity.toFixed(2)),
        "Ley Final (%)": parseFloat(bar.finalPurity.toFixed(2)),
        "Merma (%)": parseFloat(bar.lossPercentage.toFixed(2)),
        "Mejora Ley (%)": parseFloat(bar.purityGain.toFixed(2)),
      }));
  }, [filteredBars]);

  // Export report of selected sucursal smelting parameters to excel
  const exportAuditToExcel = () => {
    if (filteredBars.length === 0) {
      alert("No hay registros de auditoría para exportar.");
      return;
    }

    const dataForExcel = filteredBars.flatMap((bar) => {
      const masterRow = {
        "Fecha Fundición": bar.date,
        "Nro. Recibo": bar.receiptNumber,
        "Sucursal de Origen": bar.branchName,
        "Operador Fundidor": bar.createdBy,
        "Componentes Fundidos": bar.sourceCount,
        "PESO INICIAL TOTAL (g)": bar.inputWeight,
        "PESO BARRA RESULTANTE (g)": bar.finalWeight,
        "MERMA OBTENIDA (g)": bar.lossAmount,
        "MERMA (%)": bar.lossPercentage,
        "LEY COMPONENTES PROMEDIO (%)": bar.weightedSrcPurity,
        "LEY REFINADA BARRA (%)": bar.finalPurity,
        "REFINE INCREMENTO LEY (%)": bar.purityGain,
        "Estado de Rendimiento":
          bar.lossPercentage > 4 ? "MERMA ELEVADA" : "MERMA NORMAL",
        "Fila de Registro": "RESUMEN",
      };

      const componentRows = bar.sourceMaterials.map((src, idx) => ({
        "Fecha Fundición": "",
        "Nro. Recibo": `   ↳ Componente ${idx + 1}: #${src.receiptNumber}`,
        "Sucursal de Origen": "",
        "Operador Fundidor": "",
        "Componentes Fundidos": "",
        "PESO INICIAL TOTAL (g)": src.finalWeight,
        "PESO BARRA RESULTANTE (g)": "",
        "MERMA OBTENIDA (g)": "",
        "MERMA (%)": "",
        "LEY COMPONENTES PROMEDIO (%)": src.purity,
        "LEY REFINADA BARRA (%)": "",
        "REFINE INCREMENTO LEY (%)": "",
        "Estado de Rendimiento": "",
        "Fila de Registro": `COMPONENTE (#${src.receiptNumber})`,
      }));

      return [masterRow, ...componentRows];
    });

    const ws = XLSX.utils.json_to_sheet(dataForExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Auditoría de Fundición");

    // Auto-size columns for premium aesthetics
    const maxLens = Object.keys(dataForExcel[0] || {}).map((key) => {
      return Math.max(
        key.length,
        ...dataForExcel.map((row) => String((row as any)[key] || "").length),
      );
    });
    ws["!cols"] = maxLens.map((len) => ({ wch: len + 3 }));

    XLSX.writeFile(
      wb,
      `Reporte_Auditoria_Fundicion_${selectedBranchId === "all" ? "Consolidado" : selectedBranchId}_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  };

  return (
    <div className="space-y-8 animate-none">
      {/* Title & Introduction */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-zinc-900/40 p-6 rounded-3xl border border-white/5 gap-4">
        <div>
          <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-500 animate-pulse" /> Auditoría
            de Rendimiento de Fundición
          </h2>
          <p className="text-xs text-zinc-400 mt-1 max-w-2xl">
            Compara con exactitud científica el peso y la pureza (ley) del oro
            adquirido en sucursales en su etapa inicial de compra contra el
            rendimiento de las barras refinadas tras el proceso de fundición.
          </p>
        </div>
        <button
          onClick={exportAuditToExcel}
          disabled={filteredBars.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-100 hover:bg-white text-zinc-950 rounded-xl text-xs font-bold transition-all shadow-md shrink-0 disabled:opacity-40 disabled:pointer-events-none"
        >
          <Download className="w-4 h-4" /> Exportar Auditoría
        </button>
      </div>

      {/* Selectors and Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-zinc-950 p-4 rounded-3xl border border-white/5 shadow-sm">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5 pl-1">
            Filtrar por Sucursal
          </label>
          <div className="relative">
            <Building2 className="absolute left-3.5 top-3 w-4 h-4 text-zinc-500" />
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="w-full bg-zinc-900 border border-white/5 rounded-2xl pl-10 pr-4 py-2 text-xs font-bold text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-all cursor-pointer h-10"
            >
              <option value="all">Todas las Sucursales (Consolidado)</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.abbreviation})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5 pl-1">
            Rango Postal de Tiempo
          </label>
          <div className="relative">
            <Clock className="absolute left-3.5 top-3 w-4 h-4 text-zinc-500" />
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="w-full bg-zinc-900 border border-white/5 rounded-2xl pl-10 pr-4 py-2 text-xs font-bold text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-all cursor-pointer h-10"
            >
              <option value="all">Histórico Completo</option>
              <option value="30days">Últimos 30 días</option>
              <option value="90days">Últimos 90 días</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5 pl-1">
            Buscar por Recibo / Operador
          </label>
          <div className="relative">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Ej: F-1718 o administrador..."
              className="w-full bg-zinc-900 border border-white/5 rounded-2xl pl-10 pr-4 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-all h-10"
            />
          </div>
        </div>
      </div>

      {filteredBars.length === 0 ? (
        <div className="bg-zinc-900/30 p-12 rounded-[32px] border border-white/5 text-center">
          <AlertCircle className="w-8 h-8 text-amber-500/50 mx-auto mb-3 animate-pulse" />
          <p className="text-zinc-300 font-bold text-sm">
            No se encontraron barras fundidas con los filtros actuales
          </p>
          <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
            Para realizar una auditoría, asegúrese de registrar una fundición en
            el panel de inventario central para que se compilen materias primas
            en barras refinadas.
          </p>
        </div>
      ) : (
        <>
          {/* Auditing KPI Panel */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-zinc-900 p-6 rounded-3xl border border-white/5 flex flex-col justify-between shadow-sm hover:border-amber-500/10 transition-colors">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
                  Lotes Auditados
                </span>
                <p className="text-2xl font-black text-zinc-100 font-mono mt-2">
                  {filteredBars.length}
                </p>
              </div>
              <div className="pt-3 border-t border-white/5 mt-4 flex items-center justify-between text-[11px]">
                <span className="text-zinc-400">Total de fundiciones</span>
                <span className="font-bold text-amber-500">✓ Activo</span>
              </div>
            </div>

            <div className="bg-zinc-900 p-6 rounded-3xl border border-white/5 flex flex-col justify-between shadow-sm hover:border-amber-500/10 transition-colors">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
                  Rendimiento de Peso (Masa)
                </span>
                <p className="text-lg font-black text-zinc-100 font-mono mt-2">
                  {formatNumber(metrics.totalInputsWeight)}g{" "}
                  <span className="text-zinc-500 font-normal text-xs">→</span>{" "}
                  {formatNumber(metrics.totalOutputsWeight)}g
                </p>
              </div>
              <div className="pt-3 border-t border-white/5 mt-4 flex items-center justify-between text-[11px]">
                <span className="text-zinc-400">Retorno de Oro</span>
                <span className="font-extrabold text-emerald-400 font-mono">
                  {formatNumber(
                    metrics.totalInputsWeight > 0
                      ? (metrics.totalOutputsWeight /
                          metrics.totalInputsWeight) *
                          100
                      : 0,
                  )}
                  %
                </span>
              </div>
            </div>

            <div className="bg-zinc-900 p-6 rounded-3xl border border-white/5 flex flex-col justify-between shadow-sm hover:border-amber-500/10 transition-colors">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
                  Merma Promedio General
                </span>
                <p className="text-2xl font-black text-red-400 font-mono mt-2">
                  {formatNumber(metrics.averageLossPercentage)}%
                </p>
              </div>
              <div className="pt-3 border-t border-white/5 mt-4 flex items-center justify-between text-[11px]">
                <span className="text-zinc-400">Pérdida neta de peso</span>
                <span className="font-bold font-mono text-zinc-400">
                  -{formatNumber(metrics.totalLoss)}g
                </span>
              </div>
            </div>

            <div className="bg-zinc-900 p-6 rounded-3xl border border-white/5 flex flex-col justify-between shadow-sm hover:border-amber-500/10 transition-colors">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
                  Mejora de Pureza (Refinado)
                </span>
                <div className="flex items-baseline gap-2 mt-2">
                  <p className="text-2xl font-black text-emerald-400 font-mono">
                    +{formatNumber(metrics.avgPurityGain)}%
                  </p>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    Ley Delta
                  </span>
                </div>
              </div>
              <div className="pt-3 border-t border-white/5 mt-4 flex items-center justify-between text-[11px]">
                <span className="text-zinc-400">Pond. Origen a Barra</span>
                <span className="text-zinc-300 font-mono font-bold">
                  {formatNumber(metrics.avgSrcPurity, 1)}% ley →{" "}
                  {formatNumber(metrics.avgFinalPurity, 1)}%
                </span>
              </div>
            </div>
          </div>

          {/* Interactive Recharts Graphics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Peso Chart */}
            <div className="bg-zinc-900 p-6 rounded-[28px] border border-white/5 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">
                    Auditoría de Masa (Peso Inicial vs. Final)
                  </h3>
                  <p className="text-[10px] text-zinc-400">
                    Muestra la pérdida por merma física en gramos durante la
                    fundición.
                  </p>
                </div>
                <div className="flex gap-4 text-[10px] font-bold">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 bg-orange-500 rounded-sm" />{" "}
                    Origen
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 bg-amber-500 rounded-sm" />{" "}
                    Barra
                  </span>
                </div>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="rgba(255,255,255,0.03)"
                    />
                    <XAxis
                      dataKey="name"
                      stroke="#52525b"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#52525b"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      unit="g"
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#18181b",
                        borderColor: "rgba(255,255,255,0.08)",
                        borderRadius: "12px",
                      }}
                      labelStyle={{
                        fontWeight: "bold",
                        color: "#f4f4f5",
                        fontSize: "12px",
                      }}
                      itemStyle={{ fontSize: "11px", color: "#a1a1aa" }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      iconType="circle"
                      wrapperStyle={{ fontSize: "10px", paddingTop: "15px" }}
                    />
                    <Bar
                      dataKey="Peso Origen (g)"
                      fill="#f97316"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={30}
                    />
                    <Bar
                      dataKey="Peso Barra (g)"
                      fill="#f59e0b"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={30}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Purity Chart */}
            <div className="bg-zinc-900 p-6 rounded-[28px] border border-white/5 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">
                    Rendimiento de Pureza (Mejora de Ley)
                  </h3>
                  <p className="text-[10px] text-zinc-400">
                    Verifica que el refinado incremente correctamente la ley (%)
                    del lote.
                  </p>
                </div>
                <div className="flex gap-4 text-[10px] font-bold">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 bg-zinc-600 rounded-sm" /> Ley
                    Origen
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 bg-yellow-400 rounded-sm" />{" "}
                    Ley Barra
                  </span>
                </div>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="rgba(255,255,255,0.03)"
                    />
                    <XAxis
                      dataKey="name"
                      stroke="#52525b"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#52525b"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      unit="%"
                      domain={[50, 100]}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#18181b",
                        borderColor: "rgba(255,255,255,0.08)",
                        borderRadius: "12px",
                      }}
                      labelStyle={{
                        fontWeight: "bold",
                        color: "#f4f4f5",
                        fontSize: "12px",
                      }}
                      itemStyle={{ fontSize: "11px", color: "#a1a1aa" }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      iconType="circle"
                      wrapperStyle={{ fontSize: "10px", paddingTop: "15px" }}
                    />
                    <Bar
                      dataKey="Ley Origen (%)"
                      fill="#4b5563"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={30}
                    />
                    <Bar
                      dataKey="Ley Final (%)"
                      fill="#fbbf24"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={30}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Historical Items Audit Table */}
          <div className="bg-zinc-900 border border-white/5 rounded-3xl shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-zinc-950/60">
              <div>
                <h3 className="font-extrabold text-zinc-100 text-sm flex items-center gap-2">
                  Historial de Fundiciones Auditadas
                </h3>
                <p className="text-zinc-500 text-[11px] mt-0.5">
                  Mostrando {filteredBars.length} barra(s) registradas.
                </p>
              </div>
              <span className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/15 rounded-xl text-[10px] font-black uppercase text-amber-500 tracking-wider">
                Auditoría en Tiempo Real
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse table-auto">
                <thead>
                  <tr className="bg-zinc-900/80 border-b border-white/5 text-[10px] font-bold uppercase text-zinc-400 tracking-widest">
                    <th className="px-6 py-4">Lote / Recibo</th>
                    <th className="px-6 py-4">Origen</th>
                    <th className="px-6 py-4">Fecha</th>
                    <th className="px-6 py-4 text-center">Componentes</th>
                    <th className="px-6 py-4 text-right">
                      Masa Origen → Barra
                    </th>
                    <th className="px-6 py-4 text-center">Merma %</th>
                    <th className="px-6 py-4 text-right">Ley Origen → Barra</th>
                    <th className="px-6 py-4 text-center">Estado Lote</th>
                    <th className="px-6 py-4 text-center">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-xs">
                  {filteredBars.map((bar) => {
                    const isExpanded = expandedBars.includes(bar.id);
                    const isNormalMerma = bar.lossPercentage <= 3.5;
                    const isWarningMerma =
                      bar.lossPercentage > 3.5 && bar.lossPercentage < 5;

                    return (
                      <React.Fragment key={bar.id}>
                        <tr className="hover:bg-white/[0.01] transition-all">
                          <td className="px-6 py-4 font-mono font-bold text-amber-500 text-sm">
                            {bar.receiptNumber}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="font-bold text-zinc-200">
                                {bar.branchName}
                              </span>
                              <span className="text-[10px] text-zinc-500">
                                Fundido por: {bar.createdBy}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-zinc-300 font-mono text-xs">
                            {bar.date}
                          </td>
                          <td className="px-6 py-4 text-center font-mono font-bold text-zinc-300">
                            {bar.sourceCount} pzas
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex flex-col">
                              <span className="font-mono text-zinc-400 font-medium">
                                {formatNumber(bar.inputWeight)}g
                              </span>
                              <span className="font-mono text-amber-500 font-bold">
                                → {formatNumber(bar.finalWeight)}g
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span
                              className={`font-mono text-xs font-black ${
                                isNormalMerma
                                  ? "text-emerald-400"
                                  : isWarningMerma
                                    ? "text-amber-500"
                                    : "text-rose-500 animate-pulse"
                              }`}
                            >
                              {formatNumber(bar.lossPercentage)}%
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex flex-col">
                              <span className="font-mono text-zinc-400 font-medium">
                                {formatNumber(bar.weightedSrcPurity)}%
                              </span>
                              <span className="font-mono text-emerald-400 font-bold">
                                → {formatNumber(bar.finalPurity)}%
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                                bar.purityGain >= 0
                                  ? "bg-emerald-500/10 text-emerald-400"
                                  : "bg-rose-500/10 text-rose-400"
                              }`}
                            >
                              {bar.purityGain >= 0
                                ? `Mejora (+${formatNumber(bar.purityGain)}%)`
                                : `Pérdida (${formatNumber(bar.purityGain)}%)`}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button
                              type="button"
                              onClick={() => toggleExpandBar(bar.id)}
                              className="p-1 px-2.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 hover:text-white transition-all font-bold"
                            >
                              {isExpanded ? "Ocultar" : "Ver Componentes"}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-zinc-950/40">
                            <td
                              colSpan={9}
                              className="px-8 py-4 border-l-2 border-amber-500"
                            >
                              <div className="space-y-2">
                                <h5 className="text-[10px] uppercase tracking-wider font-extrabold text-zinc-400">
                                  Componentes de Origen Fundidos
                                </h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {(bar.sourceMaterials || []).map(
                                    (src, idx) => (
                                      <div
                                        key={idx}
                                        className="bg-zinc-900/60 p-3 rounded-xl border border-white/5 font-mono text-[11px] space-y-1"
                                      >
                                        <p className="font-bold text-zinc-200">
                                          #{src.receiptNumber}
                                        </p>
                                        <p className="text-zinc-500">
                                          Cliente: {src.client}
                                        </p>
                                        <div className="flex justify-between text-zinc-300">
                                          <span>
                                            Peso Final:{" "}
                                            {formatNumber(src.finalWeight)}g
                                          </span>
                                          <span>
                                            Ley: {formatNumber(src.purity)}%
                                          </span>
                                        </div>
                                        <p className="text-right text-amber-500/80">
                                          Total: {formatCurrency(src.total)}
                                        </p>
                                      </div>
                                    ),
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {filteredBars.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-6 py-12 text-center text-zinc-500 font-medium">
                        No hay registros de fundición que coincidan con los filtros.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
