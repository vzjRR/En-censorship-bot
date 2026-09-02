import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Card, Button, Select, StatusBadge, Spinner, EmptyState } from "../../components/ui";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { AddStaffModal } from "./AddStaffModal";
import type { StaffMember, StaffRole } from "../../lib/types";

export function StaffList() {
  const { hasPermission, user } = useAuth();
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<StaffMember | null>(null);
  const [search, setSearch] = useState("");

  const canManage = hasPermission("staff.manage");

  const load = async () => {
    const [staffRes, rolesRes] = await Promise.all([
      api.get<{ staff: StaffMember[] }>("/staff"),
      api.get<{ roles: StaffRole[] }>("/staff/roles"),
    ]);
    setStaff(staffRes.staff);
    setRoles(rolesRes.roles);
  };

  useEffect(() => {
    void load();
  }, []);

  const changeRole = async (member: StaffMember, roleId: string) => {
    await api.patch(`/staff/${member.id}/role`, { roleId });
    void load();
  };

  if (!staff) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  const filtered = staff.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return s.displayName.toLowerCase().includes(q) || s.discordUsername.toLowerCase().includes(q) || s.discordUserId.includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">Staff</h1>
        {canManage && <Button onClick={() => setShowAdd(true)}>+ Add Staff</Button>}
      </div>

      <input
        placeholder="Search staff by name, username, or Discord ID…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-accent focus:outline-none"
      />

      <Card>
        {filtered.length === 0 ? (
          <EmptyState message="No staff members found." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-surface-border text-xs uppercase text-slate-500">
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">Discord</th>
                  <th className="pb-2 pr-4">Role</th>
                  <th className="pb-2 pr-4">Status</th>
                  {canManage && <th className="pb-2 pr-4">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filtered.map((member) => (
                  <tr key={member.id}>
                    <td className="py-2 pr-4 font-medium text-slate-100">{member.displayName}</td>
                    <td className="py-2 pr-4 text-slate-400">
                      @{member.discordUsername}
                      <div className="text-xs text-slate-600">{member.discordUserId}</div>
                    </td>
                    <td className="py-2 pr-4">
                      {canManage && member.discordUserId !== user?.discordUserId ? (
                        <Select value={member.roleId} onChange={(e) => void changeRole(member, e.target.value)} className="w-40">
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        member.role.name
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={member.status} />
                    </td>
                    {canManage && (
                      <td className="py-2 pr-4">
                        {member.discordUserId !== user?.discordUserId && (
                          <Button variant="danger" onClick={() => setRemoveTarget(member)} className="!px-2 !py-1 text-xs">
                            Remove
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showAdd && <AddStaffModal roles={roles} onClose={() => setShowAdd(false)} onAdded={load} />}

      <ConfirmDialog
        open={!!removeTarget}
        title="Remove Staff Member"
        description={`Remove ${removeTarget?.displayName} from the moderation team? Their history is preserved (soft-deactivation, not deletion).`}
        confirmLabel="Remove"
        danger
        onCancel={() => setRemoveTarget(null)}
        onConfirm={async () => {
          if (!removeTarget) return;
          await api.delete(`/staff/${removeTarget.id}`);
          setRemoveTarget(null);
          void load();
        }}
      />
    </div>
  );
}
