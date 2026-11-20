import { useEffect, useMemo, useState } from 'react';
import { Menu, QrCode, Search, X } from 'lucide-react';
import { AssetDetailModal, type AssetDetailTab } from './components/AssetDetailModal';
import { AssetsView } from './components/AssetsView';
import { BreakdownsView } from './components/BreakdownsView';
import { CalibrationView } from './components/CalibrationView';
import { ContractsView } from './components/ContractsView';
import { DashboardView } from './components/DashboardView';
import { DepartmentFloorMapView } from './components/DepartmentFloorMapView';
import { MaintenanceCalendarView } from './components/MaintenanceCalendarView';
import { PartsOrdersView } from './components/PartsOrdersView';
import { PMView } from './components/PMView';
import { QRCodeModal } from './components/QRCodeModal';
import { ReportsView } from './components/ReportsView';
import { Sidebar } from './components/Sidebar';
import { UsersView } from './components/UsersView';
import {
  INITIAL_ACTIVITY_LOGS,
  INITIAL_ASSETS,
  INITIAL_BREAKDOWNS,
  INITIAL_CALIBRATIONS,
  INITIAL_CONTRACTS,
  INITIAL_MANUFACTURER_CALLS,
  INITIAL_PART_ORDERS,
  INITIAL_PMS,
  INITIAL_USERS,
  TODAY_ISO,
} from './data/mockData';
import type {
  ActivityLogEntry,
  Asset,
  BioTrackUser,
  BreakdownStatus,
  BreakdownTicket,
  CalibrationRecord,
  ManufacturerCallLog,
  NavSection,
  PartOrder,
  PartOrderStatus,
  PreventiveMaintenance,
  ServiceContract,
} from './types/biotrack';
import {
  buildAssetUpdateAuditEntries,
  completePMTransition,
  computeDashboardMetrics,
  createActivityLogEntry,
  resolveBreakdownTransition,
} from './utils/biotrackLogic';

const STORAGE_KEY = 'biotrack_cmms_state_v2';

interface PersistedState {
  assets: Asset[];
  pms: PreventiveMaintenance[];
  breakdowns: BreakdownTicket[];
  calibrations: CalibrationRecord[];
  contracts: ServiceContract[];
  partOrders: PartOrder[];
  manufacturerCalls: ManufacturerCallLog[];
  users: BioTrackUser[];
  activityLogs: ActivityLogEntry[];
  currentUserId: string;
}

function loadInitialState(): PersistedState {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedState>;
        if (
          Array.isArray(parsed.assets) &&
          Array.isArray(parsed.pms) &&
          Array.isArray(parsed.breakdowns) &&
          Array.isArray(parsed.calibrations) &&
          Array.isArray(parsed.contracts) &&
          Array.isArray(parsed.users)
        ) {
          return {
            assets: parsed.assets.map((a) => {
              const seedMatch = INITIAL_ASSETS.find((seed) => seed.id === a.id);
              return {
                ...a,
                assignedEngineer: a.assignedEngineer || 'Rohan Nair',
                safetyCertificationName:
                  a.safetyCertificationName ?? seedMatch?.safetyCertificationName,
                safetyCertificationExpiry:
                  a.safetyCertificationExpiry ?? seedMatch?.safetyCertificationExpiry,
              };
            }),
            pms: parsed.pms,
            breakdowns: parsed.breakdowns,
            calibrations: parsed.calibrations,
            contracts: parsed.contracts,
            partOrders: Array.isArray(parsed.partOrders)
              ? parsed.partOrders
              : INITIAL_PART_ORDERS,
            manufacturerCalls: Array.isArray(parsed.manufacturerCalls)
              ? parsed.manufacturerCalls
              : INITIAL_MANUFACTURER_CALLS,
            users: parsed.users,
            activityLogs: Array.isArray(parsed.activityLogs)
              ? parsed.activityLogs
              : INITIAL_ACTIVITY_LOGS,
            currentUserId: parsed.currentUserId ?? INITIAL_USERS[0].id,
          };
        }
      }
    } catch {
      // Fall back to deterministic seed state
    }
  }
  return {
    assets: INITIAL_ASSETS,
    pms: INITIAL_PMS,
    breakdowns: INITIAL_BREAKDOWNS,
    calibrations: INITIAL_CALIBRATIONS,
    contracts: INITIAL_CONTRACTS,
    partOrders: INITIAL_PART_ORDERS,
    manufacturerCalls: INITIAL_MANUFACTURER_CALLS,
    users: INITIAL_USERS,
    activityLogs: INITIAL_ACTIVITY_LOGS,
    currentUserId: INITIAL_USERS[0].id,
  };
}

