"use client";

import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";

const Icon = ({ name, className }: { name: string, className?: string }) => {
  switch (name) {
    case 'Sparkles': return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" /></svg>;
    case 'Database': return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5V19A9 3 0 0 0 21 19V5" /><path d="M3 12A9 3 0 0 0 21 12" /></svg>;
    case 'LayoutTemplate': return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg>;
    case 'ArrowRight': return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>;
    case 'AlertCircle': return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>;
    case 'Play': return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polygon points="6 3 20 12 6 21 6 3" /></svg>;
    default: return null;
  }
};

interface CatalogTable {
  id: number;
  table_name: string;
  columns: Array<{
    id: number;
    column_name: string;
    data_type: string;
    nullable: boolean;
    is_primary_key: boolean;
  }>;
}

export default function SchemaMapperWorkbenchPage() {
  const searchParams = useSearchParams();
  const connId = searchParams.get("connection_id");
  
  const [sparkConnId, setSparkConnId] = useState<number | null>(null);
  const [tables, setTables] = useState<CatalogTable[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Selection State
  const [sourceCatalog, setSourceCatalog] = useState<string>("");
  const [sourceSchema, setSourceSchema] = useState<string>("");
  const [sourceTable, setSourceTable] = useState<string>("");
  
  const [targetCatalog, setTargetCatalog] = useState<string>("");
  const [targetSchema, setTargetSchema] = useState<string>("");
  
  const [mode, setMode] = useState<"selection" | "mapping">("selection");
  const [mappingId, setMappingId] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loadingMapping, setLoadingMapping] = useState(false);

  // 1. Fetch Databricks connection
  useEffect(() => {
    if (connId) {
      setSparkConnId(parseInt(connId));
      return;
    }
    api.get<Array<{ id: number; name: string; type: string }>>("/api/v1/connectors/")
      .then(res => {
        const list = Array.isArray(res) ? res : (res as any).connectors ?? [];
        const db = list.find((c: any) => c.type?.toLowerCase() === "databricks");
        if (db) setSparkConnId(db.id);
      });
  }, [connId]);

  // 2. Fetch Schema
  useEffect(() => {
    if (!sparkConnId) return;
    setLoading(true);
    api.get<{ schema: Record<string, any[]> }>(`/api/v1/connectors/${sparkConnId}/schema`)
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
      })
      .finally(() => setLoading(false));
  }, [sparkConnId]);

  // 3. Process Dropdowns
  const catalogStructure = useMemo(() => {
    const struct: Record<string, Record<string, string[]>> = {};
    tables.forEach(t => {
      const parts = t.table_name.split('.');
      let cat = "default", sch = "default", tbl = t.table_name;
      if (parts.length >= 3) {
        cat = parts[0]; sch = parts[1]; tbl = parts.slice(2).join('.');
      } else if (parts.length === 2) {
        sch = parts[0]; tbl = parts[1];
      }
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

  // Start Mapping
  const handleStartMapping = async () => {
    if (!sparkConnId || !sourceTable || !targetSchema) return;
    setMode("mapping");
    setLoadingMapping(true);
    
    try {
      const fullSourceTableName = `${sourceCatalog}.${sourceSchema}.${sourceTable}`;
      
      // Create mapping
      const mapping = await api.post<any>("/api/v1/mappings/", {
        name: `Map ${fullSourceTableName}`,
        source_id: sparkConnId,
        target_id: sparkConnId
      });
      setMappingId(mapping.id);
      
      // Request AI suggestions
      await api.post(`/api/v1/mappings/${mapping.id}/suggestions`, {});
      
      // Poll for suggestions
      const poll = setInterval(async () => {
        const res = await api.get<any>(`/api/v1/mappings/${mapping.id}/suggestions?limit=200`);
        if (res.items && res.items.length > 0) {
          clearInterval(poll);
          // Filter out only the suggestions for our selected source table
          const relevant = res.items.filter((item: any) => item.source_table === fullSourceTableName);
          setSuggestions(relevant);
          setLoadingMapping(false);
        }
      }, 3000);
      
      // Timeout after 60s
      setTimeout(() => clearInterval(poll), 60000);
      
    } catch (e) {
      console.error(e);
      setLoadingMapping(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#09090b] text-white overflow-hidden font-sans">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-[#0d0d0d] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
            <Icon name="Sparkles" className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-white/50 tracking-tight">ReMatch Schema Engine</h1>
            <p className="text-[13px] text-white/40 mt-0.5">Automated AI-powered vector mapping</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-6 relative">
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "32px 32px" }} />

        {mode === "selection" ? (
          <div className="w-full max-w-[100rem] px-8 xl:px-16 mx-auto h-full flex flex-col justify-center gap-12 relative z-10 animate-in fade-in zoom-in-95 duration-500">
            <div className="text-center space-y-3">
              <h2 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white via-white/80 to-white/30">Configure AI Mapping</h2>
              <p className="text-white/40 text-lg">Select your source table and target destination schema to begin.</p>
            </div>

            <div className="flex flex-col md:flex-row items-stretch gap-8 items-center">
              {/* SOURCE CARD */}
              <div className="flex-1 w-full bg-gradient-to-b from-[#111] to-black border border-white/10 rounded-2xl p-10 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-white/10 via-white/40 to-white/10" />
                <h3 className="text-xl font-semibold flex items-center gap-3 mb-10">
                  <Icon name="Database" className="w-5 h-5 text-white/70" /> Source Selection
                </h3>
                
                <div className="space-y-6">
                  <div>
                    <label className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3 block">1. Unity Catalog</label>
                    <select value={sourceCatalog} onChange={e => {setSourceCatalog(e.target.value); setSourceSchema(""); setSourceTable("");}} className="w-full bg-black border border-white/10 rounded-lg px-4 py-4 text-sm focus:border-white/50 outline-none transition-colors appearance-none text-white">
                      <option value="">Select Catalog...</option>
                      {catalogs.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3 block">2. Schema</label>
                    <select value={sourceSchema} onChange={e => {setSourceSchema(e.target.value); setSourceTable("");}} disabled={!sourceCatalog} className="w-full bg-black border border-white/10 rounded-lg px-4 py-4 text-sm focus:border-white/50 outline-none transition-colors appearance-none disabled:opacity-50 text-white">
                      <option value="">Select Schema...</option>
                      {sourceSchemas.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3 block">3. Table Name</label>
                    <select value={sourceTable} onChange={e => setSourceTable(e.target.value)} disabled={!sourceSchema} className="w-full bg-black border border-white/10 rounded-lg px-4 py-4 text-sm focus:border-white/50 outline-none transition-colors appearance-none disabled:opacity-50 text-white">
                      <option value="">Select Table...</option>
                      {sourceTables.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* ACTION BUTTON */}
              <div className="flex flex-col items-center justify-center shrink-0 w-56">
                <button 
                  onClick={handleStartMapping}
                  disabled={!sourceTable || !targetSchema}
                  className="w-full py-5 rounded-xl bg-gradient-to-b from-white to-gray-200 text-black font-bold text-base hover:from-white hover:to-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-[0_0_40px_rgba(255,255,255,0.1)] hover:shadow-[0_0_60px_rgba(255,255,255,0.15)] ring-1 ring-white/50"
                >
                  <Icon name="Sparkles" className="w-5 h-5" />
                  Auto Map
                </button>
                <div className="mt-4 flex items-center gap-2 text-white/30 text-xs font-medium uppercase tracking-widest">
                  <span className="w-4 h-px bg-white/20"></span>
                  Start
                  <span className="w-4 h-px bg-white/20"></span>
                </div>
              </div>

              {/* TARGET CARD */}
              <div className="flex-1 w-full bg-gradient-to-b from-[#111] to-black border border-white/10 rounded-2xl p-10 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-white/10 via-white/40 to-white/10" />
                <h3 className="text-xl font-semibold flex items-center gap-3 mb-10">
                  <Icon name="LayoutTemplate" className="w-5 h-5 text-white/70" /> Target Destination
                </h3>
                
                <div className="space-y-6">
                  <div>
                    <label className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3 block">1. Unity Catalog</label>
                    <select value={targetCatalog} onChange={e => {setTargetCatalog(e.target.value); setTargetSchema("");}} className="w-full bg-black border border-white/10 rounded-lg px-4 py-4 text-sm focus:border-white/50 outline-none transition-colors appearance-none text-white">
                      <option value="">Select Catalog...</option>
                      {catalogs.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3 block">2. Target Schema</label>
                    <select value={targetSchema} onChange={e => setTargetSchema(e.target.value)} disabled={!targetCatalog} className="w-full bg-black border border-white/10 rounded-lg px-4 py-4 text-sm focus:border-white/50 outline-none transition-colors appearance-none disabled:opacity-50 text-white">
                      <option value="">Select Schema...</option>
                      {targetSchemas.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-lg p-5 mt-8 flex items-start gap-4">
                    <Icon name="Sparkles" className="w-5 h-5 text-white/70 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-white/60 leading-relaxed">
                      ReMatch Engine will automatically analyze all tables in this schema using vector search and select the best candidate table based on semantic meaning.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex gap-6 relative z-10 animate-in slide-in-from-bottom-8 duration-500">
            {/* COMPACT LEFT */}
            <div className="w-[300px] bg-[#111] border border-white/10 rounded-2xl flex flex-col overflow-hidden">
              <div className="p-4 border-b border-white/5 bg-white/[0.02]">
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider block mb-1">Source</span>
                <h3 className="text-sm font-semibold truncate">{sourceCatalog}.{sourceSchema}.{sourceTable}</h3>
              </div>
              <div className="p-4 flex-1 overflow-auto space-y-2">
                {tables.find(t => t.table_name === `${sourceCatalog}.${sourceSchema}.${sourceTable}`)?.columns.map(col => (
                  <div key={col.id} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                    <span className="text-xs text-white/80">{col.column_name}</span>
                    <span className="text-[9px] text-white/40 px-1.5 py-0.5 rounded bg-black">{col.data_type}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* EXPANDED CENTER */}
            <div className="flex-1 bg-[#111] border border-white/10 rounded-2xl overflow-hidden flex flex-col relative">
              <div className="absolute top-0 left-0 w-full h-1 bg-white/20" />
              
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Icon name="Sparkles" className="w-4 h-4 text-white" /> AI Mapping Results
                </h2>
                <button onClick={() => setMode("selection")} className="text-xs text-white/40 hover:text-white">Start Over</button>
              </div>

              <div className="flex-1 overflow-auto p-8">
                {loadingMapping ? (
                  <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-full border-2 border-white/10 border-t-white animate-spin" />
                      <Icon name="Sparkles" className="w-6 h-6 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                    </div>
                    <div>
                      <h3 className="text-white font-medium">ReMatch Engine Analyzing</h3>
                      <p className="text-sm text-white/40 mt-1 max-w-sm">Generating vector embeddings and calculating semantic similarity across the target schema...</p>
                    </div>
                  </div>
                ) : suggestions.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center gap-3 text-white/40">
                    <Icon name="AlertCircle" className="w-8 h-8" />
                    <p>No high-confidence mappings found.</p>
                  </div>
                ) : (
                  <div className="max-w-3xl mx-auto space-y-4">
                    {suggestions.map((s, idx) => (
                      <div key={idx} className="bg-black border border-white/10 rounded-xl p-5 flex items-start gap-6 hover:bg-white/[0.04] transition-colors relative group">
                        
                        {/* Source Col */}
                        <div className="flex-1">
                          <span className="text-[10px] text-white/40 font-mono mb-1 block">SOURCE</span>
                          <div className="font-semibold text-sm">{s.source_column}</div>
                          <div className="text-xs text-white/40 mt-1">{s.source_type}</div>
                        </div>

                        {/* Match Center */}
                        <div className="flex flex-col items-center gap-2 pt-2 px-4 shrink-0">
                          <Icon name="ArrowRight" className="w-5 h-5 text-white/40" />
                          <div className="flex items-center gap-1 bg-white/10 text-white border border-white/20 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider">
                            {s.confidence.toFixed(1)}% MATCH
                          </div>
                        </div>

                        {/* Target Col */}
                        <div className="flex-1">
                          <span className="text-[10px] text-white/40 font-mono mb-1 block">TARGET TABLE: {s.target_table}</span>
                          <div className="font-semibold text-sm text-white/90">{s.target_column}</div>
                          <div className="text-xs text-white/40 mt-1">{s.target_type}</div>
                        </div>
                        
                        {/* Reasoning Popover (on hover) */}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-96 bg-[#1a1b23] border border-white/10 p-4 rounded-xl shadow-2xl opacity-0 translate-y-2 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 transition-all z-20">
                          <div className="flex items-center gap-2 mb-2">
                            <Icon name="Sparkles" className="w-3.5 h-3.5 text-white" />
                            <span className="text-xs font-bold tracking-wider text-white">AI REASONING</span>
                          </div>
                          <p className="text-xs text-white/70 leading-relaxed">{s.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* COMPACT RIGHT */}
            <div className="w-[300px] bg-[#111] border border-white/10 rounded-2xl flex flex-col overflow-hidden">
              <div className="p-4 border-b border-white/5 bg-white/[0.02]">
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider block mb-1">Target Schema</span>
                <h3 className="text-sm font-semibold truncate">{targetCatalog}.{targetSchema}</h3>
              </div>
              <div className="p-4 flex-1 overflow-auto">
                <div className="flex flex-col items-center justify-center h-full text-center text-white/30 gap-3 px-4">
                  <Icon name="Database" className="w-8 h-8 opacity-50" />
                  <p className="text-xs">ReMatch Engine automatically scans all tables in this schema to find the best fit.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
