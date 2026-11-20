export type UserRole =
  | 'Administrator'
  | 'Biomedical Engineer'
  | 'Supervisor'
  | 'Department User';

export type Permission =
  | 'manage_assets'
  | 'delete_assets'
  | 'assign_engineer'
  | 'order_parts'
  | 'schedule_pm'
  | 'execute_pm'
  | 'report_breakdown'
  | 'resolve_breakdown'
  | 'manage_calibration'
  | 'manage_contracts'
  | 'export_reports'
  | 'manage_users';

export type OperationalStatus =
  | 'Operational'
  | 'Under Repair'
  | 'Under Maintenance'
  | 'Calibration Due'
  | 'Out of Service';

export type RiskClass = 'High' | 'Medium' | 'Low';

export interface Asset {
  id: string;
  assetCode: string;
  name: string;
  category: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  department: string;
  location: string;
  assignedEngineer: string;
  purchaseDate: string;
  purchaseCost: number;
  expectedLifecycleYears?: number;
  warrantyEnd: string;
  status: OperationalStatus;
  riskClass: RiskClass;
  lastPmDate: string;
  nextPmDate: string;
  nextCalibrationDate: string;
  safetyCertificationName?: string;
  safetyCertificationExpiry?: string;
  notes?: string;
}

export type PMFrequency = 'Quarterly' | 'Semi-Annual' | 'Annual';

export type PMStatus = 'Scheduled' | 'In Progress' | 'Completed' | 'Overdue';

export interface PMChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

export interface PreventiveMaintenance {
  id: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  department: string;
  frequency: PMFrequency;
  scheduledDate: string;
  completedDate?: string;
  assignedEngineer: string;
  status: PMStatus;
  checklist: PMChecklistItem[];
  remarks: string;
  partsReplaced?: string;
}

export type BreakdownPriority = 'Critical' | 'High' | 'Medium' | 'Low';

export type BreakdownStatus = 'Open' | 'In Progress' | 'Awaiting Parts' | 'Resolved';

export interface BreakdownTicket {
  id: string;
  ticketNumber: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  department: string;
  location: string;
  reportedBy: string;
  reportedDate: string;
  priority: BreakdownPriority;
  faultDescription: string;
  assignedEngineer: string;
  diagnosis: string;
  correctiveAction: string;
  status: BreakdownStatus;
  resolvedDate?: string;
  downtimeHours: number;
}

export type CalibrationResult = 'Pass' | 'Fail' | 'Conditional';

export interface CalibrationRecord {
  id: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  department: string;
  calibrationDate: string;
  dueDate: string;
  performedBy: string;
  standardUsed: string;
  result: CalibrationResult;
  deviationNotes: string;
  certificateId: string;
  certificateFileName: string;
}

export type ContractType = 'Manufacturer Warranty' | 'AMC' | 'CMC';

export interface ServiceContract {
  id: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  department: string;
  contractType: ContractType;
  vendor: string;
  contractNumber: string;
  startDate: string;
  endDate: string;
  annualCost: number;
  coverageDetails: string;
  contactPhone: string;
}

export interface BioTrackUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  specialty: string;
  active: boolean;
}

export type NavSection =
  | 'dashboard'
  | 'assets'
  | 'floormap'
  | 'pm'
  | 'calendar'
  | 'breakdowns'
  | 'calibration'
  | 'contracts'
  | 'parts'
  | 'reports'
  | 'users';

export interface DashboardMetrics {
  totalAssets: number;
  operationalAssets: number;
  breakdownAssets: number;
  underMaintenanceAssets: number;
  outOfServiceAssets: number;
  pmComplianceRate: number;
  completedPmCount: number;
  totalPmCount: number;
  overduePmCount: number;
  upcomingPmCount: number;
  calibrationCompliantCount: number;
  calibrationDueSoonCount: number;
  calibrationOverdueCount: number;
  calibrationComplianceRate: number;
  openBreakdownsCount: number;
  totalDowntimeHours: number;
  expiringContractsCount: number;
  expiredContractsCount: number;
  departmentDistribution: Array<{ department: string; total: number; operational: number; issues: number }>;
}

export interface DepartmentPerformance {
  department: string;
  totalAssets: number;
  activeAssets: number;
  operationalAssets: number;
  outOfServiceAssets: number;
  breakdownCount: number;
  openBreakdowns: number;
  totalDowntimeHours: number;
  avgDowntimeHours: number;
}

export interface MonthlyMaintenanceTrend {
  monthKey: string;
  monthLabel: string;
  shortLabel: string;
  pmCount: number;
  breakdownCount: number;
  downtimeHours: number;
  partsCost: number;
  pmServiceCost: number;
  breakdownRepairCost: number;
  totalMaintenanceCost: number;
}

export type CalendarEventType = 'pm' | 'calibration';

export type CalendarEventStatus =
  | 'Completed'
  | 'In Progress'
  | 'Scheduled'
  | 'Overdue'
  | 'Due Soon'
  | 'Compliant';

export interface MaintenanceCalendarEvent {
  id: string;
  type: CalendarEventType;
  date: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  department: string;
  assignedEngineer: string;
  title: string;
  status: CalendarEventStatus;
}

