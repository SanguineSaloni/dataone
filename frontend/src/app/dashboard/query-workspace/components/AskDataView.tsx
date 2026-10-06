"use client";
import { useEffect, useRef, useState, useMemo } from "react";
import { api, ApiError } from "@/lib/api";
import ChatBubble from "../../askdata/components/ChatBubble";
import ConnectionPicker from "../../askdata/components/ConnectionPicker";
import SchemaDesignPlanCard from "./SchemaDesignPlanCard";
import type { AskDataAskResponse, ChatTurn, SessionMessageEntry, SessionMessagesResponse } from "../../askdata/lib/types";
import type { Connection } from "../../query-studio/lib/types";

const SUGGESTIONS = [
  "show all tables",
  "count rows",
  "show everything in the first table",
  "database health",
];

// B05 — the conversation was component-local state, discarded whenever
// this page's route unmounted (e.g. navigating to another tab and back).
// The backend already keeps a durable ChatMessage history per session_id
// (GET /askdata/sessions/{id}/messages); persist just the session pointer
// here (sessionStorage — tab-scoped, cleared on tab close, which is the
// right lifetime for "resume where I left off," not a cross-device
// history feature) and rehydrate `turns` from that real backend data on
// mount instead of caching the rich UI state client-side.
const SESSION_STORAGE_KEY = "dataone_askdata_session";

interface StoredAskSession {
  sessionId: string;
  connectionId: number;
}

function readStoredSession(): StoredAskSession | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAskSession>;
    if (typeof parsed.sessionId === "string" && typeof parsed.connectionId === "number") {
      return { sessionId: parsed.sessionId, connectionId: parsed.connectionId };
    }
    return null;
  } catch {
    return null;
  }
}

function writeStoredSession(session: StoredAskSession | null) {
  try {
    if (session) window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    else window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // sessionStorage may be unavailable (private mode) — persistence is a
    // nicety, never a blocker.
  }
}

function greetingTurn(): ChatTurn {
  return {
    role: "assistant",
    content: "Hi! I'm AskData — ask a question in plain English and I'll ground it in your schema, generate SQL, and run it read-only.",
    timestamp: new Date().toLocaleTimeString(),
  };
}

function turnFromHistory(m: SessionMessageEntry): ChatTurn {
  const timestamp = new Date(m.created_at).toLocaleTimeString();
  if (m.role !== "assistant") {
    return { role: "user", content: m.content, timestamp };
  }
  // Only sql_text/row_count were persisted, not the full result payload —
  // reconstruct enough for "Show SQL" / "Edit in SQL" to keep working, but
  // leave `executed` false so ChatBubble never renders a result table for
  // rows that were never stored (would otherwise look like "0 rows").
  const response: AskDataAskResponse | undefined = m.sql_text
    ? {
        session_id: "", sql: m.sql_text, grounded: false, confidence: 0, method: "restored",
        executed: false, columns: [], rows: [], row_count: m.row_count ?? 0,
        masked_columns: [], summary: null, warnings: [], error: null,
      }
    : undefined;
  return { role: "assistant", content: m.content, timestamp, response };
}

interface AskDataViewProps {
  connections: Connection[];
  connectionId: number | null;
  setConnectionId: (id: number) => void;
  /** Optional pre-filled question (from a handoff) — NOT auto-sent. */
  prefillQuestion?: string;
  /** Callback to edit SQL in the SQL view */
  onEditInSql: (connectionId: number, sql: string) => void;
  /** Called when `loading` transitions from true to false (background completion). */
  onBackgroundComplete?: () => void;
}

