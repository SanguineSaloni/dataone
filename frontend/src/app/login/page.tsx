"use client";

/**
 * Login page — theme_redesign_tasks #3
 * --------------------------------------------------------------
 * Two-column layout at md+ (left: copy + Unsplash illustration;
 * right: form card). Single column on mobile. All zinc-* classes
 * swapped for semantic tokens defined in app/globals.css
 * (#theme_foundation). The mapper_tasks #5 flag-bearer comment
 * below MUST stay intact — it explains how the session-expired
 * banner is hydrated across a redirect.
 */

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Brand } from "@/components/Brand";
import { api, ApiError } from "@/lib/api";
import { auth } from "@/lib/auth";
import { ThemeToggle } from "@/lib/theme";

const ENTRA_ENABLED = process.env.NEXT_PUBLIC_ENTRA_ENABLED === "true";
const DATABRICKS_MODE = process.env.NEXT_PUBLIC_DATABRICKS_MODE === "true";

const ENTRA_ERROR_MESSAGES: Record<string, string> = {
  no_account: "No DataOne account exists for that Microsoft identity. Contact your administrator.",
};
const ENTRA_ERROR_FALLBACK = "Unable to sign in with Microsoft. Please try again.";

const DATABRICKS_ERROR_MESSAGES: Record<string, string> = {
  no_account: "No DataOne account exists for your Databricks user. Contact your administrator.",
  no_permissions: "You don't have the required Unity Catalog permissions.",
  oauth_not_configured: "Databricks OAuth is not configured on this server. Please sign in with your email and password below.",
  oauth_failed: "Databricks sign-in failed. Please try again or use your email and password below.",
};
const DATABRICKS_ERROR_FALLBACK = "Unable to sign in with Databricks. Please try again.";

