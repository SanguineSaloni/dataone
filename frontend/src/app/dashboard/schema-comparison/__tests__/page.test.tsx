import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SchemaComparisonPage from "../page";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get: getMock } }));

function makeComparison(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    source_id: 1, source_name: "Src", target_id: 2, target_name: "Tgt",
    tables: [
      {
        table: "users", status: "matched",
        added_columns: ["email"], missing_columns: ["legacy_flag"],
        changed_types: [{ column: "age", source_type: "INTEGER", target_type: "TEXT" }],
        changed_constraints: [{ column: "id", source_nullable: false, target_nullable: false, source_primary_key: true, target_primary_key: false }],
        column_count: 4,
      },
      {
        table: "leads", status: "source_only",
        added_columns: [], missing_columns: [], changed_types: [], changed_constraints: [], column_count: 2,
      },
    ],
    summary: { table_count: 2, matched_tables: 1, source_only_tables: 1, target_only_tables: 0, tables_with_changes: 1 },
    ...overrides,
  };
}

function mockRoutes(comparison = makeComparison()) {
  getMock.mockImplementation((path: string) => {
    if (path.includes("/connectors/")) return Promise.resolve([{ id: 1, name: "Src" }, { id: 2, name: "Tgt" }]);
    if (path.includes("/schema-comparison")) return Promise.resolve(comparison);
    return Promise.resolve(null);
  });
}

describe("SchemaComparisonPage", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it("prompts for source/target before either is selected", async () => {
    mockRoutes();
    render(<SchemaComparisonPage />);
    await waitFor(() => expect(screen.getByText("Pick a source and target")).toBeInTheDocument());
  });

  it("renders added/missing/type/constraint diffs once both are selected", async () => {
    mockRoutes();
    render(<SchemaComparisonPage />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Source" }), { target: { value: "1" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Target" }), { target: { value: "2" } });

    await waitFor(() => expect(screen.getByText("users")).toBeInTheDocument());
    expect(screen.getByText(/Added:/)).toBeInTheDocument();
    expect(screen.getByText(/Missing:/)).toBeInTheDocument();
    expect(screen.getByText(/Type changed:/)).toBeInTheDocument();
    expect(screen.getByText(/Constraint changed:/)).toBeInTheDocument();
    expect(screen.getByText("leads")).toBeInTheDocument();
    expect(screen.getByText("✖ Source only")).toBeInTheDocument();
  });

  it("filters to changes-only tables", async () => {
    mockRoutes();
    render(<SchemaComparisonPage />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Source" }), { target: { value: "1" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Target" }), { target: { value: "2" } });
    await waitFor(() => expect(screen.getByText("leads")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("checkbox", { name: "Changes only" }));
    // 'leads' is source_only, which counts as a change (whole table missing).
    expect(screen.getByText("leads")).toBeInTheDocument();
    expect(screen.getByText("users")).toBeInTheDocument();
  });

  it("filters by search text", async () => {
    mockRoutes();
    render(<SchemaComparisonPage />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Source" }), { target: { value: "1" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Target" }), { target: { value: "2" } });
    await waitFor(() => expect(screen.getByText("leads")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("Search table or column…"), { target: { value: "leads" } });
    expect(screen.getByText("leads")).toBeInTheDocument();
    expect(screen.queryByText("users")).not.toBeInTheDocument();
  });

  it("shows an identical badge for a matched table with no diffs", async () => {
    mockRoutes(makeComparison({
      tables: [{ table: "clean", status: "matched", added_columns: [], missing_columns: [], changed_types: [], changed_constraints: [], column_count: 3 }],
      summary: { table_count: 1, matched_tables: 1, source_only_tables: 0, target_only_tables: 0, tables_with_changes: 0 },
    }));
    render(<SchemaComparisonPage />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Source" }), { target: { value: "1" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Target" }), { target: { value: "2" } });
    await waitFor(() => expect(screen.getByText("✔ Identical")).toBeInTheDocument());
  });

  it("shows an error state when the comparison fetch fails", async () => {
    getMock.mockImplementation((path: string) => {
      if (path.includes("/connectors/")) return Promise.resolve([{ id: 1, name: "Src" }, { id: 2, name: "Tgt" }]);
      if (path.includes("/schema-comparison")) return Promise.reject(new Error("could not read live schema"));
      return Promise.resolve(null);
    });
    render(<SchemaComparisonPage />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Source" }), { target: { value: "1" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Target" }), { target: { value: "2" } });
    await waitFor(() => expect(screen.getByText("could not read live schema")).toBeInTheDocument());
  });
});
