import { useState } from 'react';
import { ArrowRight, QrCode, X } from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TODAY_ISO } from '../data/mockData';
import type {
  Asset,
  BioTrackUser,
  BreakdownTicket,
  CalibrationRecord,
  ComplianceAlert,
  DashboardMetrics,
  MonthlyMaintenanceTrend,
  NavSection,
  PartOrder,
  PreventiveMaintenance,
  ServiceContract,
  UserRole,
} from '../types/biotrack';
import {
  computeComplianceAlerts,
  computeDepartmentPerformance,
  computeEngineerCapacity,
  computeMonthlyMaintenanceTrends,
  deriveCalibrationStatus,
  deriveContractStatus,
  derivePMStatus,
  hasPermission,
} from '../utils/biotrackLogic';
import type { AssetDetailTab } from './AssetDetailModal';
import { BreakdownStatusLabel, PriorityLabel } from './StatusText';

interface DashboardViewProps {
  metrics: DashboardMetrics;
  assets: Asset[];
  pms: PreventiveMaintenance[];
  breakdowns: BreakdownTicket[];
  calibrations: CalibrationRecord[];
  contracts: ServiceContract[];
  partOrders?: PartOrder[];
  users?: BioTrackUser[];
  userRole?: UserRole;
  onReassignPM?: (pmId: string, engineerName: string) => void;
  onReassignBreakdown?: (ticketId: string, engineerName: string) => void;
  onNavigate: (section: NavSection) => void;
  onSelectAsset: (assetId: string) => void;
  onSelectAssetTab?: (assetId: string, tab: AssetDetailTab) => void;
  onOpenQuickQR: (asset: Asset) => void;
}

interface TrendTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: MonthlyMaintenanceTrend }>;
}

