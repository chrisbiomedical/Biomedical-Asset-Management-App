import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonthsISO,
  aggregateOrdersByEngineer,
  buildAssetUpdateAuditEntries,
  buildComprehensiveReportData,
  buildMachineWorkSummary,
  calculateEquipmentDepreciation,
  classifyEquipmentDensity,
  classifyLocationSeverity,
  completePMTransition,
  computeComplianceAlerts,
  computeDashboardMetrics,
  computeDepartmentPerformance,
  computeEngineerCapacity,
  computeFloorPlanDepartments,
  computeMaintenanceCalendarMonth,
  computeMonthlyMaintenanceTrends,
  createActivityLogEntry,
  DEFAULT_COMPREHENSIVE_REPORT_SEGMENTS,
  deriveAssetInventoryIndicators,
  deriveCalibrationStatus,
  deriveContractStatus,
  derivePMStatus,
  deriveSafetyCertificationStatus,
  filterAssets,
  generateNextAssetCode,
  generateNextOrderNumber,
  getAssetActivityLogs,
  getMachineComplaintStats,
  hasPermission,
  resolveAssetLifecycleYears,
  resolveBreakdownTransition,
  resolveComprehensiveReportSections,
  shiftYearMonth,
} from './biotrackLogic';
import { buildAllDataPdfDocument } from './exporters';
import type {
  Asset,
  BioTrackUser,
  BreakdownTicket,
  CalibrationRecord,
  PartOrder,
  PreventiveMaintenance,
  ServiceContract,
} from '../types/biotrack';

const REF_DATE = '2026-11-19';

const sampleAssets: Asset[] = [
  {
    id: 'a1',
    assetCode: 'BIO-1001',
    name: 'IntelliVue MX800 Patient Monitor',
    category: 'Patient Monitoring',
    manufacturer: 'Philips',
    model: 'MX800',
    serialNumber: 'SN-1001',
    department: 'ICU',
    location: 'ICU Bed 01',
    assignedEngineer: 'Rohan Nair',
    purchaseDate: '2024-01-15',
    purchaseCost: 24500,
    warrantyEnd: '2027-01-15',
    status: 'Operational',
    riskClass: 'High',
    lastPmDate: '2026-08-15',
    nextPmDate: '2026-11-15',
    nextCalibrationDate: '2026-12-30',
  },
  {
    id: 'a2',
    assetCode: 'BIO-1002',
    name: 'Evita V600 Ventilator',
    category: 'Life Support',
    manufacturer: 'Dräger',
    model: 'Evita V600',
    serialNumber: 'SN-1002',
    department: 'ICU',
    location: 'ICU Bed 04',
    assignedEngineer: 'Priya Menon',
    purchaseDate: '2023-05-10',
    purchaseCost: 42000,
    warrantyEnd: '2026-05-10',
    status: 'Under Repair',
    riskClass: 'High',
    lastPmDate: '2026-06-01',
    nextPmDate: '2026-12-01',
    nextCalibrationDate: '2026-11-01',
  },
];

test('RBAC role permission matrix enforces Administrator vs Department User', () => {
  assert.equal(hasPermission('Administrator', 'manage_users'), true);
  assert.equal(hasPermission('Administrator', 'delete_assets'), true);
  assert.equal(hasPermission('Administrator', 'assign_engineer'), true);
  assert.equal(hasPermission('Supervisor', 'assign_engineer'), true);
  assert.equal(hasPermission('Biomedical Engineer', 'assign_engineer'), false);
  assert.equal(hasPermission('Biomedical Engineer', 'execute_pm'), true);
  assert.equal(hasPermission('Biomedical Engineer', 'manage_users'), false);
  assert.equal(hasPermission('Supervisor', 'manage_contracts'), true);
  assert.equal(hasPermission('Department User', 'report_breakdown'), true);
  assert.equal(hasPermission('Department User', 'manage_assets'), false);
  assert.equal(hasPermission('Department User', 'execute_pm'), false);
  assert.equal(hasPermission('Department User', 'assign_engineer'), false);
});

test('derivePMStatus flags past-due uncompleted PMs as Overdue', () => {
  const pastDue: PreventiveMaintenance = {
    id: 'pm1',
    assetId: 'a1',
    assetCode: 'BIO-1001',
    assetName: 'Monitor',
    department: 'ICU',
    frequency: 'Quarterly',
    scheduledDate: '2026-11-10',
    assignedEngineer: 'Alex',
    status: 'Scheduled',
    checklist: [],
    remarks: '',
  };
  assert.equal(derivePMStatus(pastDue, REF_DATE), 'Overdue');
  assert.equal(derivePMStatus({ ...pastDue, status: 'Completed' }, REF_DATE), 'Completed');
  assert.equal(derivePMStatus({ ...pastDue, scheduledDate: '2026-11-25' }, REF_DATE), 'Scheduled');
});

test('completePMTransition marks PM completed and schedules next PM date', () => {
  const pm: PreventiveMaintenance = {
    id: 'pm1',
    assetId: 'a1',
    assetCode: 'BIO-1001',
    assetName: 'Monitor',
    department: 'ICU',
    frequency: 'Quarterly',
    scheduledDate: '2026-11-10',
    assignedEngineer: 'Alex',
    status: 'Scheduled',
    checklist: [{ id: 'c1', label: 'Electrical safety test', checked: false }],
    remarks: '',
  };
  const { updatedPm, updatedAsset } = completePMTransition(
    pm,
    { ...sampleAssets[0], status: 'Under Maintenance' },
    {
      completedDate: '2026-11-19',
      remarks: 'Passed all safety checks',
      checklist: [{ id: 'c1', label: 'Electrical safety test', checked: true }],
    },
  );
  assert.equal(updatedPm.status, 'Completed');
  assert.equal(updatedPm.completedDate, '2026-11-19');
  assert.equal(updatedAsset?.nextPmDate, '2027-02-19');
  assert.equal(updatedAsset?.status, 'Operational');
});

test('resolveBreakdownTransition restores asset status to Operational on resolution', () => {
  const ticket: BreakdownTicket = {
    id: 'bd1',
    ticketNumber: 'BD-2001',
    assetId: 'a2',
    assetCode: 'BIO-1002',
    assetName: 'Evita V600 Ventilator',
    department: 'ICU',
    location: 'ICU Bed 04',
    reportedBy: 'Nurse Maya',
    reportedDate: '2026-11-17',
    priority: 'Critical',
    faultDescription: 'Expiratory valve pressure sensor fault',
    assignedEngineer: 'Rohan Nair',
    diagnosis: '',
    correctiveAction: '',
    status: 'Open',
    downtimeHours: 4,
  };
  const { updatedTicket, updatedAsset } = resolveBreakdownTransition(ticket, sampleAssets[1], {
    status: 'Resolved',
    diagnosis: 'Faulty flow sensor O-ring',
    correctiveAction: 'Replaced O-ring and ran self-test',
    downtimeHours: 6.5,
    assignedEngineer: 'Rohan Nair',
    resolvedDate: '2026-11-19',
  });
  assert.equal(updatedTicket.status, 'Resolved');
  assert.equal(updatedTicket.resolvedDate, '2026-11-19');
  assert.equal(updatedAsset?.status, 'Operational');
});

