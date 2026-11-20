import { useEffect, useState } from 'react';
import { AlertTriangle, FileDown, Package, PhoneCall, Printer, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { getManufacturerSupport, TODAY_ISO } from '../data/mockData';
import type {
  ActivityActionType,
  ActivityLogEntry,
  Asset,
  BioTrackUser,
  BreakdownTicket,
  CalibrationRecord,
  ManufacturerCallLog,
  PartOrder,
  PartOrderStatus,
  PreventiveMaintenance,
  ServiceContract,
  UserRole,
} from '../types/biotrack';
import {
  calculateEquipmentDepreciation,
  defaultSafetyCertificationForCategory,
  deriveContractStatus,
  derivePMStatus,
  deriveSafetyCertificationStatus,
  generateNextOrderNumber,
  getAssetActivityLogs,
  hasPermission,
  resolveAssetLifecycleYears,
} from '../utils/biotrackLogic';
import {
  exportBreakdownWorkReportExcel,
  exportCalibrationWorkReportExcel,
  exportMachineWorkReportExcel,
  exportPMWorkReportExcel,
} from '../utils/exporters';
import {
  BreakdownStatusLabel,
  CalibrationResultLabel,
  OperationalStatusLabel,
  PMStatusLabel,
} from './StatusText';

export type AssetDetailTab =
  | 'overview'
  | 'pm'
  | 'breakdowns'
  | 'calibration'
  | 'contracts'
  | 'parts'
  | 'activity'
  | 'qr';

interface AssetDetailModalProps {
  asset: Asset | null;
  initialTab?: AssetDetailTab;
  pms: PreventiveMaintenance[];
  breakdowns: BreakdownTicket[];
  calibrations: CalibrationRecord[];
  contracts: ServiceContract[];
  partOrders: PartOrder[];
  allPartOrders: PartOrder[];
  manufacturerCalls: ManufacturerCallLog[];
  activityLogs: ActivityLogEntry[];
  users: BioTrackUser[];
  currentUser: BioTrackUser;
  userRole: UserRole;
  onAssignEngineer: (assetId: string, engineerName: string) => void;
  onUpdateAsset?: (asset: Asset) => void;
  onOrderPart: (order: PartOrder) => void;
  onUpdatePartOrderStatus: (orderId: string, status: PartOrderStatus) => void;
  onLogManufacturerCall: (call: ManufacturerCallLog) => void;
  onClose: () => void;
}

type ActivityFilter =
  | 'All'
  | 'Status & Specs'
  | 'Maintenance'
  | 'Breakdowns'
  | 'Calibration'
  | 'Contracts'
  | 'Parts & OEM';

function matchesActivityFilter(actionType: ActivityActionType, filter: ActivityFilter): boolean {
  if (filter === 'All') return true;
  if (filter === 'Status & Specs') {
    return (
      actionType === 'Asset Registered' ||
      actionType === 'Engineer Assigned' ||
      actionType === 'Status Changed' ||
      actionType === 'Equipment Updated'
    );
  }
  if (filter === 'Maintenance') {
    return actionType === 'PM Scheduled' || actionType === 'PM Completed';
  }
  if (filter === 'Breakdowns') {
    return (
      actionType === 'Breakdown Reported' ||
      actionType === 'Breakdown Updated' ||
      actionType === 'Breakdown Resolved'
    );
  }
  if (filter === 'Calibration') return actionType === 'Calibration Logged';
  if (filter === 'Parts & OEM') {
    return (
      actionType === 'Part Ordered' ||
      actionType === 'Part Status Updated' ||
      actionType === 'Manufacturer Called'
    );
  }
  return actionType === 'Contract Added';
}

function actionLabelColor(actionType: ActivityActionType): string {
  switch (actionType) {
    case 'PM Completed':
    case 'Breakdown Resolved':
    case 'Asset Registered':
      return 'text-emerald-700';
    case 'Breakdown Reported':
      return 'text-red-700';
    case 'Status Changed':
    case 'Breakdown Updated':
    case 'Part Ordered':
      return 'text-amber-700';
    case 'Engineer Assigned':
    case 'Manufacturer Called':
    case 'Part Status Updated':
      return 'text-teal-700';
    default:
      return 'text-teal-800';
  }
}

export function AssetDetailModal({
  asset,
  initialTab = 'overview',
  pms,
  breakdowns,
  calibrations,
  contracts,
  partOrders,
  allPartOrders,
  manufacturerCalls,
  activityLogs,
  users,
  currentUser,
  userRole,
  onAssignEngineer,
  onUpdateAsset,
  onOrderPart,
  onUpdatePartOrderStatus,
  onLogManufacturerCall,
  onClose,
}: AssetDetailModalProps) {
  const [tab, setTab] = useState<AssetDetailTab>(initialTab);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('All');

  // Interactive Depreciation Calculator State
  const [calcLifecycleYears, setCalcLifecycleYears] = useState('7');
  const [calcSalvagePercent, setCalcSalvagePercent] = useState('0');
  const [lifecycleSavedNotice, setLifecycleSavedNotice] = useState(false);

  // Inline Parts Order & OEM Call Forms
  const [orderFormOpen, setOrderFormOpen] = useState(false);
  const [partName, setPartName] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('250');
  const [expectedDelivery, setExpectedDelivery] = useState('2026-11-24');
  const [orderNotes, setOrderNotes] = useState('');

  const [callFormOpen, setCallFormOpen] = useState(false);
  const [callReason, setCallReason] = useState('');
  const [oemReferenceId, setOemReferenceId] = useState('');
  const [outcomeNotes, setOutcomeNotes] = useState('');

  useEffect(() => {
    setTab(initialTab);
    setActivityFilter('All');
    setOrderFormOpen(false);
    setCallFormOpen(false);
    setLifecycleSavedNotice(false);
    if (asset) {
      setCalcLifecycleYears(String(resolveAssetLifecycleYears(asset)));
      setCalcSalvagePercent('0');
    }
  }, [asset?.id, asset?.expectedLifecycleYears, initialTab]);

  if (!asset) return null;

  const canManageAssets = hasPermission(userRole, 'manage_assets');
  const canAssignEngineer = hasPermission(userRole, 'assign_engineer');
  const canOrderParts = hasPermission(userRole, 'order_parts');
  const canExport = hasPermission(userRole, 'export_reports');
  const assignableEngineers = users.filter(
    (u) => u.active && u.role === 'Biomedical Engineer',
  );

  const savedLifecycleYears = resolveAssetLifecycleYears(asset);
  const assetDepreciation = calculateEquipmentDepreciation({
    purchaseCost: asset.purchaseCost,
    purchaseDate: asset.purchaseDate,
    expectedLifecycleYears: savedLifecycleYears,
    referenceDate: TODAY_ISO,
  });
  const parsedCalcYears = Math.min(
    30,
    Math.max(1, Math.round(Number(calcLifecycleYears) || savedLifecycleYears)),
  );
  const parsedSalvagePercent = Math.min(
    90,
    Math.max(0, Number(calcSalvagePercent) || 0),
  );
  const previewDepreciation = calculateEquipmentDepreciation({
    purchaseCost: asset.purchaseCost,
    purchaseDate: asset.purchaseDate,
    expectedLifecycleYears: parsedCalcYears,
    referenceDate: TODAY_ISO,
    salvageRatePercent: parsedSalvagePercent,
  });

  const safetyCertName =
    asset.safetyCertificationName?.trim() || defaultSafetyCertificationForCategory(asset.category);
  const safetyCertState = deriveSafetyCertificationStatus(
    asset.safetyCertificationExpiry,
    TODAY_ISO,
  );

  const assetPms = pms.filter((p) => p.assetId === asset.id);
  const assetBreakdowns = breakdowns.filter((b) => b.assetId === asset.id);
  const assetCals = calibrations.filter((c) => c.assetId === asset.id);
  const assetContracts = contracts.filter((c) => c.assetId === asset.id);
  const assetPartOrders = partOrders.filter((p) => p.assetId === asset.id);
  const assetCalls = manufacturerCalls.filter((c) => c.assetId === asset.id);
  const assetAuditLogs = getAssetActivityLogs(activityLogs, asset.id);
  const filteredAuditLogs = assetAuditLogs.filter((entry) =>
    matchesActivityFilter(entry.actionType, activityFilter),
  );

  const support = getManufacturerSupport(asset.manufacturer);
  const totalDowntime = assetBreakdowns.reduce((sum, b) => sum + (b.downtimeHours || 0), 0);
  const hasCriticalActive = assetBreakdowns.some(
    (b) => b.status !== 'Resolved' && b.priority === 'Critical',
  );
  const needsOemEscalation = assetBreakdowns.length >= 2 || hasCriticalActive;

  const qrUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?asset=${encodeURIComponent(asset.assetCode)}`
      : `https://biotrack.local/?asset=${encodeURIComponent(asset.assetCode)}`;

  const tabs: Array<{ id: AssetDetailTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'pm', label: `PM History (${assetPms.length})` },
    { id: 'breakdowns', label: `Breakdowns (${assetBreakdowns.length})` },
    { id: 'calibration', label: `Calibration (${assetCals.length})` },
    { id: 'contracts', label: `Contracts (${assetContracts.length})` },
    { id: 'parts', label: `Parts & OEM (${assetPartOrders.length})` },
    { id: 'activity', label: `Activity Log (${assetAuditLogs.length})` },
    { id: 'qr', label: 'QR Code' },
  ];

  const handleOrderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!partName.trim() || !partNumber.trim()) return;
    onOrderPart({
      id: `po-${Date.now()}`,
      orderNumber: generateNextOrderNumber(allPartOrders),
      assetId: asset.id,
      assetCode: asset.assetCode,
      assetName: asset.name,
      manufacturer: asset.manufacturer,
      department: asset.department,
      partName: partName.trim(),
      partNumber: partNumber.trim(),
      quantity: Math.max(1, Math.round(Number(quantity) || 1)),
      unitCost: Math.max(0, Number(unitCost) || 0),
      orderedBy: currentUser.name,
      orderDate: TODAY_ISO,
      expectedDeliveryDate: expectedDelivery,
      status: 'Ordered',
      notes: orderNotes.trim() || undefined,
    });
    setPartName('');
    setPartNumber('');
    setOrderNotes('');
    setOrderFormOpen(false);
  };

  const handleCallSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!callReason.trim() || !outcomeNotes.trim()) return;
    onLogManufacturerCall({
      id: `call-${Date.now()}`,
      assetId: asset.id,
      assetCode: asset.assetCode,
      assetName: asset.name,
      manufacturer: asset.manufacturer,
      supportPhone: support.supportPhone,
      calledBy: currentUser.name,
      calledAt: `${TODAY_ISO} ${new Date().toISOString().slice(11, 16)}`,
      reason: callReason.trim(),
      oemReferenceId: oemReferenceId.trim() || 'UNASSIGNED',
      outcomeNotes: outcomeNotes.trim(),
    });
    setCallReason('');
    setOemReferenceId('');
    setOutcomeNotes('');
    setCallFormOpen(false);
  };

  const handleDownloadFullMachineReport = () => {
    exportMachineWorkReportExcel({
      asset,
      pms: assetPms,
      breakdowns: assetBreakdowns,
      calibrations: assetCals,
      contracts: assetContracts,
      activityLogs: assetAuditLogs,
      generatedDate: TODAY_ISO,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="asset-detail-title"
    >
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-4 border-b border-slate-200">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-500">
              <span className="font-mono font-semibold text-teal-800">{asset.assetCode}</span>
              <span aria-hidden="true">·</span>
              <span>{asset.department}</span>
              <span aria-hidden="true">·</span>
              <span>{asset.location}</span>
              <span aria-hidden="true">·</span>
              <span>
                Engineer:{' '}
                <strong className="font-medium text-slate-700">
                  {asset.assignedEngineer || 'Unassigned'}
                </strong>
              </span>
            </div>
            <h2 id="asset-detail-title" className="mt-1 text-lg font-semibold text-slate-900">
              {asset.name}
            </h2>
            <div className="mt-1 flex items-center gap-3">
              <OperationalStatusLabel status={asset.status} />
              <span className="text-xs text-slate-500">
                Risk Class: <strong className="font-medium text-slate-700">{asset.riskClass}</strong>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 no-print shrink-0">
            {canExport && (
              <button
                type="button"
                onClick={handleDownloadFullMachineReport}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 whitespace-nowrap"
              >
                <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
                Download Work Report
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close asset detail modal"
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="px-4 sm:px-6 pt-3 border-b border-slate-200 bg-slate-50 flex items-center gap-1 overflow-x-auto no-print">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-xs font-medium rounded-t-md border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                tab === t.id
                  ? 'border-teal-700 text-teal-800 bg-white'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'overview' && (
            <div className="space-y-6">
              <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                <div>
                  <dt className="text-xs text-slate-500">Manufacturer</dt>
                  <dd className="mt-0.5 text-sm font-medium text-slate-900">{asset.manufacturer}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Model</dt>
                  <dd className="mt-0.5 text-sm font-medium text-slate-900">{asset.model}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Serial Number</dt>
                  <dd className="mt-0.5 font-mono text-sm font-medium text-slate-900">
                    {asset.serialNumber}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Category</dt>
                  <dd className="mt-0.5 text-sm font-medium text-slate-900">{asset.category}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Assigned Biomedical Engineer</dt>
                  <dd className="mt-0.5">
                    {canAssignEngineer ? (
                      <select
                        value={asset.assignedEngineer}
                        onChange={(e) => onAssignEngineer(asset.id, e.target.value)}
                        aria-label={`Reassign engineer for ${asset.assetCode}`}
                        className="px-2.5 py-1 text-sm font-medium text-slate-900 bg-white border border-slate-300 rounded-md focus:border-teal-700 focus:outline-none"
                      >
                        {assignableEngineers.map((eng) => (
                          <option key={eng.id} value={eng.name}>
                            {eng.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-sm font-medium text-slate-900">
                        {asset.assignedEngineer || 'Unassigned'}
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Purchase Date</dt>
                  <dd className="mt-0.5 font-mono text-sm text-slate-900 tabular-nums">
                    {asset.purchaseDate}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Acquisition Value</dt>
                  <dd className="mt-0.5 font-mono text-sm text-slate-900 tabular-nums">
                    ${asset.purchaseCost.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Expected Lifecycle</dt>
                  <dd className="mt-0.5 font-mono text-sm text-slate-900 tabular-nums">
                    {assetDepreciation.expectedLifecycleYears} years · Ends{' '}
                    {assetDepreciation.lifecycleEndDate}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Remaining Asset Value</dt>
                  <dd
                    className={`mt-0.5 font-mono text-sm font-semibold tabular-nums ${
                      assetDepreciation.lifecycleStatus === 'Fully Depreciated'
                        ? 'text-red-700'
                        : assetDepreciation.lifecycleStatus === 'Near End of Life'
                          ? 'text-amber-700'
                          : 'text-emerald-700'
                    }`}
                  >
                    ${assetDepreciation.remainingValue.toLocaleString()}{' '}
                    <span className="text-xs font-normal text-slate-500">
                      ({assetDepreciation.remainingValuePercent}%)
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Warranty Expiry</dt>
                  <dd className="mt-0.5 font-mono text-sm text-slate-900 tabular-nums">
                    {asset.warrantyEnd}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Last PM Date</dt>
                  <dd className="mt-0.5 font-mono text-sm text-slate-900 tabular-nums">
                    {asset.lastPmDate || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Next PM Scheduled</dt>
                  <dd className="mt-0.5 font-mono text-sm text-slate-900 tabular-nums">
                    {asset.nextPmDate}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Next Calibration Due</dt>
                  <dd className="mt-0.5 font-mono text-sm text-slate-900 tabular-nums">
                    {asset.nextCalibrationDate}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs text-slate-500">Safety Certification</dt>
                  <dd className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-slate-900">
                    <span className="font-medium">{safetyCertName}</span>
                    {asset.safetyCertificationExpiry && (
                      <>
                        <span className="text-slate-300" aria-hidden="true">·</span>
                        <span
                          className={`font-mono text-xs font-semibold tabular-nums ${
                            safetyCertState.status === 'Expired'
                              ? 'text-red-700'
                              : safetyCertState.status === 'Due Soon'
                                ? 'text-amber-700'
                                : 'text-emerald-700'
                          }`}
                        >
                          {safetyCertState.status === 'Expired'
                            ? `Expired ${asset.safetyCertificationExpiry}`
                            : safetyCertState.status === 'Due Soon'
                              ? `Expiring ${asset.safetyCertificationExpiry}`
                              : `Valid until ${asset.safetyCertificationExpiry}`}
                        </span>
                      </>
                    )}
                  </dd>
                </div>
              </dl>

              {/* Equipment Depreciation Calculator */}
              <section
                aria-labelledby="depreciation-calculator-heading"
                className="pt-5 border-t border-slate-200 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3
                      id="depreciation-calculator-heading"
                      className="text-sm font-semibold text-slate-900"
                    >
                      Equipment Depreciation Calculator
                    </h3>
                    <p className="text-xs text-slate-500">
                      Straight-line valuation from purchase date ({asset.purchaseDate}) across expected lifecycle
                    </p>
                  </div>
                  <span
                    className={`text-xs font-semibold whitespace-nowrap ${
                      previewDepreciation.lifecycleStatus === 'Fully Depreciated'
                        ? 'text-red-700'
                        : previewDepreciation.lifecycleStatus === 'Near End of Life'
                          ? 'text-amber-700'
                          : 'text-emerald-700'
                    }`}
                  >
                    {previewDepreciation.lifecycleStatus}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                  <div>
                    <label
                      htmlFor="calc-lifecycle-years"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Expected Lifecycle (Years)
                    </label>
                    <input
                      id="calc-lifecycle-years"
                      type="number"
                      min="1"
                      max="30"
                      value={calcLifecycleYears}
                      onChange={(e) => {
                        setCalcLifecycleYears(e.target.value);
                        setLifecycleSavedNotice(false);
                      }}
                      className="w-full px-3 py-1.5 text-sm font-mono bg-white border border-slate-300 rounded-md focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="calc-salvage-percent"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Residual Salvage (%)
                    </label>
                    <input
                      id="calc-salvage-percent"
                      type="number"
                      min="0"
                      max="90"
                      value={calcSalvagePercent}
                      onChange={(e) => setCalcSalvagePercent(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm font-mono bg-white border border-slate-300 rounded-md focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2 flex flex-wrap items-center gap-2 sm:justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setCalcLifecycleYears(String(savedLifecycleYears));
                        setCalcSalvagePercent('0');
                        setLifecycleSavedNotice(false);
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100"
                    >
                      Reset Defaults
                    </button>
                    {canManageAssets && onUpdateAsset && parsedCalcYears !== savedLifecycleYears && (
                      <button
                        type="button"
                        onClick={() => {
                          onUpdateAsset({
                            ...asset,
                            expectedLifecycleYears: parsedCalcYears,
                          });
                          setLifecycleSavedNotice(true);
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-teal-700 rounded-md hover:bg-teal-800"
                      >
                        Save Lifecycle ({parsedCalcYears} yrs)
                      </button>
                    )}
                    {lifecycleSavedNotice && (
                      <span className="text-xs font-medium text-emerald-700">
                        Lifecycle saved to asset
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3 border-y border-slate-100">
                  <div>
                    <p className="text-[11px] font-medium text-slate-500">Remaining Asset Value</p>
                    <p className="mt-1 font-mono text-base font-semibold text-teal-800 tabular-nums">
                      ${previewDepreciation.remainingValue.toLocaleString()}
                    </p>
                    <p className="text-[11px] font-mono text-slate-500 tabular-nums">
                      {previewDepreciation.remainingValuePercent}% of acquisition
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-slate-500">Accumulated Depreciation</p>
                    <p className="mt-1 font-mono text-base font-semibold text-slate-900 tabular-nums">
                      ${previewDepreciation.accumulatedDepreciation.toLocaleString()}
                    </p>
                    <p className="text-[11px] font-mono text-slate-500 tabular-nums">
                      {previewDepreciation.depreciationPercent}% depreciated
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-slate-500">Annual Depreciation</p>
                    <p className="mt-1 font-mono text-base font-semibold text-slate-900 tabular-nums">
                      ${previewDepreciation.annualDepreciation.toLocaleString()}
                    </p>
                    <p className="text-[11px] font-mono text-slate-500 tabular-nums">
                      Salvage ${previewDepreciation.salvageValue.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-slate-500">Lifecycle Elapsed</p>
                    <p className="mt-1 font-mono text-base font-semibold text-slate-900 tabular-nums">
                      {previewDepreciation.elapsedYears.toFixed(1)} /{' '}
                      {previewDepreciation.expectedLifecycleYears} yrs
                    </p>
                    <p className="text-[11px] font-mono text-slate-500 tabular-nums">
                      {previewDepreciation.remainingYears.toFixed(1)} yrs remaining
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 tabular-nums">
                    <span>Purchased {previewDepreciation.purchaseDate}</span>
                    <span>
                      {previewDepreciation.depreciationPercent}% depreciated · End{' '}
                      {previewDepreciation.lifecycleEndDate}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-sm bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full ${
                        previewDepreciation.lifecycleStatus === 'Fully Depreciated'
                          ? 'bg-red-600'
                          : previewDepreciation.lifecycleStatus === 'Near End of Life'
                            ? 'bg-amber-500'
                            : 'bg-teal-700'
                      }`}
                      style={{ width: `${previewDepreciation.depreciationPercent}%` }}
                    />
                  </div>
                </div>
              </section>

              {asset.notes && (
                <div className="pt-4 border-t border-slate-200">
                  <h3 className="text-xs font-medium text-slate-500">Clinical Engineering Notes</h3>
                  <p className="mt-1 text-sm text-slate-700">{asset.notes}</p>
                </div>
              )}
            </div>
          )}

          {tab === 'pm' && (
            <div className="space-y-3">
              {assetPms.length === 0 ? (
                <p className="text-sm text-slate-500">No preventive maintenance records logged.</p>
              ) : (
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                  {assetPms.map((pm) => {
                    const effectiveStatus = derivePMStatus(pm, TODAY_ISO);
                    return (
                      <div key={pm.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="font-medium text-slate-800">{pm.frequency} PM</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">Scheduled {pm.scheduledDate}</span>
                            {pm.completedDate && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums">
                                  Completed {pm.completedDate}
                                </span>
                              </>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-slate-700">
                            Engineer: {pm.assignedEngineer}
                          </p>
                          {pm.remarks && <p className="mt-0.5 text-xs text-slate-500">{pm.remarks}</p>}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <PMStatusLabel status={effectiveStatus} />
                          {effectiveStatus === 'Completed' && canExport && (
                            <button
                              type="button"
                              onClick={() => exportPMWorkReportExcel(pm, asset, TODAY_ISO)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100 whitespace-nowrap"
                            >
                              <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
                              Work Report
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'breakdowns' && (
            <div className="space-y-3">
              {assetBreakdowns.length === 0 ? (
                <p className="text-sm text-slate-500">No breakdown complaints recorded for this equipment.</p>
              ) : (
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                  {assetBreakdowns.map((bd) => (
                    <div key={bd.id} className="p-4 space-y-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="font-mono font-semibold text-slate-800">
                            {bd.ticketNumber}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{bd.reportedDate}</span>
                          <span aria-hidden="true">·</span>
                          <span>Reported by {bd.reportedBy}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <BreakdownStatusLabel status={bd.status} />
                          {bd.status === 'Resolved' && canExport && (
                            <button
                              type="button"
                              onClick={() => exportBreakdownWorkReportExcel(bd, asset, TODAY_ISO)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100 whitespace-nowrap"
                            >
                              <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
                              Work Report
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-sm font-medium text-slate-900">{bd.faultDescription}</p>
                      {bd.diagnosis && (
                        <p className="text-xs text-slate-600">
                          <strong>Diagnosis:</strong> {bd.diagnosis}
                        </p>
                      )}
                      {bd.correctiveAction && (
                        <p className="text-xs text-slate-600">
                          <strong>Corrective Action:</strong> {bd.correctiveAction}
                        </p>
                      )}
                      <p className="font-mono text-xs text-slate-500 tabular-nums">
                        Downtime: {bd.downtimeHours.toFixed(1)} hrs · Engineer: {bd.assignedEngineer}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'calibration' && (
            <div className="space-y-3">
              {assetCals.length === 0 ? (
                <p className="text-sm text-slate-500">No calibration certificates recorded yet.</p>
              ) : (
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                  {assetCals.map((cal) => (
                    <div key={cal.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="font-mono font-medium text-slate-800">
                            {cal.certificateId}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            Tested {cal.calibrationDate}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">Due {cal.dueDate}</span>
                        </div>
                        <p className="text-sm text-slate-800">
                          Standard: {cal.standardUsed} ({cal.performedBy})
                        </p>
                        <p className="text-xs text-slate-600">{cal.deviationNotes}</p>
                        <p className="font-mono text-xs text-teal-700">
                          Certificate: {cal.certificateFileName}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <CalibrationResultLabel result={cal.result} />
                        {canExport && (
                          <button
                            type="button"
                            onClick={() => exportCalibrationWorkReportExcel(cal, asset, TODAY_ISO)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100 whitespace-nowrap"
                          >
                            <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
                            Work Report
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'contracts' && (
            <div className="space-y-3">
              {assetContracts.length === 0 ? (
                <p className="text-sm text-slate-500">No warranty or AMC/CMC contracts linked.</p>
              ) : (
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                  {assetContracts.map((ctr) => {
                    const st = deriveContractStatus(ctr, TODAY_ISO);
                    return (
                      <div key={ctr.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="font-semibold text-slate-800">{ctr.contractType}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">{ctr.contractNumber}</span>
                            <span aria-hidden="true">·</span>
                            <span>{ctr.vendor}</span>
                          </div>
                          <p className="text-sm text-slate-700">{ctr.coverageDetails}</p>
                          <p className="font-mono text-xs text-slate-500 tabular-nums">
                            {ctr.startDate} to {ctr.endDate} · Annual Cost: ${ctr.annualCost.toLocaleString()}
                          </p>
                        </div>
                        <span
                          className={`text-xs font-semibold whitespace-nowrap ${
                            st.status === 'Expired'
                              ? 'text-red-700'
                              : st.status === 'Expiring Soon'
                                ? 'text-amber-700'
                                : 'text-emerald-700'
                          }`}
                        >
                          {st.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'parts' && (
            <div className="space-y-5">
              {needsOemEscalation && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5 text-xs text-amber-900">
                    <p className="font-semibold flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" aria-hidden="true" />
                      Repeat Complaints Escalation ({assetBreakdowns.length} tickets ·{' '}
                      {totalDowntime.toFixed(1)}h downtime)
                    </p>
                    <p className="text-amber-800">
                      Recommended to contact {asset.manufacturer} Technical Support for root-cause guidance or bulletin updates.
                    </p>
                  </div>
                  <a
                    href={`tel:${support.supportPhone}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-700 rounded-md hover:bg-teal-800 font-mono whitespace-nowrap shrink-0"
                  >
                    <PhoneCall className="h-3.5 w-3.5" aria-hidden="true" />
                    Call {support.supportPhone}
                  </a>
                </div>
              )}

              {/* Manufacturer Direct Support & Parts Actions */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1 text-xs">
                  <div className="text-sm font-semibold text-slate-900">
                    Manufacturer: {asset.manufacturer}
                  </div>
                  <div className="text-slate-600">
                    Support Desk:{' '}
                    <a
                      href={`tel:${support.supportPhone}`}
                      className="font-mono font-semibold text-teal-800 hover:underline"
                    >
                      {support.supportPhone}
                    </a>{' '}
                    · {support.hours}
                  </div>
                  <div className="text-slate-500">
                    Parts Email: <span className="font-mono">{support.partsEmail}</span>
                  </div>
                </div>

                {canOrderParts && (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setCallFormOpen(false);
                        setOrderFormOpen((v) => !v);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-700 rounded-md hover:bg-teal-800"
                    >
                      <Package className="h-3.5 w-3.5" aria-hidden="true" />
                      Order Parts from {asset.manufacturer}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOrderFormOpen(false);
                        setCallReason(
                          assetBreakdowns.length >= 2
                            ? `Repeat complaints (${assetBreakdowns.length} tickets) escalation`
                            : 'Technical diagnostic inquiry',
                        );
                        setOemReferenceId(`OEM-${Math.floor(10000 + Math.random() * 90000)}`);
                        setCallFormOpen((v) => !v);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100"
                    >
                      <PhoneCall className="h-3.5 w-3.5" aria-hidden="true" />
                      Log OEM Call
                    </button>
                  </div>
                )}
              </div>

              {orderFormOpen && canOrderParts && (
                <form
                  onSubmit={handleOrderSubmit}
                  className="border border-teal-200 bg-teal-50/30 rounded-lg p-4 space-y-3"
                >
                  <h3 className="text-xs font-semibold text-slate-900">
                    New Direct Spare Part Order — {asset.manufacturer}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="modal-po-name" className="block text-xs font-medium text-slate-700 mb-1">
                        Part Name *
                      </label>
                      <input
                        id="modal-po-name"
                        type="text"
                        required
                        value={partName}
                        onChange={(e) => setPartName(e.target.value)}
                        placeholder="e.g. Flow Sensor Cartridge"
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white focus:border-teal-700 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="modal-po-num" className="block text-xs font-medium text-slate-700 mb-1">
                        OEM Part Number *
                      </label>
                      <input
                        id="modal-po-num"
                        type="text"
                        required
                        value={partNumber}
                        onChange={(e) => setPartNumber(e.target.value)}
                        placeholder="e.g. 8403735"
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-md bg-white focus:border-teal-700 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label htmlFor="modal-po-qty" className="block text-xs font-medium text-slate-700 mb-1">
                        Qty *
                      </label>
                      <input
                        id="modal-po-qty"
                        type="number"
                        min="1"
                        required
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-md bg-white focus:border-teal-700 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="modal-po-cost" className="block text-xs font-medium text-slate-700 mb-1">
                        Unit Cost ($)
                      </label>
                      <input
                        id="modal-po-cost"
                        type="number"
                        min="0"
                        value={unitCost}
                        onChange={(e) => setUnitCost(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-md bg-white focus:border-teal-700 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="modal-po-date" className="block text-xs font-medium text-slate-700 mb-1">
                        Expected Delivery
                      </label>
                      <input
                        id="modal-po-date"
                        type="date"
                        required
                        value={expectedDelivery}
                        onChange={(e) => setExpectedDelivery(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-md bg-white focus:border-teal-700 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="modal-po-notes" className="block text-xs font-medium text-slate-700 mb-1">
                      Notes
                    </label>
                    <input
                      id="modal-po-notes"
                      type="text"
                      value={orderNotes}
                      onChange={(e) => setOrderNotes(e.target.value)}
                      placeholder="Maintenance or breakdown reference..."
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setOrderFormOpen(false)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1.5 text-xs font-medium text-white bg-teal-700 rounded-md hover:bg-teal-800"
                    >
                      Submit Part Order
                    </button>
                  </div>
                </form>
              )}

              {callFormOpen && canOrderParts && (
                <form
                  onSubmit={handleCallSubmit}
                  className="border border-amber-200 bg-amber-50/30 rounded-lg p-4 space-y-3"
                >
                  <h3 className="text-xs font-semibold text-slate-900">
                    Log Manufacturer Technical Support Call — {asset.manufacturer} ({support.supportPhone})
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="modal-call-reason" className="block text-xs font-medium text-slate-700 mb-1">
                        Call Reason *
                      </label>
                      <input
                        id="modal-call-reason"
                        type="text"
                        required
                        value={callReason}
                        onChange={(e) => setCallReason(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white focus:border-teal-700 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="modal-call-ref" className="block text-xs font-medium text-slate-700 mb-1">
                        OEM Case / RMA #
                      </label>
                      <input
                        id="modal-call-ref"
                        type="text"
                        value={oemReferenceId}
                        onChange={(e) => setOemReferenceId(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-md bg-white focus:border-teal-700 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="modal-call-notes" className="block text-xs font-medium text-slate-700 mb-1">
                      Manufacturer Guidance / Outcome *
                    </label>
                    <textarea
                      id="modal-call-notes"
                      rows={2}
                      required
                      value={outcomeNotes}
                      onChange={(e) => setOutcomeNotes(e.target.value)}
                      placeholder="Diagnostic instructions or firmware/part advisories provided by OEM engineer..."
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setCallFormOpen(false)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1.5 text-xs font-medium text-white bg-teal-700 rounded-md hover:bg-teal-800"
                    >
                      Save OEM Call Record
                    </button>
                  </div>
                </form>
              )}

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  Spare Parts Ordered ({assetPartOrders.length})
                </h3>
                {assetPartOrders.length === 0 ? (
                  <p className="text-sm text-slate-500">No spare parts ordered for this machine yet.</p>
                ) : (
                  <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                    {assetPartOrders.map((po) => (
                      <div key={po.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 text-slate-500">
                            <span className="font-mono font-semibold text-slate-800">
                              {po.orderNumber}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">P/N {po.partNumber}</span>
                            <span aria-hidden="true">·</span>
                            <span>Ordered by {po.orderedBy}</span>
                          </div>
                          <p className="text-sm font-medium text-slate-900">{po.partName}</p>
                          <p className="font-mono text-slate-500 tabular-nums">
                            {po.quantity} × ${po.unitCost.toLocaleString()} = $
                            {(po.quantity * po.unitCost).toLocaleString()} · ETA {po.expectedDeliveryDate}
                          </p>
                        </div>
                        <div className="shrink-0">
                          {canOrderParts ? (
                            <select
                              value={po.status}
                              onChange={(e) =>
                                onUpdatePartOrderStatus(po.id, e.target.value as PartOrderStatus)
                              }
                              aria-label={`Update status for ${po.orderNumber}`}
                              className="px-2 py-1 text-xs font-semibold border border-slate-300 rounded-md bg-white text-slate-800 focus:border-teal-700 focus:outline-none"
                            >
                              <option value="Ordered">Ordered</option>
                              <option value="Shipped">Shipped</option>
                              <option value="Delivered">Delivered</option>
                              <option value="Cancelled">Cancelled</option>
                            </select>
                          ) : (
                            <span className="font-semibold text-slate-700">{po.status}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  Manufacturer Support Call Log ({assetCalls.length})
                </h3>
                {assetCalls.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No manufacturer support calls logged for this machine.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                    {assetCalls.map((call) => (
                      <div key={call.id} className="p-3.5 space-y-1 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-slate-500">
                          <div>
                            <span className="font-semibold text-teal-800">{call.manufacturer}</span>
                            <span className="mx-1.5" aria-hidden="true">·</span>
                            <span className="font-mono">Case {call.oemReferenceId}</span>
                            <span className="mx-1.5" aria-hidden="true">·</span>
                            <span>Called by {call.calledBy}</span>
                          </div>
                          <span className="font-mono tabular-nums">{call.calledAt}</span>
                        </div>
                        <p className="text-sm font-medium text-slate-900">{call.reason}</p>
                        <p className="text-slate-600">{call.outcomeNotes}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'activity' && (
            <div className="space-y-4">
              <div className="space-y-2.5">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Compliance Audit Trail
                  </h3>
                  <p className="text-xs text-slate-500">
                    Chronological record of status transitions, assignments, maintenance, calibrations, parts, and OEM calls
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
                  {(
                    [
                      'All',
                      'Status & Specs',
                      'Maintenance',
                      'Breakdowns',
                      'Calibration',
                      'Contracts',
                      'Parts & OEM',
                    ] as ActivityFilter[]
                  ).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setActivityFilter(f)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        activityFilter === f
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {filteredAuditLogs.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center border border-slate-200 rounded-lg">
                  No activity log entries recorded for this filter.
                </p>
              ) : (
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                  {filteredAuditLogs.map((entry) => (
                    <div
                      key={entry.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className={`font-semibold ${actionLabelColor(entry.actionType)}`}>
                            {entry.actionType}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-700 font-medium">{entry.actorName}</span>
                          <span aria-hidden="true">·</span>
                          <span>{entry.actorRole}</span>
                        </div>
                        <p className="text-sm font-medium text-slate-900">{entry.summary}</p>
                        {entry.details && (
                          <p className="text-xs text-slate-600">{entry.details}</p>
                        )}
                      </div>
                      <span className="font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap shrink-0">
                        {entry.timestamp}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'qr' && (
            <div className="flex flex-col items-center text-center py-4 space-y-4">
              <div className="p-4 rounded-lg border border-slate-200 bg-white">
                <QRCodeSVG value={qrUrl} size={180} level="M" />
              </div>
              <div>
                <p className="font-mono text-sm font-semibold text-teal-800">{asset.assetCode}</p>
                <p className="text-sm font-medium text-slate-900">{asset.name}</p>
                <p className="font-mono text-xs text-slate-500 mt-1">{qrUrl}</p>
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 no-print"
              >
                <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                Print Asset QR Label
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
