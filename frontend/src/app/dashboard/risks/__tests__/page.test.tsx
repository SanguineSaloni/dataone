import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RiskComplianceCenterPage from "../page";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get: getMock } }));

function makeRegister(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    total: 1,
    findings: [{
      id: "abc123",
      category: "pii_exposure",
      severity: "critical",
      title: "PII data in users.email",
      description: "Classified as PII (High sensitivity, 95% confidence, via value_pattern).",
      root_cause: "Column matched a value pattern PII/sensitivity signal.",
      impact: "Exposed to any role with read access to this connection unless masked.",
      remediation: "Confirm classification, apply a masking policy, or restrict role access.",
      effort: "S",
      connection_id: 1,
      connection_name: "Prod DB",
      mapping_id: null,
      table: "users",
      column: "email",
      detected_at: "2026-07-17T00:00:00Z",
      evidence: {},
    }],
    facets: { by_category: { pii_exposure: 1 }, by_severity: { critical: 1 } },
    partial: false,
    partial_reason: null,
    ...overrides,
  };
}

describe("RiskComplianceCenterPage", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it("renders findings and a severity facet badge", async () => {
    getMock.mockResolvedValue(makeRegister());
    render(<RiskComplianceCenterPage />);
    await waitFor(() => expect(screen.getByText("PII data in users.email")).toBeInTheDocument());
    expect(screen.getByText("1 critical")).toBeInTheDocument();
  });

  it("shows root cause/impact/remediation when a finding is selected", async () => {
    getMock.mockResolvedValue(makeRegister());
    render(<RiskComplianceCenterPage />);
    await waitFor(() => expect(screen.getByText("PII data in users.email")).toBeInTheDocument());

    fireEvent.click(screen.getByText("PII data in users.email"));
    expect(screen.getByText("Column matched a value pattern PII/sensitivity signal.")).toBeInTheDocument();
    expect(screen.getByText("Confirm classification, apply a masking policy, or restrict role access.")).toBeInTheDocument();
  });

  it("re-fetches with the category filter and resets the selection", async () => {
    getMock.mockResolvedValue(makeRegister());
    render(<RiskComplianceCenterPage />);
    await waitFor(() => expect(screen.getByText("PII data in users.email")).toBeInTheDocument());
    fireEvent.click(screen.getByText("PII data in users.email"));
    expect(screen.getByText(/Column matched a value pattern/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Category" }), { target: { value: "schema_drift" } });
    await waitFor(() => expect(getMock).toHaveBeenCalledWith(
      expect.stringContaining("category=schema_drift"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ));
    expect(screen.queryByText(/Column matched a value pattern/)).not.toBeInTheDocument();
  });

  it("shows an empty state when there are no findings", async () => {
    getMock.mockResolvedValue(makeRegister({ total: 0, findings: [], facets: { by_category: {}, by_severity: {} } }));
    render(<RiskComplianceCenterPage />);
    await waitFor(() => expect(screen.getByText("No risks detected")).toBeInTheDocument());
  });

  it("shows a partial-register warning when the backend flags one", async () => {
    getMock.mockResolvedValue(makeRegister({ partial: true, partial_reason: "schema_drift" }));
    render(<RiskComplianceCenterPage />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("schema_drift"));
  });

  it("shows an error state when the fetch fails", async () => {
    getMock.mockRejectedValue(new Error("register unavailable"));
    render(<RiskComplianceCenterPage />);
    await waitFor(() => expect(screen.getByText("register unavailable")).toBeInTheDocument());
  });
});
