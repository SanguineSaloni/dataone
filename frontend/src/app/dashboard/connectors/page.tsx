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


interface DBForm {
  dbType: string; host: string; port: string;
  database: string; username: string; password: string; ssl: boolean;
  catalog?: string; schema?: string;
}
const defaultSource: DBForm = { dbType: "mysql", host: "", port: "3306", database: "", username: "", password: "", ssl: false };

type RunStatus = "idle" | "connecting" | "triggering" | "running" | "succeeded" | "failed";

interface IngestionRun {
  id: number;
  databricks_run_id: number | null;
  status: string;
  source_type: string;
  databricks_run_url: string | null;
  error_message: string | null;
  created_at?: string;
  source_connection_id?: number;
}

interface IngestedTable {
  id: number;
  table_name: string;
  short_name: string;
  column_count: number;
  columns: Array<{
    id: number;
    column_name: string;
    data_type: string;
    nullable: boolean;
    is_primary_key: boolean;
  }>;
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
  const [catalogs, setCatalogs] = useState<any[]>([]);
  const [schemas, setSchemas] = useState<any[]>([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(false);
  const [loadingSchemas, setLoadingSchemas] = useState(false);

  useEffect(() => {
    if (form.dbType === "databricks") {
      setLoadingCatalogs(true);
      api.get("/api/v1/databricks/ingest/catalogs")
        .then((res: any) => {
          setCatalogs(res.catalogs || []);
          setLoadingCatalogs(false);
        })
        .catch((err) => {
          console.error("Failed to load catalogs:", err);
          setLoadingCatalogs(false);
        });
    } else {
      setCatalogs([]);
      setSchemas([]);
    }
  }, [form.dbType]);

  useEffect(() => {
    if (form.dbType === "databricks" && form.catalog) {
      setLoadingSchemas(true);
      setSchemas([]); // Reset schemas when catalog changes
      api.get(`/api/v1/databricks/ingest/catalogs/${form.catalog}/schemas`)
        .then((res: any) => {
          setSchemas(res.schemas || []);
          setLoadingSchemas(false);
        })
        .catch((err) => {
          console.error("Failed to load schemas:", err);
          setLoadingSchemas(false);
        });
    } else {
      setSchemas([]);
    }
  }, [form.dbType, form.catalog]);

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
          <div className="relative flex-1 min-w-0">
            <select value={form.dbType} onChange={set("dbType")}
              className="w-full px-3 py-2 rounded-lg bg-[#1a1a1a] border border-white/10 text-white text-[13px] appearance-none focus:outline-none focus:border-white/30 transition-colors">
              {types.map(t => <option key={t.value} value={t.value} className="bg-[#1a1a1a]">{t.label}</option>)}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/30">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 9l6 6 6-6" /></svg>
            </div>
          </div>
        </div>
        {form.dbType !== "s3" && form.dbType !== "salesforce" && form.dbType !== "databricks" && (
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
        {form.dbType === "databricks" ? (
          <>
            <div className="flex items-center">
              <label className="text-[13px] text-white/60 w-[160px] flex-shrink-0">Catalog Name</label>
              <div className="relative flex-1 min-w-0">
                <select 
                  value={form.catalog || ""} 
                  onChange={set("catalog")}
                  disabled={loadingCatalogs || catalogs.length === 0}
                  className="w-full px-3 py-2 rounded-lg bg-[#1a1a1a] border border-white/10 text-white text-[13px] appearance-none focus:outline-none focus:border-white/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  <option value="" disabled>
                    {loadingCatalogs ? "Loading catalogs..." : catalogs.length === 0 ? "No catalogs available" : "Select Catalog..."}
                  </option>
                  {catalogs.map(c => <option key={c.name} value={c.name} className="bg-[#1a1a1a]">{c.name}</option>)}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/30">
                  {loadingCatalogs ? (
                    <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 9l6 6 6-6" /></svg>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center">
              <label className="text-[13px] text-white/60 w-[160px] flex-shrink-0">Schema Name</label>
              <div className="relative flex-1 min-w-0">
                <select 
                  value={form.schema || ""} 
                  onChange={set("schema")}
                  disabled={!form.catalog || loadingSchemas || schemas.length === 0}
                  className="w-full px-3 py-2 rounded-lg bg-[#1a1a1a] border border-white/10 text-white text-[13px] appearance-none focus:outline-none focus:border-white/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  <option value="" disabled>
                    {!form.catalog ? "Select catalog first..." : loadingSchemas ? "Loading schemas..." : schemas.length === 0 ? "No schemas available" : "Select Schema..."}
                  </option>
                  {schemas.map(s => <option key={s.name} value={s.name} className="bg-[#1a1a1a]">{s.name}</option>)}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/30">
                  {loadingSchemas ? (
                    <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 9l6 6 6-6" /></svg>
                  )}
                </div>
              </div>
            </div>
            {catalogs.length === 0 && !loadingCatalogs && (
              <div className="text-[12px] text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mt-2">
                <p className="font-semibold mb-1">⚠️ Unable to load catalogs</p>
                <p>Make sure your DataOne Service Principal has the correct Unity Catalog permissions.</p>
              </div>
            )}
          </>
        ) : (
          <>
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
              <div className="relative flex-1 min-w-0">
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
            {(form.dbType === "mysql" || form.dbType === "postgres" || form.dbType === "sqlserver") && (
              <div className="flex items-center">
                <label className="text-[13px] text-white/60 w-[160px] flex-shrink-0">Databricks Catalog (Optional)</label>
                <input type="text" value={form.catalog || ""} onChange={set("catalog")} placeholder="e.g. saloni_rds_catalog"
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-[#1a1a1a] border border-white/10 text-white text-[13px] placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors" />
              </div>
            )}
            <div className="flex items-center mt-2">
              <label className="text-[13px] text-white/60 w-[160px] flex-shrink-0">SSL Connection</label>
              <button type="button" onClick={() => onChange({ ...form, ssl: !form.ssl })}
                className={["relative w-10 h-5 rounded-full transition-colors", form.ssl ? "bg-white/10" : "bg-white/20"].join(" ")}>
                <div className={["absolute top-0.5 w-4 h-4 rounded-full shadow transition-transform",
                  form.ssl ? "translate-x-5 bg-white" : "translate-x-0.5 bg-white"].join(" ")} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string; dot: string }> = {
    pending:   { color: "text-amber-400 bg-amber-500/10 border-amber-500/20",   label: "Pending",   dot: "bg-amber-400" },
    running:   { color: "text-blue-400 bg-blue-500/10 border-white/10",      label: "Running",   dot: "bg-blue-400 animate-pulse" },
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

// Unity Catalog browser — uses /all-tables (no owner filter, workspace-wide)
interface CatalogGroup {
  connection_id: number;
  connection_name: string;
  connection_type: string;
  is_personal: boolean;
  tables: CatalogTable[];
}

function CatalogBrowser() {
  const [groups, setGroups] = useState<CatalogGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [expandedTable, setExpandedTable] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const load = async (q?: string) => {
    setLoading(true);
    setError("");
    try {
      const url = q ? `/api/v1/catalog/all-tables?q=${encodeURIComponent(q)}` : "/api/v1/catalog/all-tables";
      const result = await api.get<{ total: number; connections: CatalogGroup[] }>(url);
      setTotal(result.total || 0);
      setGroups(result.connections || []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load catalog.");
      setGroups([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const triggerScan = async (connId: number) => {
    setScanning(true);
    try {
      await api.post(`/api/v1/catalog/scan/${connId}`, {});
      await load(search || undefined);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Scan failed.");
    } finally {
      setScanning(false);
    }
  };

  // Client-side filter
  const filteredGroups = groups.map(g => ({
    ...g,
    tables: search
      ? g.tables.filter(t =>
          t.table_name.toLowerCase().includes(search.toLowerCase()) ||
          t.columns.some(c => c.column_name.toLowerCase().includes(search.toLowerCase()))
        )
      : g.tables,
  })).filter(g => g.tables.length > 0);

  // Group tables by catalog.schema within each connection
  const groupBySchema = (tables: CatalogTable[]) => {
    const map: Record<string, CatalogTable[]> = {};
    for (const t of tables) {
      const parts = t.table_name.split(".");
      const key = parts.length >= 3 ? `${parts[0]}.${parts[1]}` : (parts[0] || "default");
      (map[key] = map[key] || []).push(t);
    }
    return map;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Search + refresh */}
      <div className="flex gap-3">
        <div className="relative flex-1 min-w-0">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tables or columns…"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#1a1a1a] border border-white/10 text-white text-[13px] placeholder:text-white/30 focus:outline-none focus:border-white/30"
          />
        </div>
        <button
          onClick={() => load(search || undefined)}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 text-[13px] font-semibold border border-white/10 transition-colors disabled:opacity-50">
          {loading ? "Loading…" : "↻ Refresh"}
        </button>
      </div>

      {error && <p className="text-amber-400 text-sm bg-amber-500/10 rounded-lg p-3 border border-amber-500/20">⚠ {error}</p>}

      {loading && (
        <div className="flex items-center justify-center py-16 gap-3">
          <div className="w-5 h-5 border-2 border-white/20/30 border-t-white rounded-full animate-spin" />
          <span className="text-white/40 text-sm">Loading Unity Catalog…</span>
        </div>
      )}

      {!loading && total === 0 && !error && (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🗄</div>
          <p className="text-white/40 text-sm">No tables discovered yet.</p>
          <p className="text-white/25 text-xs mt-1">The app auto-discovers your Unity Catalog on startup. If you just deployed, wait a moment and click Refresh.</p>
        </div>
      )}

      {!loading && filteredGroups.length > 0 && (
        <div className="flex flex-col gap-6">
          <p className="text-white/40 text-sm">{total} tables discovered across {groups.length} connection{groups.length !== 1 ? "s" : ""}</p>
          {filteredGroups.map(group => {
            const schemaMap = groupBySchema(group.tables);
            return (
              <div key={group.connection_id} className="rounded-xl border border-white/[0.06] overflow-hidden">
                {/* Connection header */}
                <div className="bg-[#111] px-5 py-3 flex items-center justify-between border-b border-white/[0.06]">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/10/20 border border-white/20/30 flex items-center justify-center">
                      <span className="text-sm">🏔</span>
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold text-white/90">{group.connection_name}</p>
                      <p className="text-[11px] text-white/40 capitalize flex items-center gap-2">
                        {group.connection_type} · {group.tables.length} tables
                        {group.is_personal
                          ? <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-[10px] font-semibold">Your workspace</span>
                          : <span className="px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/30 text-[10px] font-semibold">Shared</span>
                        }
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => triggerScan(group.connection_id)}
                    disabled={scanning}
                    className="px-3 py-1.5 rounded-lg bg-white/20/70 hover:bg-white/20 text-white text-[12px] font-semibold border border-white/20/40 transition-colors disabled:opacity-50">
                    {scanning ? "Scanning…" : "Re-scan"}
                  </button>
                </div>

                {/* Schema groups */}
                <div className="divide-y divide-white/[0.03]">
                  {Object.entries(schemaMap).map(([schema, schemaTables]) => (
                    <div key={schema}>
                      {/* Schema label */}
                      <div className="px-5 py-2 bg-[#0f0f11] flex items-center gap-2">
                        <svg className="w-3.5 h-3.5 text-white/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
                        <span className="text-[12px] font-semibold text-white/80">{schema}</span>
                        <span className="ml-auto text-[11px] text-white/30">{schemaTables.length} tables</span>
                      </div>

                      {/* Tables */}
                      {schemaTables.map(table => {
                        const shortName = table.table_name.split(".").pop() || table.table_name;
                        const isExpanded = expandedTable === table.id;
                        return (
                          <div key={table.id}>
                            <button
                              className="w-full px-8 py-2.5 flex items-center gap-3 hover:bg-white/[0.02] transition-colors group text-left"
                              onClick={() => setExpandedTable(isExpanded ? null : table.id)}>
                              <svg className={["w-3 h-3 text-white/30 transition-transform flex-shrink-0", isExpanded ? "rotate-90" : ""].join(" ")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M9 18l6-6-6-6"/></svg>
                              <svg className="w-4 h-4 text-emerald-400/60 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M2 15h20"/></svg>
                              <span className="text-[13px] text-white/80 group-hover:text-white transition-colors font-medium">{shortName}</span>
                              <span className="ml-auto text-[11px] text-white/30 flex-shrink-0">{table.columns.length} cols</span>
                            </button>

                            {isExpanded && (
                              <div className="bg-[#080809] border-t border-white/[0.03]">
                                <table className="w-full text-[12px]">
                                  <thead>
                                    <tr className="border-b border-white/[0.04]">
                                      <th className="text-left px-10 py-2 text-white/30 font-medium w-1/3">Column</th>
                                      <th className="text-left px-4 py-2 text-white/30 font-medium w-1/3">Type</th>
                                      <th className="text-left px-4 py-2 text-white/30 font-medium">Nullable</th>
                                      <th className="text-left px-4 py-2 text-white/30 font-medium">PK</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-white/[0.02]">
                                    {table.columns
                                      .sort((a, b) => a.ordinal_position - b.ordinal_position)
                                      .map(col => (
                                        <tr key={col.id} className="hover:bg-white/[0.01]">
                                          <td className="px-10 py-1.5 text-white/70 font-mono text-[11px]">{col.column_name}</td>
                                          <td className="px-4 py-1.5 text-white/70">{col.data_type}</td>
                                          <td className="px-4 py-1.5 text-white/40">{col.nullable ? "yes" : "no"}</td>
                                          <td className="px-4 py-1.5">{col.is_primary_key ? <span className="text-amber-400 text-[10px] font-bold">PK</span> : <span className="text-white/20">—</span>}</td>
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
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
type Tab = "new" | "pipelines" | "catalog" | "connections";

export default function ConnectorsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("new");

  // Form state
  const [connectionStep, setConnectionStep] = useState<"source" | "target">("source");
  const [source, setSource] = useState<DBForm>(defaultSource);
  const [target, setTarget] = useState<DBForm>({ dbType: "postgres", host: "", port: "5432", database: "", username: "", password: "", ssl: false, catalog: "target_catalog" });
  const [showSrcPw, setShowSrcPw] = useState(false);
  const [showTgtPw, setShowTgtPw] = useState(false);
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [currentRun, setCurrentRun] = useState<IngestionRun | null>(null);
  const [ingestedTables, setIngestedTables] = useState<IngestedTable[]>([]);
  const [showIngestedTables, setShowIngestedTables] = useState(false);
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
          
          // If succeeded, fetch the ingested tables
          if (updated.status === "succeeded") {
            try {
              const tablesResponse = await api.get<{ tables: IngestedTable[]; total: number }>(
                `/api/v1/databricks/ingest/runs/${runId}/tables`
              );
              setIngestedTables(tablesResponse.tables || []);
              setShowIngestedTables(true);
            } catch (tablesErr) {
              console.error("Failed to fetch ingested tables:", tablesErr);
            }
          }
        }
      } catch { stopPolling(); }
    }, 5000);
  }, []);

  const handleEstablishConnection = async () => {
    setError("");
    setRunStatus("connecting");
    try {
      const cleanName = (str: string) => str.replace(/[^A-Za-z0-9_\-]/g, "_").replace(/_+/g, "_").substring(0, 100).replace(/_$/, "");
      
      const srcPayload = {
        name: cleanName(`${source.dbType}_${source.host || source.database || "source"}`),
        type: source.dbType,
        environment: "prod",
        config: { host: source.host, port: source.port, dbname: source.database, user: source.username, password: source.password, ssl_mode: source.ssl, catalog: source.catalog },
      };
      const srcConn = await api.post<{ id: number }>("/api/v1/connectors/", srcPayload);

      const tgtPayload = {
        name: cleanName(`${target.dbType}_${target.host || target.database || "target"}_target`),
        type: target.dbType,
        environment: "prod",
        config: { host: target.host, port: target.port, dbname: target.database, user: target.username, password: target.password, ssl_mode: target.ssl, catalog: target.catalog || "target_catalog" },
      };
      const tgtConn = await api.post<{ id: number }>("/api/v1/connectors/", tgtPayload);

      // The backend automatically triggers Lakehouse Federation setup
      // when the connections are created!
      setRunStatus("succeeded");
      // startPolling no longer needed
      setActiveTab("pipelines");

      // Refresh connections list
      const freshConns = await api.get<Connection[]>("/api/v1/connectors/");
      setConnections(freshConns || []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to establish connection. Please check your credentials.");
      setRunStatus("failed");
    }
  };


  const handleDeleteConnection = async (id: number) => {
    if (!confirm("Are you sure you want to delete this connection?")) return;
    try {
      await api.delete(`/api/v1/connectors/${id}`);
      setConnections(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      alert("Failed to delete connection: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleDrop = (e: React.DragEvent) => {

    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".csv")) setCsvFile(file);
  };

  const isSubmitting = ["connecting", "triggering", "running"].includes(runStatus);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "new",       label: "New Connection",    icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 5v14M5 12h14" /></svg> },
    { id: "connections", label: "Saved Connections", icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg> },
    { id: "pipelines", label: "Active Pipelines",  icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> },
    { id: "catalog",   label: "Unity Catalog",     icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 20L12 4l8 16" /><path d="M12 11l-3 4h6z" /></svg> },
  ];

  return (
    <div className="min-h-full bg-[#0c0c0e] text-white flex flex-col relative overflow-hidden">
      {/* Background Animation */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-white/[0.03] blur-[120px] rounded-full animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-white/[0.03] blur-[120px] rounded-full animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }} />
      </div>
      
      {/* Header */}
      <div className="relative z-10 border-b border-white/[0.06] px-8 pt-8 pb-0">
        <div className="max-w-[1600px] mx-auto">
          <h1 className="text-2xl font-bold text-white mb-1">Connectors</h1>
          <p className="text-[14px] text-white/40 mb-6">Connect your data sources, trigger Databricks ingestion pipelines, and browse your Unity Catalog.</p>

          {/* Tabs */}
          <div className="flex gap-1">
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={["px-4 py-2.5 rounded-t-lg text-[13px] font-medium border-b-2 transition-all flex items-center gap-2",
                  activeTab === tab.id
                    ? "text-white border-white/20 bg-white/10/5"
                    : "text-white/40 border-transparent hover:text-white/70 hover:border-white/20"
                ].join(" ")}>
                <span>{tab.icon}</span>{tab.label}
                {tab.id === "pipelines" && runs.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-white/10/20 text-white/80 text-[10px] font-bold">{runs.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="relative z-10 flex-1 max-w-[1600px] mx-auto w-full px-8 py-8">

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
                      className="text-white/80 hover:text-white/60 underline">View in Databricks →</a>
                  )}
                </div>
                {currentRun.error_message && <p className="mt-2 text-xs text-red-400">{currentRun.error_message}</p>}
                {currentRun.status === "running" && (
                  <div className="mt-3 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-white rounded-full animate-pulse" style={{ width: "60%" }} />
                  </div>
                )}
                
                {/* Show ingested tables after success */}
                {currentRun.status === "succeeded" && showIngestedTables && ingestedTables.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-white/90">
                        ✓ Ingested {ingestedTables.length} table{ingestedTables.length !== 1 ? 's' : ''}
                      </h4>
                      <button
                        onClick={() => router.push(`/dashboard/schema-mapper?run=${currentRun.id}`)}
                        className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-lg transition-colors border border-white/10">
                        Open in Schema Mapper →
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {ingestedTables.slice(0, 6).map(table => (
                        <div key={table.id} className="bg-[#0a0a0a] border border-white/5 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <svg className="w-3 h-3 text-emerald-400/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M2 15h20"/>
                            </svg>
                            <span className="text-xs font-medium text-white/80 truncate">{table.short_name}</span>
                          </div>
                          <p className="text-[10px] text-white/40">{table.column_count} columns</p>
                        </div>
                      ))}
                    </div>
                    {ingestedTables.length > 6 && (
                      <p className="text-xs text-white/40 mt-2 text-center">
                        +{ingestedTables.length - 6} more tables
                      </p>
                    )}
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
                  <h2 className="text-[20px] font-bold text-white leading-tight">{connectionStep === 'source' ? 'Source' : 'Target'} Database Connection</h2>
                  <p className="text-[13px] text-white/40 mt-1">Configure your {connectionStep} database credentials to map it to Databricks.</p>
                </div>
                <div className="flex flex-col gap-8">
                  {connectionStep === "source" ? (
                    <DBFormPanel title="Source Database" subtitle="Enter the source database details."
                      form={source} onChange={setSource} types={SOURCE_TYPES}
                      showPassword={showSrcPw} onTogglePassword={() => setShowSrcPw(v => !v)} />
                  ) : (
                    <DBFormPanel title="Target Database" subtitle="Enter the target database details."
                      form={target} onChange={setTarget} types={SOURCE_TYPES}
                      showPassword={showTgtPw} onTogglePassword={() => setShowTgtPw(v => !v)} />
                  )}
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="flex justify-center w-full pt-2">
              {connectionStep === "source" ? (
                <button id="next-target-btn" onClick={() => setConnectionStep("target")}
                  className="flex items-center gap-3 px-10 py-4 rounded-xl bg-white text-black text-[15px] font-bold hover:bg-gray-200 transition-all shadow-xl shadow-white/10">
                  Next: Target Credentials
                </button>
              ) : (
                <div className="flex gap-4">
                  <button onClick={() => setConnectionStep("source")}
                    className="flex items-center gap-3 px-8 py-4 rounded-xl bg-white/10 text-white text-[15px] font-bold hover:bg-white/20 transition-all">
                    Back
                  </button>
                  <button id="establish-connection-btn" onClick={handleEstablishConnection} disabled={isSubmitting}
                    className="flex items-center gap-3 px-10 py-4 rounded-xl bg-white text-black text-[15px] font-bold hover:bg-gray-200 disabled:opacity-50 transition-all shadow-xl shadow-white/10">
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        {runStatus === "connecting" ? "Connecting…" : runStatus === "triggering" ? "Triggering pipeline…" : "Pipeline running…"}
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> Establish Connections
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── SAVED CONNECTIONS TAB ── */}
        {activeTab === "connections" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">Your Connections</h2>
              <button onClick={() => setActiveTab("new")} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-[13px] font-semibold text-white transition-colors">
                + New Connection
              </button>
            </div>
            
            {connections.length === 0 ? (
              <div className="text-center py-20 border border-white/5 rounded-2xl bg-[#111]">
                <p className="text-white/40 text-[14px]">No connections saved yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {connections.map(conn => (
                  <div key={conn.id} className="p-5 rounded-2xl bg-[#111] border border-white/10 hover:border-white/20 transition-colors flex flex-col gap-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
                          {conn.type === "databricks" ? "🏔" : conn.type === "mysql" ? "🐘" : "🗄"}
                        </div>
                        <div>
                          <h3 className="font-semibold text-white/90 text-[14px] truncate max-w-[150px]" title={conn.name}>{conn.name}</h3>
                          <p className="text-xs text-white/40 uppercase">{conn.type}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <StatusBadge status={conn.health_status} />
                        <button onClick={() => handleDeleteConnection(conn.id)} className="text-xs text-red-400 hover:text-red-300 bg-red-400/10 px-2 py-1 rounded">Delete</button>
                      </div>
                    </div>
                    
                    <div className="mt-2 text-[12px] text-white/60 bg-[#161618] p-3 rounded-lg font-mono">
                      {Object.entries(conn.config || {}).filter(([k]) => k !== "password" && k !== "access_token" && k !== "url").map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                          <span className="text-white/30 min-w-[60px]">{k}:</span>
                          <span className="truncate">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ACTIVE PIPELINES TAB ── */}
        {activeTab === "pipelines" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-white/40 text-sm">{runs.length} total pipeline run{runs.length !== 1 ? "s" : ""}</p>
            </div>
            {loadingData ? (
              <div className="flex items-center justify-center py-16 gap-3">
                <div className="w-5 h-5 border-2 border-white/20/30 border-t-white rounded-full animate-spin" />
                <span className="text-white/40 text-sm">Loading pipelines…</span>
              </div>
            ) : runs.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-4"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></div>
                <p className="text-white/40 text-sm">No pipelines yet.</p>
                <p className="text-white/25 text-xs mt-1">Create a connection in the &quot;New Connection&quot; tab to trigger your first Databricks ingestion pipeline.</p>
                <button onClick={() => setActiveTab("new")}
                  className="mt-6 px-6 py-2.5 rounded-lg bg-white/20 text-white text-sm font-semibold hover:bg-white/10 transition-colors">
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
                              className="text-white/80 hover:text-white/60 underline">
                              {run.databricks_run_id ? `#${run.databricks_run_id}` : "View →"}
                            </a>
                          ) : <span className="text-white/30">{run.databricks_run_id ? `#${run.databricks_run_id}` : "—"}</span>}
                        </td>
                        <td className="px-5 py-3">
                          <button
                            onClick={() => router.push(`/dashboard/schema-mapper?conn=${run.source_connection_id}`)}
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
                <div className="w-5 h-5 border-2 border-white/20/30 border-t-white rounded-full animate-spin" />
                <span className="text-white/40 text-sm">Loading connections…</span>
              </div>
            ) : (
              <CatalogBrowser />
            )}
          </div>
        )}

      </div>
    </div>
  );
}