test('computeDashboardMetrics aggregates inventory, PM compliance, calibration, and contracts', () => {
  const pms: PreventiveMaintenance[] = [
    {
      id: 'pm1',
      assetId: 'a1',
      assetCode: 'BIO-1001',
      assetName: 'Monitor',
      department: 'ICU',
      frequency: 'Quarterly',
      scheduledDate: '2026-11-01',
      completedDate: '2026-11-01',
      assignedEngineer: 'Alex',
      status: 'Completed',
      checklist: [],
      remarks: 'Done',
    },
    {
      id: 'pm2',
      assetId: 'a2',
      assetCode: 'BIO-1002',
      assetName: 'Ventilator',
      department: 'ICU',
      frequency: 'Quarterly',
      scheduledDate: '2026-11-10',
      assignedEngineer: 'Alex',
      status: 'Scheduled',
      checklist: [],
      remarks: '',
    },
  ];
  const contracts: ServiceContract[] = [
    {
      id: 'c1',
      assetId: 'a1',
      assetCode: 'BIO-1001',
      assetName: 'Monitor',
      department: 'ICU',
      contractType: 'AMC',
      vendor: 'Philips Care',
      contractNumber: 'AMC-01',
      startDate: '2025-12-01',
      endDate: '2026-12-10',
      annualCost: 2500,
      coverageDetails: 'Full parts & labor',
      contactPhone: '555-0100',
    },
  ];
  const calibrations: CalibrationRecord[] = [];
  const breakdowns: BreakdownTicket[] = [
    {
      id: 'b1',
      ticketNumber: 'BD-2001',
      assetId: 'a2',
      assetCode: 'BIO-1002',
      assetName: 'Ventilator',
      department: 'ICU',
      location: 'ICU Bed 04',
      reportedBy: 'Charge Nurse',
      reportedDate: '2026-11-18',
      priority: 'High',
      faultDescription: 'Alarm error',
      assignedEngineer: 'Alex',
      diagnosis: '',
      correctiveAction: '',
      status: 'Open',
      downtimeHours: 5,
    },
  ];

  const metrics = computeDashboardMetrics(
    sampleAssets,
    pms,
    breakdowns,
    calibrations,
    contracts,
    REF_DATE,
  );
  assert.equal(metrics.totalAssets, 2);
  assert.equal(metrics.operationalAssets, 1);
  assert.equal(metrics.breakdownAssets, 1);
  assert.equal(metrics.pmComplianceRate, 50);
  assert.equal(metrics.overduePmCount, 1);
  assert.equal(metrics.calibrationOverdueCount, 1);
  assert.equal(metrics.expiringContractsCount, 1);
  assert.equal(metrics.openBreakdownsCount, 1);
  assert.equal(metrics.totalDowntimeHours, 5);
});

test('deriveContractStatus, deriveCalibrationStatus, filterAssets, and code generators', () => {
  assert.equal(deriveContractStatus({ endDate: '2026-11-10' }, REF_DATE).status, 'Expired');
  assert.equal(deriveContractStatus({ endDate: '2026-12-15' }, REF_DATE).status, 'Expiring Soon');
  assert.equal(deriveContractStatus({ endDate: '2027-06-01' }, REF_DATE).status, 'Active');

  assert.equal(deriveCalibrationStatus('2026-11-01', REF_DATE).status, 'Overdue');
  assert.equal(deriveCalibrationStatus('2026-12-01', REF_DATE).status, 'Due Soon');
  assert.equal(deriveCalibrationStatus('2027-03-01', REF_DATE).status, 'Compliant');

  assert.equal(filterAssets(sampleAssets, 'dräger', 'All', 'All').length, 1);
  assert.equal(filterAssets(sampleAssets, '', 'ICU', 'Operational').length, 1);
  assert.equal(filterAssets(sampleAssets, '', 'All', 'All', 'Priya Menon').length, 1);
  assert.equal(filterAssets(sampleAssets, 'rohan nair', 'All', 'All').length, 1);
  assert.equal(addMonthsISO('2026-11-19', 3), '2027-02-19');
  assert.equal(generateNextAssetCode(sampleAssets), 'BIO-1003');
});

test('Activity Log tracks asset status changes, engineer assignment, metadata updates, and chronological ordering', () => {
  const actor = { name: 'Sarah Jenkins', role: 'Supervisor' as const };
  const updatedAsset: Asset = {
    ...sampleAssets[0],
    assignedEngineer: 'David Chen',
    status: 'Under Maintenance',
    location: 'Biomed Workshop Bench 2',
  };

  const diffLogs = buildAssetUpdateAuditEntries(
    sampleAssets[0],
    updatedAsset,
    actor,
    '2026-11-19 10:30',
  );
  assert.equal(diffLogs.length, 3);
  assert.equal(diffLogs[0].actionType, 'Engineer Assigned');
  assert.match(diffLogs[0].summary, /Rohan Nair to David Chen/);
  assert.equal(diffLogs[1].actionType, 'Status Changed');
  assert.match(diffLogs[1].summary, /Operational to Under Maintenance/);
  assert.equal(diffLogs[2].actionType, 'Equipment Updated');
  assert.match(diffLogs[2].details ?? '', /ICU Bay|ICU Bed 01 -> Biomed Workshop Bench 2/);

  const olderLog = createActivityLogEntry({
    assetId: 'a1',
    assetCode: 'BIO-1001',
    actor,
    actionType: 'Asset Registered',
    summary: 'Registered equipment',
    timestamp: '2026-11-18 09:00',
  });
  const otherAssetLog = createActivityLogEntry({
    assetId: 'a2',
    assetCode: 'BIO-1002',
    actor,
    actionType: 'Breakdown Reported',
    summary: 'Sensor error',
    timestamp: '2026-11-19 11:00',
  });

  const timeline = getAssetActivityLogs([olderLog, otherAssetLog, ...diffLogs], 'a1');
  assert.equal(timeline.length, 4);
  assert.equal(timeline[0].timestamp, '2026-11-19 10:30');
  assert.equal(timeline[3].actionType, 'Asset Registered');
});

