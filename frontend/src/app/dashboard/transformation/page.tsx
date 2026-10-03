"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";

const Icon = ({ name, size = 16, className = "" }: { name: string; size?: number; className?: string }) => {
  const s = { width: size, height: size, className };
  switch (name) {
    case "sparkles": return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><path d="M12 3v18m9-9H3m14.48-6.36L6.52 17.36m10.96 0L6.52 6.64" /></svg>;
    case "table": return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>;
    case "alert": return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
    case "arrow-r": return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>;
    case "send": return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
    case "code": return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>;
    default: return null;
  }
};

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  code?: string;
}

export default function TransformationPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const mappingId = searchParams.get("mappingId");

  const [activeTab, setActiveTab] = useState<"clean" | "unclean">("clean");
  const [messages, setMessages] = useState<Message[]>([
    { id: "1", role: "assistant", content: "Hi! I'm your Data Cleaning Copilot. Describe how you want to transform this data (e.g. 'Replace nulls in status with unknown', 'Create full_name from first and last name')." }
  ]);
  const [input, setInput] = useState("");
  const [loadingCode, setLoadingCode] = useState(false);
  
  // Accumulated pyspark code
  const [transformationCode, setTransformationCode] = useState<string>("");

  // Mock data for preview since we need a backend endpoint for actual data.
  // We simulate fetching this on load.
  const [cleanData, setCleanData] = useState<{cols: string[], rows: any[]}>({ cols: [], rows: [] });
  const [uncleanData, setUncleanData] = useState<{cols: string[], rows: any[]}>({ cols: [], rows: [] });

  useEffect(() => {
    // In a real implementation, we would call an API here to get actual table preview.
    setCleanData({
      cols: ["id", "first_name", "last_name", "status", "score"],
      rows: [
        [1, "Alice", "Smith", "active", 95],
        [2, "Bob", "Jones", "inactive", 82],
        [3, "Charlie", "Brown", "active", 100],
      ]
    });
    setUncleanData({
      cols: ["id", "first_name", "last_name", "status", "score"],
      rows: [
        [4, "David", null, "active", null],
        [5, null, "Williams", null, 45],
      ]
    });
  }, [mappingId]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoadingCode(true);

    try {
      // Call the AI transformation generation endpoint
      const res = await api.post<any>("/api/v1/transformation/generate", {
        prompt: userMsg.content,
        mapping_id: mappingId ? parseInt(mappingId) : null,
        current_code: transformationCode
      });
      
      const aiMsg: Message = { 
        id: (Date.now()+1).toString(), 
        role: "assistant", 
        content: res.explanation || "Here is the updated PySpark transformation logic:",
        code: res.code
      };
      
      setMessages(prev => [...prev, aiMsg]);
      if (res.code) {
        setTransformationCode(res.code);
      }
    } catch (e: any) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: "assistant", content: "Error generating transformation: " + (e.message || String(e)) }]);
    } finally {
      setLoadingCode(false);
    }
  };

  const handleExecute = async () => {
    if (!mappingId) return;
    try {
      // We pass the transformation code to the runs endpoint so it is applied before migration.
      const run = await api.post<any>(`/api/v1/mappings/${mappingId}/runs`, {
        transformation_code: transformationCode
      });
      
      if (run && run.id) {
         router.push(`/dashboard/migration-status?mappingId=${mappingId}&runId=${run.id}`);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to start migration");
    }
  };

  const renderTable = (data: {cols: string[], rows: any[]}) => (
    <div className="w-full h-full overflow-auto rounded-lg" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.2)" }}>
      <table className="w-full text-left text-[11px] whitespace-nowrap">
        <thead style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.08)", position: "sticky", top: 0, zIndex: 10 }}>
          <tr>
            {data.cols.map((c, i) => (
              <th key={i} className="px-3 py-2 font-semibold" style={{ color: "rgba(255,255,255,0.6)" }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
              {r.map((val: any, j: number) => (
                <td key={j} className="px-3 py-2 font-mono" style={{ color: val === null ? "#ef4444" : "rgba(255,255,255,0.85)" }}>
                  {val === null ? "NULL" : String(val)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "#0c0c0c", color: "rgba(255,255,255,0.88)", fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.4)" }}>
        <div>
          <h1 className="text-[14px] font-semibold tracking-tight" style={{ color: "rgba(255,255,255,0.92)" }}>Data Transformation & Cleaning</h1>
          <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>Review anomalies and apply AI-generated Spark transformations before migration.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExecute} className="flex items-center gap-1.5 text-[11px] font-bold px-4 py-1.5 rounded-md transition-all shadow-md hover:opacity-90"
            style={{ background: "#ffffff", color: "#000" }}>
            Execute Migration <Icon name="arrow-r" size={11} />
          </button>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 flex min-h-0 overflow-hidden">
        
        {/* Left Data Preview Panel */}
        <div className="flex-1 flex flex-col min-w-0 p-5 gap-4" style={{ borderRight: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center justify-between">
            <div className="flex bg-white/5 rounded-lg p-0.5">
              <button onClick={() => setActiveTab("clean")} className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-md transition-colors ${activeTab === "clean" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"}`}>
                <Icon name="table" size={12} /> Clean Data ({cleanData.rows.length})
              </button>
              <button onClick={() => setActiveTab("unclean")} className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-md transition-colors ${activeTab === "unclean" ? "bg-red-500/10 text-red-400" : "text-white/40 hover:text-white/70"}`}>
                <Icon name="alert" size={12} /> Anomalies ({uncleanData.rows.length})
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            {activeTab === "clean" ? renderTable(cleanData) : renderTable(uncleanData)}
          </div>
          
          {/* Code Preview */}
          <div className="h-40 flex-shrink-0 flex flex-col rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.5)" }}>
             <div className="px-3 py-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)" }}>
                <Icon name="code" size={12} /> PySpark Transformation Pipeline
             </div>
             <div className="flex-1 overflow-auto p-3 text-[11px] font-mono whitespace-pre-wrap" style={{ color: "#a5b4fc" }}>
                {transformationCode || "# No transformations applied yet.\n# Use the chat on the right to instruct the AI."}
             </div>
          </div>
        </div>

        {/* Right AI Chat Panel */}
        <div className="w-80 flex-shrink-0 flex flex-col bg-black/20">
          <div className="px-4 py-3 text-[11px] font-semibold flex items-center gap-2 uppercase tracking-wider" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.6)" }}>
            <Icon name="sparkles" size={12} className="text-blue-400" /> Copilot
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {messages.map(m => (
              <div key={m.id} className={`flex flex-col gap-1 ${m.role === "user" ? "items-end" : "items-start"}`}>
                <div className={`px-3 py-2 rounded-lg text-[12px] max-w-[90%] leading-relaxed ${m.role === "user" ? "bg-blue-600/20 border border-blue-500/30 text-blue-50" : "bg-white/5 border border-white/10 text-white/80"}`}>
                  {m.content}
                </div>
                {m.code && (
                  <div className="max-w-[90%] mt-1 px-3 py-2 rounded bg-black/60 border border-white/10 text-[10px] font-mono text-blue-300">
                    <pre>{m.code}</pre>
                  </div>
                )}
              </div>
            ))}
            {loadingCode && (
              <div className="flex gap-1 items-center px-3 py-2 rounded-lg bg-white/5 border border-white/10 w-16">
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce delay-75" />
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce delay-150" />
              </div>
            )}
          </div>
          <div className="p-3" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="relative flex items-center">
              <input 
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSend()}
                placeholder="Ask AI to clean data..."
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-3 pr-10 py-2.5 text-[12px] text-white focus:outline-none focus:border-blue-500/50"
              />
              <button onClick={handleSend} disabled={!input.trim()} className="absolute right-2 p-1.5 rounded-md text-white/40 hover:text-white/90 disabled:opacity-30 transition-opacity">
                <Icon name="send" size={14} />
              </button>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
