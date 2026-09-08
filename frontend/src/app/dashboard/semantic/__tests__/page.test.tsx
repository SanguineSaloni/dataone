import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SemanticPage from "../page";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get: getMock, post: vi.fn(), put: vi.fn() } }));

const catalogMetric = {
  id: 7,
  name: "Gross Revenue",
  description: "Revenue before deductions",
  status: "published",
  certified: true,
  version_number: 2,
  aggregation: "sum",
};

describe("SemanticPage", () => {
  beforeEach(() => {
    getMock.mockReset();
    getMock.mockImplementation((path: string) => {
      if (path === "/api/v1/auth/me") return Promise.resolve({ role: "analyst" });
      if (path.startsWith("/api/v1/semantic/metrics?")) return Promise.resolve([catalogMetric]);
      if (path === "/api/v1/semantic/metrics/7") return Promise.resolve({
        ...catalogMetric,
        created_by: "analyst@example.com",
        definition: { entity: "orders", measure: "amount", aggregation: "sum" },
        lineage: [],
      });
      return Promise.reject(new Error(`Unexpected request: ${path}`));
    });
  });

  it("renders the shared workspace framing and catalog", async () => {
    render(<SemanticPage />);
    expect(screen.getByRole("heading", { name: "Semantic / Metrics" })).toBeInTheDocument();
    expect(await screen.findByText("Gross Revenue")).toBeInTheDocument();
    expect(screen.getByText("✓ Certified")).toBeInTheDocument();
  });

  it("loads a selected metric definition", async () => {
    render(<SemanticPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Gross Revenue/ }));
    await waitFor(() => expect(screen.getByText("orders")).toBeInTheDocument());
    expect(screen.getByText("amount")).toBeInTheDocument();
  });
});