// Isolated so only this invisible leaf (not the whole statically-exported
// form) depends on useSearchParams — keeping it out of the page body avoids
// forcing the entire login page behind a client-only Suspense boundary.
function EntraRedirectListener({
  onError,
  onShowEmailForm,
}: {
  onError: (message: string) => void;
  onShowEmailForm: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Completes the Microsoft Entra redirect round trip: the backend appends
  // ?entra_token=... on success or ?entra_error=... on rejection (e.g. no
  // matching DataOne account — Entra login never auto-creates one).
  // Also handles Databricks OAuth: ?token=... on success or ?error=... on failure
  useEffect(() => {
    const token = searchParams.get("entra_token") || searchParams.get("token");
    const entraError = searchParams.get("entra_error");
    const databricksError = searchParams.get("error");
    
    if (token) {
      auth.setToken(token);
      router.replace("/dashboard");
    } else if (entraError) {
      onError(ENTRA_ERROR_MESSAGES[entraError] ?? ENTRA_ERROR_FALLBACK);
    } else if (databricksError) {
      onError(DATABRICKS_ERROR_MESSAGES[databricksError] ?? DATABRICKS_ERROR_FALLBACK);
      // Auto-show the email form so the user can log in with password right away
      onShowEmailForm();
    }
  }, [searchParams, router, onError, onShowEmailForm]);


  return null;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionExpiredPending, setSessionExpiredPending] = useState<number | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(!DATABRICKS_MODE && !ENTRA_ENABLED);
  const router = useRouter();

  // mapper_tasks #5 completeness fix: this flag is set by useMapping's 401
  // handler when the session expired with unsaved edits queued. The toast
  // shown at that moment can be lost if the page unloads before it paints;
  // this banner is the durable signal that survives the redirect. Read
  // once on mount and clear immediately so it doesn't reappear on a later
  // visit to /login.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("dp_session_expired_with_pending");
      if (raw) {
        const count = Number(raw);
        if (Number.isFinite(count) && count > 0) setSessionExpiredPending(count);
        localStorage.removeItem("dp_session_expired_with_pending");
      }
    } catch {
      // localStorage may be unavailable (private mode etc.) — no banner.
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await auth.login(email, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to connect to the authentication service.",
      );
    } finally {
      setLoading(false);
    }
  };

  /**
   * Native Databricks Apps login.
   * Calls /api/v1/auth/databricks/app-login which reads the
   * X-Forwarded-Email / X-Forwarded-Access-Token headers that the
   * Databricks Apps platform injects — no OAuth client credentials needed.
   */
  const handleDatabricksLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${api.base}/api/v1/auth/databricks/app-login`, {
        method: "GET",
        headers: { "Accept": "application/json" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || "Databricks sign-in failed.");
      }
      const data = await res.json();
      auth.setToken(data.access_token);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Databricks sign-in failed.");
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="flex min-h-screen bg-background font-sans text-fg">
      <Suspense fallback={null}>
        <EntraRedirectListener onError={setError} onShowEmailForm={() => setShowEmailForm(true)} />
      </Suspense>

      {/* ─────────────────────────── Left column (md+) ─────────────────────────── */}
      <aside className="hidden md:flex md:w-1/2 relative overflow-hidden flex-col justify-between p-10 bg-gradient-to-br from-blue-600 via-indigo-700 to-violet-800 text-white">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-violet-400/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative">
          <Link href="/" aria-label="DataOne home">
            <Brand inverse />
          </Link>
        </div>

        <div className="relative flex flex-col gap-6 max-w-md">
          <h2 className="text-3xl font-bold leading-tight">
            Intelligent data engineering, on autopilot.
          </h2>
          <p className="text-blue-100 leading-relaxed">
            Sign in to manage connectors, design visual pipelines, and let AI
            propose SQL transformations — all while PII stays inside your perimeter.
          </p>

          <div className="relative mt-2">
            <img
              src="https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=1000&q=70"
              alt=""
              loading="lazy"
              className="rounded-2xl border border-white/20 shadow-2xl w-full h-auto"
            />
          </div>

          <div className="flex items-center gap-4 text-xs text-blue-100 mt-2">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" /> SOC 2 ready
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" /> Private inference
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" /> Audit trail
            </span>
          </div>
        </div>

        <p className="relative text-xs text-blue-200/70">
          © 2026 DataOne. All rights reserved.
        </p>
      </aside>

      {/* ─────────────────────────── Right column (form) ─────────────────────────── */}
      <main className="flex-1 flex flex-col">
        {/* Top bar with back link + theme toggle */}
        <div className="flex items-center justify-between p-6">
          <Link
            href="/"
            className="text-xs text-fg-muted hover:text-fg transition-colors flex items-center gap-1"
          >
            ← Back to home
          </Link>
          <ThemeToggle />
        </div>

        <div className="flex-1 flex items-center justify-center px-6 pb-12 relative">
          {/* Soft background glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-accent-soft rounded-full blur-3xl -z-10 pointer-events-none" />

          <div className="w-full max-w-sm flex flex-col items-stretch">
            {/* Mobile-only brand mark */}
            <div className="md:hidden text-center mb-6">
              <Link href="/" className="inline-flex" aria-label="DataOne home">
                <Brand />
              </Link>
            </div>

            <div className="flex flex-col gap-1.5 mb-6">
              <h1 className="text-2xl font-bold text-fg">Welcome back</h1>
              <p className="text-sm text-fg-muted">
                Enter your credentials to continue.
              </p>
            </div>

            {sessionExpiredPending !== null && (
              <div className="w-full p-3 mb-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs flex items-start gap-2">
                <span className="text-base leading-none">⚠️</span>
                <span>
                  Your session expired with {sessionExpiredPending} unsaved change
                  {sessionExpiredPending === 1 ? "" : "s"}. Log back in and re-apply it.
                </span>
              </div>
            )}

            {error && (
              <div className="w-full p-3 mb-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400 text-xs flex items-start gap-2">
                <span className="text-base leading-none">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {DATABRICKS_MODE && (
              <button
                type="button"
                onClick={handleDatabricksLogin}
                disabled={loading}
                className="w-full py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-red-600 to-orange-500 rounded-xl hover:opacity-90 transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? "Signing in…" : "🧱 Sign in with Databricks"}
              </button>
            )}

            {ENTRA_ENABLED && (
              <a
                href={`${api.base}/api/v1/auth/entra/login`}
                className="w-full py-2.5 text-sm font-semibold text-accent-fg bg-accent rounded-xl hover:opacity-90 transition-all shadow-md flex items-center justify-center gap-2"
              >
                Sign in with Microsoft
              </a>
            )}

            {(DATABRICKS_MODE || ENTRA_ENABLED) && !showEmailForm && (
              <button
                type="button"
                onClick={() => setShowEmailForm(true)}
                className="mt-4 text-xs text-fg-muted hover:text-fg text-center underline underline-offset-2 transition-colors"
              >
                Sign in with a different email
              </button>
            )}

            {showEmailForm && (
              <>
                {(DATABRICKS_MODE || ENTRA_ENABLED) && (
                  <div className="flex items-center gap-3 my-4 text-xs text-fg-subtle">
                    <span className="flex-1 h-px bg-border" />
                    or
                    <span className="flex-1 h-px bg-border" />
                  </div>
                )}

                <form onSubmit={handleLogin} className="w-full flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-fg-muted">Email Address</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="px-4 py-2.5 rounded-xl bg-surface-elevated border border-border text-sm focus:outline-none focus:border-accent transition-colors text-fg placeholder:text-fg-subtle"
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-fg-muted">Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="px-4 py-2.5 rounded-xl bg-surface-elevated border border-border text-sm focus:outline-none focus:border-accent transition-colors text-fg placeholder:text-fg-subtle"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full mt-2 py-2.5 text-sm font-semibold text-accent-fg bg-accent rounded-xl hover:opacity-90 transition-all shadow-md flex items-center justify-center disabled:opacity-60"
                  >
                    {loading ? "Signing in…" : "Sign In"}
                  </button>
                </form>
              </>
            )}

            <p className="mt-6 text-xs text-fg-muted text-center">
              Access is managed by your DataOne administrator.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
