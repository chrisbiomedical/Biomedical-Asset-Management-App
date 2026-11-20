import { useState } from 'react';
import {
  CalendarClock,
  Eye,
  FileDown,
  Pencil,
  Plus,
  QrCode,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import { DEPARTMENTS, EQUIPMENT_CATEGORIES, TODAY_ISO } from '../data/mockData';
import type {
  ActivityLogEntry,
  Asset,
  BioTrackUser,
  BreakdownTicket,
  CalibrationRecord,
  OperationalStatus,
  PreventiveMaintenance,
  RiskClass,
  ServiceContract,
  UserRole,
} from '../types/biotrack';
import {
  addMonthsISO,
  calculateEquipmentDepreciation,
  defaultLifecycleYearsForCategory,
  defaultSafetyCertificationForCategory,
  deriveAssetInventoryIndicators,
  filterAssets,
  generateNextAssetCode,
  hasPermission,
  resolveAssetLifecycleYears,
} from '../utils/biotrackLogic';
import { exportMachineWorkReportExcel } from '../utils/exporters';
import { OperationalStatusLabel } from './StatusText';

interface AssetsViewProps {
  assets: Asset[];
  users: BioTrackUser[];
  pms: PreventiveMaintenance[];
  breakdowns: BreakdownTicket[];
  calibrations: CalibrationRecord[];
  contracts: ServiceContract[];
  activityLogs: ActivityLogEntry[];
  userRole: UserRole;
  onAddAsset: (asset: Asset) => void;
  onUpdateAsset: (asset: Asset) => void;
  onAssignEngineer: (assetId: string, engineerName: string) => void;
  onDeleteAsset: (assetId: string) => void;
  onSelectAsset: (assetId: string) => void;
  onOpenQR: (asset: Asset) => void;
}

const STATUS_OPTIONS: Array<'All' | OperationalStatus> = [
  'All',
  'Operational',
  'Under Repair',
  'Under Maintenance',
  'Calibration Due',
  'Out of Service',
];

export function AssetsView({
  assets,
  users,
  pms,
  breakdowns,
  calibrations,
  contracts,
  activityLogs,
  userRole,
  onAddAsset,
  onUpdateAsset,
  onAssignEngineer,
  onDeleteAsset,
  onSelectAsset,
  onOpenQR,
}: AssetsViewProps) {
  const [query, setQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState<'All' | OperationalStatus>('All');
  const [engineerFilter, setEngineerFilter] = useState('All');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [formError, setFormError] = useState('');

  const engineers = users.filter(
    (u) => u.active && (u.role === 'Biomedical Engineer' || u.role === 'Supervisor'),
  );
  const biomedicalEngineers = users.filter(
    (u) => u.active && u.role === 'Biomedical Engineer',
  );
  const assignableEngineers = biomedicalEngineers.length > 0 ? biomedicalEngineers : engineers;

  const [assetCode, setAssetCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState(EQUIPMENT_CATEGORIES[0]);
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [location, setLocation] = useState('');
  const [assignedEngineer, setAssignedEngineer] = useState(
    assignableEngineers[0]?.name ?? 'Rohan Nair',
  );
  const [purchaseDate, setPurchaseDate] = useState(TODAY_ISO);
  const [purchaseCost, setPurchaseCost] = useState('15000');
  const [expectedLifecycleYears, setExpectedLifecycleYears] = useState(
    String(defaultLifecycleYearsForCategory(EQUIPMENT_CATEGORIES[0])),
  );
  const [warrantyEnd, setWarrantyEnd] = useState(addMonthsISO(TODAY_ISO, 24));
  const [safetyCertificationName, setSafetyCertificationName] = useState(
    defaultSafetyCertificationForCategory(EQUIPMENT_CATEGORIES[0]),
  );
  const [safetyCertificationExpiry, setSafetyCertificationExpiry] = useState(
    addMonthsISO(TODAY_ISO, 12),
  );
  const [status, setStatus] = useState<OperationalStatus>('Operational');
  const [riskClass, setRiskClass] = useState<RiskClass>('High');
  const [notes, setNotes] = useState('');

  const canManage = hasPermission(userRole, 'manage_assets');
  const canDelete = hasPermission(userRole, 'delete_assets');
  const canAssignEngineer = hasPermission(userRole, 'assign_engineer');
  const canExport = hasPermission(userRole, 'export_reports');

  const baseFiltered = filterAssets(assets, query, departmentFilter, statusFilter, engineerFilter);
  const indicatorByAssetId = new Map(
    assets.map((asset) => [asset.id, deriveAssetInventoryIndicators(asset, pms, TODAY_ISO)]),
  );
  const expiringWarrantyCount = baseFiltered.filter(
    (asset) => indicatorByAssetId.get(asset.id)?.warrantyState === 'Expiring Soon',
  ).length;
  const pmAttentionCount = baseFiltered.filter((asset) => {
    const state = indicatorByAssetId.get(asset.id)?.pmState;
    return state === 'Upcoming' || state === 'Overdue';
  }).length;
  const attentionCount = baseFiltered.filter(
    (asset) => indicatorByAssetId.get(asset.id)?.needsAttention,
  ).length;
  const filtered = attentionOnly
    ? baseFiltered.filter((asset) => indicatorByAssetId.get(asset.id)?.needsAttention)
    : baseFiltered;

  const openAddModal = () => {
    setEditingAsset(null);
    setFormError('');
    setAssetCode(generateNextAssetCode(assets));
    setName('');
    setCategory(EQUIPMENT_CATEGORIES[0]);
    setManufacturer('');
    setModel('');
    setSerialNumber('');
    setDepartment(DEPARTMENTS[0]);
    setLocation('');
    setAssignedEngineer(assignableEngineers[0]?.name ?? 'Rohan Nair');
    setPurchaseDate(TODAY_ISO);
    setPurchaseCost('15000');
    setExpectedLifecycleYears(String(defaultLifecycleYearsForCategory(EQUIPMENT_CATEGORIES[0])));
    setWarrantyEnd(addMonthsISO(TODAY_ISO, 24));
    setSafetyCertificationName(defaultSafetyCertificationForCategory(EQUIPMENT_CATEGORIES[0]));
    setSafetyCertificationExpiry(addMonthsISO(TODAY_ISO, 12));
    setStatus('Operational');
    setRiskClass('High');
    setNotes('');
    setModalOpen(true);
  };

  const openEditModal = (asset: Asset) => {
    setEditingAsset(asset);
    setFormError('');
    setAssetCode(asset.assetCode);
    setName(asset.name);
    setCategory(asset.category);
    setManufacturer(asset.manufacturer);
    setModel(asset.model);
    setSerialNumber(asset.serialNumber);
    setDepartment(asset.department);
    setLocation(asset.location);
    setAssignedEngineer(asset.assignedEngineer || assignableEngineers[0]?.name || 'Rohan Nair');
    setPurchaseDate(asset.purchaseDate);
    setPurchaseCost(String(asset.purchaseCost));
    setExpectedLifecycleYears(String(resolveAssetLifecycleYears(asset)));
    setWarrantyEnd(asset.warrantyEnd);
    setSafetyCertificationName(
      asset.safetyCertificationName || defaultSafetyCertificationForCategory(asset.category),
    );
    setSafetyCertificationExpiry(
      asset.safetyCertificationExpiry || addMonthsISO(asset.purchaseDate, 12),
    );
    setStatus(asset.status);
    setRiskClass(asset.riskClass);
    setNotes(asset.notes ?? '');
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !assetCode.trim() ||
      !name.trim() ||
      !manufacturer.trim() ||
      !model.trim() ||
      !serialNumber.trim() ||
      !location.trim()
    ) {
      setFormError('Please fill in all required equipment identification fields.');
      return;
    }

    const costNum = Number(purchaseCost);
    if (Number.isNaN(costNum) || costNum < 0) {
      setFormError('Purchase cost must be a valid non-negative number.');
      return;
    }

    const lifecycleNum = Math.round(Number(expectedLifecycleYears));
    if (Number.isNaN(lifecycleNum) || lifecycleNum < 1 || lifecycleNum > 30) {
      setFormError('Expected lifecycle must be between 1 and 30 years.');
      return;
    }

    if (editingAsset) {
      onUpdateAsset({
        ...editingAsset,
        assetCode: assetCode.trim(),
        name: name.trim(),
        category,
        manufacturer: manufacturer.trim(),
        model: model.trim(),
        serialNumber: serialNumber.trim(),
        department,
        location: location.trim(),
        assignedEngineer: canAssignEngineer
          ? assignedEngineer
          : editingAsset.assignedEngineer,
        purchaseDate,
        purchaseCost: costNum,
        expectedLifecycleYears: lifecycleNum,
        warrantyEnd,
        safetyCertificationName:
          safetyCertificationName.trim() || defaultSafetyCertificationForCategory(category),
        safetyCertificationExpiry,
        status,
        riskClass,
        notes: notes.trim(),
      });
    } else {
      const newAsset: Asset = {
        id: `asset-${Date.now()}`,
        assetCode: assetCode.trim(),
        name: name.trim(),
        category,
        manufacturer: manufacturer.trim(),
        model: model.trim(),
        serialNumber: serialNumber.trim(),
        department,
        location: location.trim(),
        assignedEngineer,
        purchaseDate,
        purchaseCost: costNum,
        expectedLifecycleYears: lifecycleNum,
        warrantyEnd,
        safetyCertificationName:
          safetyCertificationName.trim() || defaultSafetyCertificationForCategory(category),
        safetyCertificationExpiry,
        status,
        riskClass,
        lastPmDate: purchaseDate,
        nextPmDate: addMonthsISO(purchaseDate, 3),
        nextCalibrationDate: addMonthsISO(purchaseDate, 6),
        notes: notes.trim(),
      };
      onAddAsset(newAsset);
    }

    setModalOpen(false);
  };

  const handleDownloadMachineReport = (asset: Asset) => {
    exportMachineWorkReportExcel({
      asset,
      pms: pms.filter((p) => p.assetId === asset.id),
      breakdowns: breakdowns.filter((b) => b.assetId === asset.id),
      calibrations: calibrations.filter((c) => c.assetId === asset.id),
      contracts: contracts.filter((c) => c.assetId === asset.id),
      activityLogs: activityLogs.filter((l) => l.assetId === asset.id),
      generatedDate: TODAY_ISO,
    });
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row flex-wrap sm:items-center gap-3 flex-1">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search
              className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search asset ID, equipment, serial, or engineer..."
              aria-label="Search medical equipment inventory"
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
            />
          </div>

          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            aria-label="Filter by department"
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-700 focus:border-teal-700 focus:outline-none"
          >
            <option value="All">All Departments</option>
            {DEPARTMENTS.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'All' | OperationalStatus)}
            aria-label="Filter by operational status"
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-700 focus:border-teal-700 focus:outline-none"
          >
            {STATUS_OPTIONS.map((st) => (
              <option key={st} value={st}>
                {st === 'All' ? 'All Statuses' : st}
              </option>
            ))}
          </select>

          <select
            value={engineerFilter}
            onChange={(e) => setEngineerFilter(e.target.value)}
            aria-label="Filter by assigned engineer"
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-700 focus:border-teal-700 focus:outline-none"
          >
            <option value="All">All Engineers</option>
            {assignableEngineers.map((eng) => (
              <option key={eng.id} value={eng.name}>
                {eng.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
          <span className="font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
            Showing {filtered.length} of {assets.length}
          </span>
          {canManage && (
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Equipment
            </button>
          )}
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5 text-amber-700 shrink-0" aria-hidden="true" />
              <span>
                Expiring warranty (&le;60d):{' '}
                <strong className="font-mono tabular-nums text-slate-900">
                  {expiringWarrantyCount}
                </strong>
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5 text-amber-700 shrink-0" aria-hidden="true" />
              <span>
                Upcoming / overdue PM (&le;30d):{' '}
                <strong className="font-mono tabular-nums text-slate-900">
                  {pmAttentionCount}
                </strong>
              </span>
            </span>
          </div>

          <button
            type="button"
            onClick={() => setAttentionOnly((prev) => !prev)}
            aria-pressed={attentionOnly}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
              attentionOnly
                ? 'bg-amber-700 text-white border-amber-700 hover:bg-amber-800'
                : 'bg-white text-slate-700 border-slate-300 hover:border-amber-600 hover:text-amber-800'
            }`}
          >
            {attentionOnly ? `Showing flagged (${attentionCount})` : `Filter flagged only (${attentionCount})`}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-2.5 whitespace-nowrap">Asset &amp; Serial</th>
                <th className="py-2.5 px-2.5">Equipment &amp; Model</th>
                <th className="py-2.5 px-2.5">Department &amp; Location</th>
                <th className="py-2.5 px-2.5 whitespace-nowrap">Assigned Engineer</th>
                <th className="py-2.5 px-2.5 text-right whitespace-nowrap">Remaining Value</th>
                <th className="py-2.5 px-2.5 whitespace-nowrap">Warranty End</th>
                <th className="py-2.5 px-2.5 whitespace-nowrap">Status</th>
                <th className="py-2.5 px-2.5 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filtered.map((asset) => {
                const dep = calculateEquipmentDepreciation({
                  purchaseCost: asset.purchaseCost,
                  purchaseDate: asset.purchaseDate,
                  expectedLifecycleYears: resolveAssetLifecycleYears(asset),
                  referenceDate: TODAY_ISO,
                });
                const indicators =
                  indicatorByAssetId.get(asset.id) ??
                  deriveAssetInventoryIndicators(asset, pms, TODAY_ISO);
                const rowHighlightClass =
                  indicators.pmState === 'Overdue'
                    ? 'bg-red-50/35 hover:bg-red-50/70'
                    : indicators.needsAttention
                      ? 'bg-amber-50/45 hover:bg-amber-50/80'
                      : 'hover:bg-slate-50';
                return (
                <tr
                  key={asset.id}
                  data-attention={indicators.needsAttention ? 'true' : 'false'}
                  className={rowHighlightClass}
                >
                  <td className="py-2.5 px-2.5 whitespace-nowrap">
                    <div className="font-mono text-xs font-semibold text-teal-800">
                      {asset.assetCode}
                    </div>
                    <div className="font-mono text-[11px] text-slate-500">
                      {asset.serialNumber}
                    </div>
                  </td>
                  <td className="py-2.5 px-2.5 min-w-[155px]">
                    <button
                      type="button"
                      onClick={() => onSelectAsset(asset.id)}
                      className="text-xs font-semibold text-slate-900 hover:text-teal-700 text-left leading-snug"
                    >
                      {asset.name}
                    </button>
                    <div className="text-[11px] text-slate-500">
                      {asset.manufacturer} · {asset.model}
                    </div>
                    {indicators.needsAttention && (
                      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                        {indicators.pmState === 'Overdue' && (
                          <span
                            title={`Preventive maintenance overdue since ${indicators.pmDueDate}`}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700"
                          >
                            <CalendarClock className="h-3 w-3 shrink-0" aria-hidden="true" />
                            PM overdue ({Math.abs(indicators.pmDaysDelta ?? 0)}d)
                          </span>
                        )}
                        {indicators.pmState === 'Upcoming' && (
                          <span
                            title={`Preventive maintenance due on ${indicators.pmDueDate}`}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700"
                          >
                            <CalendarClock className="h-3 w-3 shrink-0" aria-hidden="true" />
                            {indicators.pmDaysDelta === 0
                              ? 'PM due today'
                              : `PM due in ${indicators.pmDaysDelta}d`}
                          </span>
                        )}
                        {indicators.warrantyState === 'Expiring Soon' && (
                          <span
                            title={`Warranty expires on ${asset.warrantyEnd}`}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700"
                          >
                            <ShieldAlert className="h-3 w-3 shrink-0" aria-hidden="true" />
                            {indicators.warrantyDaysRemaining === 0
                              ? 'Warranty exp. today'
                              : `Warranty exp. in ${indicators.warrantyDaysRemaining}d`}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-2.5">
                    <div className="text-xs font-medium text-slate-800 whitespace-nowrap">{asset.department}</div>
                    <div className="text-[11px] text-slate-500">{asset.location}</div>
                  </td>
                  <td className="py-2.5 px-2.5 whitespace-nowrap">
                    {canAssignEngineer ? (
                      <select
                        value={asset.assignedEngineer}
                        onChange={(e) => onAssignEngineer(asset.id, e.target.value)}
                        aria-label={`Assign engineer for ${asset.assetCode}`}
                        className="px-2 py-1 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-md hover:border-teal-600 focus:border-teal-700 focus:outline-none"
                      >
                        {assignableEngineers.map((eng) => (
                          <option key={eng.id} value={eng.name}>
                            {eng.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs font-medium text-slate-700">
                        {asset.assignedEngineer || 'Unassigned'}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                    <div className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                      ${dep.remainingValue.toLocaleString()}
                    </div>
                    <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                      {dep.remainingValuePercent}% · {dep.expectedLifecycleYears}y life
                    </div>
                  </td>
                  <td className="py-2.5 px-2.5 whitespace-nowrap">
                    <div className="font-mono text-xs text-slate-700 tabular-nums">
                      {asset.warrantyEnd}
                    </div>
                    {indicators.warrantyState === 'Expiring Soon' && (
                      <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                        <ShieldAlert className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span>
                          {indicators.warrantyDaysRemaining === 0
                            ? 'Exp. today'
                            : `Exp. in ${indicators.warrantyDaysRemaining}d`}
                        </span>
                      </div>
                    )}
                    {indicators.warrantyState === 'Expired' && (
                      <div className="text-[11px] text-slate-400">Expired</div>
                    )}
                  </td>
                  <td className="py-2.5 px-2.5 whitespace-nowrap">
                    <OperationalStatusLabel status={asset.status} />
                  </td>
                  <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => onOpenQR(asset)}
                        aria-label={`View QR code for ${asset.assetCode}`}
                        className="p-1 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                      >
                        <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectAsset(asset.id)}
                        aria-label={`View details for ${asset.assetCode}`}
                        className="p-1 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      {canExport && (
                        <button
                          type="button"
                          onClick={() => handleDownloadMachineReport(asset)}
                          aria-label={`Download work report for ${asset.assetCode}`}
                          title="Download Machine Work Report (.xlsx)"
                          className="p-1 rounded-md text-slate-500 hover:bg-teal-50 hover:text-teal-700"
                        >
                          <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => openEditModal(asset)}
                          aria-label={`Edit ${asset.assetCode}`}
                          className="p-1 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => onDeleteAsset(asset.id)}
                          aria-label={`Delete ${asset.assetCode}`}
                          className="p-1 rounded-md text-slate-500 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 px-4 text-center text-sm text-slate-500">
                    No equipment matches your current search and filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Equipment Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="equipment-modal-title"
        >
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 id="equipment-modal-title" className="text-base font-semibold text-slate-900">
                {editingAsset ? `Edit Equipment — ${editingAsset.assetCode}` : 'Register Medical Equipment'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close equipment form"
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              {formError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs font-medium text-red-700">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="asset-code" className="block text-xs font-medium text-slate-700 mb-1">
                    Asset ID *
                  </label>
                  <input
                    id="asset-code"
                    type="text"
                    required
                    value={assetCode}
                    onChange={(e) => setAssetCode(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="asset-name" className="block text-xs font-medium text-slate-700 mb-1">
                    Equipment Name *
                  </label>
                  <input
                    id="asset-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. IntelliVue MX750 Patient Monitor"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="asset-manufacturer" className="block text-xs font-medium text-slate-700 mb-1">
                    Manufacturer *
                  </label>
                  <input
                    id="asset-manufacturer"
                    type="text"
                    required
                    value={manufacturer}
                    onChange={(e) => setManufacturer(e.target.value)}
                    placeholder="e.g. Philips"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="asset-model" className="block text-xs font-medium text-slate-700 mb-1">
                    Model *
                  </label>
                  <input
                    id="asset-model"
                    type="text"
                    required
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="e.g. MX750"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="asset-serial" className="block text-xs font-medium text-slate-700 mb-1">
                    Serial Number *
                  </label>
                  <input
                    id="asset-serial"
                    type="text"
                    required
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                    placeholder="e.g. SN-MX-9001"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="asset-category" className="block text-xs font-medium text-slate-700 mb-1">
                    Category
                  </label>
                  <select
                    id="asset-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:border-teal-700 focus:outline-none"
                  >
                    {EQUIPMENT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="asset-dept" className="block text-xs font-medium text-slate-700 mb-1">
                    Department
                  </label>
                  <select
                    id="asset-dept"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:border-teal-700 focus:outline-none"
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="asset-location" className="block text-xs font-medium text-slate-700 mb-1">
                    Location / Room *
                  </label>
                  <input
                    id="asset-location"
                    type="text"
                    required
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. ICU Bed 12"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="asset-engineer" className="block text-xs font-medium text-slate-700 mb-1">
                    Assigned Biomedical Engineer
                  </label>
                  <select
                    id="asset-engineer"
                    value={assignedEngineer}
                    disabled={Boolean(editingAsset && !canAssignEngineer)}
                    onChange={(e) => setAssignedEngineer(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:border-teal-700 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    {assignableEngineers.map((eng) => (
                      <option key={eng.id} value={eng.name}>
                        {eng.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="asset-purchase-date" className="block text-xs font-medium text-slate-700 mb-1">
                    Purchase Date
                  </label>
                  <input
                    id="asset-purchase-date"
                    type="date"
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="asset-warranty-end" className="block text-xs font-medium text-slate-700 mb-1">
                    Warranty Expiry Date
                  </label>
                  <input
                    id="asset-warranty-end"
                    type="date"
                    value={warrantyEnd}
                    onChange={(e) => setWarrantyEnd(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="asset-cost" className="block text-xs font-medium text-slate-700 mb-1">
                    Purchase Cost (USD)
                  </label>
                  <input
                    id="asset-cost"
                    type="number"
                    min="0"
                    value={purchaseCost}
                    onChange={(e) => setPurchaseCost(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="asset-lifecycle" className="block text-xs font-medium text-slate-700 mb-1">
                    Expected Lifecycle (Years)
                  </label>
                  <input
                    id="asset-lifecycle"
                    type="number"
                    min="1"
                    max="30"
                    value={expectedLifecycleYears}
                    onChange={(e) => setExpectedLifecycleYears(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="asset-status" className="block text-xs font-medium text-slate-700 mb-1">
                    Operational Status
                  </label>
                  <select
                    id="asset-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as OperationalStatus)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:border-teal-700 focus:outline-none"
                  >
                    {STATUS_OPTIONS.filter((s) => s !== 'All').map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="asset-risk" className="block text-xs font-medium text-slate-700 mb-1">
                    Clinical Risk Class
                  </label>
                  <select
                    id="asset-risk"
                    value={riskClass}
                    onChange={(e) => setRiskClass(e.target.value as RiskClass)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:border-teal-700 focus:outline-none"
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="asset-safety-cert" className="block text-xs font-medium text-slate-700 mb-1">
                    Safety Certification Standard
                  </label>
                  <input
                    id="asset-safety-cert"
                    type="text"
                    value={safetyCertificationName}
                    onChange={(e) => setSafetyCertificationName(e.target.value)}
                    placeholder="e.g. IEC 60601-1 Electrical Safety"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="asset-safety-expiry" className="block text-xs font-medium text-slate-700 mb-1">
                    Safety Cert. Expiry Date
                  </label>
                  <input
                    id="asset-safety-expiry"
                    type="date"
                    value={safetyCertificationExpiry}
                    onChange={(e) => setSafetyCertificationExpiry(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="asset-notes" className="block text-xs font-medium text-slate-700 mb-1">
                  Engineering Notes
                </label>
                <textarea
                  id="asset-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
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
                  {editingAsset ? 'Save Changes' : 'Register Equipment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