const SECTION_TITLES: Record<NavSection, string> = {
  dashboard: 'Dashboard',
  assets: 'Asset Inventory',
  floormap: 'Department Floor Plan',
  pm: 'Preventive Maintenance',
  calendar: 'Maintenance Calendar',
  breakdowns: 'Breakdown Management',
  calibration: 'Calibration Records',
  contracts: 'Warranty & AMC/CMC',
  parts: 'Spare Parts & OEM Support',
  reports: 'Reports & Exports',
  users: 'User Management',
};

export default function App() {
  const [state, setState] = useState<PersistedState>(loadInitialState);
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedAssetTab, setSelectedAssetTab] = useState<AssetDetailTab>('overview');
  const [quickQrAsset, setQuickQrAsset] = useState<Asset | null>(null);
  const [qrLookupOpen, setQrLookupOpen] = useState(false);
  const [qrLookupInput, setQrLookupInput] = useState('');
  const [qrLookupError, setQrLookupError] = useState('');

  const openAssetModal = (assetId: string, tab: AssetDetailTab = 'overview') => {
    setSelectedAssetTab(tab);
    setSelectedAssetId(assetId);
  };

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors
    }
  }, [state]);

  // Support QR deep-link query param: ?asset=BIO-1001
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const assetParam = params.get('asset');
    if (assetParam) {
      const found = state.assets.find(
        (a) => a.assetCode.toLowerCase() === assetParam.trim().toLowerCase(),
      );
      if (found) {
        setActiveSection('assets');
        setSelectedAssetId(found.id);
      }
    }
  }, []);

  const currentUser =
    state.users.find((u) => u.id === state.currentUserId && u.active) ?? state.users[0];

  const metrics = useMemo(
    () =>
      computeDashboardMetrics(
        state.assets,
        state.pms,
        state.breakdowns,
        state.calibrations,
        state.contracts,
        TODAY_ISO,
      ),
    [state.assets, state.pms, state.breakdowns, state.calibrations, state.contracts],
  );

  const selectedAsset = useMemo(
    () => state.assets.find((a) => a.id === selectedAssetId) ?? null,
    [state.assets, selectedAssetId],
  );

  const handleAddAsset = (asset: Asset) => {
    const entry = createActivityLogEntry({
      assetId: asset.id,
      assetCode: asset.assetCode,
      actor: currentUser,
      actionType: 'Asset Registered',
      summary: `Registered ${asset.name} (${asset.status})`,
      details: `${asset.manufacturer} ${asset.model} · S/N ${asset.serialNumber} · ${asset.department} (${asset.location})`,
    });
    setState((prev) => ({
      ...prev,
      assets: [asset, ...prev.assets],
      activityLogs: [entry, ...prev.activityLogs],
    }));
  };

  const handleUpdateAsset = (updated: Asset) => {
    setState((prev) => {
      const existing = prev.assets.find((a) => a.id === updated.id);
      const diffLogs = existing
        ? buildAssetUpdateAuditEntries(existing, updated, currentUser)
        : [];
      return {
        ...prev,
        assets: prev.assets.map((a) => (a.id === updated.id ? updated : a)),
        activityLogs: [...diffLogs, ...prev.activityLogs],
      };
    });
  };

  const handleAssignEngineer = (assetId: string, engineerName: string) => {
    setState((prev) => {
      const target = prev.assets.find((a) => a.id === assetId);
      if (!target || target.assignedEngineer === engineerName) return prev;
      const entry = createActivityLogEntry({
        assetId: target.id,
        assetCode: target.assetCode,
        actor: currentUser,
        actionType: 'Engineer Assigned',
        summary: `Assigned machine from ${target.assignedEngineer || 'Unassigned'} to ${engineerName}`,
        details: `${target.department} (${target.location})`,
      });
      return {
        ...prev,
        assets: prev.assets.map((a) =>
          a.id === assetId ? { ...a, assignedEngineer: engineerName } : a,
        ),
        activityLogs: [entry, ...prev.activityLogs],
      };
    });
  };

  const handleReassignPM = (pmId: string, engineerName: string) => {
    setState((prev) => {
      const targetPm = prev.pms.find((p) => p.id === pmId);
      if (!targetPm || targetPm.assignedEngineer === engineerName) return prev;
      const entry = createActivityLogEntry({
        assetId: targetPm.assetId,
        assetCode: targetPm.assetCode,
        actor: currentUser,
        actionType: 'Engineer Assigned',
        summary: `Reassigned ${targetPm.frequency} PM (${targetPm.scheduledDate}) from ${targetPm.assignedEngineer} to ${engineerName}`,
        details: `${targetPm.assetName} · ${targetPm.department}`,
      });
      return {
        ...prev,
        pms: prev.pms.map((p) =>
          p.id === pmId ? { ...p, assignedEngineer: engineerName } : p,
        ),
        activityLogs: [entry, ...prev.activityLogs],
      };
    });
  };

  const handleReassignBreakdown = (ticketId: string, engineerName: string) => {
    setState((prev) => {
      const targetTicket = prev.breakdowns.find((b) => b.id === ticketId);
      if (!targetTicket || targetTicket.assignedEngineer === engineerName) return prev;
      const entry = createActivityLogEntry({
        assetId: targetTicket.assetId,
        assetCode: targetTicket.assetCode,
        actor: currentUser,
        actionType: 'Engineer Assigned',
        summary: `Reassigned breakdown ${targetTicket.ticketNumber} from ${targetTicket.assignedEngineer} to ${engineerName}`,
        details: `${targetTicket.assetName} · ${targetTicket.department}`,
      });
      return {
        ...prev,
        breakdowns: prev.breakdowns.map((b) =>
          b.id === ticketId ? { ...b, assignedEngineer: engineerName } : b,
        ),
        activityLogs: [entry, ...prev.activityLogs],
      };
    });
  };

  const handleDeleteAsset = (assetId: string) => {
    setState((prev) => ({
      ...prev,
      assets: prev.assets.filter((a) => a.id !== assetId),
      pms: prev.pms.filter((p) => p.assetId !== assetId),
      breakdowns: prev.breakdowns.filter((b) => b.assetId !== assetId),
      calibrations: prev.calibrations.filter((c) => c.assetId !== assetId),
      contracts: prev.contracts.filter((c) => c.assetId !== assetId),
      partOrders: prev.partOrders.filter((o) => o.assetId !== assetId),
      manufacturerCalls: prev.manufacturerCalls.filter((c) => c.assetId !== assetId),
      activityLogs: prev.activityLogs.filter((l) => l.assetId !== assetId),
    }));
    if (selectedAssetId === assetId) {
      setSelectedAssetId(null);
    }
  };

  const handleSchedulePM = (pm: PreventiveMaintenance) => {
    const entry = createActivityLogEntry({
      assetId: pm.assetId,
      assetCode: pm.assetCode,
      actor: currentUser,
      actionType: 'PM Scheduled',
      summary: `Scheduled ${pm.frequency} PM for ${pm.scheduledDate}`,
      details: `Assigned to ${pm.assignedEngineer}${pm.remarks ? ` · ${pm.remarks}` : ''}`,
    });
    setState((prev) => ({
      ...prev,
      pms: [pm, ...prev.pms],
      activityLogs: [entry, ...prev.activityLogs],
    }));
  };

  const handleCompletePM = (
    pmId: string,
    completionData: {
      completedDate: string;
      remarks: string;
      partsReplaced: string;
      checklist: PreventiveMaintenance['checklist'];
    },
  ) => {
    setState((prev) => {
      const targetPm = prev.pms.find((p) => p.id === pmId);
      if (!targetPm) return prev;
      const targetAsset = prev.assets.find((a) => a.id === targetPm.assetId);
      const { updatedPm, updatedAsset } = completePMTransition(
        targetPm,
        targetAsset,
        completionData,
      );
      const passedCount = completionData.checklist.filter((c) => c.checked).length;
      const statusSuffix =
        targetAsset && updatedAsset && targetAsset.status !== updatedAsset.status
          ? ` · Status ${targetAsset.status} -> ${updatedAsset.status}`
          : '';
      const entry = createActivityLogEntry({
        assetId: targetPm.assetId,
        assetCode: targetPm.assetCode,
        actor: currentUser,
        actionType: 'PM Completed',
        summary: `Completed ${targetPm.frequency} PM (${passedCount}/${completionData.checklist.length} checks passed)${statusSuffix}`,
        details: `Parts: ${completionData.partsReplaced || 'None'} · Next PM: ${updatedAsset?.nextPmDate ?? 'N/A'} · ${completionData.remarks}`,
      });
      return {
        ...prev,
        pms: prev.pms.map((p) => (p.id === pmId ? updatedPm : p)),
        assets: updatedAsset
          ? prev.assets.map((a) => (a.id === updatedAsset.id ? updatedAsset : a))
          : prev.assets,
        activityLogs: [entry, ...prev.activityLogs],
      };
    });
  };

  const handleReportBreakdown = (ticket: BreakdownTicket) => {
    setState((prev) => {
      const prevAsset = prev.assets.find((a) => a.id === ticket.assetId);
      const statusTransition =
        prevAsset && prevAsset.status !== 'Under Repair'
          ? ` — ${prevAsset.status} -> Under Repair`
          : '';
      const entry = createActivityLogEntry({
        assetId: ticket.assetId,
        assetCode: ticket.assetCode,
        actor: currentUser,
        actionType: 'Breakdown Reported',
        summary: `Ticket ${ticket.ticketNumber} (${ticket.priority})${statusTransition}`,
        details: `Assigned to ${ticket.assignedEngineer} · ${ticket.faultDescription}`,
      });
      return {
        ...prev,
        breakdowns: [ticket, ...prev.breakdowns],
        assets: prev.assets.map((a) =>
          a.id === ticket.assetId ? { ...a, status: 'Under Repair' } : a,
        ),
        activityLogs: [entry, ...prev.activityLogs],
      };
    });
  };

  const handleResolveBreakdown = (
    ticketId: string,
    update: {
      status: BreakdownStatus;
      diagnosis: string;
      correctiveAction: string;
      downtimeHours: number;
      assignedEngineer: string;
      resolvedDate?: string;
    },
  ) => {
    setState((prev) => {
      const targetTicket = prev.breakdowns.find((b) => b.id === ticketId);
      if (!targetTicket) return prev;
      const targetAsset = prev.assets.find((a) => a.id === targetTicket.assetId);
      const { updatedTicket, updatedAsset } = resolveBreakdownTransition(
        targetTicket,
        targetAsset,
        update,
      );
      const isResolved = update.status === 'Resolved';
      const statusChangeText =
        targetAsset && updatedAsset && targetAsset.status !== updatedAsset.status
          ? ` — Status restored to ${updatedAsset.status}`
          : '';
      const entry = createActivityLogEntry({
        assetId: targetTicket.assetId,
        assetCode: targetTicket.assetCode,
        actor: currentUser,
        actionType: isResolved ? 'Breakdown Resolved' : 'Breakdown Updated',
        summary: isResolved
          ? `Ticket ${targetTicket.ticketNumber} resolved (${update.downtimeHours.toFixed(1)}h downtime)${statusChangeText}`
          : `Ticket ${targetTicket.ticketNumber} updated to ${update.status} (${update.downtimeHours.toFixed(1)}h downtime)`,
        details: [
          update.diagnosis ? `Diagnosis: ${update.diagnosis}` : '',
          update.correctiveAction ? `Action: ${update.correctiveAction}` : '',
        ]
          .filter(Boolean)
          .join(' · ') || undefined,
      });
      return {
        ...prev,
        breakdowns: prev.breakdowns.map((b) => (b.id === ticketId ? updatedTicket : b)),
        assets: updatedAsset
          ? prev.assets.map((a) => (a.id === updatedAsset.id ? updatedAsset : a))
          : prev.assets,
        activityLogs: [entry, ...prev.activityLogs],
      };
    });
  };

  const handleAddCalibration = (record: CalibrationRecord) => {
    setState((prev) => {
      const prevAsset = prev.assets.find((a) => a.id === record.assetId);
      const restored =
        prevAsset && record.result === 'Pass' && prevAsset.status === 'Calibration Due'
          ? ' · Status Calibration Due -> Operational'
          : '';
      const entry = createActivityLogEntry({
        assetId: record.assetId,
        assetCode: record.assetCode,
        actor: currentUser,
        actionType: 'Calibration Logged',
        summary: `Calibration ${record.result} (${record.certificateId})${restored}`,
        details: `${record.standardUsed} · Next due ${record.dueDate} · ${record.deviationNotes}`,
      });
      return {
        ...prev,
        calibrations: [record, ...prev.calibrations],
        assets: prev.assets.map((a) =>
          a.id === record.assetId
            ? {
                ...a,
                nextCalibrationDate: record.dueDate,
                status:
                  record.result === 'Pass' && a.status === 'Calibration Due'
                    ? 'Operational'
                    : a.status,
              }
            : a,
        ),
        activityLogs: [entry, ...prev.activityLogs],
      };
    });
  };

  const handleAddContract = (contract: ServiceContract) => {
    const entry = createActivityLogEntry({
      assetId: contract.assetId,
      assetCode: contract.assetCode,
      actor: currentUser,
      actionType: 'Contract Added',
      summary: `${contract.contractType} ${contract.contractNumber} added (${contract.vendor})`,
      details: `Valid ${contract.startDate} to ${contract.endDate} · $${contract.annualCost.toLocaleString()}/yr`,
    });
    setState((prev) => ({
      ...prev,
      contracts: [contract, ...prev.contracts],
      activityLogs: [entry, ...prev.activityLogs],
    }));
  };

  const handleOrderPart = (order: PartOrder) => {
    const entry = createActivityLogEntry({
      assetId: order.assetId,
      assetCode: order.assetCode,
      actor: currentUser,
      actionType: 'Part Ordered',
      summary: `Ordered ${order.quantity}× ${order.partName} (${order.orderNumber}) from ${order.manufacturer}`,
      details: `Part # ${order.partNumber} · Total $${(order.quantity * order.unitCost).toLocaleString()} · Expected delivery ${order.expectedDeliveryDate}${order.notes ? ` · ${order.notes}` : ''}`,
    });
    setState((prev) => ({
      ...prev,
      partOrders: [order, ...prev.partOrders],
      activityLogs: [entry, ...prev.activityLogs],
    }));
  };

  const handleUpdatePartOrderStatus = (orderId: string, status: PartOrderStatus) => {
    setState((prev) => {
      const target = prev.partOrders.find((o) => o.id === orderId);
      if (!target || target.status === status) return prev;
      const entry = createActivityLogEntry({
        assetId: target.assetId,
        assetCode: target.assetCode,
        actor: currentUser,
        actionType: 'Part Status Updated',
        summary: `Part order ${target.orderNumber} (${target.partName}) updated: ${target.status} -> ${status}`,
        details: `Manufacturer: ${target.manufacturer} · Ordered by ${target.orderedBy}`,
      });
      return {
        ...prev,
        partOrders: prev.partOrders.map((o) => (o.id === orderId ? { ...o, status } : o)),
        activityLogs: [entry, ...prev.activityLogs],
      };
    });
  };

  const handleLogManufacturerCall = (call: ManufacturerCallLog) => {
    const entry = createActivityLogEntry({
      assetId: call.assetId,
      assetCode: call.assetCode,
      actor: currentUser,
      actionType: 'Manufacturer Called',
      summary: `Called ${call.manufacturer} OEM Support (${call.supportPhone}) · Ref ${call.oemReferenceId}`,
      details: `${call.reason} · ${call.outcomeNotes}`,
    });
    setState((prev) => ({
      ...prev,
      manufacturerCalls: [call, ...prev.manufacturerCalls],
      activityLogs: [entry, ...prev.activityLogs],
    }));
  };

  const handleAddUser = (user: BioTrackUser) => {
    setState((prev) => ({
      ...prev,
      users: [...prev.users, user],
    }));
  };

  const handleToggleUserActive = (userId: string) => {
    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u.id === userId ? { ...u, active: !u.active } : u)),
    }));
  };

  const handleSwitchUser = (userId: string) => {
    setState((prev) => ({
      ...prev,
      currentUserId: userId,
    }));
  };

  const handleQrLookupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = qrLookupInput.trim().toLowerCase();
    const match = state.assets.find(
      (a) =>
        a.assetCode.toLowerCase() === cleaned ||
        a.serialNumber.toLowerCase() === cleaned,
    );
    if (!match) {
      setQrLookupError(`No equipment found matching "${qrLookupInput.trim()}".`);
      return;
    }
    setQrLookupError('');
    setQrLookupOpen(false);
    setQrLookupInput('');
    setSelectedAssetId(match.id);
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <Sidebar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        currentUser={currentUser}
        users={state.users}
        onSwitchUser={handleSwitchUser}
        openAlertsCount={metrics.openBreakdownsCount}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Header Contract */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden rounded-md p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline">BioTrack</span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <h1 className="font-display font-semibold text-slate-900 truncate">
                {SECTION_TITLES[activeSection]}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                setQrLookupError('');
                setQrLookupOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <QrCode className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
              QR Asset Lookup
            </button>
          </div>
        </header>

        {/* Main Content Viewport */}
        <main
          className={`flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto ${
            selectedAsset || quickQrAsset ? 'no-print' : ''
          }`}
        >
          {activeSection === 'dashboard' && (
            <DashboardView
              metrics={metrics}
              assets={state.assets}
              pms={state.pms}
              breakdowns={state.breakdowns}
              calibrations={state.calibrations}
              contracts={state.contracts}
              partOrders={state.partOrders}
              users={state.users}
              userRole={currentUser.role}
              onReassignPM={handleReassignPM}
              onReassignBreakdown={handleReassignBreakdown}
              onNavigate={setActiveSection}
              onSelectAsset={(id) => openAssetModal(id, 'overview')}
              onSelectAssetTab={(id, tab) => openAssetModal(id, tab)}
              onOpenQuickQR={setQuickQrAsset}
            />
          )}

          {activeSection === 'assets' && (
            <AssetsView
              assets={state.assets}
              users={state.users}
              pms={state.pms}
              breakdowns={state.breakdowns}
              calibrations={state.calibrations}
              contracts={state.contracts}
              activityLogs={state.activityLogs}
              userRole={currentUser.role}
              onAddAsset={handleAddAsset}
              onUpdateAsset={handleUpdateAsset}
              onAssignEngineer={handleAssignEngineer}
              onDeleteAsset={handleDeleteAsset}
              onSelectAsset={(id) => openAssetModal(id, 'overview')}
              onOpenQR={setQuickQrAsset}
            />
          )}

          {activeSection === 'floormap' && (
            <DepartmentFloorMapView
              assets={state.assets}
              breakdowns={state.breakdowns}
              onSelectAsset={(id) => openAssetModal(id, 'overview')}
              onNavigate={setActiveSection}
            />
          )}

          {activeSection === 'pm' && (
            <PMView
              pms={state.pms}
              assets={state.assets}
              users={state.users}
              userRole={currentUser.role}
              onSchedulePM={handleSchedulePM}
              onCompletePM={handleCompletePM}
              onSelectAsset={(id) => openAssetModal(id, 'overview')}
            />
          )}

          {activeSection === 'calendar' && (
            <MaintenanceCalendarView
              assets={state.assets}
              pms={state.pms}
              users={state.users}
              onSelectAsset={(id) => openAssetModal(id, 'overview')}
              onNavigate={setActiveSection}
            />
          )}

          {activeSection === 'breakdowns' && (
            <BreakdownsView
              breakdowns={state.breakdowns}
              assets={state.assets}
              users={state.users}
              currentUser={currentUser}
              userRole={currentUser.role}
              onReportBreakdown={handleReportBreakdown}
              onResolveBreakdown={handleResolveBreakdown}
              onSelectAsset={(id) => openAssetModal(id, 'overview')}
              onOpenPartsOrCallOem={(id) => openAssetModal(id, 'parts')}
            />
          )}

          {activeSection === 'calibration' && (
            <CalibrationView
              calibrations={state.calibrations}
              assets={state.assets}
              users={state.users}
              userRole={currentUser.role}
              onAddCalibration={handleAddCalibration}
              onSelectAsset={(id) => openAssetModal(id, 'overview')}
            />
          )}

          {activeSection === 'contracts' && (
            <ContractsView
              contracts={state.contracts}
              assets={state.assets}
              userRole={currentUser.role}
              onAddContract={handleAddContract}
              onSelectAsset={(id) => openAssetModal(id, 'overview')}
            />
          )}

          {activeSection === 'parts' && (
            <PartsOrdersView
              partOrders={state.partOrders}
              manufacturerCalls={state.manufacturerCalls}
              assets={state.assets}
              users={state.users}
              breakdowns={state.breakdowns}
              currentUser={currentUser}
              userRole={currentUser.role}
              onOrderPart={handleOrderPart}
              onUpdatePartOrderStatus={handleUpdatePartOrderStatus}
              onLogManufacturerCall={handleLogManufacturerCall}
              onSelectAsset={(id) => openAssetModal(id, 'parts')}
            />
          )}

          {activeSection === 'reports' && (
            <ReportsView
              assets={state.assets}
              pms={state.pms}
              breakdowns={state.breakdowns}
              calibrations={state.calibrations}
              contracts={state.contracts}
              activityLogs={state.activityLogs}
              userRole={currentUser.role}
            />
          )}

          {activeSection === 'users' && (
            <UsersView
              users={state.users}
              currentUser={currentUser}
              onSwitchUser={handleSwitchUser}
              onAddUser={handleAddUser}
              onToggleUserActive={handleToggleUserActive}
            />
          )}
        </main>
      </div>

      {/* Asset 360 Detail Modal */}
      <AssetDetailModal
        asset={selectedAsset}
        initialTab={selectedAssetTab}
        pms={state.pms}
        breakdowns={state.breakdowns}
        calibrations={state.calibrations}
        contracts={state.contracts}
        partOrders={state.partOrders}
        allPartOrders={state.partOrders}
        manufacturerCalls={state.manufacturerCalls}
        activityLogs={state.activityLogs}
        users={state.users}
        currentUser={currentUser}
        userRole={currentUser.role}
        onAssignEngineer={handleAssignEngineer}
        onUpdateAsset={handleUpdateAsset}
        onOrderPart={handleOrderPart}
        onUpdatePartOrderStatus={handleUpdatePartOrderStatus}
        onLogManufacturerCall={handleLogManufacturerCall}
        onClose={() => setSelectedAssetId(null)}
      />

      {/* Quick QR Tag Modal */}
      <QRCodeModal
        asset={quickQrAsset}
        onClose={() => setQuickQrAsset(null)}
        onOpenAssetRecord={(id) => openAssetModal(id, 'overview')}
      />

      {/* QR Code Scanner / Lookup Modal */}
      {qrLookupOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="qr-lookup-title"
        >
          <div className="w-full max-w-md rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 id="qr-lookup-title" className="text-base font-semibold text-slate-900">
                QR Asset Quick Lookup
              </h2>
              <button
                type="button"
                onClick={() => setQrLookupOpen(false)}
                aria-label="Close QR lookup modal"
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleQrLookupSubmit} className="p-6 space-y-4">
              <p className="text-xs text-slate-600">
                Enter an Asset ID (e.g. <span className="font-mono">BIO-1001</span>) or Serial
                Number to open its full maintenance & calibration record.
              </p>
              {qrLookupError && (
                <p className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {qrLookupError}
                </p>
              )}
              <div>
                <label htmlFor="qr-lookup-input" className="block text-xs font-medium text-slate-700 mb-1">
                  Asset ID or Serial Number
                </label>
                <div className="relative">
                  <Search
                    className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <input
                    id="qr-lookup-input"
                    type="text"
                    required
                    value={qrLookupInput}
                    onChange={(e) => setQrLookupInput(e.target.value)}
                    placeholder="BIO-1001"
                    className="w-full pl-9 pr-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setQrLookupOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800"
                >
                  Open Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
