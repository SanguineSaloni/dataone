"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Brand } from "@/components/Brand";
import { api, ApiError } from "@/lib/api";
import { auth } from "@/lib/auth";

const ENTRA_ENABLED = process.env.NEXT_PUBLIC_ENTRA_ENABLED === "true";
const DATABRICKS_MODE = process.env.NEXT_PUBLIC_DATABRICKS_MODE === "true";

const ENTRA_ERROR_MESSAGES: Record<string, string> = {
  no_account: "No DataOne account exists for that Microsoft identity. Contact your administrator.",
};

const DATABRICKS_ERROR_MESSAGES: Record<string, string> = {
  no_account: "No DataOne account exists for your Databricks user. Contact your administrator.",
  no_permissions: "You don't have the required Unity Catalog permissions.",
  oauth_not_configured: "Databricks OAuth is not configured. Please sign in with email and password below.",
  oauth_failed: "Databricks sign-in failed. Please try again or use email and password below.",
};

function RedirectListener({
  onError,
  onShowEmailForm,
}: {
  onError: (msg: string) => void;
  onShowEmailForm: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    const token = searchParams.get("entra_token") || searchParams.get("token");
    const entraError = searchParams.get("entra_error");
    const databricksError = searchParams.get("error");
    if (token) {
      auth.setToken(token);
      router.replace("/dashboard/connectors");
    } else if (entraError) {
      onError(ENTRA_ERROR_MESSAGES[entraError] ?? "Unable to sign in with Microsoft.");
    } else if (databricksError) {
      onError(DATABRICKS_ERROR_MESSAGES[databricksError] ?? "Unable to sign in with Databricks.");
      onShowEmailForm();
    }
  }, [searchParams, router, onError, onShowEmailForm]);
  return null;
}

