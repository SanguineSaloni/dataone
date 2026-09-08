"use client";

/**
 * Enterprise v2 — E01-3/E01-4 Enterprise Shell
 * --------------------------------------------------------------
 * Premium dark-glassmorphism dashboard chrome.
 *
 * Top header slots expose real capabilities only. Features whose backing
 * services do not exist yet are presented as non-interactive pending states.
 *
 * Left nav follows the vision IA and only renders items backed by real routes.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Brand } from "@/components/Brand";
import { api } from "@/lib/api";
import { auth, type AuthUser } from "@/lib/auth";
import { ThemeToggle } from "@/lib/theme";
import { Badge } from "./components/Badge";
import { Gauge } from "./components/Gauge";
import CopilotPanel from "./components/CopilotPanel";
import GlobalSearchPalette from "./components/GlobalSearchPalette";
import NotificationCenter from "./components/NotificationCenter";
import { KpiNotAvailable } from "./components/StateViews";

/* ─── Navigation items (vision IA — E01-4) ─── */
interface NavItem {
  id: string;
  label: string;
  icon: string;
  href: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: "📊", href: "/dashboard" },
  // Topology & Lineage
  { id: "topology", label: "Topology & Lineage", icon: "🕸️", href: "/dashboard/visualize/topology" },
  { id: "visualize", label: "Data Visualization", icon: "📈", href: "/dashboard/visualize" },
  { id: "impact", label: "Impact Analysis", icon: "📡", href: "/dashboard/impact" },
  // Schema Intelligence
  { id: "schema", label: "Schema Intel", icon: "🧠", href: "/dashboard/schema" },
  { id: "schema-mapper", label: "Schema Mapper", icon: "🗺️", href: "/dashboard/schema-mapper" },
  { id: "schema-comparison", label: "Schema Comparison", icon: "🔀", href: "/dashboard/schema-comparison" },
  { id: "semantic", label: "Semantic / Metrics", icon: "📐", href: "/dashboard/semantic" },
  { id: "data-quality", label: "Data Quality", icon: "🧪", href: "/dashboard/data-quality" },
  // Governance & Compliance
  { id: "governance", label: "Governance", icon: "📜", href: "/dashboard/governance" },
  { id: "risks", label: "Risk & Compliance", icon: "🛡️", href: "/dashboard/risks" },
  { id: "security", label: "Security", icon: "🔒", href: "/dashboard/security" },
  { id: "audit", label: "Audit Trail", icon: "📋", href: "/dashboard/audit" },
  // AI & Automation
  { id: "query-workspace", label: "Query Workspace", icon: "💬", href: "/dashboard/query-workspace" },
  { id: "autopilot", label: "AI Autopilot", icon: "⚙️", href: "/dashboard/autopilot" },
  // Operations
  { id: "pipelines", label: "Pipelines", icon: "🔗", href: "/dashboard/pipelines" },
  { id: "integrations", label: "Integrations", icon: "🧩", href: "/dashboard/integrations" },
  { id: "connectors", label: "Connectors", icon: "🔌", href: "/dashboard/connectors" },
];

/* ─── Sub-groups for collapsible nav sections ─── */
const NAV_GROUPS = [
  { label: "Overview", items: ["dashboard"] },
  { label: "Topology & Lineage", items: ["topology", "visualize", "impact"] },
  { label: "Schema Intelligence", items: ["schema", "schema-mapper", "schema-comparison", "semantic", "data-quality"] },
  { label: "Governance & Compliance", items: ["governance", "risks", "security", "audit"] },
  { label: "AI & Automation", items: ["query-workspace", "autopilot"] },
  { label: "Operations", items: ["pipelines", "integrations", "connectors"] },
];

/* ─── Helper: get icon for an item id ─── */
function itemIcon(id: string): string {
  return NAV_ITEMS.find((i) => i.id === id)?.icon ?? "📄";
}
function itemHref(id: string): string {
  return NAV_ITEMS.find((i) => i.id === id)?.href ?? "/dashboard";
}

