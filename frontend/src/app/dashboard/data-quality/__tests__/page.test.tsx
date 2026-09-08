import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DataQualityObservatoryPage from "../page";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get: getMock } }));

function makeScorecard(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    connection_id: 1,
    connection_name: "Prod DB",
    overall: 92.5,
    table_count: 1,
    column_count: 2,
    profiled_column_count: 2,
    tables: [{
      table: "users",
      column_count: 2,
      profiled_column_count: 2,
      overall: 92.5,
      last_scanned_at: "2026-07-17T00:00:00Z",
      columns: [
        { column: "id", completeness: 100, uniqueness: 100, consistency: 100, accuracy: null, freshness: null, overall: 100, profiled: true },
        { column: "email", completeness: 85, uniqueness: 80, consistency: 90, accuracy: null, freshness: null, overall: 85, profiled: true },
      ],
    }],
    ...overrides,
  };
}

describe("DataQualityObservatoryPage", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it("shows a connection picker prompt before any connection is selected", async () => {
    getMock.mockResolvedValue([{ id: 1, name: "Prod DB" }]);
    render(<DataQualityObservatoryPage />);
    await waitFor(() => expect(screen.getByText("Pick a connection")).toBeInTheDocument());
  });

  it("renders the overall gauge and table rows once a connection is selected", async () => {
    getMock.mockImplementation((path: string) => {
      if (path.includes("/connectors/")) return Promise.resolve([{ id: 1, name: "Prod DB" }]);
      return Promise.resolve(makeScorecard());
    });
    render(<DataQualityObservatoryPage />);
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Connection" })).toBeInTheDocument());

    fireEvent.change(screen.getByRole("combobox", { name: "Connection" }), { target: { value: "1" } });
    await waitFor(() => expect(screen.getByText("users")).toBeInTheDocument());
    expect(screen.getByText(/Overall score 92.5%/)).toBeInTheDocument();
  });

  it("expands a table to show per-column dimension scores", async () => {
    getMock.mockImplementation((path: string) => {
      if (path.includes("/connectors/")) return Promise.resolve([{ id: 1, name: "Prod DB" }]);
      return Promise.resolve(makeScorecard());
    });
    render(<DataQualityObservatoryPage />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Connection" }), { target: { value: "1" } });
    await waitFor(() => expect(screen.getByText("users")).toBeInTheDocument());

    fireEvent.click(screen.getByText("users"));
    expect(screen.getByText("email")).toBeInTheDocument();
    expect(screen.getAllByText("100%").length).toBeGreaterThan(0);
  });

  it("renders '—' for accuracy/freshness instead of a fabricated score", async () => {
    getMock.mockImplementation((path: string) => {
      if (path.includes("/connectors/")) return Promise.resolve([{ id: 1, name: "Prod DB" }]);
      return Promise.resolve(makeScorecard());
    });
    render(<DataQualityObservatoryPage />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Connection" }), { target: { value: "1" } });
    await waitFor(() => expect(screen.getByText("users")).toBeInTheDocument());
    fireEvent.click(screen.getByText("users"));

    const dashes = screen.getAllByTitle("Not yet available");
    expect(dashes.length).toBeGreaterThan(0); // accuracy + freshness cells for both columns
  });

  it("shows an empty state when the connection has no cataloged tables", async () => {
    getMock.mockImplementation((path: string) => {
      if (path.includes("/connectors/")) return Promise.resolve([{ id: 1, name: "Prod DB" }]);
      return Promise.resolve(makeScorecard({ table_count: 0, tables: [] }));
    });
    render(<DataQualityObservatoryPage />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Connection" }), { target: { value: "1" } });
    await waitFor(() => expect(screen.getByText("No cataloged tables")).toBeInTheDocument());
  });
});
