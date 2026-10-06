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
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 px-2 mb-10">
          {kpis.map((kpi, idx) => (
            <Link href={kpi.link_url} key={idx} className="rounded-2xl bg-[#111111] border border-white/[0.06] p-6 flex flex-col hover:border-white/20 transition-all cursor-pointer">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xl">{kpi.icon}</span>
                <span className="text-sm font-semibold text-white/80">{kpi.label}</span>
              </div>
              <div className="text-3xl font-bold text-white mb-1">{kpi.value}</div>
              <div className="text-xs text-white/50">{kpi.subtitle}</div>
            </Link>
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