// Floating node animation component
function FloatingNodes() {
  const nodes = [
    { x: 15, y: 20, size: 6, delay: 0, duration: 8 },
    { x: 75, y: 15, size: 4, delay: 1.5, duration: 10 },
    { x: 35, y: 65, size: 8, delay: 0.8, duration: 7 },
    { x: 80, y: 55, size: 5, delay: 2.2, duration: 9 },
    { x: 55, y: 80, size: 6, delay: 1, duration: 11 },
    { x: 20, y: 45, size: 4, delay: 3, duration: 8 },
    { x: 90, y: 30, size: 7, delay: 0.5, duration: 12 },
    { x: 45, y: 35, size: 5, delay: 2, duration: 9 },
    { x: 65, y: 70, size: 4, delay: 1.8, duration: 10 },
    { x: 10, y: 75, size: 6, delay: 2.5, duration: 8 },
  ];
  // Connection lines between some nodes
  const lines = [
    { x1: 15, y1: 20, x2: 35, y2: 65 },
    { x1: 35, y1: 65, x2: 55, y2: 80 },
    { x1: 75, y1: 15, x2: 80, y2: 55 },
    { x1: 45, y1: 35, x2: 65, y2: 70 },
    { x1: 20, y1: 45, x2: 45, y2: 35 },
    { x1: 80, y1: 55, x2: 65, y2: 70 },
  ];
  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs>
        <style>{`
          @keyframes float-node { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3%); } }
          @keyframes pulse-opacity { 0%,100% { opacity: 0.3; } 50% { opacity: 0.7; } }
          @keyframes dash-flow { to { stroke-dashoffset: -20; } }
        `}</style>
      </defs>
      {lines.map((l, i) => (
        <line
          key={i}
          x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
          stroke="rgba(129,140,248,0.2)"
          strokeWidth="0.3"
          strokeDasharray="2 2"
          style={{ animation: `dash-flow ${4 + i * 0.5}s linear infinite` }}
        />
      ))}
      {nodes.map((n, i) => (
        <circle
          key={i}
          cx={n.x} cy={n.y} r={n.size / 10}
          fill="rgba(129,140,248,0.15)"
          stroke="rgba(129,140,248,0.4)"
          strokeWidth="0.2"
          style={{
            animation: `pulse-opacity ${n.duration}s ${n.delay}s ease-in-out infinite, float-node ${n.duration}s ${n.delay}s ease-in-out infinite`,
          }}
        />
      ))}
    </svg>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionExpiredPending, setSessionExpiredPending] = useState<number | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(!DATABRICKS_MODE && !ENTRA_ENABLED);
  const router = useRouter();

  useEffect(() => {
    try {
      const raw = localStorage.getItem("dp_session_expired_with_pending");
      if (raw) {
        const count = Number(raw);
        if (Number.isFinite(count) && count > 0) setSessionExpiredPending(count);
        localStorage.removeItem("dp_session_expired_with_pending");
      }
    } catch { /* localStorage unavailable */ }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await auth.login(email, password);
      router.replace("/dashboard/connectors");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Unable to connect to the authentication service.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#09090b] font-sans text-white overflow-hidden">
      <Suspense fallback={null}>
        <RedirectListener onError={setError} onShowEmailForm={() => setShowEmailForm(true)} />
      </Suspense>

      {/* ── Left hero panel ── */}
      <div className="hidden lg:flex lg:w-[55%] relative flex-col justify-between p-10 overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#0a0a0a] to-[#000000]" />
        <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-white/5" />
        {/* Ambient glow orbs */}
        <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-white/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-white/5 rounded-full blur-[100px] pointer-events-none" />
        {/* Animated data nodes */}
        <div className="absolute inset-0 overflow-hidden">
          <FloatingNodes />
        </div>

        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)`,
            backgroundSize: "40px 40px",
          }}
        />

        {/* Brand */}
        <div className="relative z-10">
          <Link href="/signin" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-white to-gray-300 flex items-center justify-center shadow-lg shadow-white/10">
              <span className="text-black text-lg font-bold">D</span>
            </div>
            <div>
              <span className="text-xs text-white/50 tracking-widest uppercase font-medium">Veltris</span>
              <div className="text-white font-bold text-lg leading-none">DataOne</div>
            </div>
          </Link>
        </div>

        {/* Hero copy */}
        <div className="relative z-10 flex flex-col gap-6 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-white text-xs font-semibold w-fit">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            Powered by Databricks
          </div>
          <h1 className="text-4xl xl:text-5xl font-bold leading-tight text-white">
            Intelligent Data
            <span className="block bg-gradient-to-r from-white via-gray-300 to-gray-500 bg-clip-text text-transparent">
              Orchestration
            </span>
          </h1>
          <p className="text-white/60 leading-relaxed text-lg">
            Connect your sources, map schemas with AI precision, and trigger
            Databricks ingestion pipelines — all from one unified platform.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-3 mt-2">
            {[
              { icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>, label: "One-click Databricks trigger" },
              { icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>, label: "AI schema mapping" },
              { icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.956 11.956 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>, label: "Built-in data quality" },
              { icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>, label: "Live pipeline tracking" },
            ].map((f) => (
              <div
                key={f.label}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 text-sm"
              >
                <span>{f.icon}</span>
                <span>{f.label}</span>
              </div>
            ))}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-white/10">
            {[
              { value: "99.9%", label: "Uptime SLA" },
              { value: "10+", label: "Source connectors" },
              { value: "<1s", label: "Pipeline trigger" },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-2xl font-bold text-white">{s.value}</div>
                <div className="text-xs text-white/50 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-xs text-white/30">© 2026 Veltris / DataOne. All rights reserved.</p>
      </div>

      {/* ── Right sign-in panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative">
        {/* Subtle glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-white/5 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-sm flex flex-col gap-6 relative z-10">
          {/* Mobile brand */}
          <div className="lg:hidden flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-white to-gray-300 flex items-center justify-center">
              <span className="text-black font-bold">D</span>
            </div>
            <div>
              <div className="text-[10px] text-white/50 tracking-widest uppercase">Veltris</div>
              <div className="text-white font-bold">DataOne</div>
            </div>
          </div>

          {/* Heading */}
          <div>
            <h2 className="text-2xl font-bold text-white">Welcome back</h2>
            <p className="text-sm text-white/50 mt-1">Sign in to your DataOne workspace</p>
          </div>

          {/* Session expired banner */}
          {sessionExpiredPending !== null && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs flex items-start gap-2">
              <svg className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
              <span>Your session expired with {sessionExpiredPending} unsaved change{sessionExpiredPending === 1 ? "" : "s"}. Log back in and re-apply.</span>
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2">
              <svg className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
              <span>{error}</span>
            </div>
          )}

          {/* Databricks sign-in (primary) */}
          <div className="flex flex-col gap-3">
            <a
              id="databricks-signin-btn"
              href={`${api.base}/api/v1/auth/databricks/login`}
              className="w-full py-3.5 text-sm font-semibold text-white bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 backdrop-blur-md active:scale-[0.98] transition-all flex items-center justify-center gap-3"
            >
              <svg role="img" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-[#FF3621]">
                <path d="M12.012 0L.925 5.253v13.528l11.087 5.219 11.087-5.219V5.253zm0 2.22l8.816 4.148-8.816 4.148-8.816-4.148zm0 9.878l4.408-2.074 4.408 2.074-8.816 4.148-8.816-4.148 4.408-2.074zm0 5.485l4.408-2.074 4.408 2.074-8.816 4.148-8.816-4.148 4.408-2.074z"/>
              </svg>
              Sign in with Databricks
            </a>

            {ENTRA_ENABLED && (
              <a
                href={`${api.base}/api/v1/auth/entra/login`}
                className="w-full py-3 text-sm font-semibold text-white/90 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all flex items-center justify-center gap-2"
              >
                <span><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z"/></svg></span> Sign in with Microsoft
              </a>
            )}
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <span className="flex-1 h-px bg-white/10" />
            <button
              type="button"
              onClick={() => setShowEmailForm((v) => !v)}
              className="text-xs text-white/40 hover:text-white/60 transition-colors flex items-center gap-1"
            >
              {showEmailForm ? "hide" : "continue with email"}
            </button>
            <span className="flex-1 h-px bg-white/10" />
          </div>

          {/* Email form */}
          {showEmailForm && (
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-white/50">Email Address</label>
                <input
                  id="email-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  required
                  className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-white/40 transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-white/50">Password</label>
                <input
                  id="password-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-white/40 transition-colors"
                />
              </div>
              <button
                id="email-signin-btn"
                type="submit"
                disabled={loading}
                className="w-full py-3 text-sm font-semibold bg-white text-black hover:bg-gray-200 disabled:opacity-50 rounded-xl transition-all shadow-md shadow-white/10"
              >
                {loading ? "Signing in…" : "Sign In"}
              </button>
            </form>
          )}

          <p className="text-xs text-white/30 text-center">
            Access is managed by your DataOne administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
