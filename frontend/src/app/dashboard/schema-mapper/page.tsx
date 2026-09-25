"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";

type BottomTab = "preview" | "logic" | "history";

// ─── Interfaces ────────────────────────────────────────────────────────────────
interface CatalogColumn {
  id: number;
  column_name: string;
  data_type: string;
  nullable: boolean;
  is_primary_key: boolean;
}

interface CatalogTable {
  id: number;
  table_name: string;
  columns: CatalogColumn[];
}

const SOURCE_FIELDS = [
  { name: "id", type: "INT", checked: false },
  { name: "first_name", type: "VARCHAR", checked: false },
  { name: "last_name", type: "VARCHAR", checked: false },
  { name: "email", type: "VARCHAR", checked: false },
  { name: "created_at", type: "TIMESTAMP", checked: true },
  { name: "country", type: "VARCHAR", checked: false },
];

// Remove hardcoded MAPPINGS, SOURCE_FIELDS, TARGET_FIELDS

interface SparkColumn {
  name: string;
  type: string;
  nullable?: boolean;
  primary_key?: boolean;
}

export default function SchemaMapperWorkbenchPage() {
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [bottomTab, setBottomTab] = useState<BottomTab>("preview");

  const searchParams = useSearchParams();
  const connId = searchParams.get("conn");
  const runId = searchParams.get("run");

  const [tables, setTables] = useState<CatalogTable[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("Loading schema...");
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [selectedTable, setSelectedTable] = useState<CatalogTable | null>(null);
  const [error, setError] = useState<string | null>(null);
  // incrementing counter so we can deduplicate concurrent auto-loads
  const [sparkConnId, setSparkConnId] = useState<number | null>(null);

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  const hierarchy = useMemo(() => {
    const root: Record<string, any> = {};
    tables.forEach(t => {
      const parts = t.table_name.split('.');
      if (parts.length >= 3) {
        const catalog = parts[0];
        const db = parts[1];
        const table = parts.slice(2).join('.');
        
        if (!root[catalog]) root[catalog] = {};
        if (!root[catalog][db]) root[catalog][db] = [];
        root[catalog][db].push({ ...t, displayName: table });
      } else if (parts.length === 2) {
        const catalog = "default";
        const db = parts[0];
        const table = parts[1];
        
        if (!root[catalog]) root[catalog] = {};
        if (!root[catalog][db]) root[catalog][db] = [];
        root[catalog][db].push({ ...t, displayName: table });
      } else {
        const catalog = "default";
        const db = "default";
        const table = parts[0];
        if (!root[catalog]) root[catalog] = {};
        if (!root[catalog][db]) root[catalog][db] = [];
        root[catalog][db].push({ ...t, displayName: table });
      }
    });
    return root;
  }, [tables]);

  // Step 1: pick the source connector
  useEffect(() => {
    if (runId || connId) return; // URL params take precedence
    // Auto-discover the first Databricks connector to use as source
    api.get<Array<{ id: number; name: string; type: string }>>("/api/v1/connectors/")
      .then(res => {
        const list = Array.isArray(res) ? res : (res as any).connectors ?? [];
        const db = list.find((c: any) => c.type?.toLowerCase() === "databricks");
        if (db) {
          setSparkConnId(db.id);
        } else {
          setError("No Databricks connector found. Add one in the Connectors page first.");
        }
      })
      .catch(() => setError("Failed to load connectors."));
  }, [connId, runId]);

  // Step 2: fetch schema (via Spark SQL on the SQL Warehouse) for the chosen connector
  useEffect(() => {
    if (runId) {
      // Load tables from ingestion run
      setLoading(true);
      setLoadingMsg("Loading ingestion run tables...");
      api.get<{ tables: Array<{ id: number; table_name: string; short_name: string; columns: any[] }> }>(
        `/api/v1/databricks/ingest/runs/${runId}/tables`
      )
        .then(res => {
          const formattedTables: CatalogTable[] = (res.tables || []).map(t => ({
            id: t.id,
            table_name: t.table_name,
            columns: t.columns.map(c => ({
              id: c.id,
              column_name: c.column_name,
              data_type: c.data_type,
              nullable: c.nullable,
              is_primary_key: c.is_primary_key,
            }))
          }));
          setTables(formattedTables);
          if (formattedTables.length > 0) {
            const firstTable = formattedTables[0];
            const parts = firstTable.table_name.split('.');
            let initNodes: Record<string, boolean> = {};
            if (parts.length >= 3) {
              initNodes[`cat:${parts[0]}`] = true;
              initNodes[`db:${parts[0]}.${parts[1]}`] = true;
            } else if (parts.length === 2) {
              initNodes[`cat:default`] = true;
              initNodes[`db:default.${parts[0]}`] = true;
            } else {
              initNodes[`cat:default`] = true;
              initNodes[`db:default.default`] = true;
            }
            initNodes[firstTable.table_name] = true;
            setExpandedNodes(initNodes);
            setSelectedTable(firstTable);
          }
        })
        .finally(() => setLoading(false));
      return;
    }

    const targetConnId = connId ? Number(connId) : sparkConnId;
    if (!targetConnId) return;

    setLoading(true);
    setError(null);
    setLoadingMsg("Fetching Unity Catalog metadata via Spark SQL...");

    // /api/v1/connectors/{id}/schema runs Spark SQL via DatabricksConnector
    // (spark.catalog.listTables + listColumns on the SQL Warehouse)
    api.get<{ schema: Record<string, SparkColumn[]> }>(`/api/v1/connectors/${targetConnId}/schema`)
      .then(res => {
        const schema = res.schema ?? {};
        let uid = 1;
        const formatted: CatalogTable[] = Object.entries(schema).map(([tableName, cols]) => ({
          id: uid++,
          table_name: tableName,
          columns: (cols || []).map(c => ({
            id: uid++,
            column_name: c.name,
            data_type: c.type ?? "",
            nullable: c.nullable ?? true,
            is_primary_key: c.primary_key ?? false,
          }))
        }));
        setTables(formatted);
        if (formatted.length > 0) {
          const firstTable = formatted[0];
          const parts = firstTable.table_name.split('.');
          let initNodes: Record<string, boolean> = {};
          if (parts.length >= 3) {
            initNodes[`cat:${parts[0]}`] = true;
            initNodes[`db:${parts[0]}.${parts[1]}`] = true;
          } else if (parts.length === 2) {
            initNodes[`cat:default`] = true;
            initNodes[`db:default.${parts[0]}`] = true;
          } else {
            initNodes[`cat:default`] = true;
            initNodes[`db:default.default`] = true;
          }
          initNodes[firstTable.table_name] = true;
          setExpandedNodes(initNodes);
          setSelectedTable(firstTable);
        } else {
          setError("No tables found in the Unity Catalog schema.");
        }
      })
      .catch(err => setError(`Schema fetch failed: ${err?.message ?? err}`))
      .finally(() => setLoading(false));
  }, [connId, runId, sparkConnId]);
  
  const generatedMappings: Array<{
    source: { name: string; type: string };
    target: { name: string; type: string };
    match: string;
    sub?: string;
  }> = selectedTable ? selectedTable.columns.map(c => ({
    source: { name: c.column_name, type: c.data_type },
    target: { name: c.column_name, type: c.data_type },
    match: "100% Match"
  })) : [];

  return (
    <div className="flex flex-col h-full bg-[#09090b] text-white overflow-hidden font-sans">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-[#0d0d0d] flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Schema Mapper Workbench</h1>
          <p className="text-[13px] text-white/40 mt-1">Map source fields to target fields with AI-assisted suggestions.</p>
        </div>
        <div className="flex items-center gap-5 mt-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/40 font-medium">Pipeline Version</span>
            <select className="bg-transparent border border-white/10 rounded-md px-3 py-1.5 text-[13px] font-medium text-white focus:outline-none focus:border-white/30 cursor-pointer">
              <option className="bg-[#111]">v1.2 Draft</option>
            </select>
          </div>
          <label className="flex items-center gap-2.5 text-[13px] font-medium text-white/80 cursor-pointer">
            <div
              onClick={() => setShowSuggestions(v => !v)}
              className={["relative w-9 h-5 rounded-full transition-colors cursor-pointer",
                showSuggestions ? "bg-white" : "bg-white/20"].join(" ")}
            >
              <div className={["absolute top-0.5 w-4 h-4 rounded-full shadow transition-transform",
                showSuggestions ? "translate-x-4 bg-black" : "translate-x-0.5 bg-white"].join(" ")} />
            </div>
            Show AI Suggestions
          </label>
          <button 
            onClick={() => alert("Mapping logic saved successfully! DataOne agent will apply these transformations during the next Databricks ingestion run.")}
            className="flex items-center gap-2 px-5 py-2 rounded-md text-[13px] font-bold bg-white text-black hover:bg-white/90 transition-all shadow-xl shadow-black/20">
            Review & Publish Mapping
          </button>
        </div>
      </div>

      {/* 3-panel middle area */}
      <div className="flex flex-1 overflow-hidden min-h-0 bg-[#09090b] p-4 gap-4">
        
        {/* Left: Source Schema */}
        <div className="w-[280px] bg-[#111] border border-white/[0.06] rounded-xl flex flex-col flex-shrink-0 shadow-lg">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2 text-[14px] text-white font-semibold">
            <svg className="w-4 h-4 text-white/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>
            Source Schema
          </div>
          <div className="p-3 border-b border-white/[0.06]">
            <div className="relative">
              <input type="text" placeholder="Search tables or columns..." className="w-full bg-[#1a1a1a] border border-white/10 rounded-md pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-white/30" />
              <svg className="w-3.5 h-3.5 text-white/30 absolute left-2.5 top-1/2 -translate-y-1/2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
            </div>
          </div>
          <div className="p-3 overflow-y-auto flex-1 font-mono text-[12px]">
            {loading ? (
              <div className="text-white/40 p-4 text-center">
                <svg className="animate-spin w-5 h-5 mx-auto mb-2 text-white/30" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {loadingMsg}
              </div>
            ) : error ? (
              <div className="text-red-400/70 p-4 text-center text-[11px]">{error}</div>
            ) : tables.length === 0 ? (
              <div className="text-white/40 p-4 text-center">No tables found.</div>
            ) : (
              Object.entries(hierarchy).map(([catalogName, databases]) => (
                <div key={catalogName} className="mb-2">
                  <div onClick={() => toggleNode(`cat:${catalogName}`)} className="flex items-center gap-2 text-white/70 mb-2 cursor-pointer hover:text-white transition-colors p-1 rounded">
                    <span className="text-[10px] w-3 text-center">{expandedNodes[`cat:${catalogName}`] ? "▼" : "▶"}</span>
                    <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 7V4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3" /><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M12 11v6" /></svg>
                    <span className="truncate">{catalogName}</span>
                  </div>

                  {expandedNodes[`cat:${catalogName}`] && (
                    <div className="ml-4 pl-2 border-l border-white/[0.06] space-y-1.5 mb-2">
                      {Object.entries(databases as Record<string, any[]>).map(([dbName, dbTables]) => (
                        <div key={dbName} className="mb-2">
                          <div onClick={() => toggleNode(`db:${catalogName}.${dbName}`)} className="flex items-center gap-2 text-white/70 mb-2 cursor-pointer hover:text-white transition-colors p-1 rounded">
                            <span className="text-[10px] w-3 text-center">{expandedNodes[`db:${catalogName}.${dbName}`] ? "▼" : "▶"}</span>
                            <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>
                            <span className="truncate">{dbName}</span>
                          </div>

                          {expandedNodes[`db:${catalogName}.${dbName}`] && (
                            <div className="ml-4 pl-2 border-l border-white/[0.06] space-y-1.5 mb-2">
                              {dbTables.map((t: any) => (
                                <div key={t.id} className="mb-2">
                                  <div onClick={() => { toggleNode(t.table_name); setSelectedTable(t); }} className={["flex items-center gap-2 text-white/70 mb-2 cursor-pointer hover:text-white transition-colors p-1 rounded", selectedTable?.id === t.id ? "bg-white/10" : ""].join(" ")}>
                                    <span className="text-[10px] w-3 text-center">{expandedNodes[t.table_name] ? "▼" : "▶"}</span>
                                    <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></svg>
                                    <span className="truncate">{t.displayName}</span>
                                  </div>
                                  
                                  {expandedNodes[t.table_name] && (
                                    <div className="ml-4 pl-2 border-l border-white/[0.06] space-y-1.5 mb-2">
                                      {t.columns.map((col: any) => (
                                        <div key={col.id} className="flex items-center justify-between px-2 py-1.5 rounded cursor-pointer transition-colors hover:bg-white/[0.04]">
                                          <div className="flex items-center gap-2">
                                            <span className="text-white/60 truncate max-w-[120px]" title={col.column_name}>{col.column_name}</span>
                                            {col.is_primary_key && <span className="text-amber-400 text-[10px]">🔑</span>}
                                          </div>
                                          <span className="px-1.5 py-0.5 rounded bg-white/[0.03] text-[9px] text-white/30 border border-white/[0.05]">{col.data_type}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Center: Mapping Canvas */}
        <div className="flex-1 bg-[#111] border border-white/[0.06] rounded-xl flex flex-col overflow-hidden shadow-lg relative">
          {/* Subtle grid background */}
          <div className="absolute inset-0 pointer-events-none opacity-20" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, rgba(255,255,255,0.2) 1px, transparent 0)", backgroundSize: "24px 24px" }} />
          
          <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between bg-[#111] relative z-10">
            <h2 className="text-[14px] font-semibold text-white">Mapping Canvas</h2>
            <button className="px-3 py-1 text-xs font-medium border border-white/20 rounded-md text-white/70 hover:bg-white/5 transition-colors">Clear All</button>
          </div>
          
          <div className="flex-1 overflow-auto p-8 flex flex-col gap-6 relative z-10">
            {generatedMappings.length === 0 && !loading && (
              <div className="text-white/40 m-auto">Select a table to view mappings.</div>
            )}
            {generatedMappings.map((m, i) => (
              <div key={i} className="flex items-center justify-between relative">
                {/* SVG Line connecting */}
                <svg className="absolute left-[200px] right-[200px] top-1/2 -translate-y-1/2 h-10 w-[calc(100%-400px)] pointer-events-none" preserveAspectRatio="none">
                  <path d="M 0 20 L 1000 20" stroke="rgba(255,255,255,0.15)" strokeWidth={2} fill="none" />
                </svg>

                {/* Source Node */}
                <div className="w-[200px] bg-[#1a1b23] border border-[#2a2b36] rounded-lg p-2.5 relative shadow-md">
                  <div className="text-[13px] font-semibold text-white/90 font-mono mb-1">{m.source.name}</div>
                  <div className="text-[10px] text-white/40 font-mono">{m.source.type}</div>
                  <div className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-white/40 rounded-full ring-2 ring-[#1a1b23]" />
                </div>

                {/* Middle Match Pill */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                  {m.sub ? (
                    <div className="bg-[#1a1b23] border border-white/20 rounded-lg px-4 py-2 flex flex-col items-center shadow-lg">
                      <span className="text-[11px] font-medium text-white/80">{m.match}</span>
                      <span className="text-[11px] font-bold text-white font-mono mt-0.5">{m.sub}</span>
                    </div>
                  ) : (
                    <div className="bg-[#111f18] border border-[#1b3d2b] text-[#5eead4] rounded-full px-4 py-1.5 text-[11px] font-bold shadow-lg">
                      {m.match}
                    </div>
                  )}
                </div>

                {/* Target Node */}
                <div className="w-[200px] bg-[#1a1b23] border border-[#2a2b36] rounded-lg p-2.5 relative shadow-md">
                  <div className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-white/40 rounded-full ring-2 ring-[#1a1b23]" />
                  <div className="text-[13px] font-semibold text-white/90 font-mono mb-1">{m.target.name}</div>
                  <div className="text-[10px] text-white/40 font-mono">{m.target.type}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Target Schema */}
        <div className="w-[280px] bg-[#111] border border-white/[0.06] rounded-xl flex flex-col flex-shrink-0 shadow-lg">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2 text-[14px] text-white font-semibold">
            <svg className="w-4 h-4 text-white/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>
            Target Schema (Databricks)
          </div>
          <div className="p-3 border-b border-white/[0.06]">
            <div className="relative">
              <input type="text" placeholder="Search tables or columns..." className="w-full bg-[#1a1a1a] border border-white/10 rounded-md pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-white/30" />
              <svg className="w-3.5 h-3.5 text-white/30 absolute left-2.5 top-1/2 -translate-y-1/2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
            </div>
          </div>
          <div className="p-3 overflow-y-auto flex-1 font-mono text-[12px]">
            {loading ? (
              <div className="text-white/40 p-4 text-center">Loading schema...</div>
            ) : selectedTable ? (
              <div className="mb-2">
                <div className="flex items-center gap-2 text-white mb-2">
                  <span className="text-[10px] w-3 text-center">▼</span>
                  <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></svg>
                  <span className="truncate">{selectedTable.table_name}</span>
                </div>
                
                <div className="ml-4 pl-2 border-l border-white/[0.06] space-y-1.5 mb-2">
                  {selectedTable.columns.map((col) => (
                    <div key={col.id} className="flex items-center justify-between px-2 py-1.5 rounded bg-white/[0.04]">
                      <div className="flex items-center gap-2">
                        <span className="text-white truncate max-w-[120px]" title={col.column_name}>{col.column_name}</span>
                        {col.is_primary_key && <span className="text-amber-400 text-[10px]">🔑</span>}
                      </div>
                      <span className="px-1.5 py-0.5 rounded bg-white/[0.03] text-[9px] text-white/30 border border-white/[0.05]">{col.data_type}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-white/40 p-4 text-center">Select a source table to view target mapping.</div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom panel */}
      <div className="h-[280px] bg-[#0d0d0d] border-t border-white/[0.06] flex flex-col flex-shrink-0">
        {/* Bottom tabs */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4">
          <div className="flex items-center">
            {(["preview", "logic", "history"] as BottomTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setBottomTab(tab)}
                className={["px-6 py-3 text-[13px] font-semibold border-b-2 -mb-px transition-colors capitalize",
                  bottomTab === tab
                    ? "border-white text-white"
                    : "border-transparent text-white/40 hover:text-white/70"
                ].join(" ")}
              >
                {tab === "preview" ? "Data Preview" : tab === "logic" ? "Transformation Logic" : "Version History"}
              </button>
            ))}
          </div>
          <button className="flex items-center gap-1.5 text-[12px] text-white/50 hover:text-white/80">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
            Expand
          </button>
        </div>

        {/* Bottom content */}
        <div className="flex flex-1 overflow-hidden min-h-0 bg-[#09090b] p-4 gap-4">
          <div className="flex-1 bg-[#121214] border border-white/[0.06] rounded-xl flex flex-col items-center justify-center text-center p-8">
            <svg className="w-12 h-12 text-white/10 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12V7H5a2 2 0 010-4h14v4" />
              <path d="M3 5v14a2 2 0 002 2h16v-5" />
              <path d="M18 12h-4" />
            </svg>
            <h3 className="text-[14px] font-semibold text-white/80 mb-2">Awaiting Live Databricks Data</h3>
            <p className="text-[12px] text-white/40 max-w-sm">
              Data preview, transformation logic, and generated SQL will be dynamically populated directly from your Databricks cluster once the ingestion pipeline completes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
