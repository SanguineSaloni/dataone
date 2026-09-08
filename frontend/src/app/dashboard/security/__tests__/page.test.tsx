import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SecurityPage from "../page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../hooks/useSecurity", () => ({
  useSecurity: () => ({
    role: "admin", roles: [], rolesLoading: false, rolesError: null,
    permissions: [], users: [], usersLoading: false, connections: [],
    maskingPolicies: [], maskingLoading: false, rowPolicies: [], rowPoliciesLoading: false,
    audit: [], auditLoading: false, toast: null,
    createRole: vi.fn(), updateRole: vi.fn(), deleteRole: vi.fn(),
    getRolePermissionIds: vi.fn(() => []), setRolePermissions: vi.fn(),
    assignUserRole: vi.fn(), revokeUserRole: vi.fn(), getEffectivePermissions: vi.fn(),
    createMaskingPolicy: vi.fn(), deleteMaskingPolicy: vi.fn(),
    createRowPolicy: vi.fn(), deleteRowPolicy: vi.fn(), fetchAudit: vi.fn(), clearToast: vi.fn(),
  }),
}));
vi.mock("../components/RoleList", () => ({ default: () => <div>Roles surface</div> }));
vi.mock("../components/RolePermissionMatrix", () => ({ default: () => <div>Permissions surface</div> }));
vi.mock("../components/UserRoleAssignment", () => ({ default: () => <div>Users surface</div> }));
vi.mock("../components/MaskingPolicyEditor", () => ({ default: () => <div>Masking surface</div> }));
vi.mock("../components/RowFilterEditor", () => ({ default: () => <div>Row filters surface</div> }));
vi.mock("../components/SecurityAuditLog", () => ({ default: () => <div>Security audit surface</div> }));
vi.mock("../components/Toast", () => ({ default: () => null }));

describe("SecurityPage", () => {
  it("renders the shared security workspace and default section", () => {
    render(<SecurityPage />);
    expect(screen.getByRole("heading", { name: "Security Administration" })).toBeInTheDocument();
    expect(screen.getByText("Roles surface")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Security section" })).toBeInTheDocument();
  });

  it("switches sections through the shared segmented control", () => {
    render(<SecurityPage />);
    fireEvent.click(screen.getByRole("button", { name: "Permissions" }));
    expect(screen.getByText("Permissions surface")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Permissions" })).toHaveAttribute("aria-pressed", "true");
  });
});
