import type {
  ActivityActionType,
  ActivityLogEntry,
  Asset,
  BioTrackUser,
  BreakdownTicket,
  CalendarGridDay,
  CalibrationRecord,
  ComplianceAlert,
  ComprehensiveReportSegmentKey,
  ComprehensiveReportSegmentSelection,
  DashboardMetrics,
  DepartmentPerformance,
  EngineerCapacitySummary,
  EquipmentDepreciationSummary,
  FloorPlanBreakdownSeverity,
  FloorPlanDensityTier,
  FloorPlanDepartmentZone,
  FloorPlanLocationNode,
  MaintenanceCalendarEvent,
  MaintenanceCalendarMonthSummary,
  MonthlyMaintenanceTrend,
  OperationalStatus,
  PartOrder,
  Permission,
  PMFrequency,
  PMStatus,
  PreventiveMaintenance,
  ServiceContract,
  UserRole,
} from '../types/biotrack';

const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  Administrator: new Set<Permission>([
    'manage_assets',
    'delete_assets',
    'assign_engineer',
    'order_parts',
    'schedule_pm',
    'execute_pm',
    'report_breakdown',
    'resolve_breakdown',
    'manage_calibration',
    'manage_contracts',
    'export_reports',
    'manage_users',
  ]),
  'Biomedical Engineer': new Set<Permission>([
    'manage_assets',
    'order_parts',
    'schedule_pm',
    'execute_pm',
    'report_breakdown',
    'resolve_breakdown',
    'manage_calibration',
    'export_reports',
  ]),
  Supervisor: new Set<Permission>([
    'manage_assets',
    'assign_engineer',
    'order_parts',
    'schedule_pm',
    'report_breakdown',
    'resolve_breakdown',
    'manage_calibration',
    'manage_contracts',
    'export_reports',
  ]),
  'Department User': new Set<Permission>(['report_breakdown']),
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function getPermissionsForRole(role: UserRole): Permission[] {
  return Array.from(ROLE_PERMISSIONS[role] ?? []);
}