test('buildMachineWorkSummary aggregates completed PMs, breakdowns, downtime, and logs for an asset', () => {
  const summary = buildMachineWorkSummary(
    sampleAssets[0],
    [
      {
        id: 'pm1',
        assetId: 'a1',
        assetCode: 'BIO-1001',
        assetName: 'Monitor',
        department: 'ICU',
        frequency: 'Quarterly',
        scheduledDate: '2026-11-01',
        completedDate: '2026-11-01',
        assignedEngineer: 'Rohan Nair',
        status: 'Completed',
        checklist: [],
        remarks: 'Passed',
      },
    ],
    [
      {
        id: 'bd1',
        ticketNumber: 'BD-2009',
        assetId: 'a1',
        assetCode: 'BIO-1001',
        assetName: 'Monitor',
        department: 'ICU',
        location: 'ICU Bed 01',
        reportedBy: 'Nurse',
        reportedDate: '2026-10-10',
        priority: 'Medium',
        faultDescription: 'Cable fault',
        assignedEngineer: 'Rohan Nair',
        diagnosis: 'Worn lead',
        correctiveAction: 'Replaced SpO2 cable',
        status: 'Resolved',
        resolvedDate: '2026-10-10',
        downtimeHours: 2.5,
      },
    ],
    [],
    [],
    [],
  );

  assert.equal(summary.completedPmCount, 1);
  assert.equal(summary.resolvedBreakdownsCount, 1);
  assert.equal(summary.totalDowntimeHours, 2.5);
});

test('aggregateOrdersByEngineer groups ordered parts per engineer and generates next PO number', () => {
  const users: BioTrackUser[] = [
    {
      id: 'u1',
      name: 'Rohan Nair',
      email: 'rohan@hospital.org',
      role: 'Biomedical Engineer',
      department: 'Biomedical Engineering',
      specialty: 'ICU',
      active: true,
    },
    {
      id: 'u2',
      name: 'Priya Menon',
      email: 'priya@hospital.org',
      role: 'Biomedical Engineer',
      department: 'Biomedical Engineering',
      specialty: 'NICU',
      active: true,
    },
  ];
  const orders: PartOrder[] = [
    {
      id: 'po1',
      orderNumber: 'PO-3001',
      assetId: 'a1',
      assetCode: 'BIO-1001',
      assetName: 'Monitor',
      manufacturer: 'Philips',
      department: 'ICU',
      partName: 'SpO2 Extension Cable',
      partNumber: 'PH-M1941A',
      quantity: 2,
      unitCost: 140,
      orderedBy: 'Rohan Nair',
      orderDate: '2026-11-18',
      expectedDeliveryDate: '2026-11-22',
      status: 'Ordered',
    },
    {
      id: 'po2',
      orderNumber: 'PO-3004',
      assetId: 'a2',
      assetCode: 'BIO-1002',
      assetName: 'Ventilator',
      manufacturer: 'Dräger',
      department: 'ICU',
      partName: 'Flow Sensor Cartridge',
      partNumber: 'DR-8403735',
      quantity: 1,
      unitCost: 320,
      orderedBy: 'Rohan Nair',
      orderDate: '2026-11-19',
      expectedDeliveryDate: '2026-11-21',
      status: 'Delivered',
    },
  ];

  assert.equal(generateNextOrderNumber(orders), 'PO-3005');
  assert.equal(hasPermission('Biomedical Engineer', 'order_parts'), true);
  assert.equal(hasPermission('Department User', 'order_parts'), false);

  const grouped = aggregateOrdersByEngineer(orders, users);
  assert.equal(grouped[0].engineerName, 'Rohan Nair');
  assert.equal(grouped[0].orderCount, 2);
  assert.equal(grouped[0].totalUnitsOrdered, 3);
  assert.equal(grouped[0].totalSpend, 600);
  assert.equal(grouped[0].pendingCount, 1);
  assert.equal(grouped[0].deliveredCount, 1);
  assert.equal(grouped[1].engineerName, 'Priya Menon');
  assert.equal(grouped[1].orderCount, 0);
});

test('getMachineComplaintStats flags repeat-complaint machines for manufacturer escalation', () => {
  const tickets: BreakdownTicket[] = [
    {
      id: 'b1',
      ticketNumber: 'BD-2001',
      assetId: 'a2',
      assetCode: 'BIO-1002',
      assetName: 'Evita V600 Ventilator',
      department: 'ICU',
      location: 'ICU Bed 04',
      reportedBy: 'Nurse',
      reportedDate: '2026-11-17',
      priority: 'High',
      faultDescription: 'Flow fault',
      assignedEngineer: 'Rohan Nair',
      diagnosis: '',
      correctiveAction: '',
      status: 'In Progress',
      downtimeHours: 10,
    },
    {
      id: 'b2',
      ticketNumber: 'BD-2002',
      assetId: 'a2',
      assetCode: 'BIO-1002',
      assetName: 'Evita V600 Ventilator',
      department: 'ICU',
      location: 'ICU Bed 04',
      reportedBy: 'Nurse',
      reportedDate: '2026-10-05',
      priority: 'Medium',
      faultDescription: 'O2 alarm',
      assignedEngineer: 'Rohan Nair',
      diagnosis: 'Sensor drift',
      correctiveAction: 'Calibrated',
      status: 'Resolved',
      resolvedDate: '2026-10-05',
      downtimeHours: 3,
    },
  ];

  const stats = getMachineComplaintStats(sampleAssets, tickets);
  assert.equal(stats.length, 1);
  assert.equal(stats[0].asset.assetCode, 'BIO-1002');
  assert.equal(stats[0].totalComplaints, 2);
  assert.equal(stats[0].totalDowntimeHours, 13);
  assert.equal(stats[0].needsOemEscalation, true);
});

