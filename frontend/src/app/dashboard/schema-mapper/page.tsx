"use client";

import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";

const Icon = ({ name, className }: { name: string; className?: string }) => {
  const p = (d: string) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}><path d={d} strokeLinecap="round" strokeLinejoin="round" /></svg>;
  switch (name) {
    case "Sparkles": return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "Database": return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5V19A9 3 0 0 0 21 19V5" strokeLinecap="round" /><path d="M3 12A9 3 0 0 0 21 12" strokeLinecap="round" /></svg>;
    case "Table": return p("M3 3h18v18H3V3zm0 6h18M3 15h18M9 3v18");
    case "ArrowRight": return p("M5 12h14m-7-7 7 7-7 7");
    case "ChevronRight": return p("m9 18 6-6-6-6");
    case "AlertCircle": return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>;
    case "AlertTriangle": return p("M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01");
    case "RefreshCw": return p("M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M3 16l2.26 2.26A9.75 9.75 0 0 0 12 21a9 9 0 0 0 9-9");
    case "Zap": return p("M13 2 3 14h9l-1 8 10-12h-9l1-8z");
    case "CheckCircle": return p("M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3");
    default: return null;
  }
};

interface SchemaColumn { id: number; column_name: string; data_type: string; nullable: boolean; is_primary_key: boolean; }
interface CatalogTable { id: number; table_name: string; columns: SchemaColumn[]; }

const ConfidenceBar = ({ value }: { value: number }) => {
  const color = value >= 80 ? "#34d399" : value >= 60 ? "#60a5fa" : "#f59e0b";
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] font-bold tabular-nums" style={{ color }}>{value.toFixed(0)}%</span>
    </div>
  );
};

