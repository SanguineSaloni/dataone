"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────
const SOURCE_TYPES = [
  { value: "mysql", label: "MySQL", port: "3306" },
  { value: "postgres", label: "PostgreSQL", port: "5432" },
  { value: "mongodb", label: "MongoDB", port: "27017" },
  { value: "oracle", label: "Oracle", port: "1521" },
  { value: "sqlserver", label: "SQL Server", port: "1433" },
  { value: "snowflake", label: "Snowflake", port: "443" },
  { value: "redshift", label: "Amazon Redshift", port: "5439" },
  { value: "salesforce", label: "Salesforce", port: "443" },
  { value: "s3", label: "Amazon S3", port: "" },
];

const TARGET_TYPES = [
  { value: "databricks", label: "Databricks Delta Lake" },
  { value: "postgres", label: "PostgreSQL" },
  { value: "mysql", label: "MySQL" },
  { value: "s3", label: "Amazon S3" },
];

interface DBForm {
  dbType: string; host: string; port: string;
  database: string; username: string; password: string; ssl: boolean;
}
const defaultSource: DBForm = { dbType: "mysql", host: "", port: "3306", database: "", username: "", password: "", ssl: false };
const defaultTarget: DBForm = { dbType: "databricks", host: "", port: "", database: "main.dataone_ingested", username: "", password: "", ssl: true };

type RunStatus = "idle" | "connecting" | "triggering" | "running" | "succeeded" | "failed";

interface IngestionRun {
  id: number;
  databricks_run_id: number | null;
  status: string;
  source_type: string;
  databricks_run_url: string | null;
  error_message: string | null;
  created_at?: string;
}

interface Connection {
  id: number;
  name: string;
  type: string;
  environment: string;
  health_status: string;
  config: Record<string, unknown>;
  created_at?: string;
}

interface CatalogColumn {
  id: number;
  column_name: string;
  data_type: string;
  nullable: boolean;
  is_primary_key: boolean;
  ordinal_position: number;
}