test('computeDepartmentPerformance tracks active assets and average downtime per department', () => {
  const perfAssets: Asset[] = [
    ...sampleAssets,
    {
      ...sampleAssets[0],
      id: 'a3',
      assetCode: 'BIO-1003',
      department: 'ICU',
      status: 'Operational',
    },
    {
      ...sampleAssets[0],
      id: 'a4',
      assetCode: 'BIO-1004',
      department: 'Operating Theatre',
      status: 'Operational',
    },
    {
      ...sampleAssets[0],
      id: 'a5',
      assetCode: 'BIO-1005',
      department: 'Operating Theatre',
      status: 'Out of Service',
    },
    {
      ...sampleAssets[0],
      id: 'a6',
      assetCode: 'BIO-1006',
      department: 'Radiology',
      status: 'Operational',
    },
  ];

  const tickets: BreakdownTicket[] = [
    {
      id: 'b1',
      ticketNumber: 'BD-2001',
      assetId: 'a2',
      assetCode: 'BIO-1002',
      assetName: 'Evita V600 Ventilator',
      department: 'ICU',
      location: 'ICU Bed 04',
      reportedBy: 'Nurse',
      reportedDate: '2026-11-17',
      priority: 'High',
      faultDescription: 'Flow fault',
      assignedEngineer: 'Rohan Nair',
      diagnosis: '',
      correctiveAction: '',
      status: 'In Progress',
      downtimeHours: 10,
    },
    {
      id: 'b2',
      ticketNumber: 'BD-2002',
      assetId: 'a1',
      assetCode: 'BIO-1001',
      assetName: 'IntelliVue MX800',
      department: 'ICU',
      location: 'ICU Bed 01',
      reportedBy: 'Nurse',
      reportedDate: '2026-10-05',
      priority: 'Low',
      faultDescription: 'Lead cable',
      assignedEngineer: 'Rohan Nair',
      diagnosis: 'Worn lead',
      correctiveAction: 'Replaced',
      status: 'Resolved',
      resolvedDate: '2026-10-05',
      downtimeHours: 2.3,
    },
  ];

  const rows = computeDepartmentPerformance(perfAssets, tickets);
  assert.equal(rows.length, 3);
  // Sorted by activeAssets descending: ICU (3 active) -> Operating Theatre (1 active, 1 Out of Service) -> Radiology (1 active, 0 downtime)
  assert.equal(rows[0].department, 'ICU');
  assert.equal(rows[0].activeAssets, 3);
  assert.equal(rows[0].totalDowntimeHours, 12.3);
  assert.equal(rows[0].avgDowntimeHours, 4.1);
  assert.equal(rows[0].breakdownCount, 2);
  assert.equal(rows[0].openBreakdowns, 1);

  assert.equal(rows[1].department, 'Operating Theatre');
  assert.equal(rows[1].totalAssets, 2);
  assert.equal(rows[1].activeAssets, 1);
  assert.equal(rows[1].outOfServiceAssets, 1);
  assert.equal(rows[1].avgDowntimeHours, 0);

  assert.equal(rows[2].department, 'Radiology');
  assert.equal(rows[2].activeAssets, 1);
  assert.equal(rows[2].avgDowntimeHours, 0);
});

test('computeMonthlyMaintenanceTrends aggregates monthly PMs, breakdowns, and total maintenance cost', () => {
  const pms: PreventiveMaintenance[] = [
    {
      id: 'pm-1',
      assetId: 'a1',
      assetCode: 'BIO-1001',
      assetName: 'Monitor',
      department: 'ICU',
      frequency: 'Quarterly',
      scheduledDate: '2026-10-12',
      completedDate: '2026-10-12',
      assignedEngineer: 'Rohan Nair',
      status: 'Completed',
      checklist: [],
      remarks: '',
    },
    {
      id: 'pm-2',
      assetId: 'a2',
      assetCode: 'BIO-1002',
      assetName: 'Ventilator',
      department: 'ICU',
      frequency: 'Quarterly',
      scheduledDate: '2026-10-20',
      assignedEngineer: 'Rohan Nair',
      status: 'Scheduled',
      checklist: [],
      remarks: '',
    },
    {
      id: 'pm-3',
      assetId: 'a1',
      assetCode: 'BIO-1001',
      assetName: 'Monitor',
      department: 'ICU',
      frequency: 'Quarterly',
      scheduledDate: '2026-11-18',
      assignedEngineer: 'Rohan Nair',
      status: 'Scheduled',
      checklist: [],
      remarks: '',
    },
  ];

  const tickets: BreakdownTicket[] = [
    {
      id: 'bd-1',
      ticketNumber: 'BD-2001',
      assetId: 'a2',
      assetCode: 'BIO-1002',
      assetName: 'Ventilator',
      department: 'ICU',
      location: 'ICU Bed 04',
      reportedBy: 'Nurse',
      reportedDate: '2026-11-17',
      priority: 'Critical',
      faultDescription: 'Flow sensor failure',
      assignedEngineer: 'Rohan Nair',
      diagnosis: '',
      correctiveAction: '',
      status: 'In Progress',
      downtimeHours: 10,
    },
  ];

  const orders: PartOrder[] = [
    {
      id: 'po-1',
      orderNumber: 'PO-3001',
      assetId: 'a2',
      assetCode: 'BIO-1002',
      assetName: 'Ventilator',
      manufacturer: 'Dräger',
      department: 'ICU',
      partName: 'Flow Sensor',
      partNumber: '8403735',
      quantity: 2,
      unitCost: 400,
      orderedBy: 'Rohan Nair',
      orderDate: '2026-11-17',
      expectedDeliveryDate: '2026-11-21',
      status: 'Shipped',
    },
    {
      id: 'po-cancelled',
      orderNumber: 'PO-3002',
      assetId: 'a1',
      assetCode: 'BIO-1001',
      assetName: 'Monitor',
      manufacturer: 'Philips',
      department: 'ICU',
      partName: 'Cancelled Cable',
      partNumber: 'M1941A',
      quantity: 1,
      unitCost: 500,
      orderedBy: 'Rohan Nair',
      orderDate: '2026-11-15',
      expectedDeliveryDate: '2026-11-20',
      status: 'Cancelled',
    },
  ];

  const trends = computeMonthlyMaintenanceTrends(pms, tickets, orders, '2026-11-19', 3);
  assert.equal(trends.length, 3);
  assert.deepEqual(
    trends.map((t) => t.monthKey),
    ['2026-09', '2026-10', '2026-11'],
  );

  // Sep 2026: 0 events, $0
  assert.equal(trends[0].totalMaintenanceCost, 0);

  // Oct 2026: 2 PMs ($700), 0 breakdowns
  assert.equal(trends[1].pmCount, 2);
  assert.equal(trends[1].breakdownCount, 0);
  assert.equal(trends[1].pmServiceCost, 700);
  assert.equal(trends[1].totalMaintenanceCost, 700);

  // Nov 2026: 1 PM ($350) + 1 breakdown with 10h ($250 + $1200 = $1450) + non-cancelled parts ($800) = $2600
  assert.equal(trends[2].pmCount, 1);
  assert.equal(trends[2].breakdownCount, 1);
  assert.equal(trends[2].partsCost, 800);
  assert.equal(trends[2].pmServiceCost, 350);
  assert.equal(trends[2].breakdownRepairCost, 1450);
  assert.equal(trends[2].totalMaintenanceCost, 2600);
});

