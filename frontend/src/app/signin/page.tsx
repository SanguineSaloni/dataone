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
        <div className="absolute inset-0 bg-gradient-to-br from-[#0f0f1a] via-[#0d0d1f] to-[#09090b]" />
        <div className="absolute inset-0 bg-gradient-to-tr from-indigo-900/20 via-transparent to-violet-900/10" />
        {/* Ambient glow orbs */}
        <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-violet-600/10 rounded-full blur-[100px] pointer-events-none" />
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
          <Link href="/login" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <span className="text-white text-lg font-bold">D</span>
            </div>
            <div>
              <span className="text-xs text-white/50 tracking-widest uppercase font-medium">Veltris</span>
              <div className="text-white font-bold text-lg leading-none">DataOne</div>
            </div>
          </Link>
        </div>

        {/* Hero copy */}
        <div className="relative z-10 flex flex-col gap-6 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold w-fit">
            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
            Powered by Databricks
          </div>
          <h1 className="text-4xl xl:text-5xl font-bold leading-tight text-white">
            Intelligent Data
            <span className="block bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent">
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
              { icon: "⚡", label: "One-click Databricks trigger" },
              { icon: "🧠", label: "AI schema mapping" },
              { icon: "🛡", label: "Built-in data quality" },
              { icon: "📊", label: "Live pipeline tracking" },
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
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/5 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-sm flex flex-col gap-6 relative z-10">
          {/* Mobile brand */}
          <div className="lg:hidden flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <span className="text-white font-bold">D</span>
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
              <span className="text-base">⚠️</span>
              <span>Your session expired with {sessionExpiredPending} unsaved change{sessionExpiredPending === 1 ? "" : "s"}. Log back in and re-apply.</span>
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2">
              <span className="text-base">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Databricks sign-in (primary) */}
          <div className="flex flex-col gap-3">
            <a
              id="databricks-signin-btn"
              href={`${api.base}/api/v1/auth/databricks/login`}
              className="w-full py-3.5 text-sm font-semibold text-white bg-gradient-to-r from-red-600 to-orange-500 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all shadow-lg shadow-red-900/30 flex items-center justify-center gap-3"
            >
              <span className="text-lg">🧱</span>
              Sign in with Databricks
            </a>

            {ENTRA_ENABLED && (
              <a
                href={`${api.base}/api/v1/auth/entra/login`}
                className="w-full py-3 text-sm font-semibold text-white/90 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all flex items-center justify-center gap-2"
              >
                <span>🪟</span> Sign in with Microsoft
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
                  className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-indigo-500/60 transition-colors"
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
                  className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-indigo-500/60 transition-colors"
                />
              </div>
              <button
                id="email-signin-btn"
                type="submit"
                disabled={loading}
                className="w-full py-3 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl transition-all shadow-md shadow-indigo-900/40"
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