interface CatalogTable {
  id: number;
  connection_id: number;
  table_name: string;
  last_scanned_at: string;
  columns: CatalogColumn[];
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function DBFormPanel({ title, subtitle, form, onChange, types, showPassword, onTogglePassword }: {
  title: string; subtitle: string;
  form: DBForm; onChange: (f: DBForm) => void;
  types: { value: string; label: string; port?: string }[];
  showPassword: boolean; onTogglePassword: () => void;
}) {
  const set = (k: keyof DBForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const val = k === "ssl" ? (e.target as HTMLInputElement).checked : e.target.value;
    const updated = { ...form, [k]: val };
    if (k === "dbType") {
      const match = types.find(t => t.value === val);
      if (match && "port" in match && match.port !== undefined) updated.port = match.port;
    }
    onChange(updated);
  };
  return (
    <div className="flex-1 border border-white/[0.06] rounded-xl p-5 bg-transparent">
      <div className="mb-5">
        <h3 className="font-semibold text-white/90 text-[15px]">{title}</h3>
        <p className="text-[13px] text-white/40 mt-1">{subtitle}</p>
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex items-center">
          <label className="text-[13px] text-white/60 w-[160px] flex-shrink-0">Database Type</label>
          <div className="relative flex-1">
            <select value={form.dbType} onChange={set("dbType")}
              className="w-full px-3 py-2 rounded-lg bg-[#1a1a1a] border border-white/10 text-white text-[13px] appearance-none focus:outline-none focus:border-white/30 transition-colors">
              {types.map(t => <option key={t.value} value={t.value} className="bg-[#1a1a1a]">{t.label}</option>)}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/30">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 9l6 6 6-6" /></svg>
            </div>
          </div>
        </div>
        {form.dbType !== "s3" && form.dbType !== "salesforce" && (
          <>
            <div className="flex items-center">
              <label className="text-[13px] text-white/60 w-[160px] flex-shrink-0">Host / Hostname</label>
              <input type="text" value={form.host} onChange={set("host")} placeholder="e.g. db.company.com"
                className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-[#1a1a1a] border border-white/10 text-white text-[13px] placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors" />
            </div>
            <div className="flex items-center">
              <label className="text-[13px] text-white/60 w-[160px] flex-shrink-0">Port Number</label>
              <input type="text" value={form.port} onChange={set("port")} placeholder="3306"
                className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-[#1a1a1a] border border-white/10 text-white text-[13px] placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors" />
            </div>
          </>
        )}
        <div className="flex items-center">
          <label className="text-[13px] text-white/60 w-[160px] flex-shrink-0">Database Name</label>
          <input type="text" value={form.database} onChange={set("database")} placeholder="source_db"
            className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-[#1a1a1a] border border-white/10 text-white text-[13px] placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors" />
        </div>
        <div className="flex items-center">
          <label className="text-[13px] text-white/60 w-[160px] flex-shrink-0">Username</label>
          <input type="text" value={form.username} onChange={set("username")} placeholder="admin"
            className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-[#1a1a1a] border border-white/10 text-white text-[13px] placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors" />
        </div>
        <div className="flex items-center">
          <label className="text-[13px] text-white/60 w-[160px] flex-shrink-0">Password</label>
          <div className="relative flex-1">
            <input type={showPassword ? "text" : "password"} value={form.password} onChange={set("password")} placeholder="••••••••"
              className="w-full px-3 py-2 pr-10 rounded-lg bg-[#1a1a1a] border border-white/10 text-white text-[13px] placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors" />
            <button type="button" onClick={onTogglePassword} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
              {showPassword
                ? <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" /></svg>
                : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
              }
            </button>
          </div>
        </div>
        <div className="flex items-center mt-2">
          <label className="text-[13px] text-white/60 w-[160px] flex-shrink-0">SSL Connection</label>
          <button type="button" onClick={() => onChange({ ...form, ssl: !form.ssl })}
            className={["relative w-10 h-5 rounded-full transition-colors", form.ssl ? "bg-indigo-500" : "bg-white/20"].join(" ")}>
            <div className={["absolute top-0.5 w-4 h-4 rounded-full shadow transition-transform",
              form.ssl ? "translate-x-5 bg-white" : "translate-x-0.5 bg-white"].join(" ")} />
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string; dot: string }> = {
    pending:   { color: "text-amber-400 bg-amber-500/10 border-amber-500/20",   label: "Pending",   dot: "bg-amber-400" },
    running:   { color: "text-blue-400 bg-blue-500/10 border-blue-500/20",      label: "Running",   dot: "bg-blue-400 animate-pulse" },
    succeeded: { color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", label: "Succeeded", dot: "bg-emerald-400" },
    failed:    { color: "text-red-400 bg-red-500/10 border-red-500/20",         label: "Failed",    dot: "bg-red-400" },
    cancelled: { color: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",      label: "Cancelled", dot: "bg-zinc-400" },
    healthy:   { color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", label: "Healthy",   dot: "bg-emerald-400 animate-pulse" },
    unknown:   { color: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",      label: "Unknown",   dot: "bg-zinc-400" },
    degraded:  { color: "text-amber-400 bg-amber-500/10 border-amber-500/20",   label: "Degraded",  dot: "bg-amber-400" },
    down:      { color: "text-red-400 bg-red-500/10 border-red-500/20",         label: "Down",      dot: "bg-red-400" },
  };
  const s = map[status] ?? map.unknown;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${s.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{s.label}
    </span>
  );
}

// Unity Catalog tree component
function CatalogBrowser({ connections }: { connections: Connection[] }) {
  const [selectedConn, setSelectedConn] = useState<number | null>(null);
  const [tables, setTables] = useState<CatalogTable[]>([]);
  const [expandedTable, setExpandedTable] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const databricksConns = connections.filter(c => c.type === "databricks");

  const loadCatalog = async (connId: number) => {
    setSelectedConn(connId);
    setLoading(true);
    setError("");
    try {
      const result = await api.get<{ tables: CatalogTable[]; total: number }>(`/api/v1/catalog/${connId}/tables`);
      setTables(result.tables || []);
    } catch {
      setError("No catalog data yet. Try triggering a scan below.");
      setTables([]);
    } finally {
      setLoading(false);
    }
  };

  const triggerScan = async (connId: number) => {
    setLoading(true);
    try {
      await api.post(`/api/v1/catalog/scan/${connId}`, {});
      await loadCatalog(connId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Scan failed");
      setLoading(false);
    }
  };

  const filtered = tables.filter(t =>
    !search || t.table_name.toLowerCase().includes(search.toLowerCase()) ||
    t.columns.some(c => c.column_name.toLowerCase().includes(search.toLowerCase()))
  );

  // Group by catalog.schema
  const grouped: Record<string, CatalogTable[]> = {};
  for (const t of filtered) {
    const parts = t.table_name.split(".");
    const group = parts.length >= 3 ? `${parts[0]}.${parts[1]}` : parts[0] || "default";
    (grouped[group] = grouped[group] || []).push(t);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Connection picker */}
      <div className="flex flex-wrap gap-2">
        {databricksConns.length === 0 ? (
          <p className="text-white/40 text-sm">No Databricks connections found. The auto-discovered workspace connection will appear here once the app fully loads.</p>
        ) : (
          databricksConns.map(c => (
            <button key={c.id}
              onClick={() => loadCatalog(c.id)}
              className={["px-3 py-1.5 rounded-lg text-[13px] font-medium border transition-all", 
                selectedConn === c.id 
                  ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300" 
                  : "bg-white/5 border-white/10 text-white/60 hover:text-white/90 hover:border-white/20"].join(" ")}>
              🏔 {c.name}
            </button>
          ))
        )}
      </div>

      {selectedConn && (
        <>
          {/* Search + scan */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search tables or columns…"
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#1a1a1a] border border-white/10 text-white text-[13px] placeholder:text-white/30 focus:outline-none focus:border-white/30"
              />
            </div>
            <button
              onClick={() => triggerScan(selectedConn)}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white text-[13px] font-semibold border border-indigo-500/40 transition-colors disabled:opacity-50">
              {loading ? "Scanning…" : "Refresh Scan"}
            </button>
          </div>

          {error && <p className="text-amber-400 text-sm bg-amber-500/10 rounded-lg p-3 border border-amber-500/20">⚠ {error}</p>}

          {loading && !error && (
            <div className="flex items-center justify-center py-12 gap-3">
              <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
              <span className="text-white/40 text-sm">Loading Unity Catalog…</span>
            </div>
          )}

          {!loading && tables.length > 0 && (
            <div className="rounded-xl border border-white/[0.06] overflow-hidden">
              <div className="bg-[#111] px-4 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
                <span className="text-[12px] text-white/50 font-medium uppercase tracking-wider">Unity Catalog Explorer</span>
                <span className="text-[12px] text-white/30">{tables.length} tables discovered</span>
              </div>
              <div className="divide-y divide-white/[0.04] max-h-[500px] overflow-y-auto">
                {Object.entries(grouped).map(([group, groupTables]) => (
                  <div key={group}>
                    {/* Schema group header */}
                    <div className="px-4 py-2 bg-[#0f0f11] flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-indigo-400/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
                      <span className="text-[12px] font-semibold text-indigo-400/80 tracking-wide">{group}</span>
                      <span className="text-[11px] text-white/30 ml-auto">{groupTables.length} tables</span>
                    </div>
                    {groupTables.map(table => {
                      const shortName = table.table_name.split(".").pop() || table.table_name;
                      const isExpanded = expandedTable === table.id;
                      return (
                        <div key={table.id}>
                          <button
                            className="w-full px-6 py-2.5 flex items-center gap-3 hover:bg-white/[0.02] transition-colors group text-left"
                            onClick={() => setExpandedTable(isExpanded ? null : table.id)}>
                            <svg className={["w-3.5 h-3.5 text-white/30 transition-transform", isExpanded ? "rotate-90" : ""].join(" ")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 18l6-6-6-6"/></svg>
                            <svg className="w-4 h-4 text-emerald-400/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
                            <span className="text-[13px] text-white/80 group-hover:text-white transition-colors font-medium">{shortName}</span>
                            <span className="ml-auto text-[11px] text-white/30">{table.columns.length} cols</span>
                          </button>
                          {isExpanded && (
                            <div className="bg-[#0a0a0c] border-t border-white/[0.04]">
                              <table className="w-full text-[12px]">
                                <thead>
                                  <tr className="border-b border-white/[0.04]">
                                    <th className="text-left px-8 py-2 text-white/30 font-medium">Column</th>
                                    <th className="text-left px-4 py-2 text-white/30 font-medium">Type</th>
                                    <th className="text-left px-4 py-2 text-white/30 font-medium">Nullable</th>
                                    <th className="text-left px-4 py-2 text-white/30 font-medium">PK</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-white/[0.02]">
                                  {table.columns.map(col => (
                                    <tr key={col.id} className="hover:bg-white/[0.01]">
                                      <td className="px-8 py-1.5 text-white/70 font-mono">{col.column_name}</td>
                                      <td className="px-4 py-1.5 text-violet-400/70">{col.data_type}</td>
                                      <td className="px-4 py-1.5 text-white/40">{col.nullable ? "yes" : "no"}</td>
                                      <td className="px-4 py-1.5">{col.is_primary_key ? <span className="text-amber-400">🔑</span> : <span className="text-white/20">—</span>}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && tables.length === 0 && !error && (
            <div className="text-center py-12 text-white/30">
              <div className="text-4xl mb-3">🗄</div>
              <p className="text-sm">No tables in catalog yet.</p>
              <p className="text-xs mt-1">Click &quot;Refresh Scan&quot; to discover Unity Catalog tables.</p>
            </div>
          )}
        </>
      )}

      {!selectedConn && databricksConns.length > 0 && (
        <div className="text-center py-12 text-white/30">
          <div className="text-4xl mb-3">🏔</div>
          <p className="text-sm">Select a Databricks connection above to browse Unity Catalog.</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
type Tab = "new" | "pipelines" | "catalog";

export default function ConnectorsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("new");

  // Form state
  const [source, setSource] = useState<DBForm>(defaultSource);
  const [target, setTarget] = useState<DBForm>(defaultTarget);
  const [showSrcPw, setShowSrcPw] = useState(false);
  const [showTgtPw, setShowTgtPw] = useState(false);
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [currentRun, setCurrentRun] = useState<IngestionRun | null>(null);
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // CSV upload
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Real data
  const [connections, setConnections] = useState<Connection[]>([]);
  const [runs, setRuns] = useState<IngestionRun[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoadingData(true);
      try {
        const [conns, runsData] = await Promise.allSettled([
          api.get<Connection[]>("/api/v1/connectors/"),
          api.get<IngestionRun[]>("/api/v1/databricks/ingest/runs"),
        ]);
        if (conns.status === "fulfilled") setConnections(conns.value || []);
        if (runsData.status === "fulfilled") setRuns(Array.isArray(runsData.value) ? runsData.value : []);
      } finally {
        setLoadingData(false);
      }
    };
    load();
  }, []);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const startPolling = useCallback((runId: number) => {
    pollRef.current = setInterval(async () => {
      try {
        const updated = await api.get<IngestionRun>(`/api/v1/databricks/ingest/runs/${runId}`);
        setCurrentRun(updated);
        setRuns(prev => prev.map(r => r.id === runId ? updated : r));
        if (["succeeded", "failed", "cancelled"].includes(updated.status)) {
          stopPolling();
          setRunStatus(updated.status === "succeeded" ? "succeeded" : "failed");
        }
      } catch { stopPolling(); }
    }, 5000);
  }, []);

  const handleEstablishConnection = async () => {
    setError("");
    setRunStatus("connecting");
    try {
      const srcPayload = {
        name: `${source.dbType.toUpperCase()} — ${source.host || "source"}`,
        type: source.dbType,
        environment: "prod",
        config: { host: source.host, port: source.port, database: source.database, username: source.username, password: source.password, ssl: source.ssl },
      };
      const srcConn = await api.post<{ id: number }>("/api/v1/connectors/", srcPayload);

      const tgtPayload = {
        name: `Databricks Target — ${target.database}`,
        type: target.dbType,
        environment: "prod",
        config: {
          host: target.host, port: target.port,
          catalog: target.database.split(".")[0] || "main",
          schema: target.database.split(".")[1] || "dataone_ingested",
          username: target.username, password: target.password, ssl: target.ssl,
        },
      };
      const tgtConn = await api.post<{ id: number }>("/api/v1/connectors/", tgtPayload);
      setRunStatus("triggering");

      const ingestionRun = await api.post<IngestionRun>("/api/v1/databricks/ingest/trigger", {
        source_connection_id: srcConn.id,
        target_connection_id: tgtConn.id,
      });

      setCurrentRun(ingestionRun);
      setRuns(prev => [ingestionRun, ...prev]);
      setRunStatus("running");
      startPolling(ingestionRun.id);
      setActiveTab("pipelines");

      // Refresh connections list
      const freshConns = await api.get<Connection[]>("/api/v1/connectors/");
      setConnections(freshConns || []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to establish connection. Please check your credentials.");
      setRunStatus("failed");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".csv")) setCsvFile(file);
  };

  const isSubmitting = ["connecting", "triggering", "running"].includes(runStatus);

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "new",       label: "New Connection",    icon: "➕" },
    { id: "pipelines", label: "Active Pipelines",  icon: "⚡" },
    { id: "catalog",   label: "Unity Catalog",     icon: "🏔" },
  ];

  return (
    <div className="min-h-full bg-[#0c0c0e] text-white flex flex-col">
      {/* Header */}
      <div className="border-b border-white/[0.06] px-8 pt-8 pb-0">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-white mb-1">Connectors</h1>
          <p className="text-[14px] text-white/40 mb-6">Connect your data sources, trigger Databricks ingestion pipelines, and browse your Unity Catalog.</p>

          {/* Tabs */}
          <div className="flex gap-1">
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={["px-4 py-2.5 rounded-t-lg text-[13px] font-medium border-b-2 transition-all flex items-center gap-2",
                  activeTab === tab.id
                    ? "text-white border-indigo-500 bg-indigo-500/5"
                    : "text-white/40 border-transparent hover:text-white/70 hover:border-white/20"
                ].join(" ")}>
                <span>{tab.icon}</span>{tab.label}
                {tab.id === "pipelines" && runs.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 text-[10px] font-bold">{runs.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-8 py-8">

        {/* ── NEW CONNECTION TAB ── */}
        {activeTab === "new" && (
          <div className="flex flex-col gap-6">
            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">⚠ {error}</div>
            )}

            {currentRun && (
              <div className="p-5 rounded-2xl bg-[#111] border border-white/10">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-white/90">Databricks Ingestion Pipeline</h3>
                    <p className="text-xs text-white/40 mt-0.5">Source: {currentRun.source_type} → Delta Lake</p>
                  </div>
                  <StatusBadge status={currentRun.status} />
                </div>
                <div className="flex items-center gap-3 text-xs text-white/40">
                  <span>Run ID: {currentRun.databricks_run_id ?? "Assigning…"}</span>
                  {currentRun.databricks_run_url && (
                    <a href={currentRun.databricks_run_url} target="_blank" rel="noopener noreferrer"
                      className="text-indigo-400 hover:text-indigo-300 underline">View in Databricks →</a>
                  )}
                </div>
                {currentRun.error_message && <p className="mt-2 text-xs text-red-400">{currentRun.error_message}</p>}
                {currentRun.status === "running" && (
                  <div className="mt-3 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full animate-pulse" style={{ width: "60%" }} />
                  </div>
                )}
              </div>
            )}

            {/* Ingestion method selector */}
            <div className="flex flex-col lg:flex-row gap-0 items-stretch">
              {/* CSV Upload */}
              <div className="lg:w-[360px] bg-[#121214] border border-white/[0.06] rounded-[20px] p-8 flex flex-col shadow-2xl">
                <div className="mb-6">
                  <p className="text-[13px] text-white/40 mb-1">Option 1</p>
                  <h2 className="text-[20px] font-bold text-white leading-tight">Quick Upload</h2>
                  <p className="text-[13px] text-white/40 mt-1">Upload a CSV file to explore and map your data.</p>
                </div>
                <div
                  className={["flex-1 border-[1.5px] border-dashed rounded-[20px] flex flex-col items-center justify-center p-8 gap-4 transition-colors cursor-pointer",
                    isDragging ? "border-white/40 bg-white/5" : "border-white/10 hover:border-white/20"].join(" ")}
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}>
                  <input ref={fileInputRef} type="file" accept=".csv" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) setCsvFile(f); }} />
                  {csvFile ? (
                    <>
                      <div className="text-4xl">📄</div>
                      <p className="text-[15px] text-white/90 font-medium text-center">{csvFile.name}</p>
                      <p className="text-[13px] text-white/40">{(csvFile.size / 1024 / 1024).toFixed(1)} MB</p>
                      <button onClick={e => { e.stopPropagation(); setCsvFile(null); }}
                        className="text-[13px] text-red-400 hover:text-red-300 transition-colors mt-2">Remove</button>
                    </>
                  ) : (
                    <>
                      <svg className="w-10 h-10 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                      </svg>
                      <p className="text-[15px] font-semibold text-white mt-1">Drag &amp; Drop CSV file here</p>
                      <p className="text-[13px] text-white/40">or</p>
                      <button type="button" onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
                        className="px-6 py-2.5 rounded-lg bg-white text-black text-[14px] font-semibold hover:bg-white/90 transition-colors mt-1">Browse Files</button>
                    </>
                  )}
                </div>
                <p className="text-[12px] text-white/30 text-center mt-5">Supports .csv files up to 500 MB</p>
              </div>

              {/* OR */}
              <div className="flex lg:flex-col items-center justify-center flex-shrink-0 w-24">
                <div className="flex-1 w-px bg-white/[0.04]" />
                <div className="w-10 h-10 rounded-full border border-white/[0.06] bg-[#0c0c0e] flex items-center justify-center text-[12px] font-semibold text-white/40 my-4 z-10 shadow-lg">OR</div>
                <div className="flex-1 w-px bg-white/[0.04]" />
              </div>

              {/* DB Credentials */}
              <div className="flex-1 bg-[#121214] border border-white/[0.06] rounded-[20px] p-8 shadow-2xl">
                <div className="mb-6">
                  <p className="text-[13px] text-white/40 mb-1">Option 2</p>
                  <h2 className="text-[20px] font-bold text-white leading-tight">Database Connection</h2>
                  <p className="text-[13px] text-white/40 mt-1">Configure your source and target database credentials to trigger a Databricks ingestion pipeline.</p>
                </div>
                <div className="flex flex-col md:flex-row gap-8">
                  <DBFormPanel title="Source Database" subtitle="Enter the source database details."
                    form={source} onChange={setSource} types={SOURCE_TYPES}
                    showPassword={showSrcPw} onTogglePassword={() => setShowSrcPw(v => !v)} />
                  <DBFormPanel title="Target (Databricks)" subtitle="Where data lands in Delta Lake."
                    form={target} onChange={setTarget} types={TARGET_TYPES}
                    showPassword={showTgtPw} onTogglePassword={() => setShowTgtPw(v => !v)} />
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="flex justify-center w-full pt-2">
              <button id="establish-connection-btn" onClick={handleEstablishConnection} disabled={isSubmitting}
                className="flex items-center gap-3 px-10 py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-[15px] font-bold hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 transition-all shadow-xl shadow-indigo-900/40">
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {runStatus === "connecting" ? "Connecting…" : runStatus === "triggering" ? "Triggering pipeline…" : "Pipeline running…"}
                  </>
                ) : (
                  <>⚡ Establish Connection &amp; Trigger Ingestion</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── PIPELINES TAB ── */}
        {activeTab === "pipelines" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-white/40 text-sm">{runs.length} total pipeline run{runs.length !== 1 ? "s" : ""}</p>
            </div>
            {loadingData ? (
              <div className="flex items-center justify-center py-16 gap-3">
                <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                <span className="text-white/40 text-sm">Loading pipelines…</span>
              </div>
            ) : runs.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-4">⚡</div>
                <p className="text-white/40 text-sm">No pipelines yet.</p>
                <p className="text-white/25 text-xs mt-1">Create a connection in the &quot;New Connection&quot; tab to trigger your first Databricks ingestion pipeline.</p>
                <button onClick={() => setActiveTab("new")}
                  className="mt-6 px-6 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 transition-colors">
                  Create Connection →
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-white/[0.06] overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-[#111] border-b border-white/[0.06]">
                      <th className="text-left px-5 py-3 text-white/40 font-medium">Run ID</th>
                      <th className="text-left px-5 py-3 text-white/40 font-medium">Source Type</th>
                      <th className="text-left px-5 py-3 text-white/40 font-medium">Status</th>
                      <th className="text-left px-5 py-3 text-white/40 font-medium">Databricks Run</th>
                      <th className="text-left px-5 py-3 text-white/40 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {runs.map(run => (
                      <tr key={run.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-3 text-white/70 font-mono">#{run.id}</td>
                        <td className="px-5 py-3 text-white/70 capitalize">{run.source_type || "—"}</td>
                        <td className="px-5 py-3"><StatusBadge status={run.status} /></td>
                        <td className="px-5 py-3">
                          {run.databricks_run_url ? (
                            <a href={run.databricks_run_url} target="_blank" rel="noopener noreferrer"
                              className="text-indigo-400 hover:text-indigo-300 underline">
                              {run.databricks_run_id ? `#${run.databricks_run_id}` : "View →"}
                            </a>
                          ) : <span className="text-white/30">{run.databricks_run_id ? `#${run.databricks_run_id}` : "—"}</span>}
                        </td>
                        <td className="px-5 py-3">
                          <button
                            onClick={() => router.push("/dashboard/schema-mapper")}
                            className="px-3 py-1 bg-white/5 hover:bg-white/10 text-white text-[11px] font-semibold rounded-lg transition-colors border border-white/10">
                            View Schema Mapping
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Connected sources summary */}
            {connections.length > 0 && (
              <div className="mt-4">
                <p className="text-[13px] text-white/40 mb-3 font-medium">Registered Connections ({connections.length})</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {connections.map(conn => (
                    <div key={conn.id} className="bg-[#111] border border-white/[0.06] rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[13px] font-semibold text-white/90 truncate">{conn.name}</span>
                        <StatusBadge status={conn.health_status} />
                      </div>
                      <p className="text-[12px] text-white/40 capitalize">{conn.type} · {conn.environment}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── UNITY CATALOG TAB ── */}
        {activeTab === "catalog" && (
          <div>
            <p className="text-white/40 text-sm mb-6">
              Browse your Databricks Unity Catalog tables and schemas. Auto-discovered connections appear automatically.
            </p>
            {loadingData ? (
              <div className="flex items-center justify-center py-16 gap-3">
                <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                <span className="text-white/40 text-sm">Loading connections…</span>
              </div>
            ) : (
              <CatalogBrowser connections={connections} />
            )}
          </div>
        )}

      </div>
    </div>
  );
}