test('computeMaintenanceCalendarMonth builds monthly grid with PM and calibration deadlines and supports filtering', () => {
  const calendarAssets: Asset[] = [
    ...sampleAssets,
    {
      ...sampleAssets[0],
      id: 'a3',
      assetCode: 'BIO-1003',
      department: 'Operating Theatre',
      assignedEngineer: 'David Chen',
      status: 'Out of Service',
      nextPmDate: '2026-11-22',
      nextCalibrationDate: '2026-11-24',
    },
  ];

  // sampleAssets[0] has nextPmDate 2026-11-18, nextCalibrationDate 2027-02-18
  // sampleAssets[1] has nextPmDate 2026-10-10, nextCalibrationDate 2026-11-10
  const pms: PreventiveMaintenance[] = [
    {
      id: 'pm-nov',
      assetId: 'a1',
      assetCode: 'BIO-1001',
      assetName: 'IntelliVue MX800',
      department: 'ICU',
      frequency: 'Quarterly',
      scheduledDate: '2026-11-18',
      assignedEngineer: 'Rohan Nair',
      status: 'Scheduled',
      checklist: [],
      remarks: '',
    },
  ];

  const nov = computeMaintenanceCalendarMonth(calendarAssets, pms, 2026, 11, '2026-11-19');
  assert.equal(nov.monthLabel, 'November 2026');
  assert.equal(nov.days.length, 35); // Nov 1 2026 is Sunday -> 30 days fit in 5 rows (35 cells)
  assert.equal(nov.pmCount, 1); // Out of Service a3 excluded, a1 from pms
  assert.equal(nov.calibrationCount, 1); // a2 calibration due 2026-11-10
  assert.equal(nov.overdueCount, 2); // a1 PM (Nov 18) and a2 calibration (Nov 10) both < Nov 19

  const todayCell = nov.days.find((d) => d.dateISO === '2026-11-19');
  assert.equal(todayCell?.isToday, true);

  const nov01 = nov.days.find((d) => d.dateISO === '2026-11-01');
  assert.equal(nov01?.events.length, 1);
  assert.equal(nov01?.events[0].type, 'calibration');
  assert.equal(nov01?.events[0].status, 'Overdue');

  const nov18 = nov.days.find((d) => d.dateISO === '2026-11-18');
  assert.equal(nov18?.events.length, 1);
  assert.equal(nov18?.events[0].type, 'pm');

  // Filter to calibration only
  const calOnly = computeMaintenanceCalendarMonth(calendarAssets, pms, 2026, 11, '2026-11-19', {
    type: 'calibration',
  });
  assert.equal(calOnly.pmCount, 0);
  assert.equal(calOnly.calibrationCount, 1);

  // Month shift helper crosses year boundaries properly
  assert.deepEqual(shiftYearMonth(2026, 12, 1), { year: 2027, month: 1 });
  assert.deepEqual(shiftYearMonth(2026, 1, -1), { year: 2025, month: 12 });
});

test('computeEngineerCapacity aggregates open tickets, upcoming PMs, overdue PMs, and capacity status per engineer', () => {
  const users: BioTrackUser[] = [
    {
      id: 'u1',
      name: 'Rohan Nair',
      email: 'rohan@hospital.org',
      role: 'Biomedical Engineer',
      department: 'Biomedical Engineering',
      specialty: 'ICU & Ventilation',
      active: true,
    },
    {
      id: 'u2',
      name: 'Priya Menon',
      email: 'priya@hospital.org',
      role: 'Biomedical Engineer',
      department: 'Biomedical Engineering',
      specialty: 'NICU & Dialysis',
      active: true,
    },
    {
      id: 'u3',
      name: 'Sarah Jenkins',
      email: 'sarah@hospital.org',
      role: 'Supervisor',
      department: 'Biomedical Engineering',
      specialty: 'Supervisor',
      active: true,
    },
  ];

  const pms: PreventiveMaintenance[] = [
    {
      id: 'pm-1',
      assetId: 'a1',
      assetCode: 'BIO-1001',
      assetName: 'Monitor',
      department: 'ICU',
      frequency: 'Quarterly',
      scheduledDate: '2026-11-18', // overdue vs 2026-11-19
      assignedEngineer: 'Rohan Nair',
      status: 'Scheduled',
      checklist: [],
      remarks: '',
    },
    {
      id: 'pm-2',
      assetId: 'a2',
      assetCode: 'BIO-1002',
      assetName: 'Ventilator',
      department: 'ICU',
      frequency: 'Quarterly',
      scheduledDate: '2026-11-25', // upcoming
      assignedEngineer: 'Rohan Nair',
      status: 'Scheduled',
      checklist: [],
      remarks: '',
    },
    {
      id: 'pm-3',
      assetId: 'a1',
      assetCode: 'BIO-1001',
      assetName: 'Monitor',
      department: 'ICU',
      frequency: 'Quarterly',
      scheduledDate: '2026-10-01',
      completedDate: '2026-10-01',
      assignedEngineer: 'Priya Menon',
      status: 'Completed',
      checklist: [],
      remarks: '',
    },
  ];

  const tickets: BreakdownTicket[] = [
    {
      id: 'bd-1',
      ticketNumber: 'BD-2001',
      assetId: 'a2',
      assetCode: 'BIO-1002',
      assetName: 'Ventilator',
      department: 'ICU',
      location: 'ICU Bed 04',
      reportedBy: 'Nurse',
      reportedDate: '2026-11-17',
      priority: 'Critical',
      faultDescription: 'Flow sensor error',
      assignedEngineer: 'Rohan Nair',
      diagnosis: '',
      correctiveAction: '',
      status: 'In Progress',
      downtimeHours: 12,
    },
    {
      id: 'bd-2',
      ticketNumber: 'BD-2002',
      assetId: 'a1',
      assetCode: 'BIO-1001',
      assetName: 'Monitor',
      department: 'ICU',
      location: 'ICU Bed 01',
      reportedBy: 'Nurse',
      reportedDate: '2026-11-01',
      priority: 'Low',
      faultDescription: 'Cable fault',
      assignedEngineer: 'Priya Menon',
      diagnosis: 'Worn lead',
      correctiveAction: 'Replaced',
      status: 'Resolved',
      resolvedDate: '2026-11-01',
      downtimeHours: 2,
    },
  ];

  const cap = computeEngineerCapacity(users, sampleAssets, pms, tickets, '2026-11-19');
  // Supervisor excluded, only active Biomedical Engineers returned
  assert.equal(cap.length, 2);

  // Rohan Nair sorted first: 1 open ticket, 1 upcoming PM, 1 overdue PM => High Load (3 tasks)
  assert.equal(cap[0].engineerName, 'Rohan Nair');
  assert.equal(cap[0].openTicketsCount, 1);
  assert.equal(cap[0].upcomingPmCount, 1);
  assert.equal(cap[0].overduePmCount, 1);
  assert.equal(cap[0].totalActiveWorkload, 3);
  assert.equal(cap[0].capacityStatus, 'High Load');

  // Priya Menon: 0 open tickets, 0 upcoming PMs (completed excluded) => Available
  assert.equal(cap[1].engineerName, 'Priya Menon');
  assert.equal(cap[1].openTicketsCount, 0);
  assert.equal(cap[1].upcomingPmCount, 0);
  assert.equal(cap[1].totalActiveWorkload, 0);
  assert.equal(cap[1].capacityStatus, 'Available');
});

