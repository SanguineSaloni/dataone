import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardLayout, { activeNavItemId } from "../layout";

const { getMock, replaceMock, logoutMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  replaceMock: vi.fn(),
  logoutMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock("@/lib/api", () => ({ api: { get: getMock } }));
vi.mock("@/lib/auth", () => ({
  auth: {
    hasSession: () => true,
    currentUser: async () => ({ email: "admin@dataplane.ai", role: "admin" }),
    logout: logoutMock,
  },
}));
vi.mock("@/components/Brand", () => ({ Brand: () => <span>Brand</span> }));
vi.mock("@/lib/theme", () => ({ ThemeToggle: () => <button>Theme</button> }));

describe("DashboardLayout", () => {
  beforeEach(() => {
    getMock.mockReset();
    replaceMock.mockReset();
    logoutMock.mockReset();
    getMock.mockImplementation((path: string) => {
      if (path.includes("/governance/score")) return Promise.resolve({ score: 74 });
      return Promise.resolve([{ id: 1 }]);
    });
  });

  it("renders only real route links and does not probe an unavailable notification API", async () => {
    render(<DashboardLayout><div>Page body</div></DashboardLayout>);

    await waitFor(() => expect(screen.getByText("Page body")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Data Visualization" })).toHaveAttribute(
      "href",
      "/dashboard/visualize",
    );
    expect(screen.getByRole("link", { name: "Topology & Lineage" })).toHaveAttribute(
      "href",
      "/dashboard/visualize/topology",
    );
    expect(screen.getByRole("link", { name: "Impact Analysis" })).toHaveAttribute(
      "href",
      "/dashboard/impact",
    );
    expect(screen.getByRole("link", { name: "Query Workspace" })).toHaveAttribute(
      "href",
      "/dashboard/query-workspace",
    );
    expect(screen.queryByRole("link", { name: "Ask Data" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Query Studio" })).not.toBeInTheDocument();
    // Built in E06 (Data Quality Observatory) — no longer an unbuilt route.
    expect(screen.getByRole("link", { name: "Data Quality" })).toHaveAttribute(
      "href",
      "/dashboard/data-quality",
    );
    // Built in E08 (Governance Intelligence Center).
    expect(screen.getByRole("link", { name: "Governance" })).toHaveAttribute(
      "href",
      "/dashboard/governance",
    );
    expect(document.querySelector('a[href="#"]')).not.toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith("/api/v1/connectors/");
  });

  it("shows the real governance score gauge once E08's endpoint responds (E01-8)", async () => {
    render(<DashboardLayout><div>Page body</div></DashboardLayout>);
    await waitFor(() => expect(screen.getByText("Page body")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByLabelText("Governance coverage score: 74%")).toBeInTheDocument());
  });

  it("wires header search and assistant affordances", async () => {
    render(<DashboardLayout><div>Page body</div></DashboardLayout>);
    await waitFor(() => expect(screen.getByText("Page body")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: "Search connections, tables, and columns" }))
      .toBeInTheDocument();
    // E09: the copilot panel replaced the old nav-away link to Query Workspace.
    expect(screen.getByRole("button", { name: "Open AI Copilot" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Environment" })).toHaveValue("dev");
  });

  it("logs out and returns to login", async () => {
    render(<DashboardLayout><div>Page body</div></DashboardLayout>);
    await waitFor(() => expect(screen.getByText("Page body")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Log Out" }));
    expect(logoutMock).toHaveBeenCalledOnce();
    expect(replaceMock).toHaveBeenCalledWith("/login");
  });

  it("exposes aria-expanded/aria-controls on collapsible nav groups (E01-11)", async () => {
    render(<DashboardLayout><div>Page body</div></DashboardLayout>);
    await waitFor(() => expect(screen.getByText("Page body")).toBeInTheDocument());

    const groupToggle = screen.getByRole("button", { name: "Topology & Lineage" });
    expect(groupToggle).toHaveAttribute("aria-expanded", "true");
    const controlsId = groupToggle.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();
    expect(document.getElementById(controlsId as string)).toContainElement(
      screen.getByRole("link", { name: "Data Visualization" }),
    );

    fireEvent.click(groupToggle);
    expect(groupToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Data Visualization" })).not.toBeInTheDocument();
  });

  it("selects only the most specific navigation route", () => {
    expect(activeNavItemId("/dashboard/visualize")).toBe("visualize");
    expect(activeNavItemId("/dashboard/visualize/topology")).toBe("topology");
  });

  it("exposes aria-expanded on the sidebar collapse toggle (E01-11)", async () => {
    render(<DashboardLayout><div>Page body</div></DashboardLayout>);
    await waitFor(() => expect(screen.getByText("Page body")).toBeInTheDocument());

    const collapseToggle = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(collapseToggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(collapseToggle);
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toHaveAttribute("aria-expanded", "false");
  });
});
