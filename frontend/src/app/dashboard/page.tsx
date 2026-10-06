"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useWidgetData } from "./hooks/useWidgetData";
import type { DashboardSummary, TimeRange } from "./types";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
interface Connector { id: number; name: string; type: string; }
interface DriftAlert { id: number; connection_name: string | null; created_at: string; payload: Record<string, unknown> | null; }

const RANGE_KEY = "dashboard_time_range";
const POLL_MS = Number(process.env.NEXT_PUBLIC_DASHBOARD_POLL_INTERVAL_MS ?? 30_000);

import React from 'react';
function getIcon(name: string) {
  const icons: Record<string, React.ReactNode> = {
    'chart-bar': <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>,
    'database': <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>,
    'gem': <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3h12l4 6-10 13L2 9Z"/></svg>,
    'target': <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
    'alert': <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/></svg>,
    'lock': <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
    'shield': <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    'robot': <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4M8 16h.01M16 16h.01"/></svg>,
    'document': <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>,
    'plug': <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z"/></svg>,
    'link': <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
    'play': <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
    'rocket': <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>,
    'chart-line': <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
    'clock': <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  };
  if (!name || /[\u1000-\uFFFF]/.test(name)) return icons['chart-bar'];
  return icons[name] || icons['chart-bar'];
}

function KpiCircle({ kpi }: { kpi: any }) {
  const isPercent = String(kpi.label).includes('%') || String(kpi.label).includes('Score');
  let percentValue = 75;
  if (isPercent && !isNaN(Number(kpi.value))) {
    percentValue = Number(kpi.value);
  } else if (!isNaN(Number(kpi.value)) && Number(kpi.value) > 0 && Number(kpi.value) <= 100) {
    percentValue = Number(kpi.value); // Fallback mapping
  }

  const dash = (percentValue / 100) * 283;
  return (
    <Link href={kpi.link_url} className="flex flex-col items-center justify-center p-8 bg-[#111] rounded-[2rem] border border-white/5 relative overflow-hidden group hover:border-white/20 transition-all cursor-pointer">
      <h3 className="text-[14px] text-white/70 font-semibold mb-6 tracking-wide text-center h-10 flex items-center justify-center">{kpi.label}</h3>
      <div className="relative flex items-center justify-center w-32 h-32 mb-6">
        <svg className="absolute inset-0 w-full h-full transform -rotate-90" viewBox="0 0 100 100">
           <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
           <circle cx="50" cy="50" r="45" fill="none" stroke="url(#kpiGradient)" strokeWidth="6"
             strokeDasharray="283" strokeDashoffset={283 - dash} strokeLinecap="round" 
             className="transition-all duration-1000 ease-out group-hover:opacity-80" />
           <defs>
             <linearGradient id="kpiGradient" x1="0%" y1="0%" x2="100%" y2="100%">
               <stop offset="0%" stopColor="#818cf8" />
               <stop offset="100%" stopColor="#34d399" />
             </linearGradient>
           </defs>
        </svg>
        <div className="flex flex-col items-center justify-center absolute">
           <div className="text-white/60 mb-2">{getIcon(kpi.icon)}</div>
           <span className="text-2xl font-bold text-white tracking-tight">{kpi.value}{isPercent ? '%' : ''}</span>
        </div>
      </div>
      <span className="text-[11px] text-white/40 text-center px-2 uppercase tracking-widest leading-relaxed h-8 line-clamp-2">{kpi.subtitle}</span>
    </Link>
  )
}

export default function DashboardPage() {
  const [range, setRange] = useState<TimeRange>(() => {
    if (typeof window !== "undefined") {
      const s = localStorage.getItem(RANGE_KEY);
      if (s === "24h" || s === "7d" || s === "30d") return s;
    }
    return "7d";
  });

  const summary = useWidgetData<DashboardSummary>(
    (signal) => api.get<DashboardSummary>(`/api/v1/dashboard/summary?range=${range}`, { signal }),
    [range],
  );
  const drift = useWidgetData<DriftAlert[]>(
    (signal) => api.get<DriftAlert[]>("/api/v1/audit/?event_type=schema_drift_detected&page_size=5", { signal }),
    [],
  );
  const connectors = useWidgetData<Connector[]>(
    (signal) => api.get<Connector[]>("/api/v1/connectors/", { signal }),
    [],
  );

  const { refetch, isLoading } = summary;
  useEffect(() => {
    const interval = setInterval(() => { if (!document.hidden && !isLoading) refetch(); }, POLL_MS);
    return () => clearInterval(interval);
  }, [refetch, isLoading]);

  const kpis = summary.data?.kpis ?? [];

  const mockTimeseriesData = [
    { name: 'Mon', migrations: 2, visualizations: 4, hours_saved: 4 },
    { name: 'Tue', migrations: 3, visualizations: 6, hours_saved: 8 },
    { name: 'Wed', migrations: 2, visualizations: 8, hours_saved: 12 },
    { name: 'Thu', migrations: 5, visualizations: 10, hours_saved: 16 },
    { name: 'Fri', migrations: 8, visualizations: 12, hours_saved: 24 },
    { name: 'Sat', migrations: 12, visualizations: 25, hours_saved: 36 },
    { name: 'Sun', migrations: 14, visualizations: 42, hours_saved: 52 },
  ];

  return (
    <div className="flex flex-col h-full bg-[#09090b] text-white">
      <div className="flex-1 overflow-y-auto p-6 lg:p-10">
        
        {/* Page header */}
        <div className="flex items-start justify-between mb-10 px-2">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Analytics Dashboard</h1>
            <p className="text-[15px] text-white/60 mt-2">Real-time telemetry and platform intelligence metrics.</p>
          </div>
          <div className="flex items-center">
            <button className="flex items-center gap-3 px-4 py-2 rounded-lg border border-white/20 text-white text-sm font-medium hover:bg-white/5 transition-all">
              Last 7 days
              <svg className="w-4 h-4 text-white/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
            </button>
          </div>
        </div>

        {/* Dynamic KPI grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 px-2 mb-14">
          {kpis.map((kpi, idx) => (
            <KpiCircle key={idx} kpi={kpi} />
          ))}
        </div>

        {/* Analytics Graphs */}
        <div className="grid grid-cols-1 gap-6 px-2 pb-10">
          <div className="rounded-2xl bg-[#111111] border border-white/[0.06] p-7 flex flex-col">
            <h2 className="text-[17px] font-semibold text-white/90 mb-8">Platform Usage over Time</h2>
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mockTimeseriesData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorMigrations" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorViz" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorTime" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f472b6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f472b6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                  <YAxis stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} dx={-10} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#111', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Area type="monotone" dataKey="migrations" stroke="#818cf8" strokeWidth={3} fillOpacity={1} fill="url(#colorMigrations)" />
                  <Area type="monotone" dataKey="visualizations" stroke="#34d399" strokeWidth={3} fillOpacity={1} fill="url(#colorViz)" />
                  <Area type="monotone" dataKey="hours_saved" stroke="#f472b6" strokeWidth={3} fillOpacity={1} fill="url(#colorTime)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