function MaintenanceTrendTooltip({ active, payload }: TrendTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-3 text-xs text-slate-700 min-w-[220px]">
      <p className="font-semibold text-slate-900 pb-1.5 mb-2 border-b border-slate-100">
        {point.monthLabel}
      </p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-600">Total Maintenance Cost</span>
          <span className="font-mono font-semibold text-slate-900 tabular-nums">
            ${point.totalMaintenanceCost.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 text-[11px] text-slate-500 font-mono tabular-nums">
          <span>Parts · PM · Repair</span>
          <span>
            ${point.partsCost.toLocaleString()} · ${point.pmServiceCost.toLocaleString()} · $
            {point.breakdownRepairCost.toLocaleString()}
          </span>
        </div>
        <div className="pt-1.5 mt-1.5 border-t border-slate-100 space-y-1">
          <div className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-slate-700">
              <span className="h-2 w-2 rounded-xs bg-teal-700 inline-block" aria-hidden="true" />
              Preventive Maintenance
            </span>
            <span className="font-mono font-medium text-teal-700 tabular-nums">
              {point.pmCount} events
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-slate-700">
              <span className="h-2 w-2 rounded-xs bg-red-600 inline-block" aria-hidden="true" />
              Breakdown Events
            </span>
            <span className="font-mono font-medium text-red-700 tabular-nums">
              {point.breakdownCount} events ({point.downtimeHours.toFixed(1)}h)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DashboardView({
  metrics,
  assets,
  pms,
  breakdowns,
  contracts,
  partOrders = [],
  users = [],
  userRole = 'Administrator',
  onReassignPM,
  onReassignBreakdown,
  onNavigate,
  onSelectAsset,
  onSelectAssetTab,
  onOpenQuickQR,
}: DashboardViewProps) {
  const [trendMonths, setTrendMonths] = useState<3 | 6>(6);
  const [complianceFilter, setComplianceFilter] = useState<
    'All' | 'Expired' | 'Safety Certification' | 'Calibration Deadline'
  >('All');
  const [showAllCompliance, setShowAllCompliance] = useState(false);
  const [reassignEngineerId, setReassignEngineerId] = useState<string | null>(null);
  const overduePms = pms.filter((pm) => derivePMStatus(pm, TODAY_ISO) === 'Overdue');
  const openBreakdowns = breakdowns.filter((b) => b.status !== 'Resolved');
  const calibrationAlerts = assets.filter(
    (a) => deriveCalibrationStatus(a.nextCalibrationDate, TODAY_ISO).status !== 'Compliant',
  );
  const contractAlerts = contracts.filter(
    (c) => deriveContractStatus(c, TODAY_ISO).status !== 'Active',
  );
  const complianceAlerts = computeComplianceAlerts(assets, TODAY_ISO);
  const expiredComplianceCount = complianceAlerts.filter((a) => a.severity === 'Expired').length;
  const dueSoonComplianceCount = complianceAlerts.filter((a) => a.severity === 'Due Soon').length;
  const filteredComplianceAlerts = complianceAlerts.filter((alert) => {
    if (complianceFilter === 'Expired') return alert.severity === 'Expired';
    if (complianceFilter === 'Safety Certification') {
      return alert.category === 'Safety Certification';
    }
    if (complianceFilter === 'Calibration Deadline') {
      return alert.category === 'Calibration Deadline';
    }
    return true;
  });
  const visibleComplianceAlerts = showAllCompliance
    ? filteredComplianceAlerts
    : filteredComplianceAlerts.slice(0, 8);

  const openComplianceRecord = (alert: ComplianceAlert) => {
    if (onSelectAssetTab) {
      onSelectAssetTab(alert.assetId, alert.targetTab);
    } else {
      onSelectAsset(alert.assetId);
    }
  };
  const departmentalPerformance = computeDepartmentPerformance(assets, breakdowns);
  const maxDeptActiveAssets = departmentalPerformance.reduce(
    (max, row) => Math.max(max, row.activeAssets),
    0,
  );
  const totalActiveAssets = departmentalPerformance.reduce((sum, row) => sum + row.activeAssets, 0);
  const totalRecordedDowntime = departmentalPerformance.reduce(
    (sum, row) => sum + row.totalDowntimeHours,
    0,
  );
  const fleetAvgDowntime =
    totalActiveAssets > 0 ? (totalRecordedDowntime / totalActiveAssets).toFixed(1) : '0.0';
  const engineerCapacity = computeEngineerCapacity(users, assets, pms, breakdowns, TODAY_ISO);
  const maxEngineerWorkload = engineerCapacity.reduce(
    (max, e) => Math.max(max, e.totalActiveWorkload),
    0,
  );
  const totalCapacityTickets = engineerCapacity.reduce((sum, e) => sum + e.openTicketsCount, 0);
  const totalCapacityUpcomingPms = engineerCapacity.reduce((sum, e) => sum + e.upcomingPmCount, 0);
  const totalCapacityOverduePms = engineerCapacity.reduce((sum, e) => sum + e.overduePmCount, 0);
  const activeEngineers = users.filter((u) => u.active && u.role === 'Biomedical Engineer');
  const canReassignTasks = hasPermission(userRole, 'assign_engineer');
  const selectedCapacityEngineer =
    engineerCapacity.find((e) => e.engineerId === reassignEngineerId) ?? null;

  const monthlyTrends = computeMonthlyMaintenanceTrends(
    pms,
    breakdowns,
    partOrders,
    TODAY_ISO,
    trendMonths,
  );
  const periodTotalCost = monthlyTrends.reduce((sum, m) => sum + m.totalMaintenanceCost, 0);
  const periodTotalPms = monthlyTrends.reduce((sum, m) => sum + m.pmCount, 0);
  const periodTotalBreakdowns = monthlyTrends.reduce((sum, m) => sum + m.breakdownCount, 0);

  const operationalPct =
    metrics.totalAssets === 0
      ? 0
      : Math.round((metrics.operationalAssets / metrics.totalAssets) * 100);

  return (
    <div className="space-y-6">
      {/* KPI Summary Strip */}
      <section aria-label="Key biomedical fleet metrics" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500">Total Assets</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {metrics.totalAssets}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Across {metrics.departmentDistribution.length} departments
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500">Operational</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
            {metrics.operationalAssets}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap">
            {operationalPct}% fleet ready
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500">Breakdown Equipment</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-red-700 tabular-nums">
            {metrics.breakdownAssets}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            {metrics.openBreakdownsCount} active tickets
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500">PM Compliance</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-teal-700 tabular-nums">
            {metrics.pmComplianceRate}%
          </p>
          <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            {metrics.completedPmCount} of {metrics.totalPmCount} completed
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500">Overdue PMs</p>
          <p
            className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
              metrics.overduePmCount > 0 ? 'text-red-700' : 'text-slate-900'
            }`}
          >
            {metrics.overduePmCount}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            {metrics.upcomingPmCount} due in 30 days
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500">Calibration Status</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {metrics.calibrationComplianceRate}%
          </p>
          <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap">
            {metrics.calibrationOverdueCount} overdue · {metrics.calibrationDueSoonCount} due
          </p>
        </div>
      </section>

      {/* Monthly Maintenance Cost vs. PM & Breakdown Events Chart */}
      <section
        aria-labelledby="maintenance-trends-heading"
        className="bg-white border border-slate-200 rounded-lg overflow-hidden"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 border-b border-slate-200">
          <div>
            <h2 id="maintenance-trends-heading" className="text-base font-semibold text-slate-900">
              Maintenance Cost vs. Preventive & Breakdown Events
            </h2>
            <p className="text-xs text-slate-500">
              Monthly parts, PM service, and repair spend vs. scheduled PM and fault events
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-slate-600">
              <span>
                <strong className="font-semibold text-slate-900">
                  ${periodTotalCost.toLocaleString()}
                </strong>{' '}
                total spend
              </span>
              <span className="text-slate-300" aria-hidden="true">
                ·
              </span>
              <span>
                <strong className="font-semibold text-teal-700">{periodTotalPms}</strong> PMs
              </span>
              <span className="text-slate-300" aria-hidden="true">
                ·
              </span>
              <span>
                <strong className="font-semibold text-red-700">{periodTotalBreakdowns}</strong>{' '}
                breakdowns
              </span>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg" role="group" aria-label="Chart timeframe">
              <button
                type="button"
                onClick={() => setTrendMonths(3)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  trendMonths === 3
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                3 Months
              </button>
              <button
                type="button"
                onClick={() => setTrendMonths(6)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  trendMonths === 6
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                6 Months
              </button>
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-5">
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-xs bg-teal-700 inline-block" aria-hidden="true" />
                Preventive Maintenance (Events)
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-xs bg-red-600 inline-block" aria-hidden="true" />
                Breakdown Events
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-0.5 w-4 bg-slate-900 inline-block" aria-hidden="true" />
                Total Maintenance Cost ($)
              </span>
            </div>
            <span className="text-[11px] text-slate-500">
              Left axis: event count · Right axis: monthly spend (USD)
            </span>
          </div>

          <div className="w-full h-[290px] min-w-0">
            <ResponsiveContainer width="100%" height={290}>
              <ComposedChart
                data={monthlyTrends}
                margin={{ top: 10, right: 16, left: 0, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="monthLabel"
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="events"
                  allowDecimals={false}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={34}
                />
                <YAxis
                  yAxisId="cost"
                  orientation="right"
                  tickFormatter={(value: number) =>
                    value >= 1000 ? `$${(value / 1000).toFixed(1)}k` : `$${value}`
                  }
                  tick={{ fill: '#334155', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={54}
                />
                <Tooltip
                  content={<MaintenanceTrendTooltip />}
                  cursor={{ fill: 'rgba(241, 245, 249, 0.7)' }}
                />
                <Bar
                  yAxisId="events"
                  dataKey="pmCount"
                  name="Preventive Maintenance"
                  fill="#0f766e"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={28}
                />
                <Bar
                  yAxisId="events"
                  dataKey="breakdownCount"
                  name="Breakdown Events"
                  fill="#dc2626"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={28}
                />
                <Line
                  yAxisId="cost"
                  type="monotone"
                  dataKey="totalMaintenanceCost"
                  name="Total Maintenance Cost"
                  stroke="#0f172a"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#0f172a', stroke: '#ffffff', strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: '#0f172a', stroke: '#ffffff', strokeWidth: 2 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Compliance Alerts Section */}
      <section
        aria-labelledby="compliance-alerts-heading"
        className="bg-white border border-slate-200 rounded-lg overflow-hidden"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 border-b border-slate-200">
          <div>
            <h2 id="compliance-alerts-heading" className="text-base font-semibold text-slate-900">
              Compliance Alerts
            </h2>
            <p className="text-xs text-slate-500">
              Assets with expired or upcoming safety certifications and calibration deadlines (next 30 days)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
              <span className="font-semibold text-red-700">{expiredComplianceCount}</span> expired
              <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
              <span className="font-semibold text-amber-700">{dueSoonComplianceCount}</span> due soon
            </div>

            <div
              className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
              role="group"
              aria-label="Filter compliance alerts"
            >
              {(
                [
                  { id: 'All', label: `All (${complianceAlerts.length})` },
                  { id: 'Expired', label: 'Expired' },
                  { id: 'Safety Certification', label: 'Safety Certs' },
                  { id: 'Calibration Deadline', label: 'Calibration' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setComplianceFilter(tab.id);
                    setShowAllCompliance(false);
                  }}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    complianceFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => onNavigate('calibration')}
              className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 whitespace-nowrap shrink-0"
            >
              Calibration Register
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-4">Equipment &amp; Location</th>
                <th className="py-2.5 px-4">Compliance Item</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Assigned Engineer</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Deadline Date</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Compliance Status</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">Record</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {visibleComplianceAlerts.map((alert) => {
                const isExpired = alert.severity === 'Expired';
                const dayLabel = isExpired
                  ? `${Math.abs(alert.daysRemaining)}d overdue`
                  : alert.daysRemaining === 0
                    ? 'Due today'
                    : `${alert.daysRemaining}d remaining`;
                return (
                  <tr key={alert.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap">
                        <span className="font-mono font-semibold text-teal-800 shrink-0">
                          {alert.assetCode}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="shrink-0">{alert.department}</span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate max-w-[160px]">{alert.location}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => openComplianceRecord(alert)}
                        className="mt-0.5 text-sm font-medium text-slate-900 hover:text-teal-700 text-left"
                      >
                        {alert.assetName}
                      </button>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="text-xs font-semibold text-slate-800">
                        {alert.category}
                      </div>
                      <div className="text-xs text-slate-500">{alert.standardOrDetail}</div>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-700 whitespace-nowrap">
                      {alert.assignedEngineer || 'Unassigned'}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                      {alert.dueDate}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span
                        className={`font-mono text-xs font-semibold tabular-nums ${
                          isExpired ? 'text-red-700' : 'text-amber-700'
                        }`}
                      >
                        {isExpired ? 'Expired' : 'Expiring Soon'} · {dayLabel}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openComplianceRecord(alert)}
                        aria-label={`Open ${alert.category.toLowerCase()} record for ${alert.assetCode}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100 whitespace-nowrap shrink-0"
                      >
                        {alert.targetTab === 'calibration' ? 'View Calibration' : 'Open Record'}
                        <ArrowRight className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {visibleComplianceAlerts.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 px-4 text-center text-sm text-slate-500">
                    No compliance alerts match this filter.
                    {complianceFilter !== 'All' && (
                      <button
                        type="button"
                        onClick={() => setComplianceFilter('All')}
                        className="ml-2 text-xs font-medium text-teal-700 hover:text-teal-800 underline"
                      >
                        Show all alerts
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredComplianceAlerts.length > 8 && (
          <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
            <span className="font-mono tabular-nums">
              Showing {visibleComplianceAlerts.length} of {filteredComplianceAlerts.length} alerts
            </span>
            <button
              type="button"
              onClick={() => setShowAllCompliance((prev) => !prev)}
              className="font-medium text-teal-700 hover:text-teal-800 whitespace-nowrap"
            >
              {showAllCompliance
                ? 'Show top 8 priority alerts'
                : `Show all ${filteredComplianceAlerts.length} alerts`}
            </button>
          </div>
        )}
      </section>

      {/* Main Two-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Priority Engineering Queue */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-lg">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Engineering Attention Queue
              </h2>
              <p className="text-xs text-slate-500">
                Overdue maintenance, calibration expiries, and active repairs
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('pm')}
              className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 whitespace-nowrap"
            >
              View PM Schedule
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {openBreakdowns.slice(0, 3).map((ticket) => (
              <div
                key={ticket.id}
                className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono font-medium text-red-700">
                      {ticket.ticketNumber}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-slate-600">{ticket.assetCode}</span>
                    <span aria-hidden="true">·</span>
                    <span>{ticket.department}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectAsset(ticket.assetId)}
                    className="mt-0.5 text-sm font-medium text-slate-900 hover:text-teal-700 text-left truncate block max-w-full"
                  >
                    {ticket.assetName}
                  </button>
                  <p className="text-xs text-slate-600 truncate">{ticket.faultDescription}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <PriorityLabel priority={ticket.priority} />
                  <button
                    type="button"
                    onClick={() => onNavigate('breakdowns')}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
                  >
                    Manage
                  </button>
                </div>
              </div>
            ))}

            {overduePms.slice(0, 3).map((pm) => (
              <div
                key={pm.id}
                className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-medium text-red-700">Overdue PM</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-slate-600">{pm.assetCode}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">Due {pm.scheduledDate}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectAsset(pm.assetId)}
                    className="mt-0.5 text-sm font-medium text-slate-900 hover:text-teal-700 text-left truncate block max-w-full"
                  >
                    {pm.assetName}
                  </button>
                  <p className="text-xs text-slate-600">
                    Assigned to {pm.assignedEngineer} · {pm.department}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('pm')}
                  className="px-3 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100 whitespace-nowrap shrink-0"
                >
                  Execute PM
                </button>
              </div>
            ))}

            {calibrationAlerts.slice(0, 2).map((asset) => {
              const cal = deriveCalibrationStatus(asset.nextCalibrationDate, TODAY_ISO);
              return (
                <div
                  key={`cal-alert-${asset.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span
                        className={`font-medium ${
                          cal.status === 'Overdue' ? 'text-red-700' : 'text-amber-700'
                        }`}
                      >
                        Calibration {cal.status}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-slate-600">{asset.assetCode}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        Due {asset.nextCalibrationDate}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectAsset(asset.id)}
                      className="mt-0.5 text-sm font-medium text-slate-900 hover:text-teal-700 text-left truncate block max-w-full"
                    >
                      {asset.name}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('calibration')}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    Calibrate
                  </button>
                </div>
              );
            })}

            {contractAlerts.slice(0, 2).map((ctr) => {
              const st = deriveContractStatus(ctr, TODAY_ISO);
              return (
                <div
                  key={`ctr-alert-${ctr.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span
                        className={`font-medium ${
                          st.status === 'Expired' ? 'text-red-700' : 'text-amber-700'
                        }`}
                      >
                        {ctr.contractType} {st.status}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-slate-600">{ctr.assetCode}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">Ends {ctr.endDate}</span>
                    </div>
                    <p className="mt-0.5 text-sm font-medium text-slate-900 truncate">
                      {ctr.assetName} — {ctr.vendor}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('contracts')}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    Review
                  </button>
                </div>
              );
            })}

            {openBreakdowns.length === 0 &&
              overduePms.length === 0 &&
              calibrationAlerts.length === 0 &&
              contractAlerts.length === 0 && (
                <div className="px-5 py-10 text-center text-sm text-slate-500">
                  All biomedical assets are compliant with zero overdue maintenance or active breakdowns.
                </div>
              )}
          </div>
        </section>

        {/* Right: Department Readiness Distribution */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-lg">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Department Fleet Readiness
              </h2>
              <p className="text-xs text-slate-500">
                Operational vs. maintenance or repair status
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('assets')}
              className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 whitespace-nowrap"
            >
              All Assets
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {metrics.departmentDistribution.map((dept) => {
              const opWidth = dept.total === 0 ? 0 : Math.round((dept.operational / dept.total) * 100);
              const issueWidth = 100 - opWidth;
              return (
                <div key={dept.department} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800">{dept.department}</span>
                    <span className="font-mono text-slate-500 tabular-nums">
                      {dept.operational}/{dept.total} operational
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden flex">
                    {opWidth > 0 && (
                      <div
                        className="h-full bg-teal-700"
                        style={{ width: `${opWidth}%` }}
                      />
                    )}
                    {issueWidth > 0 && (
                      <div
                        className="h-full bg-amber-500"
                        style={{ width: `${issueWidth}%` }}
                      />
                    )}
                  </div>
                </div>
              );
            })}

            <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <div className="flex items-center gap-4">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-teal-700 inline-block" aria-hidden="true" />
                  Operational
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-amber-500 inline-block" aria-hidden="true" />
                  Repair / Maintenance
                </span>
              </div>
              <span className="font-mono tabular-nums">
                {metrics.expiringContractsCount + metrics.expiredContractsCount} contract alerts
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* Engineer Capacity Widget */}
      <section
        aria-labelledby="engineer-capacity-heading"
        className="bg-white border border-slate-200 rounded-lg overflow-hidden"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-200">
          <div>
            <h2 id="engineer-capacity-heading" className="text-base font-semibold text-slate-900">
              Engineer Capacity
            </h2>
            <p className="text-xs text-slate-500">
              Assigned open breakdown tickets and upcoming PM tasks per biomedical engineer for workload balancing
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="font-mono text-xs text-slate-600 tabular-nums">
              <span className="font-semibold text-slate-900">{totalCapacityTickets}</span> open tickets
              <span className="mx-1.5 text-slate-300" aria-hidden="true">|</span>
              <span className="font-semibold text-teal-700">{totalCapacityUpcomingPms}</span> upcoming PMs
              {totalCapacityOverduePms > 0 && (
                <>
                  <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
                  <span className="font-semibold text-red-700">{totalCapacityOverduePms}</span> overdue PMs
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => onNavigate('pm')}
              className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 whitespace-nowrap"
            >
              Manage PM Queue
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-4">Engineer</th>
                <th className="py-2.5 px-4 text-right">Open Tickets</th>
                <th className="py-2.5 px-4 text-right">Upcoming PMs</th>
                <th className="py-2.5 px-4 text-right">Assigned Fleet</th>
                <th className="py-2.5 px-4">Workload Balance</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4 text-right">Reassignment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {engineerCapacity.map((row) => {
                const barWidth =
                  maxEngineerWorkload === 0
                    ? 0
                    : Math.round((row.totalActiveWorkload / maxEngineerWorkload) * 100);
                const statusColor =
                  row.capacityStatus === 'High Load'
                    ? 'text-red-700 font-semibold'
                    : row.capacityStatus === 'Available'
                      ? 'text-emerald-700 font-medium'
                      : 'text-teal-700 font-medium';
                const barColor =
                  row.capacityStatus === 'High Load'
                    ? 'bg-red-600'
                    : row.capacityStatus === 'Available'
                      ? 'bg-emerald-600'
                      : 'bg-teal-700';

                return (
                  <tr key={row.engineerId} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-900">{row.engineerName}</div>
                      <div className="text-xs text-slate-500">{row.specialty}</div>
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <span
                        className={`font-mono font-semibold tabular-nums ${
                          row.openTicketsCount > 0 ? 'text-red-700' : 'text-slate-600'
                        }`}
                      >
                        {row.openTicketsCount}
                      </span>
                      {row.openTickets.length > 0 && (
                        <div className="font-mono text-[11px] text-slate-500">
                          {row.openTickets.map((t) => t.ticketNumber).join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">
                        {row.upcomingPmCount}
                      </span>
                      {row.overduePmCount > 0 && (
                        <div className="font-mono text-[11px] font-medium text-red-700 tabular-nums">
                          +{row.overduePmCount} overdue
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                      {row.assignedAssetsCount} machines
                    </td>
                    <td className="py-2.5 px-4 min-w-[140px]">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 rounded-sm bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full ${barColor}`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs text-slate-500 tabular-nums">
                          {row.totalActiveWorkload} {row.totalActiveWorkload === 1 ? 'task' : 'tasks'}
                        </span>
                      </div>
                    </td>
                    <td className={`py-2.5 px-4 text-xs whitespace-nowrap ${statusColor}`}>
                      {row.capacityStatus}
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      {canReassignTasks && row.totalActiveWorkload > 0 ? (
                        <button
                          type="button"
                          onClick={() => setReassignEngineerId(row.engineerId)}
                          className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                        >
                          Reassign Tasks
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">
                          {row.totalActiveWorkload === 0 ? 'Ready for assignment' : 'View only'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {engineerCapacity.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-slate-500">
                    No active biomedical engineers configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Departmental Performance Summary Widget */}
      <section
        aria-labelledby="departmental-performance-heading"
        className="bg-white border border-slate-200 rounded-lg overflow-hidden"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-200">
          <div>
            <h2 id="departmental-performance-heading" className="text-base font-semibold text-slate-900">
              Departmental Performance
            </h2>
            <p className="text-xs text-slate-500">
              Active equipment count and average downtime per department to highlight equipment-heavy areas
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right font-mono text-xs text-slate-600 tabular-nums">
              <span className="font-semibold text-slate-900">{totalActiveAssets}</span> active assets
              <span className="mx-1.5 text-slate-300" aria-hidden="true">|</span>
              <span className="font-semibold text-slate-900">{fleetAvgDowntime} h</span> fleet avg downtime
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigate('floormap')}
                className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 whitespace-nowrap"
              >
                Floor Plan
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <span className="text-slate-300" aria-hidden="true">|</span>
              <button
                type="button"
                onClick={() => onNavigate('assets')}
                className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 whitespace-nowrap"
              >
                Inspect Fleet
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-4">Department</th>
                <th className="py-2.5 px-4 text-right">Active Assets</th>
                <th className="py-2.5 px-4">Equipment Load</th>
                <th className="py-2.5 px-4 text-right">Avg Downtime / Asset</th>
                <th className="py-2.5 px-4 text-right">Total Downtime</th>
                <th className="py-2.5 px-4 text-right">Fault Tickets</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {departmentalPerformance.map((row, index) => {
                const loadPct =
                  maxDeptActiveAssets === 0
                    ? 0
                    : Math.round((row.activeAssets / maxDeptActiveAssets) * 100);
                const isHighLoad = index < 2 && row.activeAssets > 0;
                return (
                  <tr key={row.department} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">{row.department}</span>
                        {isHighLoad && (
                          <span className="text-[11px] font-medium text-teal-700">
                            High Density
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 font-mono tabular-nums">
                        {row.operationalAssets} operational
                        {row.outOfServiceAssets > 0 && ` · ${row.outOfServiceAssets} out of service`}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                      {row.activeAssets}
                    </td>
                    <td className="py-2.5 px-4 min-w-[140px]">
                      <div className="h-2 w-full max-w-[160px] rounded-sm bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-teal-700"
                          style={{ width: `${loadPct}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <span
                        className={`font-mono font-semibold tabular-nums ${
                          row.avgDowntimeHours >= 8
                            ? 'text-red-700'
                            : row.avgDowntimeHours > 0
                              ? 'text-amber-700'
                              : 'text-slate-500'
                        }`}
                      >
                        {row.avgDowntimeHours.toFixed(1)} h
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                      {row.totalDowntimeHours.toFixed(1)} h
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                      <span className={row.openBreakdowns > 0 ? 'font-medium text-red-700' : 'text-slate-600'}>
                        {row.breakdownCount} total ({row.openBreakdowns} open)
                      </span>
                    </td>
                  </tr>
                );
              })}
              {departmentalPerformance.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-slate-500">
                    No departmental asset data recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Bottom: Recent Breakdown & Repair Activity */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Recent Breakdown & Service Tickets
            </h2>
            <p className="text-xs text-slate-500">
              Latest equipment fault reports and recorded downtime
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('breakdowns')}
            className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 whitespace-nowrap"
          >
            All Tickets
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-4">Ticket</th>
                <th className="py-2.5 px-4">Asset</th>
                <th className="py-2.5 px-4">Department</th>
                <th className="py-2.5 px-4">Priority</th>
                <th className="py-2.5 px-4">Engineer</th>
                <th className="py-2.5 px-4 text-right">Downtime</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4 text-right">Quick QR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {breakdowns.slice(0, 5).map((ticket) => {
                const asset = assets.find((a) => a.id === ticket.assetId);
                return (
                  <tr key={ticket.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono text-xs font-medium text-slate-700 whitespace-nowrap">
                      {ticket.ticketNumber}
                    </td>
                    <td className="py-2.5 px-4">
                      <button
                        type="button"
                        onClick={() => onSelectAsset(ticket.assetId)}
                        className="font-medium text-slate-900 hover:text-teal-700 text-left"
                      >
                        {ticket.assetName}
                      </button>
                      <div className="font-mono text-xs text-slate-500">{ticket.assetCode}</div>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                      {ticket.department}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <PriorityLabel priority={ticket.priority} />
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-700 whitespace-nowrap">
                      {ticket.assignedEngineer}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                      {ticket.downtimeHours.toFixed(1)} h
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <BreakdownStatusLabel status={ticket.status} />
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {asset && (
                        <button
                          type="button"
                          onClick={() => onOpenQuickQR(asset)}
                          aria-label={`View QR code for ${asset.assetCode}`}
                          className="inline-flex items-center justify-center rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <QrCode className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Supervisor Task Reassignment Modal */}
      {selectedCapacityEngineer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reassign-tasks-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
        >
          <div className="w-full max-w-2xl rounded-lg bg-white border border-slate-200 shadow-lg overflow-hidden">
            <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-200">
              <div>
                <h2 id="reassign-tasks-title" className="text-base font-semibold text-slate-900">
                  Reassign Tasks — {selectedCapacityEngineer.engineerName}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedCapacityEngineer.specialty} ·{' '}
                  <span className="font-mono tabular-nums">
                    {selectedCapacityEngineer.openTicketsCount} open{' '}
                    {selectedCapacityEngineer.openTicketsCount === 1 ? 'ticket' : 'tickets'} ·{' '}
                    {selectedCapacityEngineer.upcomingPmCount} upcoming{' '}
                    {selectedCapacityEngineer.upcomingPmCount === 1 ? 'PM' : 'PMs'}
                    {selectedCapacityEngineer.overduePmCount > 0
                      ? ` · ${selectedCapacityEngineer.overduePmCount} overdue ${
                          selectedCapacityEngineer.overduePmCount === 1 ? 'PM' : 'PMs'
                        }`
                      : ''}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReassignEngineerId(null)}
                aria-label="Close reassignment modal"
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="max-h-[65vh] overflow-y-auto p-5 space-y-5">
              {selectedCapacityEngineer.openTickets.length === 0 &&
              selectedCapacityEngineer.pendingPms.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">
                  All open tickets and pending PM tasks for {selectedCapacityEngineer.engineerName} have been reassigned.
                </p>
              ) : (
                <>
                  {selectedCapacityEngineer.openTickets.length > 0 && (
                    <div className="space-y-2.5">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Open Breakdown Tickets ({selectedCapacityEngineer.openTickets.length})
                      </h3>
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                        {selectedCapacityEngineer.openTickets.map((ticket) => (
                          <div
                            key={ticket.id}
                            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 text-xs">
                                <span className="font-mono font-semibold text-red-700">
                                  {ticket.ticketNumber}
                                </span>
                                <span aria-hidden="true" className="text-slate-300">
                                  ·
                                </span>
                                <span className="font-mono text-slate-600">{ticket.assetCode}</span>
                                <span aria-hidden="true" className="text-slate-300">
                                  ·
                                </span>
                                <span className="text-slate-500">{ticket.department}</span>
                                <span aria-hidden="true" className="text-slate-300">
                                  ·
                                </span>
                                <PriorityLabel priority={ticket.priority} />
                              </div>
                              <p className="mt-0.5 text-sm font-medium text-slate-900 truncate">
                                {ticket.assetName}
                              </p>
                              <p className="text-xs text-slate-500 truncate">
                                {ticket.faultDescription}
                              </p>
                            </div>
                            <div className="shrink-0">
                              <label className="sr-only" htmlFor={`reassign-bd-${ticket.id}`}>
                                Assign engineer for {ticket.ticketNumber}
                              </label>
                              <select
                                id={`reassign-bd-${ticket.id}`}
                                value={ticket.assignedEngineer}
                                onChange={(e) => onReassignBreakdown?.(ticket.id, e.target.value)}
                                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
                              >
                                {activeEngineers.map((eng) => (
                                  <option key={eng.id} value={eng.name}>
                                    {eng.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedCapacityEngineer.pendingPms.length > 0 && (
                    <div className="space-y-2.5">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Pending &amp; Overdue PM Tasks ({selectedCapacityEngineer.pendingPms.length})
                      </h3>
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                        {selectedCapacityEngineer.pendingPms.map((pm) => {
                          const effectiveStatus = derivePMStatus(pm, TODAY_ISO);
                          return (
                            <div
                              key={pm.id}
                              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 text-xs">
                                  <span
                                    className={`font-medium ${
                                      effectiveStatus === 'Overdue'
                                        ? 'text-red-700'
                                        : 'text-teal-700'
                                    }`}
                                  >
                                    {effectiveStatus}
                                  </span>
                                  <span aria-hidden="true" className="text-slate-300">
                                    ·
                                  </span>
                                  <span className="font-mono text-slate-600">{pm.assetCode}</span>
                                  <span aria-hidden="true" className="text-slate-300">
                                    ·
                                  </span>
                                  <span className="font-mono tabular-nums text-slate-500">
                                    Due {pm.scheduledDate}
                                  </span>
                                </div>
                                <p className="mt-0.5 text-sm font-medium text-slate-900 truncate">
                                  {pm.assetName}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {pm.frequency} PM · {pm.department}
                                </p>
                              </div>
                              <div className="shrink-0">
                                <label className="sr-only" htmlFor={`reassign-pm-${pm.id}`}>
                                  Assign engineer for {pm.assetCode} PM
                                </label>
                                <select
                                  id={`reassign-pm-${pm.id}`}
                                  value={pm.assignedEngineer}
                                  onChange={(e) => onReassignPM?.(pm.id, e.target.value)}
                                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
                                >
                                  {activeEngineers.map((eng) => (
                                    <option key={eng.id} value={eng.name}>
                                      {eng.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-slate-200 bg-slate-50">
              <p className="text-xs text-slate-500">
                Changes apply immediately and are recorded in the asset activity log.
              </p>
              <button
                type="button"
                onClick={() => setReassignEngineerId(null)}
                className="px-4 py-1.5 text-xs font-medium text-white bg-teal-700 rounded-md hover:bg-teal-800"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
