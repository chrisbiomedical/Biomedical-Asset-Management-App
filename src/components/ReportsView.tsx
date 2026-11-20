import { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { DEPARTMENTS, TODAY_ISO } from '../data/mockData';
import type {
  ActivityLogEntry,
  Asset,
  BreakdownTicket,
  CalibrationRecord,
  ComprehensiveReportSegmentKey,
  ComprehensiveReportSegmentSelection,
  PreventiveMaintenance,
  ServiceContract,
  UserRole,
} from '../types/biotrack';
import {
  buildComprehensiveReportData,
  buildMachineWorkSummary,
  calculateEquipmentDepreciation,
  DEFAULT_COMPREHENSIVE_REPORT_SEGMENTS,
  deriveContractStatus,
  derivePMStatus,
  hasPermission,
  resolveAssetLifecycleYears,
  resolveComprehensiveReportSections,
} from '../utils/biotrackLogic';
import {
  exportAllDataPdf,
  exportMachineWorkReportExcel,
  exportToCsv,
  exportToExcel,
  type ReportColumn,
} from '../utils/exporters';

interface ReportsViewProps {
  assets: Asset[];
  pms: PreventiveMaintenance[];
  breakdowns: BreakdownTicket[];
  calibrations: CalibrationRecord[];
  contracts: ServiceContract[];
  activityLogs: ActivityLogEntry[];
  userRole: UserRole;
}

type ReportType =
  | 'inventory'
  | 'pm'
  | 'breakdown'
  | 'calibration'
  | 'contracts'
  | 'maintenance'
  | 'machine';

interface MaintenanceHistoryRow {
  date: string;
  assetCode: string;
  assetName: string;
  department: string;
  activityType: 'Preventive Maintenance' | 'Breakdown Repair' | 'Calibration';
  engineer: string;
  outcome: string;
  notes: string;
}

export function ReportsView({
  assets,
  pms,
  breakdowns,
  calibrations,
  contracts,
  activityLogs,
  userRole,
}: ReportsViewProps) {
  const [reportType, setReportType] = useState<ReportType>('inventory');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [selectedMachineId, setSelectedMachineId] = useState(assets[0]?.id ?? '');
  const [pdfSegments, setPdfSegments] = useState<ComprehensiveReportSegmentSelection>(
    DEFAULT_COMPREHENSIVE_REPORT_SEGMENTS,
  );
  const [exportStatus, setExportStatus] = useState<{
    fileName: string;
    segmentsSummary: string;
  } | null>(null);

  const canExport = hasPermission(userRole, 'export_reports');
  const comprehensiveReport = buildComprehensiveReportData({
    assets,
    pms,
    breakdowns,
    calibrations,
    contracts,
    referenceDate: TODAY_ISO,
  });
  const resolvedPdfSegments = resolveComprehensiveReportSections(pdfSegments);

  const togglePdfSegment = (key: ComprehensiveReportSegmentKey) => {
    setPdfSegments((prev) => ({ ...prev, [key]: !prev[key] }));
    setExportStatus(null);
  };

  const handleSelectAllPdfSegments = () => {
    setPdfSegments(DEFAULT_COMPREHENSIVE_REPORT_SEGMENTS);
    setExportStatus(null);
  };

  const handleClearPdfSegments = () => {
    setPdfSegments({
      inventory: false,
      activePm: false,
      openBreakdowns: false,
      calibrationHistory: false,
    });
    setExportStatus(null);
  };

  const handleExportAllDataPdf = () => {
    if (resolvedPdfSegments.noneSelected) return;
    const fileName = exportAllDataPdf(comprehensiveReport, pdfSegments);
    setExportStatus({
      fileName,
      segmentsSummary: resolvedPdfSegments.selectedLabels.join(', '),
    });
  };

  const filteredAssets =
    departmentFilter === 'All'
      ? assets
      : assets.filter((a) => a.department === departmentFilter);

  const selectedMachine =
    assets.find((a) => a.id === selectedMachineId) ?? filteredAssets[0] ?? assets[0] ?? null;
  const machineSummary = selectedMachine
    ? buildMachineWorkSummary(
        selectedMachine,
        pms,
        breakdowns,
        calibrations,
        contracts,
        activityLogs,
      )
    : null;

  const filteredPms =
    departmentFilter === 'All'
      ? pms
      : pms.filter((p) => p.department === departmentFilter);

  const filteredBreakdowns =
    departmentFilter === 'All'
      ? breakdowns
      : breakdowns.filter((b) => b.department === departmentFilter);

  const filteredCalibrations =
    departmentFilter === 'All'
      ? calibrations
      : calibrations.filter((c) => c.department === departmentFilter);

  const filteredContracts =
    departmentFilter === 'All'
      ? contracts
      : contracts.filter((c) => c.department === departmentFilter);

  const maintenanceHistory: MaintenanceHistoryRow[] = [
    ...filteredPms.map((p) => ({
      date: p.completedDate ?? p.scheduledDate,
      assetCode: p.assetCode,
      assetName: p.assetName,
      department: p.department,
      activityType: 'Preventive Maintenance' as const,
      engineer: p.assignedEngineer,
      outcome: derivePMStatus(p, TODAY_ISO),
      notes: p.remarks,
    })),
    ...filteredBreakdowns.map((b) => ({
      date: b.resolvedDate ?? b.reportedDate,
      assetCode: b.assetCode,
      assetName: b.assetName,
      department: b.department,
      activityType: 'Breakdown Repair' as const,
      engineer: b.assignedEngineer,
      outcome: `${b.status} (${b.downtimeHours}h)`,
      notes: b.correctiveAction || b.faultDescription,
    })),
    ...filteredCalibrations.map((c) => ({
      date: c.calibrationDate,
      assetCode: c.assetCode,
      assetName: c.assetName,
      department: c.department,
      activityType: 'Calibration' as const,
      engineer: c.performedBy,
      outcome: c.result,
      notes: `${c.standardUsed} — ${c.deviationNotes}`,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const handleExportExcel = () => {
    const stamp = TODAY_ISO;
    if (reportType === 'machine' && machineSummary) {
      exportMachineWorkReportExcel({
        asset: machineSummary.asset,
        pms: machineSummary.pms,
        breakdowns: machineSummary.breakdowns,
        calibrations: machineSummary.calibrations,
        contracts: machineSummary.contracts,
        activityLogs: machineSummary.activityLogs,
        generatedDate: stamp,
      });
    } else if (reportType === 'inventory') {
      const cols: ReportColumn<Asset>[] = [
        { header: 'Asset ID', accessor: (r) => r.assetCode },
        { header: 'Equipment Name', accessor: (r) => r.name },
        { header: 'Manufacturer', accessor: (r) => r.manufacturer },
        { header: 'Model', accessor: (r) => r.model },
        { header: 'Serial Number', accessor: (r) => r.serialNumber },
        { header: 'Department', accessor: (r) => r.department },
        { header: 'Location', accessor: (r) => r.location },
        { header: 'Assigned Engineer', accessor: (r) => r.assignedEngineer },
        { header: 'Purchase Date', accessor: (r) => r.purchaseDate },
        {
          header: 'Remaining Value ($)',
          accessor: (r) =>
            calculateEquipmentDepreciation({
              purchaseCost: r.purchaseCost,
              purchaseDate: r.purchaseDate,
              expectedLifecycleYears: resolveAssetLifecycleYears(r),
              referenceDate: TODAY_ISO,
            }).remainingValue,
        },
        { header: 'Warranty End', accessor: (r) => r.warrantyEnd },
        { header: 'Status', accessor: (r) => r.status },
      ];
      exportToExcel(filteredAssets, cols, 'Asset Inventory', `BioTrack_Inventory_${stamp}`);
    } else if (reportType === 'pm') {
      const cols: ReportColumn<PreventiveMaintenance>[] = [
        { header: 'Asset ID', accessor: (r) => r.assetCode },
        { header: 'Equipment Name', accessor: (r) => r.assetName },
        { header: 'Department', accessor: (r) => r.department },
        { header: 'Frequency', accessor: (r) => r.frequency },
        { header: 'Scheduled Date', accessor: (r) => r.scheduledDate },
        { header: 'Completed Date', accessor: (r) => r.completedDate ?? '' },
        { header: 'Assigned Engineer', accessor: (r) => r.assignedEngineer },
        { header: 'Status', accessor: (r) => derivePMStatus(r, TODAY_ISO) },
        { header: 'Remarks', accessor: (r) => r.remarks },
      ];
      exportToExcel(filteredPms, cols, 'PM Schedule', `BioTrack_PM_${stamp}`);
    } else if (reportType === 'breakdown') {
      const cols: ReportColumn<BreakdownTicket>[] = [
        { header: 'Ticket #', accessor: (r) => r.ticketNumber },
        { header: 'Asset ID', accessor: (r) => r.assetCode },
        { header: 'Equipment Name', accessor: (r) => r.assetName },
        { header: 'Department', accessor: (r) => r.department },
        { header: 'Priority', accessor: (r) => r.priority },
        { header: 'Reported Date', accessor: (r) => r.reportedDate },
        { header: 'Fault Description', accessor: (r) => r.faultDescription },
        { header: 'Diagnosis', accessor: (r) => r.diagnosis },
        { header: 'Corrective Action', accessor: (r) => r.correctiveAction },
        { header: 'Downtime (Hrs)', accessor: (r) => r.downtimeHours },
        { header: 'Status', accessor: (r) => r.status },
      ];
      exportToExcel(filteredBreakdowns, cols, 'Breakdowns', `BioTrack_Breakdowns_${stamp}`);
    } else if (reportType === 'calibration') {
      const cols: ReportColumn<CalibrationRecord>[] = [
        { header: 'Certificate ID', accessor: (r) => r.certificateId },
        { header: 'Asset ID', accessor: (r) => r.assetCode },
        { header: 'Equipment Name', accessor: (r) => r.assetName },
        { header: 'Department', accessor: (r) => r.department },
        { header: 'Calibration Date', accessor: (r) => r.calibrationDate },
        { header: 'Next Due Date', accessor: (r) => r.dueDate },
        { header: 'Reference Standard', accessor: (r) => r.standardUsed },
        { header: 'Result', accessor: (r) => r.result },
        { header: 'Performed By', accessor: (r) => r.performedBy },
      ];
      exportToExcel(filteredCalibrations, cols, 'Calibration', `BioTrack_Calibration_${stamp}`);
    } else if (reportType === 'contracts') {
      const cols: ReportColumn<ServiceContract>[] = [
        { header: 'Contract #', accessor: (r) => r.contractNumber },
        { header: 'Asset ID', accessor: (r) => r.assetCode },
        { header: 'Equipment Name', accessor: (r) => r.assetName },
        { header: 'Type', accessor: (r) => r.contractType },
        { header: 'Vendor', accessor: (r) => r.vendor },
        { header: 'Start Date', accessor: (r) => r.startDate },
        { header: 'End Date', accessor: (r) => r.endDate },
        { header: 'Annual Cost ($)', accessor: (r) => r.annualCost },
        { header: 'Status', accessor: (r) => deriveContractStatus(r, TODAY_ISO).status },
      ];
      exportToExcel(filteredContracts, cols, 'Contracts', `BioTrack_Contracts_${stamp}`);
    } else {
      const cols: ReportColumn<MaintenanceHistoryRow>[] = [
        { header: 'Date', accessor: (r) => r.date },
        { header: 'Asset ID', accessor: (r) => r.assetCode },
        { header: 'Equipment Name', accessor: (r) => r.assetName },
        { header: 'Department', accessor: (r) => r.department },
        { header: 'Activity Type', accessor: (r) => r.activityType },
        { header: 'Engineer', accessor: (r) => r.engineer },
        { header: 'Outcome', accessor: (r) => r.outcome },
        { header: 'Engineering Notes', accessor: (r) => r.notes },
      ];
      exportToExcel(maintenanceHistory, cols, 'Maintenance History', `BioTrack_Maintenance_${stamp}`);
    }
  };

  const handleExportCsv = () => {
    const stamp = TODAY_ISO;
    if (reportType === 'machine' && machineSummary) {
      exportToCsv(
        machineSummary.activityLogs,
        [
          { header: 'Timestamp', accessor: (r) => r.timestamp },
          { header: 'Asset ID', accessor: (r) => r.assetCode },
          { header: 'Action', accessor: (r) => r.actionType },
          { header: 'Actor', accessor: (r) => r.actorName },
          { header: 'Summary', accessor: (r) => r.summary },
          { header: 'Details', accessor: (r) => r.details ?? '' },
        ],
        `BioTrack_MachineLog_${machineSummary.asset.assetCode}_${stamp}`,
      );
    } else if (reportType === 'inventory') {
      exportToCsv(
        filteredAssets,
        [
          { header: 'Asset ID', accessor: (r) => r.assetCode },
          { header: 'Equipment Name', accessor: (r) => r.name },
          { header: 'Manufacturer', accessor: (r) => r.manufacturer },
          { header: 'Serial Number', accessor: (r) => r.serialNumber },
          { header: 'Department', accessor: (r) => r.department },
          { header: 'Assigned Engineer', accessor: (r) => r.assignedEngineer },
          { header: 'Status', accessor: (r) => r.status },
        ],
        `BioTrack_Inventory_${stamp}`,
      );
    } else if (reportType === 'pm') {
      exportToCsv(
        filteredPms,
        [
          { header: 'Asset ID', accessor: (r) => r.assetCode },
          { header: 'Equipment Name', accessor: (r) => r.assetName },
          { header: 'Scheduled Date', accessor: (r) => r.scheduledDate },
          { header: 'Engineer', accessor: (r) => r.assignedEngineer },
          { header: 'Status', accessor: (r) => derivePMStatus(r, TODAY_ISO) },
        ],
        `BioTrack_PM_${stamp}`,
      );
    } else if (reportType === 'breakdown') {
      exportToCsv(
        filteredBreakdowns,
        [
          { header: 'Ticket', accessor: (r) => r.ticketNumber },
          { header: 'Asset ID', accessor: (r) => r.assetCode },
          { header: 'Equipment', accessor: (r) => r.assetName },
          { header: 'Downtime Hours', accessor: (r) => r.downtimeHours },
          { header: 'Status', accessor: (r) => r.status },
        ],
        `BioTrack_Breakdowns_${stamp}`,
      );
    } else if (reportType === 'calibration') {
      exportToCsv(
        filteredCalibrations,
        [
          { header: 'Certificate ID', accessor: (r) => r.certificateId },
          { header: 'Asset ID', accessor: (r) => r.assetCode },
          { header: 'Due Date', accessor: (r) => r.dueDate },
          { header: 'Result', accessor: (r) => r.result },
        ],
        `BioTrack_Calibration_${stamp}`,
      );
    } else if (reportType === 'contracts') {
      exportToCsv(
        filteredContracts,
        [
          { header: 'Contract #', accessor: (r) => r.contractNumber },
          { header: 'Asset ID', accessor: (r) => r.assetCode },
          { header: 'Type', accessor: (r) => r.contractType },
          { header: 'End Date', accessor: (r) => r.endDate },
          { header: 'Status', accessor: (r) => deriveContractStatus(r, TODAY_ISO).status },
        ],
        `BioTrack_Contracts_${stamp}`,
      );
    } else {
      exportToCsv(
        maintenanceHistory,
        [
          { header: 'Date', accessor: (r) => r.date },
          { header: 'Asset ID', accessor: (r) => r.assetCode },
          { header: 'Equipment', accessor: (r) => r.assetName },
          { header: 'Activity', accessor: (r) => r.activityType },
          { header: 'Engineer', accessor: (r) => r.engineer },
          { header: 'Outcome', accessor: (r) => r.outcome },
        ],
        `BioTrack_Maintenance_${stamp}`,
      );
    }
  };

  const reportTitles: Record<ReportType, string> = {
    inventory: 'Medical Equipment Asset Inventory Report',
    pm: 'Preventive Maintenance Compliance Report',
    breakdown: 'Breakdown & Equipment Downtime Report',
    calibration: 'Calibration & Metrology Compliance Report',
    contracts: 'Warranty & AMC/CMC Coverage Report',
    maintenance: 'Consolidated Equipment Maintenance History Report',
    machine: machineSummary
      ? `Individual Machine Work Report — ${machineSummary.asset.assetCode} (${machineSummary.asset.name})`
      : 'Individual Machine Work Report',
  };

  return (
    <div className="space-y-4">
      {/* Global Comprehensive PDF Export */}
      <section
        aria-labelledby="global-export-heading"
        className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 no-print"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 id="global-export-heading" className="text-sm font-semibold text-slate-900">
              Global Fleet Compliance Summary
            </h2>
            <p className="text-xs text-slate-500 font-mono tabular-nums">
              {comprehensiveReport.summary.totalAssets} assets ·{' '}
              {comprehensiveReport.summary.activePmCount} active PM schedules ·{' '}
              {comprehensiveReport.summary.openBreakdownCount} open breakdowns ·{' '}
              {comprehensiveReport.summary.recentCalibrationCount} calibration records
            </p>
            {exportStatus && (
              <p className="text-xs font-medium text-emerald-700" role="status">
                Generated {exportStatus.fileName} including: {exportStatus.segmentsSummary}.
              </p>
            )}
          </div>

          {canExport ? (
            <button
              type="button"
              onClick={handleExportAllDataPdf}
              disabled={resolvedPdfSegments.noneSelected}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed whitespace-nowrap shrink-0 self-start md:self-center transition-colors"
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              {resolvedPdfSegments.allSelected
                ? 'Export All Data (PDF)'
                : resolvedPdfSegments.noneSelected
                  ? 'Export Selected (0)'
                  : `Export All Data (PDF · ${resolvedPdfSegments.selectedKeys.length}/4)`}
            </button>
          ) : (
            <span className="text-xs text-slate-500 whitespace-nowrap">
              Export restricted to engineering &amp; supervisory roles
            </span>
          )}
        </div>

        <div className="pt-3 border-t border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div
            className="flex flex-wrap items-center gap-x-6 gap-y-2"
            role="group"
            aria-label="Select sections to include in PDF export"
          >
            {(
              [
                {
                  key: 'inventory',
                  label: 'Equipment Inventory',
                  count: comprehensiveReport.summary.totalAssets,
                },
                {
                  key: 'activePm',
                  label: 'Active Maintenance Schedules',
                  count: comprehensiveReport.summary.activePmCount,
                },
                {
                  key: 'openBreakdowns',
                  label: 'Open Breakdowns',
                  count: comprehensiveReport.summary.openBreakdownCount,
                },
                {
                  key: 'calibrationHistory',
                  label: 'Calibration History',
                  count: comprehensiveReport.summary.recentCalibrationCount,
                },
              ] as const
            ).map((item) => (
              <label
                key={item.key}
                className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none whitespace-nowrap"
              >
                <input
                  type="checkbox"
                  checked={pdfSegments[item.key]}
                  onChange={() => togglePdfSegment(item.key)}
                  className="h-4 w-4 rounded border-slate-300 accent-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                />
                <span className="font-medium text-slate-800">{item.label}</span>
                <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                  ({item.count})
                </span>
              </label>
            ))}
          </div>

          <div className="flex items-center gap-3 text-xs shrink-0">
            {resolvedPdfSegments.noneSelected && (
              <span className="text-red-700 font-medium">
                Select at least one segment to export.
              </span>
            )}
            <button
              type="button"
              onClick={handleSelectAllPdfSegments}
              disabled={resolvedPdfSegments.allSelected}
              className="font-medium text-teal-700 hover:text-teal-800 disabled:text-slate-400 disabled:cursor-default whitespace-nowrap"
            >
              Select All
            </button>
            <span className="text-slate-300" aria-hidden="true">
              ·
            </span>
            <button
              type="button"
              onClick={handleClearPdfSegments}
              disabled={resolvedPdfSegments.noneSelected}
              className="font-medium text-slate-600 hover:text-slate-900 disabled:text-slate-400 disabled:cursor-default whitespace-nowrap"
            >
              Clear All
            </button>
          </div>
        </div>
      </section>

      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 no-print">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {(
            [
              ['inventory', 'Equipment Inventory'],
              ['pm', 'Preventive Maintenance'],
              ['breakdown', 'Breakdowns'],
              ['calibration', 'Calibration'],
              ['contracts', 'Warranty & AMC'],
              ['maintenance', 'Maintenance History'],
              ['machine', 'Machine Work Report'],
            ] as Array<[ReportType, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setReportType(id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                reportType === id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {reportType === 'machine' ? (
            <select
              value={selectedMachine?.id ?? ''}
              onChange={(e) => setSelectedMachineId(e.target.value)}
              aria-label="Select machine for work report"
              className="px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg bg-white text-slate-700 focus:border-teal-700 focus:outline-none max-w-md w-full sm:w-auto"
            >
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.assetCode} — {a.name} ({a.assignedEngineer})
                </option>
              ))}
            </select>
          ) : (
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              aria-label="Filter report by department"
              className="px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg bg-white text-slate-700 focus:border-teal-700 focus:outline-none"
            >
              <option value="All">All Departments</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}

          {canExport ? (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleExportExcel}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 whitespace-nowrap"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
                Export Excel (.xlsx)
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Export CSV
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
              >
                <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                Print / Save PDF
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Report exports require Biomedical Engineer, Supervisor, or Administrator role.
            </p>
          )}
        </div>
      </div>

      {/* Printable Report Sheet */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{reportTitles[reportType]}</h2>
            <p className="text-xs text-slate-500">
              Department Scope: {departmentFilter} · Generated {TODAY_ISO}
            </p>
          </div>
          <span className="font-mono text-xs text-slate-500">BioTrack Clinical Engineering</span>
        </div>

        <div className="overflow-x-auto">
          {reportType === 'inventory' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="py-2.5 px-4">Asset ID</th>
                  <th className="py-2.5 px-4">Equipment</th>
                  <th className="py-2.5 px-4">Manufacturer / Model</th>
                  <th className="py-2.5 px-4">Serial</th>
                  <th className="py-2.5 px-4">Department</th>
                  <th className="py-2.5 px-4">Assigned Engineer</th>
                  <th className="py-2.5 px-4 text-right">Remaining Value</th>
                  <th className="py-2.5 px-4">Warranty End</th>
                  <th className="py-2.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAssets.map((a) => {
                  const dep = calculateEquipmentDepreciation({
                    purchaseCost: a.purchaseCost,
                    purchaseDate: a.purchaseDate,
                    expectedLifecycleYears: resolveAssetLifecycleYears(a),
                    referenceDate: TODAY_ISO,
                  });
                  return (
                  <tr key={a.id}>
                    <td className="py-2.5 px-4 font-mono font-semibold">{a.assetCode}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-900">{a.name}</td>
                    <td className="py-2.5 px-4 text-slate-600">
                      {a.manufacturer} · {a.model}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-600">{a.serialNumber}</td>
                    <td className="py-2.5 px-4 text-slate-600">{a.department}</td>
                    <td className="py-2.5 px-4 text-slate-700 font-medium">{a.assignedEngineer}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                      ${dep.remainingValue.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums">{a.warrantyEnd}</td>
                    <td className="py-2.5 px-4 font-medium">{a.status}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {reportType === 'pm' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="py-2.5 px-4">Asset ID</th>
                  <th className="py-2.5 px-4">Equipment</th>
                  <th className="py-2.5 px-4">Department</th>
                  <th className="py-2.5 px-4">Frequency</th>
                  <th className="py-2.5 px-4">Scheduled</th>
                  <th className="py-2.5 px-4">Completed</th>
                  <th className="py-2.5 px-4">Engineer</th>
                  <th className="py-2.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPms.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2.5 px-4 font-mono font-semibold">{p.assetCode}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-900">{p.assetName}</td>
                    <td className="py-2.5 px-4 text-slate-600">{p.department}</td>
                    <td className="py-2.5 px-4 text-slate-600">{p.frequency}</td>
                    <td className="py-2.5 px-4 font-mono tabular-nums">{p.scheduledDate}</td>
                    <td className="py-2.5 px-4 font-mono tabular-nums">{p.completedDate ?? '—'}</td>
                    <td className="py-2.5 px-4 text-slate-700">{p.assignedEngineer}</td>
                    <td className="py-2.5 px-4 font-medium">{derivePMStatus(p, TODAY_ISO)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {reportType === 'breakdown' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="py-2.5 px-4">Ticket</th>
                  <th className="py-2.5 px-4">Asset ID</th>
                  <th className="py-2.5 px-4">Equipment</th>
                  <th className="py-2.5 px-4">Priority</th>
                  <th className="py-2.5 px-4">Reported</th>
                  <th className="py-2.5 px-4 text-right">Downtime</th>
                  <th className="py-2.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBreakdowns.map((b) => (
                  <tr key={b.id}>
                    <td className="py-2.5 px-4 font-mono font-semibold">{b.ticketNumber}</td>
                    <td className="py-2.5 px-4 font-mono">{b.assetCode}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-900">{b.assetName}</td>
                    <td className="py-2.5 px-4">{b.priority}</td>
                    <td className="py-2.5 px-4 font-mono tabular-nums">{b.reportedDate}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                      {b.downtimeHours.toFixed(1)} h
                    </td>
                    <td className="py-2.5 px-4 font-medium">{b.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {reportType === 'calibration' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="py-2.5 px-4">Certificate</th>
                  <th className="py-2.5 px-4">Asset ID</th>
                  <th className="py-2.5 px-4">Equipment</th>
                  <th className="py-2.5 px-4">Standard Used</th>
                  <th className="py-2.5 px-4">Test Date</th>
                  <th className="py-2.5 px-4">Due Date</th>
                  <th className="py-2.5 px-4">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCalibrations.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2.5 px-4 font-mono font-semibold">{c.certificateId}</td>
                    <td className="py-2.5 px-4 font-mono">{c.assetCode}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-900">{c.assetName}</td>
                    <td className="py-2.5 px-4 text-slate-600">{c.standardUsed}</td>
                    <td className="py-2.5 px-4 font-mono tabular-nums">{c.calibrationDate}</td>
                    <td className="py-2.5 px-4 font-mono tabular-nums">{c.dueDate}</td>
                    <td className="py-2.5 px-4 font-medium">{c.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {reportType === 'contracts' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="py-2.5 px-4">Contract #</th>
                  <th className="py-2.5 px-4">Asset ID</th>
                  <th className="py-2.5 px-4">Equipment</th>
                  <th className="py-2.5 px-4">Type</th>
                  <th className="py-2.5 px-4">Vendor</th>
                  <th className="py-2.5 px-4">End Date</th>
                  <th className="py-2.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredContracts.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2.5 px-4 font-mono font-semibold">{c.contractNumber}</td>
                    <td className="py-2.5 px-4 font-mono">{c.assetCode}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-900">{c.assetName}</td>
                    <td className="py-2.5 px-4">{c.contractType}</td>
                    <td className="py-2.5 px-4 text-slate-600">{c.vendor}</td>
                    <td className="py-2.5 px-4 font-mono tabular-nums">{c.endDate}</td>
                    <td className="py-2.5 px-4 font-medium">
                      {deriveContractStatus(c, TODAY_ISO).status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {reportType === 'maintenance' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4">Asset ID</th>
                  <th className="py-2.5 px-4">Equipment</th>
                  <th className="py-2.5 px-4">Activity Type</th>
                  <th className="py-2.5 px-4">Engineer</th>
                  <th className="py-2.5 px-4">Outcome</th>
                  <th className="py-2.5 px-4">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {maintenanceHistory.map((row, idx) => (
                  <tr key={`${row.assetCode}-${row.activityType}-${idx}`}>
                    <td className="py-2.5 px-4 font-mono tabular-nums whitespace-nowrap">{row.date}</td>
                    <td className="py-2.5 px-4 font-mono font-semibold whitespace-nowrap">{row.assetCode}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-900">{row.assetName}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap">{row.activityType}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap">{row.engineer}</td>
                    <td className="py-2.5 px-4 font-medium whitespace-nowrap">{row.outcome}</td>
                    <td className="py-2.5 px-4 text-slate-600 max-w-sm truncate">{row.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {reportType === 'machine' && machineSummary && (
            <div className="p-6 space-y-6 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-4 border-b border-slate-200">
                <div>
                  <span className="text-slate-500 block">Assigned Engineer</span>
                  <span className="font-semibold text-slate-900">
                    {machineSummary.asset.assignedEngineer}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Completed PMs</span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {machineSummary.completedPmCount} / {machineSummary.pms.length}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Breakdowns / Downtime</span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {machineSummary.breakdowns.length} ({machineSummary.totalDowntimeHours.toFixed(1)}h)
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Calibrations Logged</span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {machineSummary.calibrations.length}
                  </span>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-slate-800 mb-2">
                  Preventive Maintenance &amp; Repair Log ({machineSummary.pms.length + machineSummary.breakdowns.length})
                </h3>
                {machineSummary.pms.length === 0 && machineSummary.breakdowns.length === 0 ? (
                  <p className="text-slate-500">No work orders logged for this machine yet.</p>
                ) : (
                  <table className="w-full text-left border-collapse border border-slate-200">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Work Type</th>
                        <th className="py-2 px-3">Engineer</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3">Work Performed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {machineSummary.pms.map((p) => (
                        <tr key={p.id}>
                          <td className="py-2 px-3 font-mono tabular-nums whitespace-nowrap">
                            {p.completedDate ?? p.scheduledDate}
                          </td>
                          <td className="py-2 px-3">{p.frequency} PM</td>
                          <td className="py-2 px-3">{p.assignedEngineer}</td>
                          <td className="py-2 px-3 font-medium">{derivePMStatus(p, TODAY_ISO)}</td>
                          <td className="py-2 px-3 text-slate-600">{p.remarks}</td>
                        </tr>
                      ))}
                      {machineSummary.breakdowns.map((b) => (
                        <tr key={b.id}>
                          <td className="py-2 px-3 font-mono tabular-nums whitespace-nowrap">
                            {b.resolvedDate ?? b.reportedDate}
                          </td>
                          <td className="py-2 px-3">Breakdown ({b.ticketNumber})</td>
                          <td className="py-2 px-3">{b.assignedEngineer}</td>
                          <td className="py-2 px-3 font-medium">
                            {b.status} ({b.downtimeHours}h)
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            {b.correctiveAction || b.faultDescription}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