const TypeBadge = ({ type }: { type?: string }) => {
  if (!type) return null;
  const t = type.toUpperCase();
  const colorMap: Record<string, string> = {
    INT: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    INTEGER: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    BIGINT: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    SMALLINT: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    VARCHAR: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    STRING: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    TEXT: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    CHAR: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    FLOAT: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    DOUBLE: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    DECIMAL: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    NUMERIC: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    BOOLEAN: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    DATE: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    TIMESTAMP: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  };
  const cls = colorMap[t] ?? "bg-white/5 text-white/50 border-white/10";
  return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${cls}`}>{type}</span>;
};

const FancySelect = ({ label, value, onChange, disabled, options, placeholder, accent }: {
  label: string; value: string; onChange: (v: string) => void;
  disabled?: boolean; options: string[]; placeholder: string; accent: string;
}) => (
  <div>
    <label className="text-[10px] font-bold uppercase tracking-widest mb-2 block" style={{ color: accent + "99" }}>{label}</label>
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
        className="w-full bg-black/40 border rounded-xl px-4 py-3 text-sm focus:outline-none transition-all appearance-none text-white pr-8 disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ borderColor: value ? accent + "40" : "rgba(255,255,255,0.08)" }}>
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <Icon name="ChevronRight" className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-white/30 pointer-events-none" />
    </div>
  </div>
);

export default function SchemaMapperWorkbenchPage() {
  const searchParams = useSearchParams();
  const connId = searchParams.get("connection_id");
  const [sparkConnId, setSparkConnId] = useState<number | null>(null);
  const [tables, setTables] = useState<CatalogTable[]>([]);
  const [sourceCatalog, setSourceCatalog] = useState("");
  const [sourceSchema, setSourceSchema] = useState("");
  const [sourceTable, setSourceTable] = useState("");
  const [targetCatalog, setTargetCatalog] = useState("");
  const [targetSchema, setTargetSchema] = useState("");
  const [mode, setMode] = useState<"selection" | "mapping">("selection");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loadingMapping, setLoadingMapping] = useState(false);

  useEffect(() => {
    if (connId) { setSparkConnId(parseInt(connId)); return; }
    api.get<Array<{ id: number; name: string; type: string }>>("/api/v1/connectors/").then(res => {
      const list = Array.isArray(res) ? res : (res as any).connectors ?? [];
      const db = list.find((c: any) => c.type?.toLowerCase() === "databricks");
      if (db) setSparkConnId(db.id);
    });
  }, [connId]);

  useEffect(() => {
    if (!sparkConnId) return;
    api.get<{ schema: Record<string, any[]> }>(`/api/v1/connectors/${sparkConnId}/schema`).then(res => {
      const schema = res.schema ?? {};
      let uid = 1;
      setTables(Object.entries(schema).map(([tableName, cols]) => ({
        id: uid++,
        table_name: tableName,
        columns: (cols || []).map(c => ({ id: uid++, column_name: c.name, data_type: c.type ?? "", nullable: c.nullable ?? true, is_primary_key: c.primary_key ?? false })),
      })));
    });
  }, [sparkConnId]);

  const catalogStructure = useMemo(() => {
    const struct: Record<string, Record<string, string[]>> = {};
    tables.forEach(t => {
      const parts = t.table_name.split(".");
      let cat = "default", sch = "default", tbl = t.table_name;
      if (parts.length >= 3) { cat = parts[0]; sch = parts[1]; tbl = parts.slice(2).join("."); }
      else if (parts.length === 2) { sch = parts[0]; tbl = parts[1]; }
      if (!struct[cat]) struct[cat] = {};
      if (!struct[cat][sch]) struct[cat][sch] = [];
      struct[cat][sch].push(tbl);
    });
    return struct;
  }, [tables]);

  const catalogs = Object.keys(catalogStructure).sort();
  const sourceSchemas = sourceCatalog ? Object.keys(catalogStructure[sourceCatalog] || {}).sort() : [];
  const sourceTables = sourceSchema ? (catalogStructure[sourceCatalog]?.[sourceSchema] || []).sort() : [];
  const targetSchemas = targetCatalog ? Object.keys(catalogStructure[targetCatalog] || {}).sort() : [];
  const targetSchemaTables = useMemo(() => {
    if (!targetCatalog || !targetSchema) return [];
    return tables.filter(t => t.table_name.startsWith(`${targetCatalog}.${targetSchema}.`));
  }, [tables, targetCatalog, targetSchema]);

  const sourceTableObj = tables.find(t => t.table_name === `${sourceCatalog}.${sourceSchema}.${sourceTable}`);
  const canStart = !!sourceTable && !!targetSchema && !!sparkConnId;

  const handleStartMapping = async () => {
    if (!canStart) return;
    setMode("mapping"); setLoadingMapping(true); setSuggestions([]);
    try {
      const fullSrc = `${sourceCatalog}.${sourceSchema}.${sourceTable}`;
      const fullTgt = `${targetCatalog}.${targetSchema}`;
      const mapping = await api.post<any>("/api/v1/mappings/", {
        name: `Map ${fullSrc} \u2192 ${fullTgt}`, source_id: sparkConnId, target_id: sparkConnId,
      });
      await api.post(`/api/v1/mappings/${mapping.id}/suggestions`, {});
      const poll = setInterval(async () => {
        const res = await api.get<any>(`/api/v1/mappings/${mapping.id}/suggestions?limit=200`);
        if (res.items && res.items.length > 0) {
          clearInterval(poll);
          const err = res.items.find((i: any) => i.status === "error" || i.target_table === "ERROR");
          if (err) { setSuggestions([err]); setLoadingMapping(false); return; }
          setSuggestions(res.items.filter((i: any) => i.source_table === fullSrc).sort((a: any, b: any) => b.confidence - a.confidence));
          setLoadingMapping(false);
        }
      }, 4000);
      setTimeout(() => { clearInterval(poll); setLoadingMapping(false); }, 180000);
    } catch (e) { console.error(e); setLoadingMapping(false); }
  };

  return (
    <div className="flex flex-col h-full text-white overflow-hidden font-sans" style={{ background: "linear-gradient(135deg,#0a0a0f 0%,#080b12 100%)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-white/[0.06] flex-shrink-0" style={{ background: "rgba(255,255,255,0.02)" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#3b82f6,#8b5cf6)", boxShadow: "0 0 20px rgba(99,102,241,0.4)" }}>
            <Icon name="Zap" className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">ReMatch Schema Engine</h1>
            <p className="text-[11px] text-white/35">AI-powered vector field mapping</p>
          </div>
        </div>
        {mode === "mapping" && (
          <button onClick={() => { setMode("selection"); setSuggestions([]); }}
            className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20">
            <Icon name="RefreshCw" className="w-3 h-3" /> New Mapping
          </button>
        )}
      </div>

      <div className="flex-1 overflow-hidden p-4">
        {/* SELECTION MODE */}
        {mode === "selection" && (
          <div className="h-full flex flex-col gap-4">
            <div className="text-center pt-1 pb-0.5">
              <h2 className="text-2xl font-bold tracking-tight" style={{ background: "linear-gradient(90deg,#fff,#888)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                Configure AI Field Mapping
              </h2>
              <p className="text-sm text-white/35 mt-1">Select a source table and target schema — AI finds the best column matches.</p>
            </div>

            <div className="flex-1 flex gap-4 min-h-0">
              {/* SOURCE CARD */}
              <div className="flex-1 rounded-2xl border flex flex-col overflow-hidden" style={{ borderColor: "rgba(59,130,246,0.25)", background: "linear-gradient(160deg,rgba(59,130,246,0.08) 0%,rgba(0,0,0,0.5) 100%)" }}>
                <div className="px-5 py-4 border-b flex items-center gap-2.5 flex-shrink-0" style={{ borderColor: "rgba(59,130,246,0.15)", background: "rgba(59,130,246,0.05)" }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(59,130,246,0.2)" }}>
                    <Icon name="Database" className="w-3.5 h-3.5 text-blue-400" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Source</span>
                    <p className="text-[10px] text-white/35 leading-none mt-0.5">Select the table to map from</p>
                  </div>
                </div>
                <div className="p-5 space-y-3.5 flex-shrink-0">
                  <FancySelect label="1 · Catalog" value={sourceCatalog} onChange={v => { setSourceCatalog(v); setSourceSchema(""); setSourceTable(""); }} options={catalogs} placeholder="Select catalog..." accent="#3b82f6" />
                  <FancySelect label="2 · Schema" value={sourceSchema} onChange={v => { setSourceSchema(v); setSourceTable(""); }} disabled={!sourceCatalog} options={sourceSchemas} placeholder="Select schema..." accent="#3b82f6" />
                  <FancySelect label="3 · Table" value={sourceTable} onChange={setSourceTable} disabled={!sourceSchema} options={sourceTables} placeholder="Select table..." accent="#3b82f6" />
                </div>
                {sourceTableObj ? (
                  <div className="flex-1 min-h-0 flex flex-col mx-4 mb-4 rounded-xl overflow-hidden border" style={{ borderColor: "rgba(59,130,246,0.15)", background: "rgba(0,0,0,0.3)" }}>
                    <div className="px-3 py-2 text-[10px] font-bold text-blue-400/60 uppercase tracking-widest border-b flex-shrink-0" style={{ borderColor: "rgba(59,130,246,0.1)" }}>
                      {sourceTableObj.columns.length} Columns
                    </div>
                    <div className="overflow-auto flex-1 p-2 space-y-0.5">
                      {sourceTableObj.columns.map(col => (
                        <div key={col.id} className="flex items-center justify-between px-3 py-1.5 rounded-lg hover:bg-blue-500/5 transition-colors">
                          <div className="flex items-center gap-2 min-w-0">
                            {col.is_primary_key && <span className="text-[8px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1 rounded flex-shrink-0">PK</span>}
                            <span className="text-xs text-white/80 font-mono truncate">{col.column_name}</span>
                          </div>
                          <TypeBadge type={col.data_type} />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-blue-400/20 flex-col gap-2 px-6 pb-6">
                    <Icon name="Table" className="w-8 h-8" />
                    <p className="text-xs text-center">Select a table to preview columns</p>
                  </div>
                )}
              </div>

              {/* CENTER BUTTON */}
              <div className="flex flex-col items-center justify-center gap-3 w-28 flex-shrink-0">
                <div className="w-px h-16 bg-gradient-to-b from-transparent to-white/10" />
                <button onClick={handleStartMapping} disabled={!canStart}
                  className="w-full flex flex-col items-center gap-2 py-5 px-3 rounded-2xl font-bold text-sm transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed relative overflow-hidden"
                  style={canStart ? { background: "linear-gradient(135deg,#3b82f6,#8b5cf6)", boxShadow: "0 0 30px rgba(99,102,241,0.5)" } : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <Icon name="Sparkles" className="w-5 h-5" />
                  <span className="text-[11px] tracking-wide leading-tight">Auto<br />Map</span>
                </button>
                <div className="w-px h-16 bg-gradient-to-b from-white/10 to-transparent" />
              </div>

              {/* TARGET CARD */}
              <div className="flex-1 rounded-2xl border flex flex-col overflow-hidden" style={{ borderColor: "rgba(52,211,153,0.25)", background: "linear-gradient(160deg,rgba(52,211,153,0.08) 0%,rgba(0,0,0,0.5) 100%)" }}>
                <div className="px-5 py-4 border-b flex items-center gap-2.5 flex-shrink-0" style={{ borderColor: "rgba(52,211,153,0.15)", background: "rgba(52,211,153,0.05)" }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(52,211,153,0.2)" }}>
                    <Icon name="Table" className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Target</span>
                    <p className="text-[10px] text-white/35 leading-none mt-0.5">Select the destination schema</p>
                  </div>
                </div>
                <div className="p-5 space-y-3.5 flex-shrink-0">
                  <FancySelect label="1 · Catalog" value={targetCatalog} onChange={v => { setTargetCatalog(v); setTargetSchema(""); }} options={catalogs} placeholder="Select catalog..." accent="#34d399" />
                  <FancySelect label="2 · Schema" value={targetSchema} onChange={setTargetSchema} disabled={!targetCatalog} options={targetSchemas} placeholder="Select schema..." accent="#34d399" />
                </div>
                {targetSchemaTables.length > 0 ? (
                  <div className="flex-1 min-h-0 flex flex-col mx-4 mb-4 rounded-xl overflow-hidden border" style={{ borderColor: "rgba(52,211,153,0.15)", background: "rgba(0,0,0,0.3)" }}>
                    <div className="px-3 py-2 text-[10px] font-bold text-emerald-400/60 uppercase tracking-widest border-b flex-shrink-0" style={{ borderColor: "rgba(52,211,153,0.1)" }}>
                      {targetSchemaTables.length} tables · {targetSchemaTables.reduce((s, t) => s + t.columns.length, 0)} columns
                    </div>
                    <div className="overflow-auto flex-1 p-2 space-y-2">
                      {targetSchemaTables.map(tbl => {
                        const name = tbl.table_name.split(".").pop() ?? tbl.table_name;
                        return (
                          <div key={tbl.id} className="rounded-lg border overflow-hidden" style={{ borderColor: "rgba(52,211,153,0.1)" }}>
                            <div className="px-3 py-1.5 text-[10px] font-bold text-emerald-400/80 uppercase tracking-wider flex items-center gap-1.5" style={{ background: "rgba(52,211,153,0.06)" }}>
                              <Icon name="Table" className="w-3 h-3" />{name}
                            </div>
                            {tbl.columns.map(col => (
                              <div key={col.id} className="flex items-center justify-between px-3 py-1.5 hover:bg-emerald-500/5 transition-colors border-t" style={{ borderColor: "rgba(52,211,153,0.06)" }}>
                                <div className="flex items-center gap-2 min-w-0">
                                  {col.is_primary_key && <span className="text-[8px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1 rounded flex-shrink-0">PK</span>}
                                  <span className="text-[11px] text-white/70 font-mono truncate">{col.column_name}</span>
                                </div>
                                <TypeBadge type={col.data_type} />
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-emerald-400/20 flex-col gap-2 px-6 pb-6">
                    <Icon name="Table" className="w-8 h-8" />
                    <p className="text-xs text-center">Select catalog & schema to preview target tables</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* MAPPING MODE */}
        {mode === "mapping" && (
          <div className="h-full flex gap-4">
            {/* Source Panel */}
            <div className="w-60 flex-shrink-0 rounded-2xl border flex flex-col overflow-hidden" style={{ borderColor: "rgba(59,130,246,0.2)", background: "linear-gradient(160deg,rgba(59,130,246,0.07) 0%,rgba(0,0,0,0.5) 100%)" }}>
              <div className="px-4 py-3 border-b flex-shrink-0" style={{ borderColor: "rgba(59,130,246,0.12)", background: "rgba(59,130,246,0.05)" }}>
                <span className="text-[9px] font-bold text-blue-400 uppercase tracking-widest block">Source Table</span>
                <h3 className="text-xs font-semibold text-white/90 mt-0.5 truncate">{sourceTable}</h3>
                <p className="text-[9px] text-blue-400/40 truncate">{sourceCatalog}.{sourceSchema}</p>
              </div>
              <div className="flex-1 overflow-auto p-2 space-y-0.5">
                {sourceTableObj?.columns.map(col => (
                  <div key={col.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-blue-500/5 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      {col.is_primary_key && <span className="text-[8px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1 rounded flex-shrink-0">PK</span>}
                      <span className="text-[11px] text-white/80 font-mono truncate">{col.column_name}</span>
                    </div>
                    <TypeBadge type={col.data_type} />
                  </div>
                ))}
              </div>
            </div>

            {/* Center */}
            <div className="flex-1 rounded-2xl border flex flex-col overflow-hidden" style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
              <div className="h-0.5 flex-shrink-0" style={{ background: "linear-gradient(90deg,#3b82f6,#8b5cf6,#34d399)" }} />
              <div className="px-5 py-3 border-b flex items-center justify-between flex-shrink-0" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                <div className="flex items-center gap-2">
                  <Icon name="Sparkles" className="w-4 h-4 text-purple-400" />
                  <h2 className="text-sm font-bold">AI Mapping Results</h2>
                  {!loadingMapping && suggestions.length > 0 && suggestions[0].status !== "error" && suggestions[0].target_table !== "ERROR" && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: "rgba(52,211,153,0.15)", color: "#34d399" }}>
                      {suggestions.length} match{suggestions.length !== 1 ? "es" : ""}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-mono">
                  <span className="text-blue-400/50 truncate max-w-[120px]">{sourceCatalog}.{sourceSchema}.{sourceTable}</span>
                  <Icon name="ArrowRight" className="w-3 h-3 text-white/20 flex-shrink-0" />
                  <span className="text-emerald-400/50 truncate max-w-[120px]">{targetCatalog}.{targetSchema}</span>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-6">
                {loadingMapping ? (
                  <div className="h-full flex flex-col items-center justify-center gap-5">
                    <div className="relative w-20 h-20">
                      <div className="absolute inset-0 rounded-full border-2 border-white/5 border-t-blue-500 animate-spin" style={{ animationDuration: "1.2s" }} />
                      <div className="absolute inset-2 rounded-full border-2 border-white/5 border-t-purple-500 animate-spin" style={{ animationDuration: "1.8s", animationDirection: "reverse" }} />
                      <div className="absolute inset-4 rounded-full border-2 border-white/5 border-t-emerald-500 animate-spin" style={{ animationDuration: "2.4s" }} />
                      <Icon name="Sparkles" className="w-5 h-5 text-white/50 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                    </div>
                    <div className="text-center">
                      <h3 className="font-semibold text-white">Analyzing schemas…</h3>
                      <p className="text-sm text-white/35 mt-1.5 max-w-xs">Generating vector embeddings and computing semantic similarity. This takes ~60–90 seconds.</p>
                    </div>
                    <div className="w-48 h-1 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full animate-pulse" style={{ background: "linear-gradient(90deg,#3b82f6,#8b5cf6,#34d399)", width: "70%" }} />
                    </div>
                  </div>
                ) : suggestions.length > 0 && (suggestions[0].status === "error" || suggestions[0].target_table === "ERROR") ? (
                  <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-8">
                    <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
                      <Icon name="AlertTriangle" className="w-7 h-7 text-red-400" />
                    </div>
                    <h3 className="text-lg font-bold text-red-400">Databricks AI Error</h3>
                    <pre className="text-xs text-red-400/60 max-w-lg p-4 rounded-xl text-left break-words whitespace-pre-wrap w-full" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.1)" }}>
                      {suggestions[0].reason}
                    </pre>
                    <button onClick={() => setMode("selection")} className="px-5 py-2 rounded-xl text-sm font-medium" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                      Try Again
                    </button>
                  </div>
                ) : suggestions.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center gap-3 text-white/25">
                    <Icon name="AlertCircle" className="w-10 h-10" />
                    <p className="text-sm">No high-confidence mappings found.</p>
                    <p className="text-xs text-white/15">Try a different source table or target schema.</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-w-2xl mx-auto">
                    <p className="text-[10px] text-white/20 uppercase tracking-widest mb-4 text-center">Sorted by confidence · hover for AI reasoning</p>
                    {suggestions.map((s, idx) => (
                      <div key={idx} className="rounded-2xl border p-4 hover:scale-[1.005] transition-all duration-200 relative group cursor-default"
                        style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}>
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0 p-3 rounded-xl" style={{ background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.15)" }}>
                            <span className="text-[8px] font-bold text-blue-400 uppercase tracking-widest block mb-1">Source</span>
                            <div className="font-semibold text-sm text-white truncate">{s.source_column}</div>
                            <TypeBadge type={s.source_type} />
                          </div>
                          <div className="flex flex-col items-center justify-center gap-1.5 pt-3 px-0.5 flex-shrink-0">
                            <Icon name="ArrowRight" className="w-4 h-4 text-white/15" />
                            <div className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={
                              s.confidence >= 80 ? { background: "rgba(52,211,153,0.15)", color: "#34d399" } :
                              s.confidence >= 60 ? { background: "rgba(96,165,250,0.15)", color: "#60a5fa" } :
                              { background: "rgba(245,158,11,0.15)", color: "#f59e0b" }
                            }>{s.confidence.toFixed(0)}%</div>
                          </div>
                          <div className="flex-1 min-w-0 p-3 rounded-xl" style={{ background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.15)" }}>
                            <span className="text-[8px] font-bold text-emerald-400 uppercase tracking-widest block mb-1 truncate">
                              {s.target_table?.split(".").pop()}
                            </span>
                            <div className="font-semibold text-sm text-white truncate">{s.target_column}</div>
                            <TypeBadge type={s.target_type} />
                          </div>
                        </div>
                        <div className="mt-3 px-1"><ConfidenceBar value={s.confidence} /></div>
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-80 p-4 rounded-2xl shadow-2xl pointer-events-none opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all z-30"
                          style={{ background: "#1a1b2e", border: "1px solid rgba(139,92,246,0.25)" }}>
                          <div className="flex items-center gap-2 mb-2">
                            <Icon name="Sparkles" className="w-3 h-3 text-purple-400" />
                            <span className="text-[9px] font-bold uppercase tracking-wider text-purple-300">AI Reasoning</span>
                          </div>
                          <p className="text-xs text-white/65 leading-relaxed">{s.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Target Panel */}
            <div className="w-60 flex-shrink-0 rounded-2xl border flex flex-col overflow-hidden" style={{ borderColor: "rgba(52,211,153,0.2)", background: "linear-gradient(160deg,rgba(52,211,153,0.07) 0%,rgba(0,0,0,0.5) 100%)" }}>
              <div className="px-4 py-3 border-b flex-shrink-0" style={{ borderColor: "rgba(52,211,153,0.12)", background: "rgba(52,211,153,0.05)" }}>
                <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest block">Target Schema</span>
                <h3 className="text-xs font-semibold text-white/90 mt-0.5 truncate">{targetSchema}</h3>
                <p className="text-[9px] text-emerald-400/40 truncate">{targetCatalog}</p>
              </div>
              <div className="flex-1 overflow-auto p-2 space-y-2">
                {targetSchemaTables.map(tbl => {
                  const name = tbl.table_name.split(".").pop() ?? tbl.table_name;
                  const isMapped = suggestions.some(s => s.target_table === tbl.table_name);
                  return (
                    <div key={tbl.id} className="rounded-xl border overflow-hidden" style={{ borderColor: isMapped ? "rgba(52,211,153,0.25)" : "rgba(52,211,153,0.08)", background: isMapped ? "rgba(52,211,153,0.04)" : "transparent" }}>
                      <div className="px-3 py-1.5 flex items-center gap-1.5 border-b" style={{ borderColor: "rgba(52,211,153,0.08)", background: "rgba(52,211,153,0.05)" }}>
                        {isMapped && <Icon name="CheckCircle" className="w-3 h-3 text-emerald-400 flex-shrink-0" />}
                        <span className="text-[10px] font-bold text-emerald-400/70 uppercase tracking-wide truncate">{name}</span>
                      </div>
                      {tbl.columns.map(col => {
                        const hit = suggestions.some(s => s.target_table === tbl.table_name && s.target_column === col.column_name);
                        return (
                          <div key={col.id} className="flex items-center justify-between px-3 py-1.5 border-t transition-colors" style={{ borderColor: "rgba(52,211,153,0.05)", background: hit ? "rgba(52,211,153,0.06)" : "transparent" }}>
                            <div className="flex items-center gap-1.5 min-w-0">
                              {hit && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />}
                              {col.is_primary_key && <span className="text-[7px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1 rounded flex-shrink-0">PK</span>}
                              <span className="text-[10px] text-white/60 font-mono truncate">{col.column_name}</span>
                            </div>
                            <TypeBadge type={col.data_type} />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