test('calculateEquipmentDepreciation computes remaining value from purchase date and expected lifecycle', () => {
  // Exact 4-year midpoint on an 8-year lifecycle ($40,000 -> $20,000 remaining)
  const mid = calculateEquipmentDepreciation({
    purchaseCost: 40000,
    purchaseDate: '2022-11-19',
    expectedLifecycleYears: 8,
    referenceDate: '2026-11-19',
  });
  assert.equal(mid.elapsedYears, 4);
  assert.equal(mid.remainingYears, 4);
  assert.equal(mid.annualDepreciation, 5000);
  assert.equal(mid.accumulatedDepreciation, 20000);
  assert.equal(mid.remainingValue, 20000);
  assert.equal(mid.remainingValuePercent, 50);
  assert.equal(mid.lifecycleEndDate, '2030-11-19');
  assert.equal(mid.lifecycleStatus, 'Active Lifecycle');

  // With 10% salvage value ($40,000 -> $4,000 salvage; $36,000 depreciable -> $18,000 depreciated at midpoint)
  const withSalvage = calculateEquipmentDepreciation({
    purchaseCost: 40000,
    purchaseDate: '2022-11-19',
    expectedLifecycleYears: 8,
    referenceDate: '2026-11-19',
    salvageRatePercent: 10,
  });
  assert.equal(withSalvage.salvageValue, 4000);
  assert.equal(withSalvage.annualDepreciation, 4500);
  assert.equal(withSalvage.accumulatedDepreciation, 18000);
  assert.equal(withSalvage.remainingValue, 22000);

  // Near end of life (>= 75% elapsed)
  const nearEol = calculateEquipmentDepreciation({
    purchaseCost: 20000,
    purchaseDate: '2020-11-19',
    expectedLifecycleYears: 7,
    referenceDate: '2026-11-19',
  });
  assert.equal(nearEol.lifecycleStatus, 'Near End of Life');

  // Fully depreciated past expected lifecycle
  const expired = calculateEquipmentDepreciation({
    purchaseCost: 15000,
    purchaseDate: '2016-01-01',
    expectedLifecycleYears: 5,
    referenceDate: '2026-11-19',
  });
  assert.equal(expired.remainingValue, 0);
  assert.equal(expired.depreciationPercent, 100);
  assert.equal(expired.lifecycleStatus, 'Fully Depreciated');

  // Category fallback & explicit lifecycle override
  assert.equal(
    resolveAssetLifecycleYears({ category: 'Diagnostic Imaging', expectedLifecycleYears: undefined }),
    10,
  );
  assert.equal(
    resolveAssetLifecycleYears({ category: 'Diagnostic Imaging', expectedLifecycleYears: 12 }),
    12,
  );
});

test('buildComprehensiveReportData compiles inventory with remaining values, active PMs, open breakdowns, and calibration history', () => {
  const pms: PreventiveMaintenance[] = [
    {
      id: 'pm-a',
      assetId: 'a1',
      assetCode: 'BIO-1001',
      assetName: 'Monitor',
      department: 'ICU',
      frequency: 'Quarterly',
      scheduledDate: '2026-11-25',
      assignedEngineer: 'Rohan Nair',
      status: 'Scheduled',
      checklist: [],
      remarks: 'Scheduled check',
    },
    {
      id: 'pm-b',
      assetId: 'a2',
      assetCode: 'BIO-1002',
      assetName: 'Ventilator',
      department: 'ICU',
      frequency: 'Quarterly',
      scheduledDate: '2026-10-01',
      assignedEngineer: 'Rohan Nair',
      status: 'Scheduled',
      checklist: [],
      remarks: 'Overdue check',
    },
    {
      id: 'pm-c',
      assetId: 'a1',
      assetCode: 'BIO-1001',
      assetName: 'Monitor',
      department: 'ICU',
      frequency: 'Quarterly',
      scheduledDate: '2026-08-01',
      completedDate: '2026-08-01',
      assignedEngineer: 'Rohan Nair',
      status: 'Completed',
      checklist: [],
      remarks: 'Completed check',
    },
  ];

  const tickets: BreakdownTicket[] = [
    {
      id: 'bd-1',
      ticketNumber: 'BD-2001',
      assetId: 'a2',
      assetCode: 'BIO-1002',
      assetName: 'Ventilator',
      department: 'ICU',
      location: 'ICU Bay 2',
      reportedBy: 'Nurse',
      reportedDate: '2026-11-18',
      priority: 'Critical',
      faultDescription: 'Sensor alarm',
      assignedEngineer: 'Rohan Nair',
      diagnosis: '',
      correctiveAction: '',
      status: 'In Progress',
      downtimeHours: 10,
    },
    {
      id: 'bd-2',
      ticketNumber: 'BD-2002',
      assetId: 'a1',
      assetCode: 'BIO-1001',
      assetName: 'Monitor',
      department: 'ICU',
      location: 'ICU Bay 1',
      reportedBy: 'Nurse',
      reportedDate: '2026-10-10',
      priority: 'Low',
      faultDescription: 'Lead fault',
      assignedEngineer: 'Rohan Nair',
      diagnosis: 'Cable',
      correctiveAction: 'Replaced',
      status: 'Resolved',
      resolvedDate: '2026-10-10',
      downtimeHours: 2,
    },
  ];

  const calibrations: CalibrationRecord[] = [
    {
      id: 'cal-1',
      assetId: 'a1',
      assetCode: 'BIO-1001',
      assetName: 'Monitor',
      department: 'ICU',
      calibrationDate: '2026-06-01',
      dueDate: '2027-06-01',
      performedBy: 'Rohan Nair',
      standardUsed: 'Fluke ProSim 8',
      result: 'Pass',
      deviationNotes: 'Within tolerance',
      certificateId: 'CAL-101',
      certificateFileName: 'cal-101.pdf',
    },
    {
      id: 'cal-2',
      assetId: 'a2',
      assetCode: 'BIO-1002',
      assetName: 'Ventilator',
      department: 'ICU',
      calibrationDate: '2026-09-15',
      dueDate: '2027-09-15',
      performedBy: 'Rohan Nair',
      standardUsed: 'TSI Certifier',
      result: 'Pass',
      deviationNotes: 'Verified',
      certificateId: 'CAL-102',
      certificateFileName: 'cal-102.pdf',
    },
  ];

  const contracts: ServiceContract[] = [
    {
      id: 'ctr-1',
      assetId: 'a1',
      assetCode: 'BIO-1001',
      assetName: 'Monitor',
      department: 'ICU',
      contractType: 'AMC',
      vendor: 'Philips',
      contractNumber: 'AMC-100',
      startDate: '2026-01-01',
      endDate: '2027-06-01',
      annualCost: 2400,
      coverageDetails: 'Full PM & parts',
      contactPhone: '555-0100',
    },
  ];

  const report = buildComprehensiveReportData({
    assets: sampleAssets,
    pms,
    breakdowns: tickets,
    calibrations,
    contracts,
    referenceDate: REF_DATE,
  });

  assert.equal(report.summary.totalAssets, sampleAssets.length);
  assert.equal(report.inventory.length, sampleAssets.length);
  assert.ok(report.summary.totalRemainingValue > 0);
  assert.ok(report.summary.totalRemainingValue < report.summary.totalAcquisitionValue);

  // Active PMs exclude Completed ('pm-c') and sort overdue first by scheduledDate
  assert.equal(report.activeMaintenanceSchedules.length, 2);
  assert.equal(report.activeMaintenanceSchedules[0].id, 'pm-b');
  assert.equal(report.activeMaintenanceSchedules[0].effectiveStatus, 'Overdue');
  assert.equal(report.summary.overduePmCount, 1);

  // Open breakdowns exclude Resolved ('bd-2')
  assert.equal(report.openBreakdowns.length, 1);
  assert.equal(report.openBreakdowns[0].ticketNumber, 'BD-2001');

  // Recent calibrations sorted newest first
  assert.equal(report.recentCalibrations.length, 2);
  assert.equal(report.recentCalibrations[0].certificateId, 'CAL-102');
});

