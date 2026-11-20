import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  FileBarChart2,
  FileCheck2,
  Gauge,
  LayoutDashboard,
  MapPinned,
  Package,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import type { BioTrackUser, NavSection, UserRole } from '../types/biotrack';

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  currentUser: BioTrackUser;
  users: BioTrackUser[];
  onSwitchUser: (userId: string) => void;
  openAlertsCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{
  id: NavSection;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'assets', label: 'Asset Inventory', icon: Activity },
  { id: 'floormap', label: 'Department Map', icon: MapPinned },
  { id: 'pm', label: 'Preventive Maint.', icon: CalendarClock },
  { id: 'calendar', label: 'Maintenance Calendar', icon: CalendarDays },
  { id: 'breakdowns', label: 'Breakdowns', icon: AlertTriangle },
  { id: 'calibration', label: 'Calibration', icon: Gauge },
  { id: 'contracts', label: 'Warranty & AMC', icon: FileCheck2 },
  { id: 'parts', label: 'Parts & OEM', icon: Package },
  { id: 'reports', label: 'Reports', icon: FileBarChart2 },
  { id: 'users', label: 'User Management', icon: Users },
];

const ROLE_SHORT_DESC: Record<UserRole, string> = {
  Administrator: 'Full system access',
  'Biomedical Engineer': 'PM, repairs & calibration',
  Supervisor: 'Approvals, contracts & audit',
  'Department User': 'View assets & report faults',
};

export function Sidebar({
  activeSection,
  onSelectSection,
  currentUser,
  users,
  onSwitchUser,
  openAlertsCount,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const initials = currentUser.name
    .split(' ')
    .filter((p) => !p.includes('.'))
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  const content = (
    <div className="flex h-full flex-col bg-white border-r border-slate-200">
      <div className="flex h-16 items-center justify-between px-5 border-b border-slate-200">
        <button
          type="button"
          onClick={() => {
            onSelectSection('dashboard');
            onCloseMobile();
          }}
          className="flex items-center gap-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 rounded-md"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-700 text-white shrink-0">
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="M3 12h4l2.5-6 4 12 2.5-6H21" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
            BioTrack
          </span>
        </button>

        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectSection(item.id);
                onCloseMobile();
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-teal-50 text-teal-800'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon
                  className={`h-4 w-4 shrink-0 ${isActive ? 'text-teal-700' : 'text-slate-400'}`}
                  aria-hidden="true"
                />
                <span className="truncate">{item.label}</span>
              </span>
              {item.id === 'breakdowns' && openAlertsCount > 0 && (
                <span className="font-mono text-xs font-semibold text-red-700 tabular-nums">
                  {openAlertsCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700 shrink-0">
            {initials || 'BT'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 truncate">{currentUser.name}</p>
            <p className="text-xs text-slate-500 truncate">{currentUser.role}</p>
          </div>
        </div>

        <div>
          <label
            htmlFor="role-switcher-select"
            className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
            Active Role Session
          </label>
          <select
            id="role-switcher-select"
            value={currentUser.id}
            onChange={(e) => onSwitchUser(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
          >
            {users
              .filter((u) => u.active)
              .map((user) => (
                <option key={user.id} value={user.id}>
                  {user.role} — {user.name}
                </option>
              ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">{ROLE_SHORT_DESC[currentUser.role]}</p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0 no-print">
        {content}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-72 max-w-[85vw] h-full">{content}</aside>
        </div>
      )}
    </>
  );
}
