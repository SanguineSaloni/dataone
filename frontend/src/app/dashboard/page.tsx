"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { DemoDataBanner } from "./components/DemoDataBanner";
import { useWidgetData } from "./hooks/useWidgetData";
import type { DashboardSummary, TimeRange } from "./types";

// SVG Donut Chart
function DonutChart({ value, size = 120, strokeWidth = 10, color = "#818cf8", bgColor = "rgba(255,255,255,0.05)" }: {
  value: number; size?: number; strokeWidth?: number; color?: string; bgColor?: string;
}) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;
  const cx = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={bgColor} strokeWidth={strokeWidth} />
      <circle
        cx={cx} cy={cx} r={r} fill="none"
        stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={circ / 4}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 1s ease" }}
      />
    </svg>
  );
}

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
  let percentValue = 0;
  
  if (!isNaN(Number(kpi.value))) {
    const v = Number(kpi.value);
    if (v <= 0) {
      percentValue = 0;
    } else if (isPercent) {
      percentValue = Math.min(100, v);
    } else {
      // For raw numbers, cap the visual ring at 100.
      percentValue = Math.min(100, v);
    }
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

  // Derive metrics from summary data
  const kpis = summary.data?.kpis ?? [];
  const mappedPct = kpis.find(k => k.label === "Mapped Assets %")?.value ?? 94.2;
  const dqScore = kpis.find(k => k.label === "Data Quality Score")?.value ?? 92.6;
  const totalTables = kpis.find(k => k.label === "Total Tables")?.value ?? 1087;
  const mappedFields = Math.round(Number(totalTables) * 0.94);
  const unmappedFields = Math.round(Number(totalTables) * 0.06);
  const needsReview = kpis.find(k => k.label === "Critical Risks")?.value ?? 12;

  const activeConn = connectors.data?.[0];
  const connName = activeConn ? `${activeConn.type.toUpperCase()} → Databricks (Target)` : "No connection";

  const govActivities = [
    { icon: "✅", color: "text-emerald-400", label: "Schema change approved", time: "2 hrs ago" },
    { icon: "✅", color: "text-emerald-400", label: "Access policy updated", time: "5 hrs ago" },
    { icon: "⚠️", color: "text-amber-400", label: "Risk detected in data flow", time: "1 day ago" },
    { icon: "❗", color: "text-orange-400", label: "Approval pending for new mapping", time: "1 day ago" },
  ];

  const RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
    { value: "24h", label: "Last 24h" },
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
  ];

  return (
    <div className="flex flex-col h-full bg-[#09090b] text-white">
      {/* Active connection strip */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-white/[0.06] bg-[#09090b] flex-shrink-0">
        <div className="flex items-center gap-4 bg-[#111] px-4 py-3 rounded-xl border border-white/[0.06]">
          <div className="w-3 h-3 bg-emerald-500 rounded-full flex-shrink-0" />
          <div className="flex flex-col">
            <div className="flex items-center gap-2 text-[15px] font-medium text-white">
              MySQL (Localhost) <span className="text-white/40">→</span> PostgreSQL (Target)
              <span className="text-emerald-400 ml-2">Connected</span>
            </div>
            <div className="text-xs text-white/40 mt-0.5">Last synced: Sep 10, 2026 • 14:32</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-6 py-3 rounded-lg bg-white text-black text-sm font-semibold hover:bg-white/90 transition-all">
            <span>▶</span> Run Migration Analysis
          </button>
          <button className="flex items-center gap-2 px-6 py-3 rounded-lg bg-transparent border border-white/20 text-white text-sm font-semibold hover:bg-white/5 transition-all">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
            View Pending Approvals (2)
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <DemoDataBanner onChange={() => { summary.refetch(); connectors.refetch(); }} />

        {/* Page header */}
        <div className="flex items-start justify-between mb-8 px-2">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Pipeline Overview</h1>
            <p className="text-[15px] text-white/60 mt-2">A unified view of your data migration, quality, and governance across environments.</p>
          </div>
          <div className="flex items-center">
            <button className="flex items-center gap-3 px-4 py-2 rounded-lg border border-white/20 text-white text-sm font-medium hover:bg-white/5 transition-all">
              Last 7 days
              <svg className="w-4 h-4 text-white/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
            </button>
          </div>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-2 pb-10">
          
          {/* Schema Mapping Confidence */}
          <div className="rounded-2xl bg-[#111111] border border-white/[0.06] p-7 flex flex-col justify-between">
            <h2 className="text-[17px] font-semibold text-white/90 mb-8">Schema Mapping Confidence</h2>
            <div className="flex items-center gap-10">
              <div className="relative flex-shrink-0">
                <DonutChart value={Number(mappedPct)} size={160} strokeWidth={16} color="#10b981" bgColor="rgba(255,255,255,0.05)" />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-white">{Number(mappedPct).toFixed(1)}%</span>
                  <span className="text-xs text-white/50 mt-1">AI Confidence</span>
                </div>
              </div>
              <div className="flex flex-col gap-4 flex-1">
                <div className="flex items-center gap-4">
                  <div className="w-4 h-4 rounded-sm bg-[#10b981] flex-shrink-0" />
                  <span className="text-[15px] font-bold text-white w-14">1,024</span>
                  <span className="text-[15px] text-white/60">Mapped Fields</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-4 h-4 rounded-sm bg-white/20 flex-shrink-0" />
                  <span className="text-[15px] font-bold text-white w-14">63</span>
                  <span className="text-[15px] text-white/60">Unmapped Fields</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-4 h-4 rounded-sm bg-white/40 flex-shrink-0" />
                  <span className="text-[15px] font-bold text-white w-14">12</span>
                  <span className="text-[15px] text-white/60">Needs Review</span>
                </div>
              </div>
            </div>
            <div className="mt-8 flex justify-end">
              <Link href="/dashboard/schema-mapper" className="text-[13px] text-white/40 hover:text-white transition-colors flex items-center gap-1">
                View Schema Mapper →
              </Link>
            </div>
          </div>

          {/* DBA Copilot Insights */}
          <div className="rounded-2xl bg-[#111111] border border-white/[0.06] p-7 flex flex-col justify-between">
            <h2 className="text-[17px] font-semibold text-white/90 mb-6">DBA Copilot Insights</h2>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.04]">
                <div className="w-10 h-10 rounded-lg bg-white/5 text-white flex items-center justify-center font-bold text-lg flex-shrink-0">5</div>
                <span className="text-[15px] text-white/80">Impact analysis completed</span>
              </div>
              <div className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.04]">
                <div className="w-10 h-10 rounded-lg bg-white/5 text-white flex items-center justify-center font-bold text-lg flex-shrink-0">2</div>
                <span className="text-[15px] text-white/80">Pending human approvals</span>
              </div>
              <div className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.04]">
                <div className="w-10 h-10 rounded-lg bg-white/5 text-white flex items-center justify-center font-bold text-lg flex-shrink-0">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L1 21h22L12 2zm1 16h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
                </div>
                <span className="text-[15px] text-white/80">Potential issues detected</span>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <Link href="/dashboard/autopilot" className="text-[13px] text-white/40 hover:text-white transition-colors">
                View Insights →
              </Link>
            </div>
          </div>

          {/* Data Quality Health */}
          <div className="rounded-2xl bg-[#111111] border border-white/[0.06] p-7 flex flex-col justify-between">
            <h2 className="text-[17px] font-semibold text-white/90 mb-8">Data Quality Health</h2>
            <div className="flex items-center gap-10">
              <div className="relative flex-shrink-0">
                <DonutChart value={Number(dqScore)} size={160} strokeWidth={16} color="#ffffff" bgColor="rgba(255,255,255,0.1)" />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-white">{Number(dqScore).toFixed(1)}%</span>
                  <span className="text-xs text-white/50 mt-1">Overall Score</span>
                </div>
              </div>
              <div className="flex flex-col gap-4 flex-1">
                <div className="flex items-center gap-4">
                  <div className="w-3 h-3 rounded-full bg-[#10b981] flex-shrink-0" />
                  <span className="text-[15px] text-white/60 flex-1">Accuracy</span>
                  <span className="text-[15px] font-bold text-white">96%</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-3 h-3 rounded-full bg-[#fbbf24] flex-shrink-0" />
                  <span className="text-[15px] text-white/60 flex-1">Completeness</span>
                  <span className="text-[15px] font-bold text-white">91%</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-3 h-3 rounded-full bg-[#f97316] flex-shrink-0" />
                  <span className="text-[15px] text-white/60 flex-1">Drift Alerts</span>
                  <span className="text-[15px] font-bold text-white">3</span>
                </div>
              </div>
            </div>
            <div className="mt-8 flex justify-end">
              <Link href="/dashboard/data-quality" className="text-[13px] text-white/40 hover:text-white transition-colors flex items-center gap-1">
                View Data Quality →
              </Link>
            </div>
          </div>

          {/* Autopilot Governance */}
          <div className="rounded-2xl bg-[#111111] border border-white/[0.06] p-7 flex flex-col justify-between">
            <h2 className="text-[17px] font-semibold text-white/90 mb-6">Autopilot Governance</h2>
            <div>
              <p className="text-[13px] text-white/40 mb-4">Recent Activities</p>
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-6 h-6 rounded-full bg-[#10b981] flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path d="M20 6L9 17l-5-5" /></svg>
                  </div>
                  <span className="text-[15px] text-white/70 flex-1">Schema change approved</span>
                  <span className="text-[13px] text-white/40">2 hrs ago</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-6 h-6 rounded-full bg-[#10b981] flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path d="M20 6L9 17l-5-5" /></svg>
                  </div>
                  <span className="text-[15px] text-white/70 flex-1">Access policy updated</span>
                  <span className="text-[13px] text-white/40">5 hrs ago</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-6 h-6 rounded-full bg-[#f97316] flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <span className="text-[15px] text-white/70 flex-1">Risk detected in data flow</span>
                  <span className="text-[13px] text-white/40">1 day ago</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-6 h-6 rounded-full bg-[#fbbf24] flex items-center justify-center flex-shrink-0">
                    <span className="text-black font-bold text-sm">!</span>
                  </div>
                  <span className="text-[15px] text-white/70 flex-1">Approval pending for new mapping</span>
                  <span className="text-[13px] text-white/40">1 day ago</span>
                </div>
              </div>
            </div>
            <div className="mt-8 flex justify-end">
              <Link href="/dashboard/audit" className="text-[13px] text-white/40 hover:text-white transition-colors">
                View Audit Trail →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
