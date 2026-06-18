import * as React from "react";
import { useState, useEffect, useMemo } from "react";
import {
  Clock,
  Calendar,
  Coins,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const formatNumber = (num: number, decimals: number = 2) => {
  if (num === null || num === undefined || isNaN(num)) return "0.00";
  return num.toLocaleString("es-ES", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

interface BranchCalendarClockPanelProps {
  branchMode: string | null;
  goldPurchases: any[];
  clients: any[];
  onViewPurchase: (purchase: any) => void;
}

export default function BranchCalendarClockPanel({
  branchMode,
  goldPurchases,
  clients,
  onViewPurchase,
}: BranchCalendarClockPanelProps) {
  // 1. Clock state
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Calendar state
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  // Date selected in calendar (defaults to today)
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDate());

  // Local helper definitions
  const currentYear = calendarDate.getFullYear();
  const currentMonth = calendarDate.getMonth(); // 0-11

  // Navigate month
  const handlePrevMonth = () => {
    setCalendarDate(new Date(currentYear, currentMonth - 1, 1));
    setSelectedDay(1); // Default to first day of previous month
  };

  const handleNextMonth = () => {
    setCalendarDate(new Date(currentYear, currentMonth + 1, 1));
    setSelectedDay(1); // Default to first day of next month
  };

  // Helper arrays/structures
  const MONTHS_SPANISH = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  const DAYS_SPANISH = ["D", "L", "M", "M", "J", "V", "S"];

  // Number of days in the month
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  // Day of the week for the first day of the month (0 = Sunday, etc.)
  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();

  // Active branch purchases (excluding "anulado")
  const activeBranchPurchases = useMemo(() => {
    return goldPurchases.filter(
      (p) => p.branchId === branchMode && p.type !== "anulado"
    );
  }, [goldPurchases, branchMode]);

  // Group active branch purchases of the current view month by day
  const purchasesByDay = useMemo(() => {
    const map: Record<number, any[]> = {};
    activeBranchPurchases.forEach((p) => {
      const pDate = new Date(p.createdAt);
      if (pDate.getFullYear() === currentYear && pDate.getMonth() === currentMonth) {
        const d = pDate.getDate();
        if (!map[d]) map[d] = [];
        map[d].push(p);
      }
    });
    return map;
  }, [activeBranchPurchases, currentYear, currentMonth]);

  // Selected date full representation
  const selectedFullDateStr = `${selectedDay.toString().padStart(2, "0")} de ${MONTHS_SPANISH[currentMonth]} de ${currentYear}`;
  const selectedDayPurchases = purchasesByDay[selectedDay] || [];

  // Generate calendar grid array
  // We need to pad days of week before first day of month
  const calendarCells = useMemo(() => {
    const cells = [];
    // Previous month cells padding
    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push({ isPadding: true, dayNum: 0 });
    }
    // Current month cells
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ isPadding: false, dayNum: d });
    }
    return cells;
  }, [daysInMonth, firstDayOfWeek]);

  // Calculate current month statistics
  const monthStats = useMemo(() => {
    const list: any[] = Object.values(purchasesByDay).flat() as any[];
    const openCount = list.filter((p) => p.type === "abierto").length;
    const closedCount = list.filter((p) => p.type === "cerrado").length;
    const totalWeight = list.reduce((sum, p) => {
      const pWeight = p.items?.reduce((s: number, item: any) => s + (item.finalWeight || item.initialWeight || 0), 0) || 0;
      return sum + pWeight;
    }, 0);
    const totalAmount = list.reduce((sum, p) => sum + (p.total || 0), 0);

    return { openCount, closedCount, totalWeight, totalAmount };
  }, [purchasesByDay]);

  return (
    <div id="branch-calendar-clock-panel" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 1. Time / Clock Sidebar Card */}
      <div className="bg-zinc-900 border border-white/5 rounded-[32px] p-6 flex flex-col justify-between shadow-xl relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
        
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-500">
              <Clock className="w-4 h-4 animate-pulse" />
            </span>
            <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">
              Estación de Tiempo Real
            </span>
          </div>

          {/* Majestic Clock Display */}
          <div className="py-2">
            <div className="text-5xl font-mono font-black text-zinc-100 tracking-tight select-none">
              {currentTime.toLocaleTimeString("es-ES", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
              })}
            </div>
            <div className="text-sm font-bold text-amber-500 mt-2 select-none capitalize">
              {currentTime.toLocaleDateString("es-ES", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </div>
          </div>

          <div className="h-px bg-white/5 w-full" />

          {/* Quick Metrics of the current calendar month */}
          <div className="space-y-4">
            <h4 className="text-[10px] text-zinc-500 uppercase font-black tracking-wider">
              Resumen Compras del Mes ({MONTHS_SPANISH[currentMonth]} {currentYear})
            </h4>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-zinc-950/40 p-3 rounded-2xl border border-white/5 text-center">
                <span className="block text-[9px] font-bold text-zinc-500 uppercase">Transacciones</span>
                <span className="text-xl font-extrabold text-zinc-100 mt-1 block">
                  {monthStats.openCount + monthStats.closedCount}
                </span>
                <span className="text-[8px] text-zinc-500 font-semibold block mt-0.5">
                  ({monthStats.openCount} Abiertas | {monthStats.closedCount} Cerradas)
                </span>
              </div>
              <div className="bg-zinc-950/40 p-3 rounded-2xl border border-white/5 text-center">
                <span className="block text-[9px] font-bold text-zinc-500 uppercase">Volumen Oro</span>
                <span className="text-xl font-extrabold text-amber-500 mt-1 block font-mono">
                  {formatNumber(monthStats.totalWeight, 2)}g
                </span>
                <span className="text-[8px] text-zinc-500 font-semibold block mt-0.5">
                  Peso total comprado
                </span>
              </div>
            </div>

            <div className="bg-zinc-950/40 p-4 rounded-2xl border border-white/5 flex items-center justify-between">
              <div>
                <span className="block text-[9px] font-bold text-zinc-500 uppercase">Flujo Monetario Mes</span>
                <span className="text-lg font-black text-emerald-400 font-mono mt-0.5 block">
                  {formatNumber(monthStats.totalAmount, 2)} BS
                </span>
              </div>
              <Coins className="w-8 h-8 text-emerald-500/20" />
            </div>
          </div>
        </div>

        <div className="pt-6 text-[10px] text-zinc-500 font-bold uppercase select-none flex items-center gap-1.5 border-t border-white/5 mt-6 sm:mt-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Terminal Activa y Sincronizada
        </div>
      </div>

      {/* 2. Interactive Calendar & Day Details (Span 2) */}
      <div className="lg:col-span-2 bg-zinc-900 border border-white/5 rounded-[32px] p-6 flex flex-col justify-between shadow-xl">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 h-full">
          {/* Calendar Selector (Col span 3) */}
          <div className="md:col-span-3 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-blue-500/10 rounded-xl border border-blue-500/20 text-blue-500 font-bold">
                  <Calendar className="w-4 h-4" />
                </span>
                <h3 className="text-sm font-black text-zinc-100 uppercase tracking-wider">
                  Calendario de Compras
                </h3>
              </div>

              {/* Prev/Next Month Controls */}
              <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-xl border border-white/5">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1 px-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-850 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[11px] font-extrabold uppercase text-zinc-300 px-1 whitespace-nowrap min-w-[90px] text-center">
                  {MONTHS_SPANISH[currentMonth]} {currentYear}
                </span>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1 px-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-850 transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Calendar Grid */}
            <div className="space-y-1.5 text-center">
              {/* Day headers */}
              <div className="grid grid-cols-7 text-[10px] font-black uppercase text-zinc-500 tracking-wider">
                {DAYS_SPANISH.map((dayLabel, idx) => (
                  <div key={`${dayLabel}-${idx}`} className="py-1">
                    {dayLabel}
                  </div>
                ))}
              </div>

              {/* Days grid */}
              <div className="grid grid-cols-7 gap-1">
                {calendarCells.map((cell, idx) => {
                  if (cell.isPadding) {
                    return (
                      <div
                        key={`pad-${idx}`}
                        className="aspect-square bg-zinc-950/20 rounded-xl border border-transparent"
                      />
                    );
                  }

                  const dayNum = cell.dayNum;
                  const isSelected = selectedDay === dayNum;
                  const dayPurchases = purchasesByDay[dayNum] || [];
                  const openCount = dayPurchases.filter((p) => p.type === "abierto").length;
                  const closedCount = dayPurchases.filter((p) => p.type === "cerrado").length;
                  const isToday =
                    new Date().getDate() === dayNum &&
                    new Date().getMonth() === currentMonth &&
                    new Date().getFullYear() === currentYear;

                  return (
                    <button
                      key={`day-${dayNum}`}
                      type="button"
                      onClick={() => setSelectedDay(dayNum)}
                      className={`aspect-square rounded-2xl border transition-all flex flex-col justify-between p-1.5 text-left relative cursor-pointer group ${
                        isSelected
                          ? "bg-amber-500/15 border-amber-500/40 text-amber-500 shadow-md shadow-amber-500/5 scale-[1.03]"
                          : isToday
                            ? "bg-zinc-850 border-white/10 text-white"
                            : "bg-zinc-950/50 border-white/5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                      }`}
                    >
                      <span className={`text-[11px] font-extrabold ${isSelected ? "text-amber-500" : isToday ? "text-amber-400" : "text-zinc-400"}`}>
                        {dayNum}
                      </span>

                      {/* Display small dots / counts if exist */}
                      {dayPurchases.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 mt-auto">
                          {openCount > 0 && (
                            <span
                              className="w-1.5 h-1.5 rounded-full bg-blue-500"
                              title={`${openCount} Compras Abiertas`}
                            />
                          )}
                          {closedCount > 0 && (
                            <span
                              className="w-1.5 h-1.5 rounded-full bg-emerald-500"
                              title={`${closedCount} Compras Cerradas`}
                            />
                          )}
                          <span className="text-[7px] font-mono font-bold scale-90 origin-bottom-left text-zinc-500 group-hover:text-zinc-300">
                            {dayPurchases.length}
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Selected Day Details Panel (Col span 2) */}
          <div className="md:col-span-2 bg-zinc-950/60 rounded-3xl border border-white/5 p-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="border-b border-white/5 pb-2.5">
                <span className="text-[8px] font-black uppercase text-zinc-500 tracking-[0.15em] block">
                  Detalles del Día
                </span>
                <span className="text-xs font-black text-zinc-200 block truncate">
                  {selectedFullDateStr}
                </span>
              </div>

              {/* Selected Day List of Receipts */}
              {selectedDayPurchases.length === 0 ? (
                <div className="text-center py-12 px-4 space-y-2 text-zinc-500 my-auto">
                  <Calendar className="w-7 h-7 mx-auto stroke-[1.5] opacity-20" />
                  <p className="text-[10px] uppercase font-black tracking-wide">
                    Sin operaciones
                  </p>
                  <p className="text-[9px] text-zinc-650 font-medium">
                    No se registran compras de oro en esta fecha.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[220px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800 pr-1 select-none">
                  {selectedDayPurchases.map((p) => {
                    const clientObj = clients.find((c) => c.id === p.clientId);
                    return (
                      <div
                        key={p.id}
                        className="bg-zinc-900 border border-white/5 rounded-2xl p-2.5 hover:border-white/10 transition-colors flex items-center justify-between gap-2 group"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-mono font-bold text-amber-500 shrink-0">
                              #{p.receiptNumber}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase shrink-0 ${
                                p.type === "abierto"
                                  ? "bg-blue-500/10 text-blue-500 border border-blue-500/10"
                                  : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/10"
                              }`}
                            >
                              {p.type}
                            </span>
                          </div>
                          <p className="text-[10px] font-bold text-zinc-200 truncate pr-1">
                            {clientObj?.name || "Cliente S/D"}
                          </p>
                          <p className="text-[9px] font-mono text-zinc-500">
                            {formatNumber(
                              p.items?.reduce((s: number, item: any) => s + (item.finalWeight || item.initialWeight || 0), 0) || 0,
                              2
                            )}g | {formatNumber(p.total, 2)} BS
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => onViewPurchase(p)}
                          className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-100 text-[9px] font-bold text-zinc-300 hover:text-zinc-950 uppercase rounded-xl transition-all border border-white/5 shrink-0 cursor-pointer"
                          title="Ver Recibo Completo"
                        >
                          Ver
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Total recap of the day */}
            {selectedDayPurchases.length > 0 && (
              <div className="border-t border-white/5 pt-2.5 mt-4 text-[9px] font-bold text-zinc-500 flex justify-between items-center bg-zinc-950/20 px-1">
                <span>TOTAL DÍA:</span>
                <span className="font-mono text-zinc-200 text-xs font-black">
                  {formatNumber(selectedDayPurchases.reduce((sum, p) => sum + (p.total || 0), 0), 2)} BS
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
