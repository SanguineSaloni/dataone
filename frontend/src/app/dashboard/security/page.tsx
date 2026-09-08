"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSecurity } from "./hooks/useSecurity";

import RoleList from "./components/RoleList";
import RolePermissionMatrix from "./components/RolePermissionMatrix";
import UserRoleAssignment from "./components/UserRoleAssignment";
import MaskingPolicyEditor from "./components/MaskingPolicyEditor";
import RowFilterEditor from "./components/RowFilterEditor";
import SecurityAuditLog from "./components/SecurityAuditLog";
import Toast from "./components/Toast";
import { SegmentedControl, WorkspaceHeader } from "../components";

const TABS = [
  { key: "roles", label: "Roles" },
  { key: "permissions", label: "Permissions" },
  { key: "users", label: "Users" },
  { key: "masking", label: "Masking" },
  { key: "row-filters", label: "Row Filters" },
  { key: "audit", label: "Audit" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function SecurityPage() {
  const router = useRouter();
  const s = useSecurity();
  const [activeTab, setActiveTab] = useState<TabKey>("roles");

  const isAdmin = s.role === "admin";

  return (
    <div className="workspace-page flex h-full flex-col gap-4 overflow-hidden">
      <WorkspaceHeader
        eyebrow="Governance & Compliance"
        title="Security Administration"
        description={`Manage roles, permissions, masking, row-level access, and security audit evidence.${!isAdmin ? " You are viewing in read-only mode." : ""}`}
        className="shrink-0 border-b border-border bg-glass-bg-strong px-4 py-4 backdrop-blur-xl md:px-6"
        actions={
        <button
          type="button"
          onClick={() => router.push("/dashboard/schema")}
          className="flex items-center gap-2 rounded-xl border border-border-strong bg-surface-overlay px-4 py-2 text-sm font-semibold text-fg-muted hover:border-accent/30 hover:text-accent"
        >
          🔍 PII Classifications (Schema Intel) →
        </button>
        }
      />

      <div className="overflow-x-auto px-4"><SegmentedControl label="Security section" value={activeTab} onChange={setActiveTab} options={TABS.map((tab) => ({ value: tab.key, label: tab.label }))} /></div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {activeTab === "roles" && (
          <RoleList
            role={s.role}
            roles={s.roles}
            loading={s.rolesLoading}
            error={s.rolesError}
            onCreate={s.createRole}
            onUpdate={s.updateRole}
            onDelete={s.deleteRole}
          />
        )}
        {activeTab === "permissions" && (
          <RolePermissionMatrix
            role={s.role}
            roles={s.roles}
            permissions={s.permissions}
            getRolePermissionIds={s.getRolePermissionIds}
            onSave={s.setRolePermissions}
          />
        )}
        {activeTab === "users" && (
          <UserRoleAssignment
            role={s.role}
            users={s.users}
            loading={s.usersLoading}
            roles={s.roles}
            onAssign={s.assignUserRole}
            onRevoke={s.revokeUserRole}
            getEffectivePermissions={s.getEffectivePermissions}
          />
        )}
        {activeTab === "masking" && (
          <MaskingPolicyEditor
            role={s.role}
            connections={s.connections}
            policies={s.maskingPolicies}
            loading={s.maskingLoading}
            roles={s.roles}
            onCreate={s.createMaskingPolicy}
            onDelete={s.deleteMaskingPolicy}
          />
        )}
        {activeTab === "row-filters" && (
          <RowFilterEditor
            role={s.role}
            connections={s.connections}
            policies={s.rowPolicies}
            loading={s.rowPoliciesLoading}
            roles={s.roles}
            onCreate={s.createRowPolicy}
            onDelete={s.deleteRowPolicy}
          />
        )}
        {activeTab === "audit" && (
          <SecurityAuditLog audit={s.audit} loading={s.auditLoading} onRefresh={s.fetchAudit} />
        )}
      </div>

      <Toast toast={s.toast} onDismiss={s.clearToast} />
    </div>
  );
}
