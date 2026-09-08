import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ImpactAnalysisPage from "../page";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get: getMock } }));

function makeImpact(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    connection_id: 1,
    connection_name: "Prod DB",
    table: "users",
    column: "email",
    upstream: [],
    downstream: [{ mapping_id: 1, mapping_name: "Users to Customers", target_table: "customers", target_column: "contact_email" }],
    affected_pipelines: [{ pipeline_id: 1, pipeline_name: "Nightly Sync" }],
    affected_metrics: [],
    affected_reports: [],
    affected_ml_models: [],
    is_pii: true,
    risk_score: 40,
    risk_score_explanation: "2 declared consumer(s), 1 pipeline(s), touches PII",
    ...overrides,
  };
}

function mockRoutes({ impact = makeImpact() }: { impact?: Record<string, unknown> } = {}) {
  getMock.mockImplementation((path: string) => {
    if (path.includes("/connectors/")) return Promise.resolve([{ id: 1, name: "Prod DB" }]);
    if (path.includes("/catalog/")) {
      return Promise.resolve({
        tables: [{ table_name: "users", columns: [{ column_name: "email" }, { column_name: "id" }] }],
      });
    }
    if (path.includes("/impact")) return Promise.resolve(impact);
    return Promise.resolve(null);
  });
}

describe("ImpactAnalysisPage", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it("prompts for a table selection before any connection/table is picked", async () => {
    mockRoutes();
    render(<ImpactAnalysisPage />);
    await waitFor(() => expect(screen.getByText("Select a table")).toBeInTheDocument());
  });

  it("renders downstream, affected pipelines, risk score, and a PII badge once a table is selected", async () => {
    mockRoutes();
    render(<ImpactAnalysisPage />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Connection" }), { target: { value: "1" } });
    fireEvent.change(await screen.findByRole("combobox", { name: "Table" }), { target: { value: "users" } });

    await waitFor(() => expect(screen.getByText("Nightly Sync")).toBeInTheDocument());
    expect(screen.getByText("customers.contact_email")).toBeInTheDocument();
    expect(screen.getByText("PII")).toBeInTheDocument();
    expect(screen.getByText(/2 declared consumer/)).toBeInTheDocument();
  });

  it("re-queries when a specific column is selected", async () => {
    mockRoutes();
    render(<ImpactAnalysisPage />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Connection" }), { target: { value: "1" } });
    fireEvent.change(await screen.findByRole("combobox", { name: "Table" }), { target: { value: "users" } });
    await waitFor(() => expect(screen.getByText("Nightly Sync")).toBeInTheDocument());

    fireEvent.change(screen.getByRole("combobox", { name: "Column (optional)" }), { target: { value: "email" } });
    await waitFor(() => expect(getMock).toHaveBeenCalledWith(
      expect.stringContaining("column=email"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ));
  });

  it("shows honest empty states for unmapped columns instead of fabricating impact", async () => {
    mockRoutes({ impact: makeImpact({ downstream: [], affected_pipelines: [], is_pii: false, risk_score: 0, risk_score_explanation: "0 declared consumer(s)" }) });
    render(<ImpactAnalysisPage />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Connection" }), { target: { value: "1" } });
    fireEvent.change(await screen.findByRole("combobox", { name: "Table" }), { target: { value: "users" } });

    await waitFor(() => expect(screen.getByText("No declared downstream mapping.")).toBeInTheDocument());
    expect(screen.queryByText("PII")).not.toBeInTheDocument();
  });

  it("shows an error state when the impact query fails", async () => {
    getMock.mockImplementation((path: string) => {
      if (path.includes("/connectors/")) return Promise.resolve([{ id: 1, name: "Prod DB" }]);
      if (path.includes("/catalog/")) return Promise.resolve({ tables: [{ table_name: "users", columns: [] }] });
      if (path.includes("/impact")) return Promise.reject(new Error("traversal failed"));
      return Promise.resolve(null);
    });
    render(<ImpactAnalysisPage />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Connection" }), { target: { value: "1" } });
    fireEvent.change(await screen.findByRole("combobox", { name: "Table" }), { target: { value: "users" } });
    await waitFor(() => expect(screen.getByText("traversal failed")).toBeInTheDocument());
  });
});
