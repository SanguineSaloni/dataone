"use client";
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";

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
  dbType: string;
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
}

const defaultSource: DBForm = { dbType: "mysql", host: "localhost", port: "3306", database: "source_db", username: "admin", password: "", ssl: false };
const defaultTarget: DBForm = { dbType: "databricks", host: "", port: "", database: "main.dataone_ingested", username: "", password: "", ssl: true };

type RunStatus = "idle" | "connecting" | "triggering" | "running" | "succeeded" | "failed";

interface IngestionRun {
  id: number;
  databricks_run_id: number | null;
  status: string;
  source_type: string;
  databricks_run_url: string | null;
  error_message: string | null;
}

function DBFormPanel({ title, subtitle, form, onChange, types, showPassword, onTogglePassword }: {
  title: string; subtitle: string;
  form: DBForm; onChange: (f: DBForm) => void;
  types: { value: string; label: string; port?: string }[];
  showPassword: boolean; onTogglePassword: () => void;
}) {
  const set = (k: keyof DBForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const val = k === "ssl" ? (e.target as HTMLInputElement).checked : e.target.value;
    const updated = { ...form, [k]: val };
    // Auto-fill port when DB type changes
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
            <select
              value={form.dbType}
              onChange={set("dbType")}
              className="w-full px-3 py-2 rounded-lg bg-[#1a1a1a] border border-white/10 text-white text-[13px] appearance-none focus:outline-none focus:border-white/30 transition-colors"
            >
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
              <label className="text-[13px] text-white/60 w-[160px] flex-shrink-0">Host Name / Localhost</label>
              <input type="text" value={form.host} onChange={set("host")}
                placeholder="localhost"
                className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-[#1a1a1a] border border-white/10 text-white text-[13px] placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors" />
            </div>
            <div className="flex items-center">
              <label className="text-[13px] text-white/60 w-[160px] flex-shrink-0">Port Number</label>
              <input type="text" value={form.port} onChange={set("port")}
                placeholder="3306"
                className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-[#1a1a1a] border border-white/10 text-white text-[13px] placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors" />
            </div>
          </>
        )}
        <div className="flex items-center">
          <label className="text-[13px] text-white/60 w-[160px] flex-shrink-0">Database Name</label>
          <input type="text" value={form.database} onChange={set("database")}
            placeholder="source_db"
            className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-[#1a1a1a] border border-white/10 text-white text-[13px] placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors" />
        </div>
        <div className="flex items-center">
          <label className="text-[13px] text-white/60 w-[160px] flex-shrink-0">Username</label>
          <input type="text" value={form.username} onChange={set("username")}
            placeholder="admin"
            className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-[#1a1a1a] border border-white/10 text-white text-[13px] placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors" />
        </div>
        <div className="flex items-center">
          <label className="text-[13px] text-white/60 w-[160px] flex-shrink-0">Password</label>
          <div className="relative flex-1">
            <input type={showPassword ? "text" : "password"} value={form.password} onChange={set("password")}
              placeholder="••••••••"
              className="w-full px-3 py-2 pr-10 rounded-lg bg-[#1a1a1a] border border-white/10 text-white text-[13px] placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors" />
            <button type="button" onClick={onTogglePassword}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
              {showPassword
                ? <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" /></svg>
                : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
              }
            </button>
          </div>
        </div>
        <div className="flex items-center mt-2">
          <label className="text-[13px] text-white/60 w-[160px] flex-shrink-0">SSL Connection</label>
          <button
            type="button"
            onClick={() => onChange({ ...form, ssl: !form.ssl })}
            className={["relative w-10 h-5 rounded-full transition-colors", form.ssl ? "bg-white" : "bg-white/20"].join(" ")}
          >
            <div className={["absolute top-0.5 w-4 h-4 rounded-full shadow transition-transform",
              form.ssl ? "translate-x-5 bg-black" : "translate-x-0.5 bg-white"].join(" ")} />
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string; icon: string }> = {
    pending: { color: "text-amber-400 bg-amber-500/10 border-amber-500/20", label: "Pending", icon: "⏳" },
    running: { color: "text-blue-400 bg-blue-500/10 border-blue-500/20", label: "Running", icon: "⚡" },
    succeeded: { color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", label: "Succeeded", icon: "✅" },
    failed: { color: "text-red-400 bg-red-500/10 border-red-500/20", label: "Failed", icon: "❌" },
    cancelled: { color: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20", label: "Cancelled", icon: "⛔" },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${s.color}`}>
      {s.icon} {s.label}
    </span>
  );
}

export default function IngestionPage() {
  const router = useRouter();
  const [source, setSource] = useState<DBForm>(defaultSource);
  const [target, setTarget] = useState<DBForm>(defaultTarget);
  const [showSrcPw, setShowSrcPw] = useState(false);
  const [showTgtPw, setShowTgtPw] = useState(false);
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [run, setRun] = useState<IngestionRun | null>(null);
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // CSV upload state
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const startPolling = useCallback((runId: number) => {
    pollRef.current = setInterval(async () => {
      try {
        const updated = await api.get<IngestionRun>(`/api/v1/databricks/ingest/runs/${runId}`);
        setRun(updated);
        if (updated.status === "succeeded" || updated.status === "failed" || updated.status === "cancelled") {
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
      // Create source connection
      const srcPayload = {
        name: `${source.dbType.toUpperCase()} Source — ${source.host}`,
        type: source.dbType,
        environment: "prod",
        config: {
          host: source.host, port: source.port, database: source.database,
          username: source.username, password: source.password, ssl: source.ssl,
        },
      };
      const srcConn = await api.post<{ id: number }>("/api/v1/connectors/", srcPayload);

      // Create target connection
      const tgtPayload = {
        name: `${target.dbType.toUpperCase()} Target`,
        type: target.dbType,
        environment: "prod",
        config: {
          host: target.host, port: target.port, catalog: target.database.split(".")[0] || "main",
          schema: target.database.split(".")[1] || "dataone_ingested",
          username: target.username, password: target.password, ssl: target.ssl,
        },
      };
      const tgtConn = await api.post<{ id: number }>("/api/v1/connectors/", tgtPayload);

      setRunStatus("triggering");

      // Trigger Databricks ingestion
      const ingestionRun = await api.post<IngestionRun>("/api/v1/databricks/ingest/trigger", {
        source_connection_id: srcConn.id,
        target_connection_id: tgtConn.id,
      });

      setRun(ingestionRun);
      setRunStatus("running");
      startPolling(ingestionRun.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to establish connection. Please check your credentials.");
      setRunStatus("failed");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".csv")) setCsvFile(file);
  };

  const isSubmitting = runStatus === "connecting" || runStatus === "triggering" || runStatus === "running";

  return (
    <div className="min-h-full bg-[#0c0c0e] text-white flex flex-col relative overflow-y-auto">
      {/* Background decoration */}
      <div className="absolute bottom-0 left-0 right-0 h-[400px] pointer-events-none bg-[url('/wave-bg.svg')] bg-cover bg-top opacity-30" />
      
      {/* Header Logo */}
      <div className="absolute top-6 left-8 flex items-center gap-3">
        <span className="text-white text-xl font-bold tracking-wide">Veltris</span>
        <div className="w-px h-5 bg-white/20" />
        <span className="text-white text-xl font-bold tracking-wide">DataOne</span>
      </div>

      <div className="w-full max-w-7xl mx-auto px-6 py-16 flex-1 flex flex-col items-center justify-center relative z-10">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-[34px] font-bold text-white mb-2">Welcome to DataOne</h1>
          <p className="text-[#a1a1aa] text-[15px]">Select an ingestion method or configure source and target database credentials to begin.</p>
        </div>

        {/* Existing Connections (Mockup) */}
        <div className="max-w-5xl w-full mx-auto mb-10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[15px] font-semibold text-white/90">Active Pipelines</h3>
            <button className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors">View All →</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#121214] border border-white/[0.06] rounded-xl p-4 flex items-center justify-between shadow-lg">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/50 border border-white/10">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><path d="M22 6l-10 7L2 6" /></svg>
                </div>
                <div>
                  <h4 className="text-[13px] font-semibold text-white/90">MySQL Source → PostgreSQL Target</h4>
                  <p className="text-[11px] text-white/40 mt-0.5">Connection ID: #7829 • Last synced 2m ago</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" /> Active
                </span>
                <button
                  onClick={() => router.push("/dashboard/schema-mapper")}
                  className="px-3 py-1 bg-white/5 hover:bg-white/10 text-white text-[11px] font-semibold rounded-lg transition-colors border border-white/10"
                >
                  View Mapping
                </button>
              </div>
            </div>
          </div>
        </div>

      {/* Error */}
      {error && (
        <div className="max-w-5xl mx-auto w-full mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* Run progress tracker */}
      {run && (
        <div className="max-w-5xl mx-auto w-full mb-6 p-5 rounded-2xl bg-[#111] border border-white/10">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-white/90">Databricks Ingestion Pipeline</h3>
              <p className="text-xs text-white/40 mt-0.5">Source type: {run.source_type} → Delta Lake</p>
            </div>
            <StatusBadge status={run.status} />
          </div>
          <div className="flex items-center gap-3 text-xs text-white/40">
            <span>Run ID: {run.databricks_run_id ?? "Assigning…"}</span>
            {run.databricks_run_url && (
              <a href={run.databricks_run_url} target="_blank" rel="noopener noreferrer"
                className="text-indigo-400 hover:text-indigo-300 underline">View in Databricks →</a>
            )}
          </div>
          {run.error_message && (
            <p className="mt-2 text-xs text-red-400">{run.error_message}</p>
          )}
          {/* Progress bar */}
          {run.status === "running" && (
            <div className="mt-3 h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full animate-pulse" style={{ width: "60%" }} />
            </div>
          )}
          {run.status === "succeeded" && (
            <button
              onClick={() => router.push("/dashboard")}
              className="mt-4 w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition-colors">
              → Go to Dashboard
            </button>
          )}
        </div>
      )}

      {/* Main layout */}
      <div className="w-full flex flex-col lg:flex-row gap-0 items-stretch">
          {/* Option 1: CSV Upload */}
          <div className="lg:w-[400px] bg-[#121214] border border-white/[0.06] rounded-[20px] p-8 flex flex-col shadow-2xl">
            <div className="mb-6">
              <p className="text-[13px] text-[#a1a1aa] mb-1">Option 1</p>
              <h2 className="text-[22px] font-bold text-white leading-tight">Quick Upload</h2>
              <p className="text-[13px] text-[#a1a1aa] mt-1">Upload a CSV file to quickly explore and map your data.</p>
            </div>
            <div
              className={["flex-1 border-[1.5px] border-dashed rounded-[20px] flex flex-col items-center justify-center p-8 gap-4 transition-colors cursor-pointer",
                isDragging ? "border-white/40 bg-white/5" : "border-white/10 hover:border-white/20"
              ].join(" ")}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setCsvFile(f); }} />
              {csvFile ? (
                <>
                  <div className="text-4xl">📄</div>
                  <p className="text-[15px] text-white/90 font-medium text-center">{csvFile.name}</p>
                  <p className="text-[13px] text-white/40">{(csvFile.size / 1024 / 1024).toFixed(1)} MB</p>
                  <button onClick={(e) => { e.stopPropagation(); setCsvFile(null); }}
                    className="text-[13px] text-red-400 hover:text-red-300 transition-colors mt-2">Remove</button>
                </>
              ) : (
                <>
                  <svg className="w-10 h-10 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                  <p className="text-[15px] font-semibold text-white mt-1">Drag & Drop CSV file here</p>
                  <p className="text-[13px] text-white/40">or</p>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                    className="px-6 py-2.5 rounded-lg bg-white text-black text-[14px] font-semibold hover:bg-white/90 transition-colors mt-1"
                  >Browse Files</button>
                </>
              )}
            </div>
            <p className="text-[12px] text-[#a1a1aa] text-center mt-5">Supports .csv files up to 500 MB</p>
          </div>

          {/* OR divider */}
          <div className="flex lg:flex-col items-center justify-center flex-shrink-0 w-24">
            <div className="flex-1 w-px bg-white/[0.04]" />
            <div className="w-10 h-10 rounded-full border border-white/[0.06] bg-[#0c0c0e] flex items-center justify-center text-[12px] font-semibold text-white/40 my-4 z-10 shadow-lg">OR</div>
            <div className="flex-1 w-px bg-white/[0.04]" />
          </div>

          {/* Option 2: DB Credentials */}
          <div className="flex-1 bg-[#121214] border border-white/[0.06] rounded-[20px] p-8 shadow-2xl">
            <div className="mb-6">
              <p className="text-[13px] text-[#a1a1aa] mb-1">Option 2</p>
              <h2 className="text-[22px] font-bold text-white leading-tight">Database Connection Credentials</h2>
              <p className="text-[13px] text-[#a1a1aa] mt-1">Configure your source and target database connections.</p>
            </div>
            <div className="flex flex-col md:flex-row gap-8">
              <DBFormPanel
                title="Source Database" subtitle="Enter the source database details."
                form={source} onChange={setSource}
                types={SOURCE_TYPES}
                showPassword={showSrcPw} onTogglePassword={() => setShowSrcPw(v => !v)}
              />
              <DBFormPanel
                title="Target Database" subtitle="Enter the target database details."
                form={target} onChange={setTarget}
                types={TARGET_TYPES}
                showPassword={showTgtPw} onTogglePassword={() => setShowTgtPw(v => !v)}
              />
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <div className="mt-10 flex justify-center w-full">
          <button
            id="establish-connection-btn"
            onClick={handleEstablishConnection}
            disabled={isSubmitting}
            className="flex items-center gap-3 px-8 py-4 rounded-lg bg-white text-black text-[15px] font-bold hover:bg-white/90 disabled:opacity-50 transition-all shadow-xl shadow-black/40"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                {runStatus === "connecting" ? "Connecting…" : runStatus === "triggering" ? "Triggering pipeline…" : "Pipeline running…"}
              </>
            ) : (
              <>Establish Connection & Open Dashboard <span className="text-lg leading-none">→</span></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
