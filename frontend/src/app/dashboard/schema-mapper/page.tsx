import { useState, useEffect } from "react";
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

const PREVIEW_ROWS = [
  { id: 1, first_name: "John", last_name: "Doe", email: "john.doe@acme.com", created_at: "2024-01-15 10:21:45", country: "US" },
  { id: 2, first_name: "Sarah", last_name: "Smith", email: "sarah.smith@acme.com", created_at: "2024-02-10 14:11:22", country: "UK" },
  { id: 3, first_name: "Michael", last_name: "Brown", email: "michael.brown@acme.com", created_at: "2024-03-05 09:18:30", country: "CA" },
];

const GENERATED_SQL = `SELECT * FROM source;`;

export default function SchemaMapperWorkbenchPage() {
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [bottomTab, setBottomTab] = useState<BottomTab>("preview");
  
  const searchParams = useSearchParams();
  const connId = searchParams.get("conn");
  
  const [tables, setTables] = useState<CatalogTable[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});
  const [selectedTable, setSelectedTable] = useState<CatalogTable | null>(null);

  useEffect(() => {
    if (connId) {
      setLoading(true);
      api.get<{ tables: CatalogTable[] }>(`/api/v1/catalog/${connId}/tables`)
        .then(res => {
          setTables(res.tables || []);
          if (res.tables && res.tables.length > 0) {
            setExpandedTables({ [res.tables[0].table_name]: true });
            setSelectedTable(res.tables[0]);
          }
        })
        .finally(() => setLoading(false));
    }
  }, [connId]);

  const toggleTable = (t: CatalogTable) => {
    setExpandedTables(prev => ({ ...prev, [t.table_name]: !prev[t.table_name] }));
    setSelectedTable(t);
  };
  
  const generatedMappings = selectedTable ? selectedTable.columns.map(c => ({
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
              <div className="text-white/40 p-4 text-center">Loading schema...</div>
            ) : tables.length === 0 ? (
              <div className="text-white/40 p-4 text-center">No tables found.</div>
            ) : (
              tables.map(t => (
                <div key={t.id} className="mb-2">
                  <div onClick={() => toggleTable(t)} className={["flex items-center gap-2 text-white/70 mb-2 cursor-pointer hover:text-white transition-colors p-1 rounded", selectedTable?.id === t.id ? "bg-white/10" : ""].join(" ")}>
                    <span className="text-[10px] w-3 text-center">{expandedTables[t.table_name] ? "▼" : "▶"}</span>
                    <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></svg>
                    <span className="truncate">{t.table_name}</span>
                  </div>
                  
                  {expandedTables[t.table_name] && (
                    <div className="ml-4 pl-2 border-l border-white/[0.06] space-y-1.5 mb-2">
                      {t.columns.map((col) => (
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
          {/* Tab content (Data Preview) */}
          <div className="flex-1 bg-[#121214] border border-white/[0.06] rounded-xl flex flex-col overflow-hidden">
            <div className="px-4 py-2 border-b border-white/[0.06] flex items-center justify-between">
              <span className="text-[12px] font-semibold text-white/90">Preview: customer_db.customers (Source)</span>
              <span className="text-[11px] text-white/40">Rows: 5</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="py-2.5 px-4 font-medium text-white/40">id</th>
                    <th className="py-2.5 px-4 font-medium text-white/40">first_name</th>
                    <th className="py-2.5 px-4 font-medium text-white/40">last_name</th>
                    <th className="py-2.5 px-4 font-medium text-white/40">email</th>
                    <th className="py-2.5 px-4 font-medium text-white/40">created_at</th>
                    <th className="py-2.5 px-4 font-medium text-white/40">country</th>
                  </tr>
                </thead>
                <tbody>
                  {PREVIEW_ROWS.map((row) => (
                    <tr key={row.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                      <td className="py-2.5 px-4 text-white/70">{row.id}</td>
                      <td className="py-2.5 px-4 text-white/70">{row.first_name}</td>
                      <td className="py-2.5 px-4 text-white/70">{row.last_name}</td>
                      <td className="py-2.5 px-4 text-white/70">{row.email}</td>
                      <td className="py-2.5 px-4 text-white/70">{row.created_at}</td>
                      <td className="py-2.5 px-4 text-white/70">{row.country}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* SQL panel */}
          <div className="flex-1 bg-[#121214] border border-white/[0.06] rounded-xl flex flex-col overflow-hidden">
            <div className="px-4 py-2 border-b border-white/[0.06] flex items-center justify-between">
              <span className="text-[12px] font-semibold text-white/90">Generated SQL (Transformation)</span>
              <button className="flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white/80">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                Copy
              </button>
            </div>
            <div className="flex flex-1 overflow-auto bg-[#0a0a0c]">
              <div className="py-4 px-2 text-right border-r border-white/5 select-none text-[#4b5563] text-[12px] font-mono leading-[1.6]">
                {GENERATED_SQL.split('\n').map((_, i) => <div key={i}>{i + 1}</div>)}
              </div>
              <pre className="p-4 text-[12px] font-mono leading-[1.6] overflow-x-auto text-[#e2e8f0]">
                {GENERATED_SQL.split('\n').map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
