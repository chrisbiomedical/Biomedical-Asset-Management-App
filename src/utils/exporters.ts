import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type {
  ActivityLogEntry,
  Asset,
  BreakdownTicket,
  CalibrationRecord,
  ComprehensiveReportSegmentSelection,
  PreventiveMaintenance,
  ServiceContract,
} from '../types/biotrack';
import {
  calculateEquipmentDepreciation,
  DEFAULT_COMPREHENSIVE_REPORT_SEGMENTS,
  resolveAssetLifecycleYears,
  resolveComprehensiveReportSections,
  type ComprehensiveReportData,
} from './biotrackLogic';

export interface ReportColumn<T> {
  header: string;
  accessor: (row: T) => string | number;
}

export function exportToExcel<T>(
  rows: T[],
  columns: ReportColumn<T>[],
  sheetName: string,
  fileName: string,
): void {
  const worksheetData = [
    columns.map((c) => c.header),
    ...rows.map((row) => columns.map((c) => c.accessor(row))),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
}

export function exportToCsv<T>(
  rows: T[],
  columns: ReportColumn<T>[],
  fileName: string,
): void {
  const escapeCell = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    columns.map((c) => escapeCell(c.header)).join(','),
    ...rows.map((row) => columns.map((c) => escapeCell(c.accessor(row))).join(',')),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportMachineWorkReportExcel(params: {
  asset: Asset;
  pms: PreventiveMaintenance[];
  breakdowns: BreakdownTicket[];
  calibrations: CalibrationRecord[];
  contracts: ServiceContract[];
  activityLogs: ActivityLogEntry[];
  generatedDate: string;
}): void {
  const { asset, pms, breakdowns, calibrations, contracts, activityLogs, generatedDate } = params;
  const workbook = XLSX.utils.book_new();

  const lifecycleYears = resolveAssetLifecycleYears(asset);
  const depreciation = calculateEquipmentDepreciation({
    purchaseCost: asset.purchaseCost,
    purchaseDate: asset.purchaseDate,
    expectedLifecycleYears: lifecycleYears,
    referenceDate: generatedDate,
  });
  const totalDowntime = breakdowns.reduce((sum, b) => sum + (b.downtimeHours || 0), 0);
  const overviewRows: Array<Array<string | number>> = [
    ['BioTrack — Machine Work & Compliance Report', ''],
    ['Report Generated On', generatedDate],
    ['Asset ID', asset.assetCode],
    ['Equipment Name', asset.name],
    ['Category', asset.category],
    ['Manufacturer', asset.manufacturer],
    ['Model', asset.model],
    ['Serial Number', asset.serialNumber],
    ['Department', asset.department],
    ['Location / Room', asset.location],
    ['Assigned Biomedical Engineer', asset.assignedEngineer],
    ['Operational Status', asset.status],
    ['Clinical Risk Class', asset.riskClass],
    ['Purchase Date', asset.purchaseDate],
    ['Acquisition Value (USD)', asset.purchaseCost],
    ['Expected Lifecycle (Years)', lifecycleYears],
    ['Remaining Asset Value (USD)', depreciation.remainingValue],
    ['Warranty Expiry', asset.warrantyEnd],
    ['Last PM Date', asset.lastPmDate || '—'],
    ['Next PM Due', asset.nextPmDate],
    ['Next Calibration Due', asset.nextCalibrationDate],
    ['Completed PM Work Orders', pms.filter((p) => p.status === 'Completed').length],
    ['Breakdown Tickets Logged', breakdowns.length],
    ['Total Recorded Downtime (Hours)', totalDowntime],
    ['Calibration Certificates', calibrations.length],
    ['Active/Linked Contracts', contracts.length],
    ['Engineering Notes', asset.notes ?? ''],
  ];
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(overviewRows),
    'Machine Summary',
  );

  const pmSheetRows: Array<Array<string | number>> = [
    [
      'PM ID',
      'Frequency',
      'Scheduled Date',
      'Completed Date',
      'Assigned Engineer',
      'Status',
      'Checklist Passed',
      'Parts Replaced',
      'Remarks',
    ],
    ...pms.map((pm) => {
      const passed = pm.checklist.filter((c) => c.checked).length;
      return [
        pm.id,
        pm.frequency,
        pm.scheduledDate,
        pm.completedDate ?? 'Pending',
        pm.assignedEngineer,
        pm.status,
        `${passed}/${pm.checklist.length}`,
        pm.partsReplaced ?? 'None',
        pm.remarks,
      ];
    }),
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(pmSheetRows), 'PM Work Orders');

  const bdSheetRows: Array<Array<string | number>> = [
    [
      'Ticket #',
      'Reported Date',
      'Resolved Date',
      'Priority',
      'Assigned Engineer',
      'Status',
      'Downtime (Hrs)',
      'Fault Description',
      'Diagnosis',
      'Corrective Action',
    ],
    ...breakdowns.map((bd) => [
      bd.ticketNumber,
      bd.reportedDate,
      bd.resolvedDate ?? 'Open',
      bd.priority,
      bd.assignedEngineer,
      bd.status,
      bd.downtimeHours,
      bd.faultDescription,
      bd.diagnosis,
      bd.correctiveAction,
    ]),
  ];
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(bdSheetRows),
    'Breakdown Repairs',
  );

  const calSheetRows: Array<Array<string | number>> = [
    [
      'Certificate ID',
      'Calibration Date',
      'Next Due Date',
      'Performed By',
      'Reference Standard',
      'Result',
      'Deviation Notes',
      'Certificate File',
    ],
    ...calibrations.map((c) => [
      c.certificateId,
      c.calibrationDate,
      c.dueDate,
      c.performedBy,
      c.standardUsed,
      c.result,
      c.deviationNotes,
      c.certificateFileName,
    ]),
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(calSheetRows), 'Calibrations');

  const logSheetRows: Array<Array<string | number>> = [
    ['Timestamp', 'Action Type', 'Actor', 'Role', 'Summary', 'Details'],
    ...activityLogs.map((l) => [
      l.timestamp,
      l.actionType,
      l.actorName,
      l.actorRole,
      l.summary,
      l.details ?? '',
    ]),
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(logSheetRows), 'Activity Audit Log');

  XLSX.writeFile(workbook, `BioTrack_WorkReport_${asset.assetCode}_${generatedDate}.xlsx`);
}