export interface CalendarGridDay {
  dateISO: string;
  dayOfMonth: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  events: MaintenanceCalendarEvent[];
}

export interface MaintenanceCalendarMonthSummary {
  year: number;
  month: number;
  monthLabel: string;
  days: CalendarGridDay[];
  pmCount: number;
  calibrationCount: number;
  overdueCount: number;
  upcomingCount: number;
}

export interface EngineerCapacitySummary {
  engineerId: string;
  engineerName: string;
  specialty: string;
  assignedAssetsCount: number;
  openTicketsCount: number;
  upcomingPmCount: number;
  overduePmCount: number;
  totalActiveWorkload: number;
  capacityStatus: 'Available' | 'Balanced' | 'High Load';
  openTickets: BreakdownTicket[];
  pendingPms: PreventiveMaintenance[];
}

export interface EquipmentDepreciationSummary {
  purchaseCost: number;
  purchaseDate: string;
  referenceDate: string;
  expectedLifecycleYears: number;
  salvageRatePercent: number;
  salvageValue: number;
  annualDepreciation: number;
  elapsedYears: number;
  remainingYears: number;
  accumulatedDepreciation: number;
  remainingValue: number;
  depreciationPercent: number;
  remainingValuePercent: number;
  lifecycleEndDate: string;
  lifecycleStatus: 'Active Lifecycle' | 'Near End of Life' | 'Fully Depreciated';
}

export type ComplianceAlertCategory = 'Safety Certification' | 'Calibration Deadline';

export type ComplianceAlertSeverity = 'Expired' | 'Due Soon';

export interface ComplianceAlert {
  id: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  department: string;
  location: string;
  assignedEngineer: string;
  category: ComplianceAlertCategory;
  standardOrDetail: string;
  dueDate: string;
  daysRemaining: number;
  severity: ComplianceAlertSeverity;
  targetTab: 'overview' | 'calibration';
}

export type ComprehensiveReportSegmentKey =
  | 'inventory'
  | 'activePm'
  | 'openBreakdowns'
  | 'calibrationHistory';

export interface ComprehensiveReportSegmentSelection {
  inventory: boolean;
  activePm: boolean;
  openBreakdowns: boolean;
  calibrationHistory: boolean;
}

export type PartOrderStatus = 'Ordered' | 'Shipped' | 'Delivered' | 'Cancelled';

export interface PartOrder {
  id: string;
  orderNumber: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  manufacturer: string;
  department: string;
  partName: string;
  partNumber: string;
  quantity: number;
  unitCost: number;
  orderedBy: string;
  orderDate: string;
  expectedDeliveryDate: string;
  status: PartOrderStatus;
  notes?: string;
}

export interface ManufacturerSupportInfo {
  manufacturer: string;
  supportPhone: string;
  partsEmail: string;
  hours: string;
}

export interface ManufacturerCallLog {
  id: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  manufacturer: string;
  supportPhone: string;
  calledBy: string;
  calledAt: string;
  reason: string;
  oemReferenceId: string;
  outcomeNotes: string;
}

export type ActivityActionType =
  | 'Asset Registered'
  | 'Engineer Assigned'
  | 'Status Changed'
  | 'Equipment Updated'
  | 'PM Scheduled'
  | 'PM Completed'
  | 'Breakdown Reported'
  | 'Breakdown Updated'
  | 'Breakdown Resolved'
  | 'Calibration Logged'
  | 'Contract Added'
  | 'Part Ordered'
  | 'Part Status Updated'
  | 'Manufacturer Called';

export interface ActivityLogEntry {
  id: string;
  assetId: string;
  assetCode: string;
  timestamp: string;
  actorName: string;
  actorRole: UserRole;
  actionType: ActivityActionType;
  summary: string;
  details?: string;
}

export type FloorPlanColorMode = 'equipment' | 'breakdowns';

export type FloorPlanDensityTier = 'Asset-Heavy' | 'Moderate' | 'Standard';

export type FloorPlanBreakdownSeverity = 'High Breakdown' | 'Watch' | 'Nominal';

export interface FloorPlanLocationNode {
  location: string;
  totalAssets: number;
  operationalAssets: number;
  issueAssets: number;
  openBreakdownsCount: number;
  criticalOpenCount: number;
  totalDowntimeHours: number;
  severity: FloorPlanBreakdownSeverity;
  assets: Asset[];
}

export interface FloorPlanDepartmentZone {
  department: string;
  wingCode: string;
  floorNumber: 1 | 2 | 3;
  floorLabel: string;
  wingLabel: string;
  totalAssets: number;
  activeAssets: number;
  operationalAssets: number;
  issueAssets: number;
  openBreakdownsCount: number;
  totalBreakdownsCount: number;
  criticalOpenCount: number;
  totalDowntimeHours: number;
  densityTier: FloorPlanDensityTier;
  breakdownSeverity: FloorPlanBreakdownSeverity;
  leadEngineers: string[];
  locations: FloorPlanLocationNode[];
  assets: Asset[];
  openTickets: BreakdownTicket[];
}