export default function AskDataView({
  connections,
  connectionId,
  setConnectionId,
  prefillQuestion,
  onEditInSql,
  onBackgroundComplete,
}: AskDataViewProps) {
  const [turns, setTurns] = useState<ChatTurn[]>([greetingTurn()]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreAttemptedRef = useRef(false);

  // Schema state
  const [tables, setTables] = useState<any[]>([]);
  const [srcCat, setSrcCat] = useState("");
  const [srcSch, setSrcSch] = useState("");
  const [srcTbl, setSrcTbl] = useState("");

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [turns]);

  // Load schema
  useEffect(() => {
    if (!connectionId) return;
    setTables([]);
    setSrcCat("");
    setSrcSch("");
    setSrcTbl("");
    api.get<{ schema: Record<string, any[]> }>(`/api/v1/connectors/${connectionId}/schema`)
      .then((res) => {
        let uid = 1;
        setTables(Object.entries(res.schema ?? {}).map(([name, cols]) => ({
          id: uid++, table_name: name,
        })));
      })
      .catch(() => {});
  }, [connectionId]);

  const struct = useMemo(() => {
    const s: Record<string, Record<string, string[]>> = {};
    tables.forEach(t => {
      const p = t.table_name.split(".");
      const [cat, sch, tbl] = p.length >= 3 ? [p[0], p[1], p.slice(2).join(".")] : p.length === 2 ? ["default", p[0], p[1]] : ["default", "default", t.table_name];
      if (!s[cat]) s[cat] = {};
      if (!s[cat][sch]) s[cat][sch] = [];
      s[cat][sch].push(tbl);
    });
    return s;
  }, [tables]);

  const cats = Object.keys(struct).sort();
  const srcSchs = srcCat ? Object.keys(struct[srcCat] || {}).sort() : [];
  const srcTbls = srcSch ? (struct[srcCat]?.[srcSch] || []).sort() : [];

  // Restore the last conversation in this browser tab (B05): this
  // component remounts fresh whenever the user navigates to a different
  // route and back to Query Workspace, which previously discarded `turns`
  // and `sessionId` even though the backend already persists the full
  // exchange. Runs once `connectionId` is known; a stored session for a
  // *different* connection is intentionally left alone (the backend
  // itself refuses to mix connections in one session).
  useEffect(() => {
    if (restoreAttemptedRef.current || connectionId == null) return;
    restoreAttemptedRef.current = true;
    const stored = readStoredSession();
    if (!stored || stored.connectionId !== connectionId) return;
    api
      .get<SessionMessagesResponse>(`/api/v1/askdata/sessions/${stored.sessionId}/messages`)
      .then((data) => {
        if (data.messages.length === 0) return;
        setTurns([greetingTurn(), ...data.messages.map(turnFromHistory)]);
        setSessionId(stored.sessionId);
      })
      .catch(() => {
        // A stale/expired session id just starts fresh — restoring is a
        // nicety, never a blocker.
        writeStoredSession(null);
      });
  }, [connectionId]);

  // Apply prefillQuestion once on mount (or when it changes via handoff)
  useEffect(() => {
    if (prefillQuestion) {
      setInput(prefillQuestion);
    }
  }, [prefillQuestion]);

  // Track loading → false transitions for the background-completion badge
  // (mirrors SqlWorkspaceView's running → false tracking).
  const prevLoadingRef = useRef(loading);
  useEffect(() => {
    if (prevLoadingRef.current && !loading) {
      onBackgroundComplete?.();
    }
    prevLoadingRef.current = loading;
  }, [loading, onBackgroundComplete]);

  const sendMessage = async (text?: string) => {
    const question = text ?? input;
    if (!question.trim() || connectionId == null) return;
    setTurns((p) => [...p, { role: "user", content: question, timestamp: new Date().toLocaleTimeString() }]);
    setInput("");
    setLoading(true);
    try {
      const payload: any = {
        connection_id: connectionId,
        question,
        session_id: sessionId,
      };
      if (srcCat && srcSch && srcTbl) {
        payload.table_name = `${srcCat}.${srcSch}.${srcTbl}`;
      }
      
      const data = await api.post<AskDataAskResponse>("/api/v1/askdata/ask", payload);
      setSessionId(data.session_id);
      writeStoredSession({ sessionId: data.session_id, connectionId });
      setTurns((p) => [...p, {
        role: "assistant",
        content: data.error ?? data.summary ?? "No response generated.",
        timestamp: new Date().toLocaleTimeString(),
        response: data,
      }]);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "AskData is unreachable — is the API running?";
      setTurns((p) => [...p, { role: "assistant", content: message, timestamp: new Date().toLocaleTimeString() }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const startNewChat = () => {
    writeStoredSession(null);
    setSessionId(undefined);
    setTurns([greetingTurn()]);
    setInput("");
    inputRef.current?.focus();
  };

  return (
    <div className="flex h-full flex-col bg-[#0b0c10]">
      {/* HEADER */}
      <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] bg-[#111318] px-6 py-4 shadow-sm z-10 relative">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-white/90 tracking-wide">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-white/5 text-[15px]" aria-hidden="true">✨</span>
            NL2SQL Genie
          </h2>
          <p className="ml-10 mt-1 text-[12px] text-white/40 font-medium">Conversational query generation grounded in Unity Catalog.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {sessionId && (
            <button
              type="button"
              onClick={startNewChat}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-[12px] font-semibold text-white/60 hover:text-white hover:bg-white/10 transition-all shadow-sm"
            >
              + New Chat
            </button>
          )}
          
          <div className="flex items-center gap-2 bg-black/20 p-1 rounded-xl border border-white/[0.04]">
            <ConnectionPicker connections={connections} value={connectionId} onChange={setConnectionId} />
          
          {/* Catalog Picker */}
          <select
            value={srcCat}
            onChange={(e) => { setSrcCat(e.target.value); setSrcSch(""); setSrcTbl(""); }}
            className="bg-[#111318] border border-transparent hover:border-white/10 rounded-lg px-3 py-1.5 text-[12px] text-white/70 focus:outline-none focus:border-white/20 transition-colors appearance-none cursor-pointer"
            title="Catalog"
          >
            <option value="">Catalog…</option>
            {cats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {/* Schema Picker */}
          <select
            value={srcSch}
            onChange={(e) => { setSrcSch(e.target.value); setSrcTbl(""); }}
            disabled={!srcCat}
            className="bg-[#111318] border border-transparent hover:border-white/10 rounded-lg px-3 py-1.5 text-[12px] text-white/70 focus:outline-none focus:border-white/20 transition-colors disabled:opacity-30 appearance-none cursor-pointer"
            title="Schema"
          >
            <option value="">Schema…</option>
            {srcSchs.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {/* Table Picker */}
          <select
            value={srcTbl}
            onChange={(e) => setSrcTbl(e.target.value)}
            disabled={!srcSch}
            className="bg-[#111318] border border-transparent hover:border-white/10 rounded-lg px-3 py-1.5 text-[12px] text-white/70 focus:outline-none focus:border-white/20 transition-colors disabled:opacity-30 appearance-none cursor-pointer"
            title="Table"
          >
            <option value="">Table (Optional)…</option>
            {srcTbls.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          </div>
        </div>
      </div>

      {/* CHAT AREA */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 relative">
        {turns.map((turn, i) => (
          <div key={i}>
            <ChatBubble turn={turn} connectionId={connectionId} onEditInSql={onEditInSql} />
            {turn.response?.plan_id != null && (
              <div className="flex justify-start mb-6 animate-in fade-in duration-300">
                <div className="max-w-[85%] w-full">
                  <SchemaDesignPlanCard planId={turn.response.plan_id} />
                </div>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex justify-start mb-6 animate-in fade-in duration-300">
            <div className="bg-[#111318] border border-white/[0.06] rounded-2xl px-5 py-4 flex items-center gap-3 shadow-xl">
              <div className="flex gap-1.5">
                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
              <span className="text-[12px] font-medium text-white/50 tracking-wide">Genie is thinking…</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* SUGGESTIONS */}
      {turns.length <= 1 && (
        <div className="px-6 pb-4 flex flex-wrap gap-2.5">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => sendMessage(s)}
              className="rounded-full border border-white/10 bg-[#111318] px-4 py-2 text-[12px] font-medium text-white/50 transition-all hover:border-white/20 hover:bg-white/5 hover:text-white/90 hover:-translate-y-0.5 shadow-sm"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* INPUT BAR */}
      <div className="p-6 pt-0">
        <div className="relative flex items-center bg-[#111318] border border-white/[0.08] rounded-2xl p-2 shadow-lg transition-all focus-within:border-white/20 focus-within:shadow-[0_0_15px_rgba(255,255,255,0.05)]">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Ask a read-only question in english... (e.g. what is the avg sales rate this quarter?)"
            aria-label="Ask a question about your data"
            className="flex-1 bg-transparent px-4 py-3 text-[14px] text-white/90 placeholder:text-white/30 focus:outline-none"
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim() || connectionId == null}
            className="shrink-0 flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-[13px] tracking-wide transition-all disabled:opacity-40"
            style={{
              background: loading || !input.trim() || connectionId == null
                ? "rgba(255,255,255,0.05)"
                : "linear-gradient(135deg,#6366f1,#8b5cf6)",
              color: loading || !input.trim() || connectionId == null ? "rgba(255,255,255,0.3)" : "white",
              boxShadow: loading || !input.trim() || connectionId == null ? "none" : "0 4px 15px -3px rgba(99, 102, 241, 0.4)",
            }}
          >
            {loading ? "Asking..." : "Ask Genie"}
          </button>
        </div>
      </div>
    </div>
  );
}
