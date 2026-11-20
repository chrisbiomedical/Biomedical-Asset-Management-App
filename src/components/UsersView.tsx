import { useState } from 'react';
import { Check, Plus, Shield, UserCheck, X } from 'lucide-react';
import { DEPARTMENTS } from '../data/mockData';
import type { BioTrackUser, Permission, UserRole } from '../types/biotrack';
import { hasPermission } from '../utils/biotrackLogic';

interface UsersViewProps {
  users: BioTrackUser[];
  currentUser: BioTrackUser;
  onSwitchUser: (userId: string) => void;
  onAddUser: (user: BioTrackUser) => void;
  onToggleUserActive: (userId: string) => void;
}

const ROLES: UserRole[] = [
  'Administrator',
  'Biomedical Engineer',
  'Supervisor',
  'Department User',
];

const PERMISSION_LABELS: Array<{ key: Permission; label: string }> = [
  { key: 'manage_assets', label: 'Add / Edit Equipment' },
  { key: 'delete_assets', label: 'Delete Equipment' },
  { key: 'assign_engineer', label: 'Assign Machines to Engineers' },
  { key: 'order_parts', label: 'Order Spare Parts & Call OEM' },
  { key: 'schedule_pm', label: 'Schedule PMs' },
  { key: 'execute_pm', label: 'Execute PM Checklists' },
  { key: 'report_breakdown', label: 'Report Breakdowns' },
  { key: 'resolve_breakdown', label: 'Diagnose & Resolve Repairs' },
  { key: 'manage_calibration', label: 'Log Calibrations' },
  { key: 'manage_contracts', label: 'Manage Warranty & AMC' },
  { key: 'export_reports', label: 'Export Excel / PDF Reports' },
  { key: 'manage_users', label: 'Manage Users & Roles' },
];

export function UsersView({
  users,
  currentUser,
  onSwitchUser,
  onAddUser,
  onToggleUserActive,
}: UsersViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('Biomedical Engineer');
  const [department, setDepartment] = useState('Biomedical Engineering');
  const [specialty, setSpecialty] = useState('');

  const canManageUsers = hasPermission(currentUser.role, 'manage_users');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    onAddUser({
      id: `usr-${Date.now()}`,
      name: name.trim(),
      email: email.trim(),
      role,
      department,
      specialty: specialty.trim() || role,
      active: true,
    });
    setModalOpen(false);
    setName('');
    setEmail('');
    setSpecialty('');
  };

  return (
    <div className="space-y-6">
      {/* Staff Directory */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Hospital Engineering & Clinical Users
            </h2>
            <p className="text-xs text-slate-500">
              Signed in as <strong>{currentUser.name}</strong> ({currentUser.role})
            </p>
          </div>
          {canManageUsers && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add User
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-4">User</th>
                <th className="py-2.5 px-4">Role</th>
                <th className="py-2.5 px-4">Department & Specialty</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {users.map((u) => {
                const isCurrent = u.id === currentUser.id;
                return (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-900">{u.name}</div>
                      <div className="font-mono text-xs text-slate-500">{u.email}</div>
                    </td>
                    <td className="py-2.5 px-4 text-xs font-medium text-slate-800 whitespace-nowrap">
                      {u.role}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600">
                      <div>{u.department}</div>
                      <div className="text-slate-400">{u.specialty}</div>
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span
                        className={`text-xs font-medium ${
                          u.active ? 'text-emerald-700' : 'text-slate-400'
                        }`}
                      >
                        {u.active ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        {u.active && !isCurrent && (
                          <button
                            type="button"
                            onClick={() => onSwitchUser(u.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100"
                          >
                            <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            Use Role
                          </button>
                        )}
                        {isCurrent && (
                          <span className="text-xs font-medium text-slate-500">Current Session</span>
                        )}
                        {canManageUsers && !isCurrent && (
                          <button
                            type="button"
                            onClick={() => onToggleUserActive(u.id)}
                            className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                          >
                            {u.active ? 'Suspend' : 'Activate'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Role-Based Access Control Matrix */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
          <Shield className="h-4 w-4 text-teal-700" aria-hidden="true" />
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Role-Based Access Control Matrix
            </h2>
            <p className="text-xs text-slate-500">
              Permissions enforced across inventory, maintenance, calibration, contracts, and exports
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <th className="py-2.5 px-4">Capability</th>
                {ROLES.map((r) => (
                  <th key={r} className="py-2.5 px-4 text-center">
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {PERMISSION_LABELS.map((perm) => (
                <tr key={perm.key} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4 font-medium text-slate-800">{perm.label}</td>
                  {ROLES.map((r) => {
                    const allowed = hasPermission(r, perm.key);
                    return (
                      <td key={r} className="py-2.5 px-4 text-center">
                        {allowed ? (
                          <Check
                            className="h-4 w-4 text-emerald-700 inline-block"
                            aria-label={`${r}: allowed`}
                          />
                        ) : (
                          <span className="text-slate-300" aria-label={`${r}: restricted`}>
                            —
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Add User Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-user-title"
        >
          <div className="w-full max-w-md rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 id="add-user-title" className="text-base font-semibold text-slate-900">
                Add System User
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close add user modal"
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label htmlFor="usr-name" className="block text-xs font-medium text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  id="usr-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="usr-email" className="block text-xs font-medium text-slate-700 mb-1">
                  Hospital Email *
                </label>
                <input
                  id="usr-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="usr-role" className="block text-xs font-medium text-slate-700 mb-1">
                    Access Role
                  </label>
                  <select
                    id="usr-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:border-teal-700 focus:outline-none"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="usr-dept" className="block text-xs font-medium text-slate-700 mb-1">
                    Department
                  </label>
                  <select
                    id="usr-dept"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:border-teal-700 focus:outline-none"
                  >
                    <option value="Biomedical Engineering">Biomedical Engineering</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="usr-spec" className="block text-xs font-medium text-slate-700 mb-1">
                  Title / Specialty
                </label>
                <input
                  id="usr-spec"
                  type="text"
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  placeholder="e.g. Imaging & Ultrasound Specialist"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800"
                >
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