export function activeNavItemId(pathname: string): string | undefined {
  return NAV_ITEMS
    .filter((item) => pathname === item.href || pathname.startsWith(item.href + "/"))
    .sort((left, right) => right.href.length - left.href.length)[0]?.id;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [connections, setConnections] = useState<Array<{ environment?: string }>>([]);
  const [governanceScore, setGovernanceScore] = useState<number | null>(null);
  const [environment, setEnvironment] = useState("dev");
  const [authError, setAuthError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const validateSession = useCallback(async () => {
    if (!auth.hasSession()) {
      router.replace("/login");
      return;
    }
    try {
      const currentUser = await auth.currentUser();
      setUser(currentUser);
      // Fetch connections count
      api
        .get<unknown[]>("/api/v1/connectors/")
        .then((rows) => setConnections(rows as Array<{ environment?: string }>))
        .catch(() => setConnections([]));
      // Governance health score (E01-8, now backed by E08's real endpoint).
      api
        .get<{ score: number }>("/api/v1/governance/score")
        .then((data) => setGovernanceScore(data.score))
        .catch(() => setGovernanceScore(null));
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Unable to validate your session.");
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => void validateSession(), 0);
    return () => window.clearTimeout(timer);
  }, [validateSession]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = localStorage.getItem("dataone_environment");
      if (saved && ["dev", "qa", "uat", "prod"].includes(saved)) setEnvironment(saved);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const activeNavId = activeNavItemId(pathname);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-fg">
        {authError ? (
          <div className="max-w-sm rounded-2xl glass-strong p-6 text-center">
            <p className="text-sm text-red-500">{authError}</p>
            <button onClick={() => { setAuthError(""); void validateSession(); }} className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg">
              Retry authentication
            </button>
          </div>
        ) : (
          <p className="text-sm text-fg-muted">Validating your DataOne session…</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-background font-sans text-fg overflow-hidden">
      {/* ─────────────────────────── Sidebar ─────────────────────────── */}
      <aside
        className={[
          "flex flex-col border-r border-border transition-all duration-300",
          sidebarCollapsed ? "w-16" : "w-[var(--sidebar-width)]",
        ].join(" ")}
      >
        {/* Brand */}
        <div className={[
          "p-4 border-b border-border flex items-center gap-3",
          sidebarCollapsed ? "justify-center" : "px-5 py-4",
        ].join(" ")}>
          <Link href="/dashboard" aria-label="DataOne dashboard" className="flex items-center gap-3 min-w-0">
            <Brand compact showWordmark={!sidebarCollapsed} />
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg truncate">DataOne</p>
                <p className="text-[10px] text-fg-subtle truncate">Enterprise</p>
              </div>
            )}
          </Link>
        </div>

        {/* Collapse toggle */}
        <button
          type="button"
          onClick={() => setSidebarCollapsed((c) => !c)}
          className="flex items-center justify-center h-8 text-xs text-fg-subtle hover:text-fg-muted border-b border-border transition-colors"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!sidebarCollapsed}
        >
          <span aria-hidden="true">{sidebarCollapsed ? "▶" : "◀"}</span>
        </button>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {NAV_GROUPS.map((group) => {
            const isCollapsed = collapsedGroups.has(group.label);
            return (
              <div key={group.label}>
                {/* Group header */}
                {!sidebarCollapsed && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.label)}
                    aria-expanded={!isCollapsed}
                    aria-controls={`nav-group-${group.label.replace(/\s+/g, "-").toLowerCase()}`}
                    className="flex items-center justify-between w-full px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle hover:text-fg-muted transition-colors"
                  >
                    <span>{group.label}</span>
                    <span className="text-[8px]" aria-hidden="true">{isCollapsed ? "▸" : "▾"}</span>
                  </button>
                )}
                {!isCollapsed && (
                  <div id={`nav-group-${group.label.replace(/\s+/g, "-").toLowerCase()}`} className="space-y-0.5">
                    {group.items.map((itemId) => {
                      const href = itemHref(itemId);
                      const active = activeNavId === itemId;
                      return (
                        <div key={itemId} className="relative">
                          <Link
                            href={href}
                            className={[
                              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                              sidebarCollapsed ? "justify-center px-2" : "",
                              active
                                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30"
                                : "text-fg-muted hover:bg-surface-overlay hover:text-fg border border-transparent",
                            ].join(" ")}
                          >
                            <span className="text-base flex-shrink-0" aria-hidden="true">{itemIcon(itemId)}</span>
                            {!sidebarCollapsed && (
                              <>
                                <span className="truncate">{NAV_ITEMS.find(i => i.id === itemId)?.label}</span>
                                {itemId === "query-workspace" && (
                                  <span className="ml-auto w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse flex-shrink-0" />
                                )}
                              </>
                            )}
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* User section */}
        <div className="p-3 border-t border-border">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2 text-xs text-fg-muted px-2 py-1.5 mb-1">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse flex-shrink-0" />
              <span className="truncate" title={user.email}>{user.email}</span>
            </div>
          )}
          <button
            onClick={() => {
              auth.logout();
              router.replace("/login");
            }}
            className={[
              "w-full py-2 hover:bg-surface-overlay rounded-xl text-xs text-fg-muted font-medium border border-transparent hover:border-border-strong transition-all flex items-center justify-center gap-2",
              sidebarCollapsed ? "px-0" : "",
            ].join(" ")}
            title="Log Out"
            aria-label="Log Out"
          >
            {sidebarCollapsed ? "🚪" : "🚪 Log Out"}
          </button>
        </div>
      </aside>

      {/* ─────────────────────────── Main column ─────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* ─── Enterprise header (E01-3) ─── */}
        <header className="glass sticky top-0 z-10 flex-shrink-0">
          <div className="flex items-center justify-between h-[var(--header-height)] px-4 md:px-6">
            {/* Left: page breadcrumb */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-fg-subtle hidden sm:inline">DataOne</span>
                <span className="text-fg-subtle hidden sm:inline">/</span>
                <span className="font-semibold text-fg truncate max-w-[200px]">
                  {NAV_ITEMS.find((item) => item.id === activeNavId)?.label || "Dashboard"}
                </span>
              </div>
            </div>

            {/* Right: header control slots */}
            <div className="flex items-center gap-2 md:gap-3">
              <GlobalSearchPalette />

              <label className="hidden xl:flex items-center gap-1.5 rounded-xl border border-border bg-surface-overlay px-2.5 py-1.5 text-xs text-fg-muted">
                <span aria-hidden="true">🌐</span>
                <span className="sr-only">Environment</span>
                <select value={environment} onChange={(event) => { setEnvironment(event.target.value); localStorage.setItem("dataone_environment", event.target.value); }} className="bg-transparent uppercase rounded">
                  <option value="dev">Dev</option><option value="qa">QA</option><option value="uat">UAT</option><option value="prod">Prod</option>
                </select>
              </label>

              {/* Connections count */}
              {connections.length > 0 && (
                <Badge variant="success" size="md" dot>
                  {connections.filter((connection) => (connection.environment ?? "dev") === environment).length} connections
                </Badge>
              )}

              {/* Governance health score (E01-8), backed by E08's real coverage score */}
              <div className="hidden lg:flex items-end gap-1.5" title="Governance coverage score">
                {governanceScore === null ? (
                  <KpiNotAvailable label="Governance" reason="Pending" />
                ) : (
                  <Link href="/dashboard/governance" className="flex items-end gap-1.5" aria-label={`Governance coverage score: ${governanceScore}%`}>
                    <Gauge value={governanceScore} size="sm" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">Gov</span>
                  </Link>
                )}
              </div>

              {/* E09: persistent copilot panel, available on every page — routes
                  through AskData's existing intent gate (read_query /
                  schema_design / external_action / platform_insight), so the
                  full Query Workspace remains available for deeper follow-up. */}
              <CopilotPanel />

              <NotificationCenter />

              {/* Identity display; workspace switching waits for E01-10. */}
              <div
                className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-surface-overlay transition-colors"
                aria-label={`Signed in as ${user.email}`}
              >
                <div className="w-7 h-7 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold">
                  {user.email.charAt(0).toUpperCase()}
                </div>
                <span className="hidden lg:inline text-sm text-fg-muted max-w-[100px] truncate">
                  {user.email.split("@")[0]}
                </span>
              </div>

              {/* Theme toggle */}
              <ThemeToggle />
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