export function exportPMWorkReportExcel(
  pm: PreventiveMaintenance,
  asset: Asset | undefined,
  generatedDate: string,
): void {
  const workbook = XLSX.utils.book_new();
  const passed = pm.checklist.filter((c) => c.checked).length;

  const summaryRows: Array<Array<string | number>> = [
    ['BioTrack — Preventive Maintenance Work Report', ''],
    ['Report Generated On', generatedDate],
    ['Asset ID', pm.assetCode],
    ['Equipment Name', pm.assetName],
    ['Manufacturer / Model', asset ? `${asset.manufacturer} ${asset.model}` : '—'],
    ['Serial Number', asset?.serialNumber ?? '—'],
    ['Department / Location', asset ? `${asset.department} · ${asset.location}` : pm.department],
    ['Primary Machine Engineer', asset?.assignedEngineer ?? pm.assignedEngineer],
    ['PM Work Order ID', pm.id],
    ['Maintenance Frequency', pm.frequency],
    ['Scheduled Date', pm.scheduledDate],
    ['Completed Date', pm.completedDate ?? 'Pending'],
    ['Executed By Engineer', pm.assignedEngineer],
    ['PM Status', pm.status],
    ['Checklist Score', `${passed}/${pm.checklist.length} passed`],
    ['Parts / Consumables Replaced', pm.partsReplaced ?? 'None'],
    ['Engineer Test Remarks', pm.remarks],
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summaryRows), 'PM Work Summary');

  const checklistRows: Array<Array<string | number>> = [
    ['#', 'Inspection Step', 'Result'],
    ...pm.checklist.map((item, idx) => [idx + 1, item.label, item.checked ? 'PASS' : 'PENDING']),
  ];
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(checklistRows),
    'Safety Checklist',
  );

  XLSX.writeFile(
    workbook,
    `BioTrack_PM_WorkReport_${pm.assetCode}_${pm.completedDate ?? generatedDate}.xlsx`,
  );
}