test('computeComplianceAlerts flags expired and upcoming safety certifications and calibration deadlines', () => {
  const complianceAssets: Asset[] = [
    {
      ...sampleAssets[0],
      id: 'c1',
      assetCode: 'BIO-2001',
      name: 'Compliant Monitor',
      nextCalibrationDate: '2027-06-01',
      safetyCertificationName: 'IEC 60601-1 Electrical Safety',
      safetyCertificationExpiry: '2027-06-01',
      status: 'Operational',
    },
    {
      ...sampleAssets[1],
      id: 'c2',
      assetCode: 'BIO-2002',
      name: 'Expired Cert & Overdue Cal Ventilator',
      nextCalibrationDate: '2026-11-10', // -9 days -> Expired calibration
      safetyCertificationName: 'ISO 80601-2-12 Ventilator Safety',
      safetyCertificationExpiry: '2026-11-05', // -14 days -> Expired safety cert
      status: 'Under Repair',
    },
    {
      ...sampleAssets[0],
      id: 'c3',
      assetCode: 'BIO-2003',
      name: 'Upcoming Deadline Scanner',
      nextCalibrationDate: '2026-12-04', // +15 days -> Due Soon calibration
      safetyCertificationName: 'AERB Radiation Permit',
      safetyCertificationExpiry: '2026-11-26', // +7 days -> Due Soon safety cert
      status: 'Operational',
    },
    {
      ...sampleAssets[1],
      id: 'c4',
      assetCode: 'BIO-2004',
      name: 'Decommissioned ESU',
      nextCalibrationDate: '2026-10-01',
      safetyCertificationExpiry: '2026-10-01',
      status: 'Out of Service',
    },
  ];

  assert.equal(deriveSafetyCertificationStatus('2026-11-05', REF_DATE).status, 'Expired');
  assert.equal(deriveSafetyCertificationStatus('2026-12-01', REF_DATE).status, 'Due Soon');
  assert.equal(deriveSafetyCertificationStatus('2027-04-01', REF_DATE).status, 'Valid');
  assert.equal(deriveSafetyCertificationStatus(undefined, REF_DATE).status, 'Not Set');

  const alerts = computeComplianceAlerts(complianceAssets, REF_DATE);
  // Excludes compliant c1 and Out of Service c4; emits 4 alerts (2 from c2, 2 from c3)
  assert.equal(alerts.length, 4);

  // Sorted most overdue first, then nearest upcoming
  assert.equal(alerts[0].assetId, 'c2');
  assert.equal(alerts[0].category, 'Safety Certification');
  assert.equal(alerts[0].severity, 'Expired');
  assert.equal(alerts[0].daysRemaining, -14);
  assert.equal(alerts[0].targetTab, 'overview');

  assert.equal(alerts[1].assetId, 'c2');
  assert.equal(alerts[1].category, 'Calibration Deadline');
  assert.equal(alerts[1].severity, 'Expired');
  assert.equal(alerts[1].daysRemaining, -9);
  assert.equal(alerts[1].targetTab, 'calibration');

  assert.equal(alerts[2].assetId, 'c3');
  assert.equal(alerts[2].category, 'Safety Certification');
  assert.equal(alerts[2].severity, 'Due Soon');
  assert.equal(alerts[2].daysRemaining, 7);

  assert.equal(alerts[3].assetId, 'c3');
  assert.equal(alerts[3].category, 'Calibration Deadline');
  assert.equal(alerts[3].severity, 'Due Soon');
  assert.equal(alerts[3].daysRemaining, 15);
});

test('resolveComprehensiveReportSections and buildAllDataPdfDocument filter included PDF segments', () => {
  const all = resolveComprehensiveReportSections(DEFAULT_COMPREHENSIVE_REPORT_SEGMENTS);
  assert.equal(all.allSelected, true);
  assert.equal(all.noneSelected, false);
  assert.equal(all.selectedKeys.length, 4);

  const onlyBreakdowns = resolveComprehensiveReportSections({
    inventory: false,
    activePm: false,
    openBreakdowns: true,
    calibrationHistory: false,
  });
  assert.equal(onlyBreakdowns.allSelected, false);
  assert.equal(onlyBreakdowns.noneSelected, false);
  assert.deepEqual(onlyBreakdowns.selectedKeys, ['openBreakdowns']);
  assert.deepEqual(onlyBreakdowns.selectedLabels, ['Open Breakdowns']);

  const none = resolveComprehensiveReportSections({
    inventory: false,
    activePm: false,
    openBreakdowns: false,
    calibrationHistory: false,
  });
  assert.equal(none.noneSelected, true);
  assert.equal(none.selectedKeys.length, 0);

  const reportData = buildComprehensiveReportData({
    assets: sampleAssets,
    pms: [],
    breakdowns: [],
    calibrations: [],
    contracts: [],
    referenceDate: REF_DATE,
  });

  const fullPdf = buildAllDataPdfDocument(reportData, DEFAULT_COMPREHENSIVE_REPORT_SEGMENTS);
  assert.equal(fullPdf.includedSectionTitles.length, 4);
  assert.ok(fullPdf.includedSectionTitles[0].startsWith('1. Complete Equipment Inventory'));
  assert.ok(fullPdf.includedSectionTitles[3].startsWith('4. Recent Calibration History'));

  const calibrationOnlyPdf = buildAllDataPdfDocument(reportData, {
    inventory: false,
    activePm: false,
    openBreakdowns: false,
    calibrationHistory: true,
  });
  assert.equal(calibrationOnlyPdf.includedSectionTitles.length, 1);
  assert.ok(
    calibrationOnlyPdf.includedSectionTitles[0].startsWith('1. Recent Calibration History'),
  );
});

