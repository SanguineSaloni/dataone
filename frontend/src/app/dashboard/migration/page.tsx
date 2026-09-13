"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useWidgetData } from "../hooks/useWidgetData";

interface SchemaField {
  name: string;
  type: string;
  targetName?: string;
  targetType?: string;
  confidence?: number;
  transformation?: string;
}

const SOURCE_FIELDS: SchemaField[] = [
  { name: "id", type: "INT", targetName: "customer_id", targetType: "BIGINT", confidence: 98, transformation: "Auto-Cast: INT to BIGINT" },
  { name: "first_name", type: "VARCHAR", targetName: "fname", targetType: "VARCHAR", confidence: 96 },
  { name: "last_name", type: "VARCHAR", targetName: "lname", targetType: "VARCHAR", confidence: 97 },
  { name: "email", type: "VARCHAR", targetName: "email_address", targetType: "VARCHAR", confidence: 92 },
  { name: "created_at", type: "DATETIME", targetName: "signup_date", targetType: "TIMESTAMP", confidence: 95, transformation: "DATE to TIMESTAMP" },
  { name: "country", type: "VARCHAR", targetName: "country", targetType: "VARCHAR", confidence: 94 },
];

const PREVIEW_ROWS = [
  { id: 101, first_name: "John", last_name: "Doe", email: "john@example.com", created_at: "2024-01-15 10:21:45", country: "US" },
  { id: 102, first_name: "Sarah", last_name: "Smith", email: "sarah@example.com", created_at: "2024-01-16 11:05:32", country: "UK" },
  { id: 103, first_name: "Michael", last_name: "Brown", email: "michael@example.com", created_at: "2024-01-17 09:18:27", country: "CA" },
  { id: 104, first_name: "Emily", last_name: "Davis", email: "emily@example.com", created_at: "2024-01-18 14:22:10", country: "AU" },
  { id: 105, first_name: "David", last_name: "Wilson", email: "david@example.com", created_at: "2024-01-19 16:47:25", country: "US" },
];

const GENERATED_SQL = `SELECT
  id AS customer_id,
  first_name AS fname,
  last_name AS lname,
  email AS email_address,
  CAST(created_at AS TIMESTAMP) AS signup_date,
  country
FROM customers;`;

const AI_CONFIDENCE = 96;

function ConfidenceBadge({ pct, transformation }: { pct: number; transformation?: string }) {
  const color = pct >= 95 ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5"
    : pct >= 90 ? "text-blue-400 border-blue-500/20 bg-blue-500/5"
    : "text-amber-400 border-amber-500/20 bg-amber-500/5";
  return (
    <div className={`px-3 py-1 rounded-lg border text-xs font-semibold text-center min-w-[90px] ${color}`}>
      {transformation ? <span className="block text-[10px] text-white/40">{transformation}</span> : null}
      <span>{transformation ? "" : `${pct}% Match`}{!transformation && ""}</span>
      {transformation && <span>{pct}%</span>}
    </div>
  );
}

type CopilotTab = "migration" | "schema" | "impact";

const KEY_FINDINGS = [
  "Source and target schemas are structurally compatible.",
  "Data type mismatches automatically handled (3 fields).",
  "No critical dependency conflicts found.",
  "Migration can be executed with minimal downtime.",
];

const EXAMPLE_QUERIES = [
  "Show total customers by country",
  "Find all null values in email",
  "Generate SQL to create target table",
];