export function exportBreakdownWorkReportExcel(
  ticket: BreakdownTicket,
  asset: Asset | undefined,
  generatedDate: string,
): void {
  const workbook = XLSX.utils.book_new();
  const rows: Array<Array<string | number>> = [
    ['BioTrack — Breakdown & Corrective Repair Work Report', ''],
    ['Report Generated On', generatedDate],
    ['Ticket Number', ticket.ticketNumber],
    ['Asset ID', ticket.assetCode],
    ['Equipment Name', ticket.assetName],
    ['Manufacturer / Model', asset ? `${asset.manufacturer} ${asset.model}` : '—'],
    ['Serial Number', asset?.serialNumber ?? '—'],
    ['Department / Location', `${ticket.department} · ${ticket.location}`],
    ['Reported By', ticket.reportedBy],
    ['Reported Date', ticket.reportedDate],
    ['Clinical Priority', ticket.priority],
    ['Assigned Biomedical Engineer', ticket.assignedEngineer],
    ['Repair Status', ticket.status],
    ['Resolved Date', ticket.resolvedDate ?? 'In Progress'],
    ['Total Downtime (Hours)', ticket.downtimeHours],
    ['Fault Description', ticket.faultDescription],
    ['Root Cause / Diagnosis', ticket.diagnosis || '—'],
    ['Corrective Action Taken', ticket.correctiveAction || '—'],
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Repair Work Report');
  XLSX.writeFile(
    workbook,
    `BioTrack_Repair_WorkReport_${ticket.assetCode}_${ticket.ticketNumber}.xlsx`,
  );
}

export function exportCalibrationWorkReportExcel(
  cal: CalibrationRecord,
  asset: Asset | undefined,
  generatedDate: string,
): void {
  const workbook = XLSX.utils.book_new();
  const rows: Array<Array<string | number>> = [
    ['BioTrack — Calibration Work Report', ''],
    ['Report Generated On', generatedDate],
    ['Certificate ID', cal.certificateId],
    ['Asset ID', cal.assetCode],
    ['Equipment Name', cal.assetName],
    ['Manufacturer / Model', asset ? `${asset.manufacturer} ${asset.model}` : '—'],
    ['Serial Number', asset?.serialNumber ?? '—'],
    ['Department', cal.department],
    ['Calibration Date', cal.calibrationDate],
    ['Next Calibration Due', cal.dueDate],
    ['Performed By', cal.performedBy],
    ['Reference Standard Used', cal.standardUsed],
    ['Test Result', cal.result],
    ['Measured Deviations / Notes', cal.deviationNotes],
    ['Certificate File', cal.certificateFileName],
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Calibration Report');
  XLSX.writeFile(
    workbook,
    `BioTrack_Cal_WorkReport_${cal.assetCode}_${cal.certificateId}.xlsx`,
  );
}

interface JsPdfWithAutoTable extends jsPDF {
  lastAutoTable?: { finalY: number };
}

export function buildAllDataPdfDocument(
  data: ComprehensiveReportData,
  segments: ComprehensiveReportSegmentSelection = DEFAULT_COMPREHENSIVE_REPORT_SEGMENTS,
): { doc: JsPdfWithAutoTable; fileName: string; includedSectionTitles: string[] } {
  const resolved = resolveComprehensiveReportSections(segments);
  const effectiveSegments = resolved.noneSelected
    ? DEFAULT_COMPREHENSIVE_REPORT_SEGMENTS
    : segments;
  const effectiveResolved = resolved.noneSelected
    ? resolveComprehensiveReportSections(DEFAULT_COMPREHENSIVE_REPORT_SEGMENTS)
    : resolved;

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
  }) as JsPdfWithAutoTable;

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 36;

  // Document Header
  doc.setFillColor(15, 118, 110); // Teal-700
  doc.rect(0, 0, pageWidth, 62, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('BioTrack — Comprehensive Clinical Engineering Report', marginX, 28);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(
    `${effectiveResolved.subtitleText} · Generated ${data.generatedDate}`,
    marginX,
    46,
  );

  // Fleet Executive Summary Table (dynamically aligned to selected segments)
  let currentY = 82;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Executive Fleet Summary', marginX, currentY);

  const summaryHeads: string[] = [];
  const summaryValues: string[] = [];

  if (effectiveSegments.inventory) {
    summaryHeads.push('Total Assets', 'Operational', 'Total Acquisition Value', 'Remaining Asset Value');
    summaryValues.push(
      String(data.summary.totalAssets),
      `${data.summary.operationalAssets}/${data.summary.totalAssets}`,
      `$${data.summary.totalAcquisitionValue.toLocaleString()}`,
      `$${data.summary.totalRemainingValue.toLocaleString()}`,
    );
  }
  if (effectiveSegments.activePm) {
    summaryHeads.push('Active PM Schedules');
    summaryValues.push(`${data.summary.activePmCount} (${data.summary.overduePmCount} overdue)`);
  }
  if (effectiveSegments.openBreakdowns) {
    summaryHeads.push('Open Breakdowns');
    summaryValues.push(String(data.summary.openBreakdownCount));
  }
  if (effectiveSegments.calibrationHistory) {
    summaryHeads.push('Calibration Records');
    summaryValues.push(String(data.summary.recentCalibrationCount));
  }
  summaryHeads.push('Active Contracts');
  summaryValues.push(String(data.summary.activeContractCount));

  autoTable(doc, {
    startY: currentY + 8,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold', fontSize: 8.5 },
    bodyStyles: { textColor: [15, 23, 42], fontSize: 9, fontStyle: 'bold' },
    head: [summaryHeads],
    body: [summaryValues],
  });

  currentY = (doc.lastAutoTable?.finalY ?? currentY + 50) + 22;
  let sectionIndex = 0;
  const includedSectionTitles: string[] = [];

  const ensurePageSpace = () => {
    if (sectionIndex > 0 && currentY > pageHeight - 110) {
      doc.addPage();
      currentY = 44;
    }
  };

  if (effectiveSegments.inventory) {
    sectionIndex += 1;
    const title = `${sectionIndex}. Complete Equipment Inventory (${data.inventory.length} Assets)`;
    includedSectionTitles.push(title);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(title, marginX, currentY);

    autoTable(doc, {
      startY: currentY + 8,
      margin: { left: marginX, right: marginX },
      theme: 'striped',
      headStyles: { fillColor: [15, 118, 110], textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
      head: [[
        'Asset ID',
        'Equipment Name',
        'Manufacturer / Model',
        'Department',
        'Engineer',
        'Purchased',
        'Lifecycle',
        'Remaining Value',
        'Warranty End',
        'Status',
      ]],
      body: data.inventory.map((row) => [
        row.asset.assetCode,
        row.asset.name,
        `${row.asset.manufacturer} · ${row.asset.model}`,
        row.asset.department,
        row.asset.assignedEngineer,
        row.asset.purchaseDate,
        `${row.lifecycleYears} yrs`,
        `$${row.remainingValue.toLocaleString()} (${row.remainingValuePercent}%)`,
        row.asset.warrantyEnd,
        row.asset.status,
      ]),
    });

    currentY = (doc.lastAutoTable?.finalY ?? currentY + 80) + 22;
  }

  if (effectiveSegments.activePm) {
    ensurePageSpace();
    sectionIndex += 1;
    const title = `${sectionIndex}. Active Preventive Maintenance Schedules (${data.activeMaintenanceSchedules.length})`;
    includedSectionTitles.push(title);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(title, marginX, currentY);

    autoTable(doc, {
      startY: currentY + 8,
      margin: { left: marginX, right: marginX },
      theme: 'striped',
      headStyles: { fillColor: [15, 118, 110], textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 7.8, textColor: [30, 41, 59] },
      head: [[
        'Asset ID',
        'Equipment Name',
        'Department',
        'Frequency',
        'Scheduled Date',
        'Assigned Engineer',
        'Status',
        'Work Scope / Remarks',
      ]],
      body:
        data.activeMaintenanceSchedules.length > 0
          ? data.activeMaintenanceSchedules.map((pm) => [
              pm.assetCode,
              pm.assetName,
              pm.department,
              pm.frequency,
              pm.scheduledDate,
              pm.assignedEngineer,
              pm.effectiveStatus,
              pm.remarks,
            ])
          : [['—', 'No active preventive maintenance schedules pending.', '', '', '', '', '', '']],
    });

    currentY = (doc.lastAutoTable?.finalY ?? currentY + 80) + 22;
  }

  if (effectiveSegments.openBreakdowns) {
    ensurePageSpace();
    sectionIndex += 1;
    const title = `${sectionIndex}. Open Breakdown Tickets (${data.openBreakdowns.length})`;
    includedSectionTitles.push(title);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(title, marginX, currentY);

    autoTable(doc, {
      startY: currentY + 8,
      margin: { left: marginX, right: marginX },
      theme: 'striped',
      headStyles: { fillColor: [185, 28, 28], textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 7.8, textColor: [30, 41, 59] },
      head: [[
        'Ticket #',
        'Asset ID',
        'Equipment Name',
        'Department',
        'Priority',
        'Reported Date',
        'Engineer',
        'Downtime',
        'Status',
        'Fault Description',
      ]],
      body:
        data.openBreakdowns.length > 0
          ? data.openBreakdowns.map((bd) => [
              bd.ticketNumber,
              bd.assetCode,
              bd.assetName,
              bd.department,
              bd.priority,
              bd.reportedDate,
              bd.assignedEngineer,
              `${bd.downtimeHours.toFixed(1)} h`,
              bd.status,
              bd.faultDescription,
            ])
          : [['—', 'No open breakdown tickets.', '', '', '', '', '', '', '', '']],
    });

    currentY = (doc.lastAutoTable?.finalY ?? currentY + 80) + 22;
  }

  if (effectiveSegments.calibrationHistory) {
    ensurePageSpace();
    sectionIndex += 1;
    const title = `${sectionIndex}. Recent Calibration History (${data.recentCalibrations.length} Records)`;
    includedSectionTitles.push(title);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(title, marginX, currentY);

    autoTable(doc, {
      startY: currentY + 8,
      margin: { left: marginX, right: marginX },
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 7.8, textColor: [30, 41, 59] },
      head: [[
        'Certificate ID',
        'Asset ID',
        'Equipment Name',
        'Department',
        'Test Date',
        'Next Due',
        'Reference Standard',
        'Performed By',
        'Result',
      ]],
      body:
        data.recentCalibrations.length > 0
          ? data.recentCalibrations.map((cal) => [
              cal.certificateId,
              cal.assetCode,
              cal.assetName,
              cal.department,
              cal.calibrationDate,
              cal.dueDate,
              cal.standardUsed,
              cal.performedBy,
              cal.result,
            ])
          : [['—', 'No calibration history records available.', '', '', '', '', '', '', '']],
    });
  }

  // Page numbering footer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `BioTrack Biomedical Equipment Asset Management System · Confidential Compliance Export`,
      marginX,
      pageHeight - 18,
    );
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - marginX, pageHeight - 18, {
      align: 'right',
    });
  }

  const fileName = `BioTrack_Comprehensive_Report_${data.generatedDate}.pdf`;
  return { doc, fileName, includedSectionTitles };
}

export function exportAllDataPdf(
  data: ComprehensiveReportData,
  segments: ComprehensiveReportSegmentSelection = DEFAULT_COMPREHENSIVE_REPORT_SEGMENTS,
): string {
  const { doc, fileName } = buildAllDataPdfDocument(data, segments);
  doc.save(fileName);
  return fileName;
}

