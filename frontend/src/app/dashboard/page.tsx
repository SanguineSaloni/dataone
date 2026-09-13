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
