"use client";
import { useEffect, useRef, useState } from "react";
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

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [turns]);

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
      const data = await api.post<AskDataAskResponse>("/api/v1/askdata/ask", {
        connection_id: connectionId,
        question,
        session_id: sessionId,
      });
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
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-border bg-glass-bg px-4 py-3 backdrop-blur-sm">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-sm text-accent" aria-hidden="true">✦</span>
            AskData
          </h2>
          <p className="ml-10 text-xs text-fg-subtle">Grounded, transparent SQL with read-only execution.</p>
        </div>
        <div className="flex items-center gap-2">
          {sessionId && (
            <button
              type="button"
              onClick={startNewChat}
              className="rounded-lg border border-border-strong bg-surface-overlay px-3 py-1.5 text-xs font-semibold text-fg-subtle hover:border-accent/30 hover:text-accent"
            >
              + New chat
            </button>
          )}
          <ConnectionPicker connections={connections} value={connectionId} onChange={setConnectionId} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {turns.map((turn, i) => (
          <div key={i}>
            <ChatBubble turn={turn} connectionId={connectionId} onEditInSql={onEditInSql} />
            {turn.response?.plan_id != null && (
              <div className="flex justify-start">
                <div className="max-w-[80%] w-full">
                  <SchemaDesignPlanCard planId={turn.response.plan_id} />
                </div>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-surface-elevated border border-border rounded-2xl px-4 py-3 flex items-center gap-2">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
              <span className="text-xs text-fg-subtle">Thinking…</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {turns.length <= 1 && (
        <div className="px-4 pb-2 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => sendMessage(s)}
              className="rounded-full border border-border bg-surface-overlay px-3 py-1.5 text-[11px] text-fg-muted transition-all hover:border-accent/30 hover:bg-accent-soft hover:text-accent"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-border bg-glass-bg-strong p-4 backdrop-blur-xl">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Ask about your data…"
            aria-label="Ask a question about your data"
            className="flex-1 rounded-xl border border-border-strong bg-surface-overlay px-4 py-2.5 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim() || connectionId == null}
            className="workspace-primary-action px-5 py-2.5"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