export default function MigrationPage() {
  const [copilotTab, setCopilotTab] = useState<CopilotTab>("migration");
  const [nlQuery, setNlQuery] = useState("");
  const [generatedSql, setGeneratedSql] = useState("");
  const [copied, setCopied] = useState(false);
  const [queryRunning, setQueryRunning] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const handleRunQuery = async () => {
    if (!nlQuery.trim()) return;
    setQueryRunning(true);
    try {
      const result = await api.post<{ sql?: string; answer?: string }>("/api/v1/databricks/ingest/genie", { question: nlQuery });
      setGeneratedSql(result.sql ?? result.answer ?? "No SQL generated");
    } catch {
      setGeneratedSql("-- Error: Could not generate SQL. Ensure Genie is configured.");
    } finally {
      setQueryRunning(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#09090b] text-white">
      {/* Top strip */}
      <div className="flex items-center justify-between px-6 py-2.5 border-b border-white/[0.06] bg-[#0d0d0d] flex-shrink-0">
        <h1 className="text-sm font-bold text-white/80">Transform Data. Amplify Possibilities.</h1>
        <div className="flex gap-2">
          <Link href="/dashboard" className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 text-xs font-semibold hover:bg-white/10 transition-colors">🏠 Dashboard</Link>
          <Link href="/dashboard/visualize" className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 text-xs font-semibold hover:bg-white/10 transition-colors">📊 Data Visualization</Link>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Top section: Schema Mapping + DBA Copilot */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-0 border-b border-white/[0.06]">
          {/* Schema Mapping & Topology */}
          <div className="xl:col-span-2 p-5 border-r border-white/[0.06]">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="font-semibold text-white/90">Schema Mapping & Topology</h2>
                <p className="text-xs text-white/40 mt-0.5">Visualize and map your source and target schemas with AI-powered suggestions.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold">
                  ⚡ {AI_CONFIDENCE}% AI Match
                </span>
                <Link href="/dashboard/schema-mapper" className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 text-xs font-semibold hover:bg-white/10 transition-colors">
                  View Details →
                </Link>
              </div>
            </div>

            {/* Schema topology */}
            <div className="flex gap-4 items-start">
              {/* Source */}
              <div className="flex-1 bg-[#111] rounded-xl border border-white/[0.06] overflow-hidden">
                <div className="px-3 py-2 border-b border-white/[0.06] flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-white/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>
                  <span className="text-xs text-white/50 font-medium">Source Schema</span>
                  <select className="ml-auto bg-transparent text-xs text-white/40 border-none focus:outline-none">
                    <option>MySQL (customers)</option>
                  </select>
                </div>
                <div className="p-2">
                  {SOURCE_FIELDS.map((f) => (
                    <div key={f.name} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 group">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/60 flex-shrink-0" />
                      <span className="text-xs text-white/70 font-medium flex-1">{f.name}</span>
                      <span className="text-[10px] text-white/30 font-mono">{f.type}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Connection lines + confidence */}
              <div className="flex flex-col gap-1 py-8 flex-shrink-0">
                {SOURCE_FIELDS.map((f) => (
                  <div key={f.name} className="flex items-center" style={{ height: "32px" }}>
                    <div className="w-3 h-px bg-white/20" />
                    <div className={`px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap border ${
                      f.confidence && f.confidence >= 96 ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5"
                        : f.transformation ? "text-amber-400 border-amber-500/20 bg-amber-500/5"
                        : "text-blue-400 border-blue-500/20 bg-blue-500/5"
                    }`}>
                      {f.transformation ? f.transformation.split(":")[0] : `Direct Match ${f.confidence}%`}
                    </div>
                    <div className="w-3 h-px bg-white/20" />
                  </div>
                ))}
              </div>

              {/* Target */}
              <div className="flex-1 bg-[#111] rounded-xl border border-white/[0.06] overflow-hidden">
                <div className="px-3 py-2 border-b border-white/[0.06] flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-white/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>
                  <span className="text-xs text-white/50 font-medium">Target Schema</span>
                  <select className="ml-auto bg-transparent text-xs text-white/40 border-none focus:outline-none">
                    <option>PostgreSQL (customers)</option>
                  </select>
                </div>
                <div className="p-2">
                  {SOURCE_FIELDS.map((f) => (
                    <div key={f.name} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500/60 flex-shrink-0" />
                      <span className="text-xs text-white/70 font-medium flex-1">{f.targetName}</span>
                      <span className="text-[10px] text-white/30 font-mono">{f.targetType}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* DBA Copilot */}
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">🤖</span>
                <h2 className="font-semibold text-white/90">Agentic DBA Copilot</h2>
              </div>
              <Link href="/dashboard/autopilot" className="text-xs text-indigo-400 hover:text-indigo-300">View All →</Link>
            </div>
            <p className="text-xs text-white/30 mb-3">AI-driven insights to optimize your data transformation.</p>

            {/* Tabs */}
            <div className="flex gap-1 mb-4 bg-white/5 rounded-lg p-1">
              {(["migration", "schema", "impact"] as CopilotTab[]).map((tab) => (
                <button key={tab} onClick={() => setCopilotTab(tab)}
                  className={["flex-1 py-1.5 rounded text-[10px] font-semibold capitalize transition-colors",
                    copilotTab === tab ? "bg-white/10 text-white" : "text-white/30 hover:text-white/60"
                  ].join(" ")}>
                  {tab === "migration" ? "Migration Analysis" : tab === "schema" ? "Schema Recommendations" : "Impact Analysis"}
                </button>
              ))}
            </div>

            {copilotTab === "migration" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs font-semibold text-white/80">Migration Analysis Summary</p>
                    <p className="text-[10px] text-white/30">Analyze execution efficiency and structural compatibility.</p>
                  </div>
                  <span className="text-[10px] text-emerald-400 border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 rounded-full font-semibold">✓ Analysis Complete</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {[
                    { icon: "⚡", value: "1.4s", label: "Est. Execution Time", sub: "Good performance" },
                    { icon: "📊", value: "100%", label: "Schema Compatibility", sub: "No blocking issues" },
                    { icon: "📋", value: "1.2M", label: "Rows Ready", sub: "Validated" },
                  ].map((m) => (
                    <div key={m.label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-2.5 text-center">
                      <div className="text-base mb-1">{m.icon}</div>
                      <div className="text-sm font-bold text-white">{m.value}</div>
                      <div className="text-[9px] text-white/40 leading-tight mt-0.5">{m.label}</div>
                      <div className="text-[9px] text-white/25 mt-0.5">{m.sub}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-xs font-semibold text-white/60 mb-2">Key Findings</p>
                  {KEY_FINDINGS.map((f) => (
                    <div key={f} className="flex items-start gap-2 mb-1.5">
                      <span className="text-emerald-400 text-xs mt-0.5">✓</span>
                      <span className="text-[11px] text-white/50">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {copilotTab !== "migration" && (
              <div className="flex flex-col items-center justify-center py-8 text-white/20 text-xs">
                <p>{copilotTab === "schema" ? "Schema recommendations will appear here after analysis." : "Impact analysis runs after migration is triggered."}</p>
                <Link href="/dashboard/autopilot" className="mt-3 text-indigo-400 text-xs">Open Copilot →</Link>
              </div>
            )}
          </div>
        </div>

        {/* Bottom section: Data Preview + AskData */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-0">
          {/* Data preview */}
          <div className="xl:col-span-2 p-5 border-r border-white/[0.06]">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-semibold text-white/90 flex items-center gap-2">
                  <svg className="w-4 h-4 text-white/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18" /></svg>
                  Data Source & Target Preview
                </h2>
                <p className="text-xs text-white/30 mt-0.5">Compare your source data with the transformed target preview.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/30">Rows: 1,000</span>
                <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 text-xs hover:bg-white/10 transition-colors">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></svg>
                  Refresh
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {["#", "id (INT)", "first_name (VARCHAR)", "last_name (VARCHAR)", "email (VARCHAR)", "created_at"].map(h => (
                      <th key={h} className="text-left py-2 px-2 text-white/30 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PREVIEW_ROWS.map((row, i) => (
                    <tr key={row.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="py-2 px-2 text-white/30">{i + 1}</td>
                      <td className="py-2 px-2 text-white/60">{row.id}</td>
                      <td className="py-2 px-2 text-white/60">{row.first_name}</td>
                      <td className="py-2 px-2 text-white/60">{row.last_name}</td>
                      <td className="py-2 px-2 text-white/40">{row.email}</td>
                      <td className="py-2 px-2 text-white/40">{row.created_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* AskData NL2SQL */}
          <div className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-4 h-4 text-white/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
              <h2 className="font-semibold text-white/90">AskData (NL2SQL Assistant)</h2>
            </div>
            <p className="text-xs text-white/30 mb-3">Get insights from your data using natural language.</p>

            {/* Query input */}
            <div className="flex gap-2 mb-3">
              <input
                type="text" value={nlQuery}
                onChange={(e) => setNlQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRunQuery()}
                placeholder="Ask any question about your data..."
                className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-indigo-500/40 transition-colors"
              />
              <button onClick={handleRunQuery} disabled={queryRunning}
                className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 disabled:opacity-50 transition-colors flex-shrink-0">
                {queryRunning ? <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" /> : "▶"}
              </button>
            </div>

            {/* Example queries */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {EXAMPLE_QUERIES.map((q) => (
                <button key={q} onClick={() => { setNlQuery(q); }}
                  className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/[0.06] text-white/40 text-[10px] hover:text-white/60 hover:bg-white/10 transition-colors">
                  {q}
                </button>
              ))}
            </div>

            {/* Generated SQL */}
            <div className="relative">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-white/40 font-semibold">Generated SQL</span>
                <button onClick={() => handleCopy(generatedSql || GENERATED_SQL)}
                  className="text-[10px] text-white/30 hover:text-white/60 transition-colors flex items-center gap-1">
                  {copied ? "✓ Copied" : "📋 Copy"}
                </button>
              </div>
              <div className="bg-[#0a0a0a] border border-white/[0.06] rounded-xl p-3 font-mono text-[10px] text-white/50 whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed">
                {generatedSql || GENERATED_SQL}
              </div>
            </div>

            <button onClick={handleRunQuery} disabled={queryRunning}
              className="mt-3 w-full py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polygon points="5 3 19 12 5 21 5 3" /></svg>
              Run Query
            </button>
            <p className="text-[10px] text-white/20 text-center mt-2">Results will be displayed below</p>
          </div>
        </div>
      </div>
    </div>
  );
}