export function daysBetweenISO(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO.slice(0, 10)}T00:00:00Z`).getTime();
  const to = new Date(`${toISO.slice(0, 10)}T00:00:00Z`).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

export function addMonthsISO(dateISO: string, months: number): string {
  const [y, m, d] = dateISO.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return dateISO;
  const target = new Date(Date.UTC(y, m - 1 + months, d));
  const year = target.getUTCFullYear();
  const month = String(target.getUTCMonth() + 1).padStart(2, '0');
  const day = String(target.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function frequencyToMonths(frequency: PMFrequency): number {
  switch (frequency) {
    case 'Quarterly':
      return 3;
    case 'Semi-Annual':
      return 6;
    case 'Annual':
      return 12;
  }
}

export function derivePMStatus(pm: PreventiveMaintenance, referenceDate: string): PMStatus {
  if (pm.status === 'Completed') return 'Completed';
  if (pm.status === 'In Progress') {
    return daysBetweenISO(referenceDate, pm.scheduledDate) < 0 ? 'Overdue' : 'In Progress';
  }
  return daysBetweenISO(referenceDate, pm.scheduledDate) < 0 ? 'Overdue' : 'Scheduled';
}

export function deriveContractStatus(
  contract: Pick<ServiceContract, 'endDate'>,
  referenceDate: string,
): { status: 'Active' | 'Expiring Soon' | 'Expired'; daysRemaining: number } {
  const daysRemaining = daysBetweenISO(referenceDate, contract.endDate);
  if (daysRemaining < 0) {
    return { status: 'Expired', daysRemaining };
  }
  if (daysRemaining <= 60) {
    return { status: 'Expiring Soon', daysRemaining };
  }
  return { status: 'Active', daysRemaining };
}

export function deriveCalibrationStatus(
  dueDate: string,
  referenceDate: string,
): { status: 'Compliant' | 'Due Soon' | 'Overdue'; daysRemaining: number } {
  const daysRemaining = daysBetweenISO(referenceDate, dueDate);
  if (daysRemaining < 0) {
    return { status: 'Overdue', daysRemaining };
  }
  if (daysRemaining <= 30) {
    return { status: 'Due Soon', daysRemaining };
  }
  return { status: 'Compliant', daysRemaining };
}

export function computeDashboardMetrics(
  assets: Asset[],
  pms: PreventiveMaintenance[],
  breakdowns: BreakdownTicket[],
  _calibrations: CalibrationRecord[],
  contracts: ServiceContract[],
  referenceDate: string,
): DashboardMetrics {
  const totalAssets = assets.length;
  const operationalAssets = assets.filter((a) => a.status === 'Operational').length;
  const breakdownAssets = assets.filter((a) => a.status === 'Under Repair').length;
  const underMaintenanceAssets = assets.filter(
    (a) => a.status === 'Under Maintenance' || a.status === 'Calibration Due',
  ).length;
  const outOfServiceAssets = assets.filter((a) => a.status === 'Out of Service').length;

  let completedPmCount = 0;
  let overduePmCount = 0;
  let upcomingPmCount = 0;

  for (const pm of pms) {
    const effectiveStatus = derivePMStatus(pm, referenceDate);
    if (effectiveStatus === 'Completed') {
      completedPmCount += 1;
    } else if (effectiveStatus === 'Overdue') {
      overduePmCount += 1;
    } else {
      const daysUntil = daysBetweenISO(referenceDate, pm.scheduledDate);
      if (daysUntil >= 0 && daysUntil <= 30) {
        upcomingPmCount += 1;
      }
    }
  }

  const totalPmCount = pms.length;
  const pmComplianceRate =
    totalPmCount === 0 ? 100 : Math.round((completedPmCount / totalPmCount) * 100);

  let calibrationCompliantCount = 0;
  let calibrationDueSoonCount = 0;
  let calibrationOverdueCount = 0;

  for (const asset of assets) {
    const calState = deriveCalibrationStatus(asset.nextCalibrationDate, referenceDate);
    if (calState.status === 'Overdue') {
      calibrationOverdueCount += 1;
    } else if (calState.status === 'Due Soon') {
      calibrationDueSoonCount += 1;
    } else {
      calibrationCompliantCount += 1;
    }
  }

  const calibrationComplianceRate =
    totalAssets === 0 ? 100 : Math.round(((totalAssets - calibrationOverdueCount) / totalAssets) * 100);

  const openBreakdownsCount = breakdowns.filter((b) => b.status !== 'Resolved').length;
  const totalDowntimeHours = breakdowns.reduce((sum, b) => sum + (b.downtimeHours || 0), 0);

  let expiringContractsCount = 0;
  let expiredContractsCount = 0;
  for (const c of contracts) {
    const st = deriveContractStatus(c, referenceDate);
    if (st.status === 'Expiring Soon') expiringContractsCount += 1;
    if (st.status === 'Expired') expiredContractsCount += 1;
  }

  const deptMap = new Map<string, { total: number; operational: number; issues: number }>();
  for (const asset of assets) {
    const entry = deptMap.get(asset.department) ?? { total: 0, operational: 0, issues: 0 };
    entry.total += 1;
    if (asset.status === 'Operational') {
      entry.operational += 1;
    } else {
      entry.issues += 1;
    }
    deptMap.set(asset.department, entry);
  }

  const departmentDistribution = Array.from(deptMap.entries())
    .map(([department, counts]) => ({ department, ...counts }))
    .sort((a, b) => b.total - a.total);

  return {
    totalAssets,
    operationalAssets,
    breakdownAssets,
    underMaintenanceAssets,
    outOfServiceAssets,
    pmComplianceRate,
    completedPmCount,
    totalPmCount,
    overduePmCount,
    upcomingPmCount,
    calibrationCompliantCount,
    calibrationDueSoonCount,
    calibrationOverdueCount,
    calibrationComplianceRate,
    openBreakdownsCount,
    totalDowntimeHours,
    expiringContractsCount,
    expiredContractsCount,
    departmentDistribution,
  };
}

export function filterAssets(
  assets: Asset[],
  query: string,
  department: string,
  status: string,
  engineer: string = 'All',
): Asset[] {
  const q = query.trim().toLowerCase();
  return assets.filter((asset) => {
    if (department !== 'All' && asset.department !== department) return false;
    if (status !== 'All' && asset.status !== status) return false;
    if (engineer !== 'All' && asset.assignedEngineer !== engineer) return false;
    if (!q) return true;
    return (
      asset.assetCode.toLowerCase().includes(q) ||
      asset.name.toLowerCase().includes(q) ||
      asset.manufacturer.toLowerCase().includes(q) ||
      asset.model.toLowerCase().includes(q) ||
      asset.serialNumber.toLowerCase().includes(q) ||
      asset.department.toLowerCase().includes(q) ||
      asset.location.toLowerCase().includes(q) ||
      asset.assignedEngineer.toLowerCase().includes(q)
    );
  });
}

export function completePMTransition(
  pm: PreventiveMaintenance,
  asset: Asset | undefined,
  completionData: {
    completedDate: string;
    remarks: string;
    partsReplaced?: string;
    checklist: PreventiveMaintenance['checklist'];
  },
): { updatedPm: PreventiveMaintenance; updatedAsset?: Asset } {
  const updatedPm: PreventiveMaintenance = {
    ...pm,
    status: 'Completed',
    completedDate: completionData.completedDate,
    remarks: completionData.remarks,
    partsReplaced: completionData.partsReplaced ?? pm.partsReplaced,
    checklist: completionData.checklist,
  };

  if (!asset) {
    return { updatedPm };
  }

  const nextPmDate = addMonthsISO(
    completionData.completedDate,
    frequencyToMonths(pm.frequency),
  );

  const nextStatus: OperationalStatus =
    asset.status === 'Under Maintenance' ? 'Operational' : asset.status;

  return {
    updatedPm,
    updatedAsset: {
      ...asset,
      lastPmDate: completionData.completedDate,
      nextPmDate,
      status: nextStatus,
    },
  };
}

export function resolveBreakdownTransition(
  ticket: BreakdownTicket,
  asset: Asset | undefined,
  update: {
    status: BreakdownTicket['status'];
    diagnosis: string;
    correctiveAction: string;
    downtimeHours: number;
    assignedEngineer: string;
    resolvedDate?: string;
  },
): { updatedTicket: BreakdownTicket; updatedAsset?: Asset } {
  const isResolved = update.status === 'Resolved';
  const updatedTicket: BreakdownTicket = {
    ...ticket,
    status: update.status,
    diagnosis: update.diagnosis,
    correctiveAction: update.correctiveAction,
    downtimeHours: update.downtimeHours,
    assignedEngineer: update.assignedEngineer,
    resolvedDate: isResolved ? (update.resolvedDate ?? ticket.resolvedDate) : undefined,
  };

  if (!asset) {
    return { updatedTicket };
  }

  const nextAssetStatus: OperationalStatus = isResolved
    ? 'Operational'
    : 'Under Repair';

  return {
    updatedTicket,
    updatedAsset: {
      ...asset,
      status: nextAssetStatus,
    },
  };
}

export function generateNextAssetCode(assets: Asset[]): string {
  let maxNum = 1000;
  for (const a of assets) {
    const match = a.assetCode.match(/BIO-(\d+)/i);
    if (match) {
      const n = Number(match[1]);
      if (n > maxNum) maxNum = n;
    }
  }
  return `BIO-${maxNum + 1}`;
}

export function generateNextTicketNumber(tickets: BreakdownTicket[]): string {
  let maxNum = 2000;
  for (const t of tickets) {
    const match = t.ticketNumber.match(/BD-(\d+)/i);
    if (match) {
      const n = Number(match[1]);
      if (n > maxNum) maxNum = n;
    }
  }
  return `BD-${maxNum + 1}`;
}

export function createActivityLogEntry(params: {
  assetId: string;
  assetCode: string;
  actor: Pick<BioTrackUser, 'name' | 'role'>;
  actionType: ActivityActionType;
  summary: string;
  details?: string;
  timestamp?: string;
}): ActivityLogEntry {
  return {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    assetId: params.assetId,
    assetCode: params.assetCode,
    timestamp: params.timestamp ?? new Date().toISOString().slice(0, 16).replace('T', ' '),
    actorName: params.actor.name,
    actorRole: params.actor.role,
    actionType: params.actionType,
    summary: params.summary,
    details: params.details,
  };
}

export function buildAssetUpdateAuditEntries(
  previous: Asset,
  next: Asset,
  actor: Pick<BioTrackUser, 'name' | 'role'>,
  timestamp?: string,
): ActivityLogEntry[] {
  const entries: ActivityLogEntry[] = [];

  if (previous.assignedEngineer !== next.assignedEngineer) {
    entries.push(
      createActivityLogEntry({
        assetId: next.id,
        assetCode: next.assetCode,
        actor,
        actionType: 'Engineer Assigned',
        summary: `Assigned machine from ${previous.assignedEngineer || 'Unassigned'} to ${next.assignedEngineer || 'Unassigned'}`,
        details: `${next.department} (${next.location})`,
        timestamp,
      }),
    );
  }

  if (previous.status !== next.status) {
    entries.push(
      createActivityLogEntry({
        assetId: next.id,
        assetCode: next.assetCode,
        actor,
        actionType: 'Status Changed',
        summary: `Operational status changed from ${previous.status} to ${next.status}`,
        details: next.notes ? `Notes: ${next.notes}` : undefined,
        timestamp,
      }),
    );
  }

  const changedFields: string[] = [];
  if (previous.department !== next.department) {
    changedFields.push(`Department: ${previous.department} -> ${next.department}`);
  }
  if (previous.location !== next.location) {
    changedFields.push(`Location: ${previous.location} -> ${next.location}`);
  }
  if (previous.name !== next.name) {
    changedFields.push(`Name: ${previous.name} -> ${next.name}`);
  }
  if (previous.warrantyEnd !== next.warrantyEnd) {
    changedFields.push(`Warranty End: ${previous.warrantyEnd} -> ${next.warrantyEnd}`);
  }
  if (previous.riskClass !== next.riskClass) {
    changedFields.push(`Risk Class: ${previous.riskClass} -> ${next.riskClass}`);
  }
  if (previous.serialNumber !== next.serialNumber) {
    changedFields.push(`Serial: ${previous.serialNumber} -> ${next.serialNumber}`);
  }
  if ((previous.expectedLifecycleYears ?? null) !== (next.expectedLifecycleYears ?? null)) {
    const prevLife = resolveAssetLifecycleYears(previous);
    const nextLife = resolveAssetLifecycleYears(next);
    if (prevLife !== nextLife || next.expectedLifecycleYears !== undefined) {
      changedFields.push(`Expected Lifecycle: ${prevLife} yrs -> ${nextLife} yrs`);
    }
  }
  if (
    (previous.safetyCertificationName ?? '') !== (next.safetyCertificationName ?? '') ||
    (previous.safetyCertificationExpiry ?? '') !== (next.safetyCertificationExpiry ?? '')
  ) {
    changedFields.push(
      `Safety Cert: ${next.safetyCertificationName || 'Standard'} (exp ${next.safetyCertificationExpiry || '—'})`,
    );
  }

  if (changedFields.length > 0) {
    entries.push(
      createActivityLogEntry({
        assetId: next.id,
        assetCode: next.assetCode,
        actor,
        actionType: 'Equipment Updated',
        summary: `Updated ${changedFields.length} equipment record field${changedFields.length > 1 ? 's' : ''}`,
        details: changedFields.join(' · '),
        timestamp,
      }),
    );
  }

  return entries;
}

export function getAssetActivityLogs(
  logs: ActivityLogEntry[],
  assetId: string,
): ActivityLogEntry[] {
  return logs
    .filter((entry) => entry.assetId === assetId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export interface MachineWorkSummary {
  asset: Asset;
  pms: PreventiveMaintenance[];
  completedPmCount: number;
  breakdowns: BreakdownTicket[];
  resolvedBreakdownsCount: number;
  totalDowntimeHours: number;
  calibrations: CalibrationRecord[];
  contracts: ServiceContract[];
  activityLogs: ActivityLogEntry[];
}

export function buildMachineWorkSummary(
  asset: Asset,
  pms: PreventiveMaintenance[],
  breakdowns: BreakdownTicket[],
  calibrations: CalibrationRecord[],
  contracts: ServiceContract[],
  activityLogs: ActivityLogEntry[],
): MachineWorkSummary {
  const assetPms = pms.filter((p) => p.assetId === asset.id);
  const assetBreakdowns = breakdowns.filter((b) => b.assetId === asset.id);
  const assetCals = calibrations.filter((c) => c.assetId === asset.id);
  const assetContracts = contracts.filter((c) => c.assetId === asset.id);
  const assetLogs = getAssetActivityLogs(activityLogs, asset.id);

  return {
    asset,
    pms: assetPms,
    completedPmCount: assetPms.filter((p) => p.status === 'Completed').length,
    breakdowns: assetBreakdowns,
    resolvedBreakdownsCount: assetBreakdowns.filter((b) => b.status === 'Resolved').length,
    totalDowntimeHours: assetBreakdowns.reduce((sum, b) => sum + (b.downtimeHours || 0), 0),
    calibrations: assetCals,
    contracts: assetContracts,
    activityLogs: assetLogs,
  };
}

export function generateNextOrderNumber(orders: PartOrder[]): string {
  let maxNum = 3000;
  for (const o of orders) {
    const match = o.orderNumber.match(/PO-(\d+)/i);
    if (match) {
      const n = Number(match[1]);
      if (n > maxNum) maxNum = n;
    }
  }
  return `PO-${maxNum + 1}`;
}

export interface EngineerOrdersSummary {
  engineerName: string;
  specialty: string;
  orderCount: number;
  totalUnitsOrdered: number;
  pendingCount: number;
  deliveredCount: number;
  totalSpend: number;
  orders: PartOrder[];
}

export function aggregateOrdersByEngineer(
  orders: PartOrder[],
  users: BioTrackUser[],
): EngineerOrdersSummary[] {
  const byEngineer = new Map<string, PartOrder[]>();
  for (const user of users) {
    if (user.active && user.role === 'Biomedical Engineer') {
      byEngineer.set(user.name, []);
    }
  }
  for (const order of orders) {
    const list = byEngineer.get(order.orderedBy) ?? [];
    list.push(order);
    byEngineer.set(order.orderedBy, list);
  }

  return Array.from(byEngineer.entries())
    .map(([engineerName, engOrders]) => {
      const user = users.find((u) => u.name === engineerName);
      const sorted = [...engOrders].sort((a, b) => b.orderDate.localeCompare(a.orderDate));
      return {
        engineerName,
        specialty: user?.specialty ?? 'Biomedical Engineering',
        orderCount: sorted.length,
        totalItems: sorted.length,
        totalUnitsOrdered: sorted
          .filter((o) => o.status !== 'Cancelled')
          .reduce((sum, o) => sum + o.quantity, 0),
        pendingCount: sorted.filter((o) => o.status === 'Ordered' || o.status === 'Shipped').length,
        deliveredCount: sorted.filter((o) => o.status === 'Delivered').length,
        totalSpend: sorted
          .filter((o) => o.status !== 'Cancelled')
          .reduce((sum, o) => sum + o.quantity * o.unitCost, 0),
        orders: sorted,
      };
    })
    .sort((a, b) => b.orderCount - a.orderCount || a.engineerName.localeCompare(b.engineerName));
}

export interface MachineComplaintStat {
  asset: Asset;
  totalComplaints: number;
  openComplaints: number;
  totalDowntimeHours: number;
  latestTicket?: BreakdownTicket;
  needsOemEscalation: boolean;
}

export function getMachineComplaintStats(
  assets: Asset[],
  breakdowns: BreakdownTicket[],
): MachineComplaintStat[] {
  return assets
    .map((asset) => {
      const tickets = breakdowns
        .filter((b) => b.assetId === asset.id)
        .sort((a, b) => b.reportedDate.localeCompare(a.reportedDate));
      const openComplaints = tickets.filter((b) => b.status !== 'Resolved').length;
      const totalDowntimeHours = tickets.reduce((sum, b) => sum + (b.downtimeHours || 0), 0);
      const hasCriticalActive = tickets.some(
        (b) => b.status !== 'Resolved' && b.priority === 'Critical',
      );
      return {
        asset,
        totalComplaints: tickets.length,
        openComplaints,
        totalDowntimeHours,
        latestTicket: tickets[0],
        needsOemEscalation: tickets.length >= 2 || hasCriticalActive,
      };
    })
    .filter((stat) => stat.totalComplaints > 0)
    .sort(
      (a, b) =>
        b.totalComplaints - a.totalComplaints ||
        b.openComplaints - a.openComplaints ||
        b.totalDowntimeHours - a.totalDowntimeHours,
    );
}

export function computeDepartmentPerformance(
  assets: Asset[],
  breakdowns: BreakdownTicket[],
): DepartmentPerformance[] {
  const deptMap = new Map<
    string,
    {
      totalAssets: number;
      activeAssets: number;
      operationalAssets: number;
      outOfServiceAssets: number;
      breakdownCount: number;
      openBreakdowns: number;
      totalDowntimeHours: number;
    }
  >();

  const ensureEntry = (department: string) => {
    const existing = deptMap.get(department);
    if (existing) return existing;
    const created = {
      totalAssets: 0,
      activeAssets: 0,
      operationalAssets: 0,
      outOfServiceAssets: 0,
      breakdownCount: 0,
      openBreakdowns: 0,
      totalDowntimeHours: 0,
    };
    deptMap.set(department, created);
    return created;
  };

  for (const asset of assets) {
    const entry = ensureEntry(asset.department);
    entry.totalAssets += 1;
    if (asset.status === 'Out of Service') {
      entry.outOfServiceAssets += 1;
    } else {
      entry.activeAssets += 1;
    }
    if (asset.status === 'Operational') {
      entry.operationalAssets += 1;
    }
  }

  for (const ticket of breakdowns) {
    const entry = ensureEntry(ticket.department);
    entry.breakdownCount += 1;
    if (ticket.status !== 'Resolved') {
      entry.openBreakdowns += 1;
    }
    entry.totalDowntimeHours += ticket.downtimeHours || 0;
  }

  return Array.from(deptMap.entries())
    .map(([department, counts]) => {
      const totalDowntimeHours = Number(counts.totalDowntimeHours.toFixed(1));
      const avgDowntimeHours =
        counts.activeAssets > 0
          ? Number((totalDowntimeHours / counts.activeAssets).toFixed(1))
          : 0;
      return {
        department,
        totalAssets: counts.totalAssets,
        activeAssets: counts.activeAssets,
        operationalAssets: counts.operationalAssets,
        outOfServiceAssets: counts.outOfServiceAssets,
        breakdownCount: counts.breakdownCount,
        openBreakdowns: counts.openBreakdowns,
        totalDowntimeHours,
        avgDowntimeHours,
      };
    })
    .sort(
      (a, b) =>
        b.activeAssets - a.activeAssets ||
        b.avgDowntimeHours - a.avgDowntimeHours ||
        a.department.localeCompare(b.department),
    );
}

const MONTH_SHORT_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export const PM_STANDARD_SERVICE_COST = 350;
export const BREAKDOWN_BASE_DISPATCH_COST = 250;
export const BREAKDOWN_HOURLY_REPAIR_RATE = 120;

export function computeMonthlyMaintenanceTrends(
  pms: PreventiveMaintenance[],
  breakdowns: BreakdownTicket[],
  partOrders: PartOrder[],
  referenceDate: string,
  monthCount: number = 6,
): MonthlyMaintenanceTrend[] {
  const [yearStr, monthStr] = referenceDate.slice(0, 7).split('-');
  const refYear = Number(yearStr) || 2026;
  const refMonth = Number(monthStr) || 11;
  const count = Math.max(1, monthCount);

  const buckets = new Map<
    string,
    {
      monthKey: string;
      monthLabel: string;
      shortLabel: string;
      pmCount: number;
      breakdownCount: number;
      downtimeHours: number;
      partsCost: number;
    }
  >();
  const orderedKeys: string[] = [];

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const d = new Date(Date.UTC(refYear, refMonth - 1 - offset, 1));
    const y = d.getUTCFullYear();
    const mIndex = d.getUTCMonth();
    const key = `${y}-${String(mIndex + 1).padStart(2, '0')}`;
    const shortName = MONTH_SHORT_NAMES[mIndex];
    orderedKeys.push(key);
    buckets.set(key, {
      monthKey: key,
      monthLabel: `${shortName} ${y}`,
      shortLabel: shortName,
      pmCount: 0,
      breakdownCount: 0,
      downtimeHours: 0,
      partsCost: 0,
    });
  }

  for (const pm of pms) {
    const dateStr = pm.status === 'Completed' && pm.completedDate ? pm.completedDate : pm.scheduledDate;
    const key = dateStr.slice(0, 7);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.pmCount += 1;
    }
  }

  for (const ticket of breakdowns) {
    const key = ticket.reportedDate.slice(0, 7);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.breakdownCount += 1;
      bucket.downtimeHours += ticket.downtimeHours || 0;
    }
  }

  for (const order of partOrders) {
    if (order.status === 'Cancelled') continue;
    const key = order.orderDate.slice(0, 7);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.partsCost += order.quantity * order.unitCost;
    }
  }

  return orderedKeys.map((key) => {
    const b = buckets.get(key)!;
    const downtimeHours = Number(b.downtimeHours.toFixed(1));
    const partsCost = Math.round(b.partsCost);
    const pmServiceCost = b.pmCount * PM_STANDARD_SERVICE_COST;
    const breakdownRepairCost =
      b.breakdownCount * BREAKDOWN_BASE_DISPATCH_COST +
      Math.round(downtimeHours * BREAKDOWN_HOURLY_REPAIR_RATE);
    const totalMaintenanceCost = partsCost + pmServiceCost + breakdownRepairCost;

    return {
      monthKey: b.monthKey,
      monthLabel: b.monthLabel,
      shortLabel: b.shortLabel,
      pmCount: b.pmCount,
      breakdownCount: b.breakdownCount,
      downtimeHours,
      partsCost,
      pmServiceCost,
      breakdownRepairCost,
      totalMaintenanceCost,
    };
  });
}

const MONTH_FULL_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function shiftYearMonth(
  year: number,
  month: number,
  deltaMonths: number,
): { year: number; month: number } {
  const d = new Date(Date.UTC(year, month - 1 + deltaMonths, 1));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
  };
}

function formatDateISOUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function computeMaintenanceCalendarMonth(
  assets: Asset[],
  pms: PreventiveMaintenance[],
  year: number,
  month: number,
  referenceDate: string,
  filters?: {
    type?: 'all' | 'pm' | 'calibration';
    department?: string;
    engineer?: string;
  },
): MaintenanceCalendarMonthSummary {
  const targetMonthKey = `${year}-${String(month).padStart(2, '0')}`;
  const typeFilter = filters?.type ?? 'all';
  const departmentFilter = filters?.department ?? 'All';
  const engineerFilter = filters?.engineer ?? 'All';

  const assetById = new Map(assets.map((a) => [a.id, a]));
  const events: MaintenanceCalendarEvent[] = [];
  const scheduledPmAssetMonths = new Set<string>();

  for (const pm of pms) {
    const effectiveDate =
      pm.status === 'Completed' && pm.completedDate ? pm.completedDate : pm.scheduledDate;
    scheduledPmAssetMonths.add(`${pm.assetId}:${effectiveDate.slice(0, 7)}`);

    if (typeFilter === 'calibration') continue;
    if (effectiveDate.slice(0, 7) !== targetMonthKey) continue;
    if (departmentFilter !== 'All' && pm.department !== departmentFilter) continue;
    if (engineerFilter !== 'All' && pm.assignedEngineer !== engineerFilter) continue;

    events.push({
      id: `cal-pm-${pm.id}`,
      type: 'pm',
      date: effectiveDate,
      assetId: pm.assetId,
      assetCode: pm.assetCode,
      assetName: pm.assetName,
      department: pm.department,
      assignedEngineer: pm.assignedEngineer,
      title: `${pm.frequency} PM`,
      status: derivePMStatus(pm, referenceDate),
    });
  }

  for (const asset of assets) {
    if (asset.status === 'Out of Service') continue;
    if (departmentFilter !== 'All' && asset.department !== departmentFilter) continue;
    if (engineerFilter !== 'All' && asset.assignedEngineer !== engineerFilter) continue;

    // Planned nextPmDate from asset record if no explicit PM work order already exists in that month
    if (
      typeFilter !== 'calibration' &&
      asset.nextPmDate &&
      asset.nextPmDate.slice(0, 7) === targetMonthKey &&
      !scheduledPmAssetMonths.has(`${asset.id}:${targetMonthKey}`)
    ) {
      const isOverdue = daysBetweenISO(referenceDate, asset.nextPmDate) < 0;
      events.push({
        id: `cal-asset-pm-${asset.id}`,
        type: 'pm',
        date: asset.nextPmDate,
        assetId: asset.id,
        assetCode: asset.assetCode,
        assetName: asset.name,
        department: asset.department,
        assignedEngineer: asset.assignedEngineer,
        title: 'Scheduled PM Due',
        status: isOverdue ? 'Overdue' : 'Scheduled',
      });
    }

    // Calibration deadline from asset record
    if (
      typeFilter !== 'pm' &&
      asset.nextCalibrationDate &&
      asset.nextCalibrationDate.slice(0, 7) === targetMonthKey
    ) {
      const calState = deriveCalibrationStatus(asset.nextCalibrationDate, referenceDate);
      events.push({
        id: `cal-due-${asset.id}`,
        type: 'calibration',
        date: asset.nextCalibrationDate,
        assetId: asset.id,
        assetCode: asset.assetCode,
        assetName: asset.name,
        department: asset.department,
        assignedEngineer: asset.assignedEngineer,
        title: 'Calibration Due',
        status: calState.status,
      });
    }
  }

  const eventsByDate = new Map<string, MaintenanceCalendarEvent[]>();
  for (const evt of events) {
    const list = eventsByDate.get(evt.date) ?? [];
    list.push(evt);
    eventsByDate.set(evt.date, list);
  }
  for (const list of eventsByDate.values()) {
    list.sort((a, b) => {
      const aOverdue = a.status === 'Overdue' ? 0 : 1;
      const bOverdue = b.status === 'Overdue' ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      if (a.type !== b.type) return a.type === 'pm' ? -1 : 1;
      return a.assetCode.localeCompare(b.assetCode);
    });
  }

  // Build Sunday-to-Saturday calendar grid covering the full month
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const lastOfMonth = new Date(Date.UTC(year, month, 0));
  const leadingEmptyDays = firstOfMonth.getUTCDay(); // 0 = Sun
  const totalMonthDays = lastOfMonth.getUTCDate();
  const totalCells = Math.ceil((leadingEmptyDays + totalMonthDays) / 7) * 7;

  const days: CalendarGridDay[] = [];
  for (let cellIdx = 0; cellIdx < totalCells; cellIdx += 1) {
    const cellDate = new Date(Date.UTC(year, month - 1, 1 - leadingEmptyDays + cellIdx));
    const dateISO = formatDateISOUTC(cellDate);
    const inCurrentMonth =
      cellDate.getUTCFullYear() === year && cellDate.getUTCMonth() === month - 1;
    days.push({
      dateISO,
      dayOfMonth: cellDate.getUTCDate(),
      inCurrentMonth,
      isToday: dateISO === referenceDate,
      events: inCurrentMonth ? (eventsByDate.get(dateISO) ?? []) : [],
    });
  }

  // Suppress unused variable lint if assetById isn't needed directly
  void assetById;

  const pmCount = events.filter((e) => e.type === 'pm').length;
  const calibrationCount = events.filter((e) => e.type === 'calibration').length;
  const overdueCount = events.filter((e) => e.status === 'Overdue').length;
  const upcomingCount = events.filter(
    (e) =>
      e.status !== 'Completed' &&
      e.status !== 'Overdue' &&
      daysBetweenISO(referenceDate, e.date) >= 0,
  ).length;

  return {
    year,
    month,
    monthLabel: `${MONTH_FULL_NAMES[month - 1]} ${year}`,
    days,
    pmCount,
    calibrationCount,
    overdueCount,
    upcomingCount,
  };
}

export function computeEngineerCapacity(
  users: BioTrackUser[],
  assets: Asset[],
  pms: PreventiveMaintenance[],
  breakdowns: BreakdownTicket[],
  referenceDate: string,
): EngineerCapacitySummary[] {
  const engineers = users.filter((u) => u.active && u.role === 'Biomedical Engineer');

  return engineers
    .map((engineer) => {
      const assignedAssetsCount = assets.filter(
        (a) => a.assignedEngineer === engineer.name && a.status !== 'Out of Service',
      ).length;

      const openTickets = breakdowns
        .filter((b) => b.status !== 'Resolved' && b.assignedEngineer === engineer.name)
        .sort((a, b) => a.reportedDate.localeCompare(b.reportedDate));

      const pendingPms = pms
        .filter((pm) => pm.assignedEngineer === engineer.name && pm.status !== 'Completed')
        .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

      let upcomingPmCount = 0;
      let overduePmCount = 0;
      for (const pm of pendingPms) {
        const eff = derivePMStatus(pm, referenceDate);
        if (eff === 'Overdue') {
          overduePmCount += 1;
        } else if (eff === 'Scheduled' || eff === 'In Progress') {
          upcomingPmCount += 1;
        }
      }

      const openTicketsCount = openTickets.length;
      const totalActiveWorkload = openTicketsCount + upcomingPmCount + overduePmCount;

      let capacityStatus: EngineerCapacitySummary['capacityStatus'] = 'Balanced';
      if (totalActiveWorkload === 0) {
        capacityStatus = 'Available';
      } else if (totalActiveWorkload >= 3 || (openTicketsCount >= 1 && overduePmCount >= 1)) {
        capacityStatus = 'High Load';
      } else if (totalActiveWorkload === 1 && openTicketsCount === 0 && overduePmCount === 0) {
        capacityStatus = 'Available';
      }

      return {
        engineerId: engineer.id,
        engineerName: engineer.name,
        specialty: engineer.specialty,
        assignedAssetsCount,
        openTicketsCount,
        upcomingPmCount,
        overduePmCount,
        totalActiveWorkload,
        capacityStatus,
        openTickets,
        pendingPms,
      };
    })
    .sort(
      (a, b) =>
        b.totalActiveWorkload - a.totalActiveWorkload ||
        b.openTicketsCount - a.openTicketsCount ||
        b.overduePmCount - a.overduePmCount ||
        a.engineerName.localeCompare(b.engineerName),
    );
}

const CATEGORY_LIFECYCLE_DEFAULTS: Record<string, number> = {
  'Diagnostic Imaging': 10,
  'Life Support': 8,
  'Surgical Equipment': 8,
  'Renal Care': 7,
  'Laboratory Analyzer': 7,
  'Patient Monitoring': 6,
  'Emergency Resuscitation': 6,
  'Infusion Therapy': 5,
};

export function defaultLifecycleYearsForCategory(category: string): number {
  return CATEGORY_LIFECYCLE_DEFAULTS[category] ?? 7;
}

export function resolveAssetLifecycleYears(
  asset: Pick<Asset, 'category' | 'expectedLifecycleYears'>,
): number {
  if (
    typeof asset.expectedLifecycleYears === 'number' &&
    Number.isFinite(asset.expectedLifecycleYears) &&
    asset.expectedLifecycleYears >= 1
  ) {
    return Math.round(asset.expectedLifecycleYears);
  }
  return defaultLifecycleYearsForCategory(asset.category);
}

export function calculateEquipmentDepreciation(params: {
  purchaseCost: number;
  purchaseDate: string;
  expectedLifecycleYears: number;
  referenceDate: string;
  salvageRatePercent?: number;
}): EquipmentDepreciationSummary {
  const purchaseCost = Math.max(0, Number(params.purchaseCost) || 0);
  const expectedLifecycleYears = Math.max(1, Math.round(params.expectedLifecycleYears) || 1);
  const salvageRatePercent = Math.min(
    90,
    Math.max(0, Number(params.salvageRatePercent ?? 0) || 0),
  );

  const salvageValue = Math.round(purchaseCost * (salvageRatePercent / 100));
  const depreciableBase = Math.max(0, purchaseCost - salvageValue);
  const annualDepreciation = Math.round(depreciableBase / expectedLifecycleYears);

  const daysElapsed = Math.max(0, daysBetweenISO(params.purchaseDate, params.referenceDate));
  const totalLifecycleDays = expectedLifecycleYears * 365.25;
  const fractionElapsed =
    totalLifecycleDays > 0 ? Math.min(1, Math.max(0, daysElapsed / totalLifecycleDays)) : 1;

  const elapsedYears = Number((fractionElapsed * expectedLifecycleYears).toFixed(2));
  const remainingYears = Number(Math.max(0, expectedLifecycleYears - elapsedYears).toFixed(2));

  const accumulatedDepreciation = Math.min(
    depreciableBase,
    Math.round(depreciableBase * fractionElapsed),
  );
  const remainingValue = Math.max(salvageValue, Math.round(purchaseCost - accumulatedDepreciation));

  const depreciationPercent =
    purchaseCost > 0 ? Math.min(100, Math.round((accumulatedDepreciation / purchaseCost) * 100)) : 0;
  const remainingValuePercent =
    purchaseCost > 0 ? Math.max(0, Math.round((remainingValue / purchaseCost) * 100)) : 0;

  const lifecycleEndDate = addMonthsISO(params.purchaseDate, expectedLifecycleYears * 12);

  let lifecycleStatus: EquipmentDepreciationSummary['lifecycleStatus'] = 'Active Lifecycle';
  if (fractionElapsed >= 1) {
    lifecycleStatus = 'Fully Depreciated';
  } else if (fractionElapsed >= 0.75) {
    lifecycleStatus = 'Near End of Life';
  }

  return {
    purchaseCost,
    purchaseDate: params.purchaseDate,
    referenceDate: params.referenceDate,
    expectedLifecycleYears,
    salvageRatePercent,
    salvageValue,
    annualDepreciation,
    elapsedYears,
    remainingYears,
    accumulatedDepreciation,
    remainingValue,
    depreciationPercent,
    remainingValuePercent,
    lifecycleEndDate,
    lifecycleStatus,
  };
}

export interface ComprehensiveReportInventoryRow {
  asset: Asset;
  lifecycleYears: number;
  remainingValue: number;
  remainingValuePercent: number;
}

export interface ComprehensiveReportScheduleRow extends PreventiveMaintenance {
  effectiveStatus: PMStatus;
}

export interface ComprehensiveReportData {
  generatedDate: string;
  summary: {
    totalAssets: number;
    operationalAssets: number;
    totalAcquisitionValue: number;
    totalRemainingValue: number;
    activePmCount: number;
    overduePmCount: number;
    openBreakdownCount: number;
    recentCalibrationCount: number;
    activeContractCount: number;
  };
  inventory: ComprehensiveReportInventoryRow[];
  activeMaintenanceSchedules: ComprehensiveReportScheduleRow[];
  openBreakdowns: BreakdownTicket[];
  recentCalibrations: CalibrationRecord[];
}

const PRIORITY_RANK: Record<BreakdownTicket['priority'], number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

export function buildComprehensiveReportData(params: {
  assets: Asset[];
  pms: PreventiveMaintenance[];
  breakdowns: BreakdownTicket[];
  calibrations: CalibrationRecord[];
  contracts: ServiceContract[];
  referenceDate: string;
}): ComprehensiveReportData {
  const { assets, pms, breakdowns, calibrations, contracts, referenceDate } = params;

  const inventory: ComprehensiveReportInventoryRow[] = assets.map((asset) => {
    const dep = calculateEquipmentDepreciation({
      purchaseCost: asset.purchaseCost,
      purchaseDate: asset.purchaseDate,
      expectedLifecycleYears: resolveAssetLifecycleYears(asset),
      referenceDate,
    });
    return {
      asset,
      lifecycleYears: dep.expectedLifecycleYears,
      remainingValue: dep.remainingValue,
      remainingValuePercent: dep.remainingValuePercent,
    };
  });

  const activeMaintenanceSchedules: ComprehensiveReportScheduleRow[] = pms
    .map((pm) => ({
      ...pm,
      effectiveStatus: derivePMStatus(pm, referenceDate),
    }))
    .filter((pm) => pm.effectiveStatus !== 'Completed')
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

  const openBreakdowns = breakdowns
    .filter((b) => b.status !== 'Resolved')
    .sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        a.reportedDate.localeCompare(b.reportedDate),
    );

  const recentCalibrations = [...calibrations].sort((a, b) =>
    b.calibrationDate.localeCompare(a.calibrationDate),
  );

  return {
    generatedDate: referenceDate,
    summary: {
      totalAssets: assets.length,
      operationalAssets: assets.filter((a) => a.status === 'Operational').length,
      totalAcquisitionValue: assets.reduce((sum, a) => sum + (a.purchaseCost || 0), 0),
      totalRemainingValue: inventory.reduce((sum, row) => sum + row.remainingValue, 0),
      activePmCount: activeMaintenanceSchedules.length,
      overduePmCount: activeMaintenanceSchedules.filter((pm) => pm.effectiveStatus === 'Overdue')
        .length,
      openBreakdownCount: openBreakdowns.length,
      recentCalibrationCount: recentCalibrations.length,
      activeContractCount: contracts.filter(
        (c) => deriveContractStatus(c, referenceDate).status !== 'Expired',
      ).length,
    },
    inventory,
    activeMaintenanceSchedules,
    openBreakdowns,
    recentCalibrations,
  };
}

const CATEGORY_SAFETY_CERT_DEFAULTS: Record<string, string> = {
  'Diagnostic Imaging': 'AERB / IEC 60601 Radiation & Electrical Safety',
  'Life Support': 'ISO 80601 / IEC 60601 Life Support Safety',
  'Surgical Equipment': 'IEC 60601-1 Surgical Electrical Safety',
  'Renal Care': 'IEC 60601-2-16 Hemodialysis Safety',
  'Laboratory Analyzer': 'IEC 61010-2-101 IVD Bio-Safety',
  'Patient Monitoring': 'IEC 60601-1 Patient Leakage Safety',
  'Emergency Resuscitation': 'IEC 60601-2-4 Defibrillator Safety',
  'Infusion Therapy': 'IEC 60601-2-24 Infusion Safety',
};

export function defaultSafetyCertificationForCategory(category: string): string {
  return CATEGORY_SAFETY_CERT_DEFAULTS[category] ?? 'IEC 60601-1 Electrical Safety';
}

export function deriveSafetyCertificationStatus(
  expiryDate: string | undefined,
  referenceDate: string,
): { status: 'Valid' | 'Due Soon' | 'Expired' | 'Not Set'; daysRemaining: number } {
  if (!expiryDate || !expiryDate.trim()) {
    return { status: 'Not Set', daysRemaining: 0 };
  }
  const daysRemaining = daysBetweenISO(referenceDate, expiryDate);
  if (daysRemaining < 0) {
    return { status: 'Expired', daysRemaining };
  }
  if (daysRemaining <= 30) {
    return { status: 'Due Soon', daysRemaining };
  }
  return { status: 'Valid', daysRemaining };
}

export function computeComplianceAlerts(
  assets: Asset[],
  referenceDate: string,
): ComplianceAlert[] {
  const alerts: ComplianceAlert[] = [];

  for (const asset of assets) {
    if (asset.status === 'Out of Service') continue;

    const certState = deriveSafetyCertificationStatus(
      asset.safetyCertificationExpiry,
      referenceDate,
    );
    if (certState.status === 'Expired' || certState.status === 'Due Soon') {
      alerts.push({
        id: `comp-cert-${asset.id}`,
        assetId: asset.id,
        assetCode: asset.assetCode,
        assetName: asset.name,
        department: asset.department,
        location: asset.location,
        assignedEngineer: asset.assignedEngineer,
        category: 'Safety Certification',
        standardOrDetail:
          asset.safetyCertificationName?.trim() ||
          defaultSafetyCertificationForCategory(asset.category),
        dueDate: asset.safetyCertificationExpiry ?? '',
        daysRemaining: certState.daysRemaining,
        severity: certState.status === 'Expired' ? 'Expired' : 'Due Soon',
        targetTab: 'overview',
      });
    }

    const calState = deriveCalibrationStatus(asset.nextCalibrationDate, referenceDate);
    if (calState.status === 'Overdue' || calState.status === 'Due Soon') {
      alerts.push({
        id: `comp-cal-${asset.id}`,
        assetId: asset.id,
        assetCode: asset.assetCode,
        assetName: asset.name,
        department: asset.department,
        location: asset.location,
        assignedEngineer: asset.assignedEngineer,
        category: 'Calibration Deadline',
        standardOrDetail: 'NIST / ISO Metrology Calibration Due',
        dueDate: asset.nextCalibrationDate,
        daysRemaining: calState.daysRemaining,
        severity: calState.status === 'Overdue' ? 'Expired' : 'Due Soon',
        targetTab: 'calibration',
      });
    }
  }

  return alerts.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === 'Expired' ? -1 : 1;
    }
    if (a.daysRemaining !== b.daysRemaining) {
      return a.daysRemaining - b.daysRemaining;
    }
    if (a.assetCode !== b.assetCode) {
      return a.assetCode.localeCompare(b.assetCode);
    }
    return a.category.localeCompare(b.category);
  });
}

export const DEFAULT_COMPREHENSIVE_REPORT_SEGMENTS: ComprehensiveReportSegmentSelection = {
  inventory: true,
  activePm: true,
  openBreakdowns: true,
  calibrationHistory: true,
};

export const COMPREHENSIVE_REPORT_SEGMENT_LABELS: Record<
  ComprehensiveReportSegmentKey,
  string
> = {
  inventory: 'Equipment Inventory',
  activePm: 'Active Maintenance Schedules',
  openBreakdowns: 'Open Breakdowns',
  calibrationHistory: 'Calibration History',
};

export interface ResolvedComprehensiveSections {
  selectedKeys: ComprehensiveReportSegmentKey[];
  selectedLabels: string[];
  allSelected: boolean;
  noneSelected: boolean;
  subtitleText: string;
}

export function resolveComprehensiveReportSections(
  segments: ComprehensiveReportSegmentSelection,
): ResolvedComprehensiveSections {
  const orderedKeys: ComprehensiveReportSegmentKey[] = [
    'inventory',
    'activePm',
    'openBreakdowns',
    'calibrationHistory',
  ];
  const selectedKeys = orderedKeys.filter((key) => segments[key]);
  const selectedLabels = selectedKeys.map((key) => COMPREHENSIVE_REPORT_SEGMENT_LABELS[key]);
  const allSelected = selectedKeys.length === orderedKeys.length;
  const noneSelected = selectedKeys.length === 0;
  const subtitleText = allSelected
    ? 'Full Equipment Inventory, Active Maintenance Schedules, Open Breakdowns & Calibration History'
    : selectedLabels.join(', ');

  return {
    selectedKeys,
    selectedLabels,
    allSelected,
    noneSelected,
    subtitleText,
  };
}

export interface AssetInventoryIndicators {
  warrantyState: 'Active' | 'Expiring Soon' | 'Expired';
  warrantyDaysRemaining: number;
  pmState: 'Scheduled' | 'Upcoming' | 'Overdue' | 'None';
  pmDueDate?: string;
  pmDaysDelta?: number;
  needsAttention: boolean;
}

export function deriveAssetInventoryIndicators(
  asset: Pick<Asset, 'id' | 'status' | 'warrantyEnd' | 'nextPmDate'>,
  pms: PreventiveMaintenance[],
  referenceDate: string,
  options?: {
    warrantyThresholdDays?: number;
    pmThresholdDays?: number;
  },
): AssetInventoryIndicators {
  const warrantyThresholdDays = options?.warrantyThresholdDays ?? 60;
  const pmThresholdDays = options?.pmThresholdDays ?? 30;

  const warrantyDaysRemaining = daysBetweenISO(referenceDate, asset.warrantyEnd);
  let warrantyState: AssetInventoryIndicators['warrantyState'] = 'Active';
  if (warrantyDaysRemaining < 0) {
    warrantyState = 'Expired';
  } else if (warrantyDaysRemaining <= warrantyThresholdDays) {
    warrantyState = 'Expiring Soon';
  }

  let pmState: AssetInventoryIndicators['pmState'] = 'None';
  let pmDueDate: string | undefined;
  let pmDaysDelta: number | undefined;

  if (asset.status !== 'Out of Service') {
    const activePmDates = pms
      .filter(
        (pm) =>
          pm.assetId === asset.id && derivePMStatus(pm, referenceDate) !== 'Completed',
      )
      .map((pm) => pm.scheduledDate)
      .filter((d) => Boolean(d));

    const candidateDates =
      activePmDates.length > 0
        ? activePmDates
        : asset.nextPmDate
          ? [asset.nextPmDate]
          : [];

    if (candidateDates.length > 0) {
      candidateDates.sort((a, b) => a.localeCompare(b));
      pmDueDate = candidateDates[0];
      pmDaysDelta = daysBetweenISO(referenceDate, pmDueDate);

      if (pmDaysDelta < 0) {
        pmState = 'Overdue';
      } else if (pmDaysDelta <= pmThresholdDays) {
        pmState = 'Upcoming';
      } else {
        pmState = 'Scheduled';
      }
    }
  }

  const needsAttention =
    warrantyState === 'Expiring Soon' ||
    pmState === 'Upcoming' ||
    pmState === 'Overdue';

  return {
    warrantyState,
    warrantyDaysRemaining,
    pmState,
    pmDueDate,
    pmDaysDelta,
    needsAttention,
  };
}

interface DepartmentArchitecturalMeta {
  wingCode: string;
  floorNumber: 1 | 2 | 3;
  floorLabel: string;
  wingLabel: string;
  order: number;
}

const DEPARTMENT_FLOOR_MAP: Record<string, DepartmentArchitecturalMeta> = {
  Emergency: {
    wingCode: 'L1-ER',
    floorNumber: 1,
    floorLabel: 'Level 1 · Acute Trauma & Diagnostics',
    wingLabel: 'East Trauma Wing',
    order: 1,
  },
  Radiology: {
    wingCode: 'L1-RAD',
    floorNumber: 1,
    floorLabel: 'Level 1 · Acute Trauma & Diagnostics',
    wingLabel: 'West Imaging Wing',
    order: 2,
  },
  'Central Laboratory': {
    wingCode: 'L1-LAB',
    floorNumber: 1,
    floorLabel: 'Level 1 · Acute Trauma & Diagnostics',
    wingLabel: 'North Diagnostics Wing',
    order: 3,
  },
  ICU: {
    wingCode: 'L2-ICU',
    floorNumber: 2,
    floorLabel: 'Level 2 · Critical Care & Surgical Pavilion',
    wingLabel: 'North Critical Care Wing',
    order: 4,
  },
  'Operating Theatre': {
    wingCode: 'L2-OT',
    floorNumber: 2,
    floorLabel: 'Level 2 · Critical Care & Surgical Pavilion',
    wingLabel: 'Central Sterile Pavilion',
    order: 5,
  },
  NICU: {
    wingCode: 'L2-NICU',
    floorNumber: 2,
    floorLabel: 'Level 2 · Critical Care & Surgical Pavilion',
    wingLabel: 'East Neonatal Wing',
    order: 6,
  },
  Cardiology: {
    wingCode: 'L3-CARD',
    floorNumber: 3,
    floorLabel: 'Level 3 · Specialty Procedures & Renal Care',
    wingLabel: 'West Interventional Wing',
    order: 7,
  },
  'Dialysis Unit': {
    wingCode: 'L3-REN',
    floorNumber: 3,
    floorLabel: 'Level 3 · Specialty Procedures & Renal Care',
    wingLabel: 'East Renal Wing',
    order: 8,
  },
};

export function classifyEquipmentDensity(totalAssets: number): FloorPlanDensityTier {
  if (totalAssets >= 4) return 'Asset-Heavy';
  if (totalAssets === 3) return 'Moderate';
  return 'Standard';
}

export function classifyLocationSeverity(params: {
  openBreakdownsCount: number;
  criticalOpenCount: number;
  totalDowntimeHours: number;
  issueAssets: number;
}): FloorPlanBreakdownSeverity {
  if (
    params.criticalOpenCount > 0 ||
    params.openBreakdownsCount >= 2 ||
    (params.openBreakdownsCount >= 1 && params.totalDowntimeHours >= 20)
  ) {
    return 'High Breakdown';
  }
  if (params.openBreakdownsCount > 0 || params.issueAssets > 0) {
    return 'Watch';
  }
  return 'Nominal';
}

export function computeFloorPlanDepartments(
  assets: Asset[],
  breakdowns: BreakdownTicket[],
): FloorPlanDepartmentZone[] {
  const deptNames = new Set<string>(Object.keys(DEPARTMENT_FLOOR_MAP));
  for (const asset of assets) {
    if (asset.department) deptNames.add(asset.department);
  }
  for (const ticket of breakdowns) {
    if (ticket.department) deptNames.add(ticket.department);
  }

  const zones: FloorPlanDepartmentZone[] = [];

  for (const department of deptNames) {
    const meta = DEPARTMENT_FLOOR_MAP[department] ?? {
      wingCode: `L3-${department.slice(0, 3).toUpperCase()}`,
      floorNumber: 3 as const,
      floorLabel: 'Level 3 · Specialty Procedures & Renal Care',
      wingLabel: 'Annex Wing',
      order: 99,
    };

    const deptAssets = assets
      .filter((a) => a.department === department)
      .sort((a, b) => a.assetCode.localeCompare(b.assetCode));
    const deptBreakdowns = breakdowns.filter((b) => b.department === department);
    const openTickets = deptBreakdowns
      .filter((b) => b.status !== 'Resolved')
      .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);

    const totalAssets = deptAssets.length;
    const activeAssets = deptAssets.filter((a) => a.status !== 'Out of Service').length;
    const operationalAssets = deptAssets.filter((a) => a.status === 'Operational').length;
    const issueAssets = deptAssets.filter(
      (a) => a.status !== 'Operational' && a.status !== 'Out of Service',
    ).length;

    const openBreakdownsCount = openTickets.length;
    const criticalOpenCount = openTickets.filter(
      (b) => b.priority === 'Critical' || b.priority === 'High',
    ).length;
    const totalDowntimeHours = Number(
      deptBreakdowns.reduce((sum, b) => sum + (b.downtimeHours || 0), 0).toFixed(1),
    );

    const engineerCounts = new Map<string, number>();
    for (const a of deptAssets) {
      if (a.assignedEngineer) {
        engineerCounts.set(a.assignedEngineer, (engineerCounts.get(a.assignedEngineer) ?? 0) + 1);
      }
    }
    const leadEngineers = Array.from(engineerCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name);

    const locationMap = new Map<string, Asset[]>();
    for (const a of deptAssets) {
      const locName = a.location.trim() || `${department} General`;
      const list = locationMap.get(locName) ?? [];
      list.push(a);
      locationMap.set(locName, list);
    }

    const locations: FloorPlanLocationNode[] = Array.from(locationMap.entries())
      .map(([location, locAssets]) => {
        const locAssetIds = new Set(locAssets.map((a) => a.id));
        const locTickets = deptBreakdowns.filter(
          (b) => locAssetIds.has(b.assetId) || b.location === location,
        );
        const locOpen = locTickets.filter((b) => b.status !== 'Resolved');
        const locCritical = locOpen.filter(
          (b) => b.priority === 'Critical' || b.priority === 'High',
        ).length;
        const locDowntime = Number(
          locTickets.reduce((sum, b) => sum + (b.downtimeHours || 0), 0).toFixed(1),
        );
        const locIssues = locAssets.filter(
          (a) => a.status !== 'Operational' && a.status !== 'Out of Service',
        ).length;

        return {
          location,
          totalAssets: locAssets.length,
          operationalAssets: locAssets.filter((a) => a.status === 'Operational').length,
          issueAssets: locIssues,
          openBreakdownsCount: locOpen.length,
          criticalOpenCount: locCritical,
          totalDowntimeHours: locDowntime,
          severity: classifyLocationSeverity({
            openBreakdownsCount: locOpen.length,
            criticalOpenCount: locCritical,
            totalDowntimeHours: locDowntime,
            issueAssets: locIssues,
          }),
          assets: locAssets,
        };
      })
      .sort((a, b) => a.location.localeCompare(b.location));

    zones.push({
      department,
      wingCode: meta.wingCode,
      floorNumber: meta.floorNumber,
      floorLabel: meta.floorLabel,
      wingLabel: meta.wingLabel,
      totalAssets,
      activeAssets,
      operationalAssets,
      issueAssets,
      openBreakdownsCount,
      totalBreakdownsCount: deptBreakdowns.length,
      criticalOpenCount,
      totalDowntimeHours,
      densityTier: classifyEquipmentDensity(totalAssets),
      breakdownSeverity: classifyLocationSeverity({
        openBreakdownsCount,
        criticalOpenCount,
        totalDowntimeHours,
        issueAssets,
      }),
      leadEngineers,
      locations,
      assets: deptAssets,
      openTickets,
    });
  }

  return zones.sort((a, b) => {
    const aOrder = DEPARTMENT_FLOOR_MAP[a.department]?.order ?? 99;
    const bOrder = DEPARTMENT_FLOOR_MAP[b.department]?.order ?? 99;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.department.localeCompare(b.department);
  });
}