test('deriveAssetInventoryIndicators identifies expiring warranties and upcoming or overdue PM tasks', () => {
  const pms: PreventiveMaintenance[] = [
    {
      id: 'pm-exp',
      assetId: 'ind-1',
      assetCode: 'BIO-3001',
      assetName: 'Monitor',
      department: 'ICU',
      frequency: 'Quarterly',
      scheduledDate: '2026-11-26', // +7d -> Upcoming PM
      assignedEngineer: 'Rohan Nair',
      status: 'Scheduled',
      checklist: [],
      remarks: '',
    },
    {
      id: 'pm-done',
      assetId: 'ind-3',
      assetCode: 'BIO-3003',
      assetName: 'Pump',
      department: 'NICU',
      frequency: 'Annual',
      scheduledDate: '2026-11-22', // Completed PM must not trigger upcoming indicator
      completedDate: '2026-11-18',
      assignedEngineer: 'Priya Menon',
      status: 'Completed',
      checklist: [],
      remarks: '',
    },
  ];

  // Expiring warranty (+12d) + upcoming PM (+7d from active PM)
  const both = deriveAssetInventoryIndicators(
    {
      id: 'ind-1',
      status: 'Operational',
      warrantyEnd: '2026-12-01',
      nextPmDate: '2027-02-15',
    },
    pms,
    REF_DATE,
  );
  assert.equal(both.warrantyState, 'Expiring Soon');
  assert.equal(both.warrantyDaysRemaining, 12);
  assert.equal(both.pmState, 'Upcoming');
  assert.equal(both.pmDaysDelta, 7);
  assert.equal(both.needsAttention, true);

  // Healthy warranty (> 60d) + overdue PM from asset.nextPmDate fallback (-5d)
  const overduePm = deriveAssetInventoryIndicators(
    {
      id: 'ind-2',
      status: 'Operational',
      warrantyEnd: '2027-08-01',
      nextPmDate: '2026-11-14',
    },
    pms,
    REF_DATE,
  );
  assert.equal(overduePm.warrantyState, 'Active');
  assert.equal(overduePm.pmState, 'Overdue');
  assert.equal(overduePm.pmDaysDelta, -5);
  assert.equal(overduePm.needsAttention, true);

  // Completed PM ignored; nextPmDate well in future (> 30d) -> no attention needed
  const healthy = deriveAssetInventoryIndicators(
    {
      id: 'ind-3',
      status: 'Operational',
      warrantyEnd: '2027-06-01',
      nextPmDate: '2027-03-01',
    },
    pms,
    REF_DATE,
  );
  assert.equal(healthy.warrantyState, 'Active');
  assert.equal(healthy.pmState, 'Scheduled');
  assert.equal(healthy.needsAttention, false);

  // Out of Service assets should not be flagged for upcoming PMs
  const decommissioned = deriveAssetInventoryIndicators(
    {
      id: 'ind-4',
      status: 'Out of Service',
      warrantyEnd: '2025-01-01',
      nextPmDate: '2026-11-20',
    },
    pms,
    REF_DATE,
  );
  assert.equal(decommissioned.warrantyState, 'Expired');
  assert.equal(decommissioned.pmState, 'None');
  assert.equal(decommissioned.needsAttention, false);
});

test('computeFloorPlanDepartments maps equipment density tiers, room bay nodes, and high-breakdown severity', () => {
  const floorAssets: Asset[] = [
    ...sampleAssets,
    {
      ...sampleAssets[0],
      id: 'a-icu-3',
      assetCode: 'BIO-1003',
      department: 'ICU',
      location: 'ICU Bay 03',
      status: 'Operational',
    },
    {
      ...sampleAssets[0],
      id: 'a-icu-4',
      assetCode: 'BIO-1004',
      department: 'ICU',
      location: 'ICU Bay 01',
      status: 'Operational',
    },
    {
      ...sampleAssets[0],
      id: 'a-rad-1',
      assetCode: 'BIO-1009',
      department: 'Radiology',
      location: 'Radiology CT Bay 01',
      status: 'Calibration Due',
    },
  ];

  const tickets: BreakdownTicket[] = [
    {
      id: 'bd-f1',
      ticketNumber: 'BD-2101',
      assetId: 'a2',
      assetCode: 'BIO-1002',
      assetName: 'Evita V600 Ventilator',
      department: 'ICU',
      location: 'ICU Bay 04',
      reportedBy: 'Nurse',
      reportedDate: '2026-11-18',
      priority: 'Critical',
      faultDescription: 'Expiratory valve leak',
      assignedEngineer: 'Priya Menon',
      diagnosis: '',
      correctiveAction: '',
      status: 'In Progress',
      downtimeHours: 14,
    },
  ];

  assert.equal(classifyEquipmentDensity(4), 'Asset-Heavy');
  assert.equal(classifyEquipmentDensity(3), 'Moderate');
  assert.equal(classifyEquipmentDensity(2), 'Standard');

  assert.equal(
    classifyLocationSeverity({
      openBreakdownsCount: 1,
      criticalOpenCount: 1,
      totalDowntimeHours: 5,
      issueAssets: 1,
    }),
    'High Breakdown',
  );
  assert.equal(
    classifyLocationSeverity({
      openBreakdownsCount: 0,
      criticalOpenCount: 0,
      totalDowntimeHours: 0,
      issueAssets: 1,
    }),
    'Watch',
  );
  assert.equal(
    classifyLocationSeverity({
      openBreakdownsCount: 0,
      criticalOpenCount: 0,
      totalDowntimeHours: 0,
      issueAssets: 0,
    }),
    'Nominal',
  );

  const zones = computeFloorPlanDepartments(floorAssets, tickets);
  assert.equal(zones.length, 8);

  const icu = zones.find((z) => z.department === 'ICU');
  assert.ok(icu);
  assert.equal(icu.totalAssets, 4);
  assert.equal(icu.densityTier, 'Asset-Heavy');
  assert.equal(icu.openBreakdownsCount, 1);
  assert.equal(icu.breakdownSeverity, 'High Breakdown');
  assert.equal(icu.locations.length, 4);
  const bed04 = icu.locations.find((loc) => loc.location === 'ICU Bed 04');
  assert.equal(bed04?.severity, 'High Breakdown');

  const radiology = zones.find((z) => z.department === 'Radiology');
  assert.ok(radiology);
  assert.equal(radiology.totalAssets, 1);
  assert.equal(radiology.densityTier, 'Standard');
  assert.equal(radiology.breakdownSeverity, 'Watch');

  const nicu = zones.find((z) => z.department === 'NICU');
  assert.ok(nicu);
  assert.equal(nicu.totalAssets, 0);
  assert.equal(nicu.breakdownSeverity, 'Nominal');
});








