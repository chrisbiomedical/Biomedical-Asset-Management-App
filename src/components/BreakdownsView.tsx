import { useState } from 'react';
import { AlertTriangle, FileDown, PhoneCall, Wrench, X } from 'lucide-react';
import { getManufacturerSupport, TODAY_ISO } from '../data/mockData';
import type {
  Asset,
  BioTrackUser,
  BreakdownPriority,
  BreakdownStatus,
  BreakdownTicket,
  UserRole,
} from '../types/biotrack';
import {
  generateNextTicketNumber,
  getMachineComplaintStats,
  hasPermission,
} from '../utils/biotrackLogic';
import { exportBreakdownWorkReportExcel } from '../utils/exporters';
import { BreakdownStatusLabel, PriorityLabel } from './StatusText';

interface BreakdownsViewProps {
  breakdowns: BreakdownTicket[];
  assets: Asset[];
  users: BioTrackUser[];
  currentUser: BioTrackUser;
  userRole: UserRole;
  onReportBreakdown: (ticket: BreakdownTicket) => void;
  onResolveBreakdown: (
    ticketId: string,
    update: {
      status: BreakdownStatus;
      diagnosis: string;
      correctiveAction: string;
      downtimeHours: number;
      assignedEngineer: string;
      resolvedDate?: string;
    },
  ) => void;
  onSelectAsset: (assetId: string) => void;
  onOpenPartsOrCallOem?: (assetId: string) => void;
}

type BreakdownTab = 'All' | BreakdownStatus;

export function BreakdownsView({
  breakdowns,
  assets,
  users,
  currentUser,
  userRole,
  onReportBreakdown,
  onResolveBreakdown,
  onSelectAsset,
  onOpenPartsOrCallOem,
}: BreakdownsViewProps) {
  const [tab, setTab] = useState<BreakdownTab>('All');
  const [reportOpen, setReportOpen] = useState(false);
  const [editingTicket, setEditingTicket] = useState<BreakdownTicket | null>(null);
  const [lastResolvedTicketId, setLastResolvedTicketId] = useState<string | null>(null);

  const engineers = users.filter(
    (u) => u.active && (u.role === 'Biomedical Engineer' || u.role === 'Supervisor'),
  );

  // Report breakdown state
  const [assetId, setAssetId] = useState(assets[0]?.id ?? '');
  const [priority, setPriority] = useState<BreakdownPriority>('High');
  const [faultDescription, setFaultDescription] = useState('');
  const [assignedEngineer, setAssignedEngineer] = useState(
    assets[0]?.assignedEngineer || engineers[0]?.name || 'Rohan Nair',
  );

  // Update / Resolve breakdown state
  const [ticketStatus, setTicketStatus] = useState<BreakdownStatus>('In Progress');
  const [diagnosis, setDiagnosis] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [downtimeHours, setDowntimeHours] = useState('0');
  const [ticketEngineer, setTicketEngineer] = useState('');

  const canReport = hasPermission(userRole, 'report_breakdown');
  const canResolve = hasPermission(userRole, 'resolve_breakdown');
  const canExport = hasPermission(userRole, 'export_reports');
  const canOrderOrCallOem = hasPermission(userRole, 'order_parts');

  const lastResolvedTicket = lastResolvedTicketId
    ? breakdowns.find((b) => b.id === lastResolvedTicketId) ?? null
    : null;

  const complaintStats = getMachineComplaintStats(assets, breakdowns);
  const escalatedMachines = complaintStats.filter((s) => s.needsOemEscalation);
  const complaintStatByAssetId = new Map(complaintStats.map((s) => [s.asset.id, s]));

  const filtered = breakdowns.filter((b) => (tab === 'All' ? true : b.status === tab));

  const counts: Record<BreakdownTab, number> = {
    All: breakdowns.length,
    Open: breakdowns.filter((b) => b.status === 'Open').length,
    'In Progress': breakdowns.filter((b) => b.status === 'In Progress').length,
    'Awaiting Parts': breakdowns.filter((b) => b.status === 'Awaiting Parts').length,
    Resolved: breakdowns.filter((b) => b.status === 'Resolved').length,
  };

  const handleReportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const asset = assets.find((a) => a.id === assetId);
    if (!asset || !faultDescription.trim()) return;

    const newTicket: BreakdownTicket = {
      id: `bd-${Date.now()}`,
      ticketNumber: generateNextTicketNumber(breakdowns),
      assetId: asset.id,
      assetCode: asset.assetCode,
      assetName: asset.name,
      department: asset.department,
      location: asset.location,
      reportedBy: currentUser.name,
      reportedDate: TODAY_ISO,
      priority,
      faultDescription: faultDescription.trim(),
      assignedEngineer,
      diagnosis: '',
      correctiveAction: '',
      status: 'Open',
      downtimeHours: 0,
    };

    onReportBreakdown(newTicket);
    setReportOpen(false);
    setFaultDescription('');
  };

  const openUpdateModal = (ticket: BreakdownTicket) => {
    setEditingTicket(ticket);
    setTicketStatus(ticket.status);
    setDiagnosis(ticket.diagnosis);
    setCorrectiveAction(ticket.correctiveAction);
    setDowntimeHours(String(ticket.downtimeHours));
    setTicketEngineer(ticket.assignedEngineer);
  };

  const handleUpdateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTicket) return;
    const resolvedId = editingTicket.id;
    onResolveBreakdown(resolvedId, {
      status: ticketStatus,
      diagnosis: diagnosis.trim(),
      correctiveAction: correctiveAction.trim(),
      downtimeHours: Math.max(0, Number(downtimeHours) || 0),
      assignedEngineer: ticketEngineer,
      resolvedDate: ticketStatus === 'Resolved' ? TODAY_ISO : undefined,
    });
    if (ticketStatus === 'Resolved') {
      setLastResolvedTicketId(resolvedId);
    }
    setEditingTicket(null);
  };

  const handleAssetChange = (nextAssetId: string) => {
    setAssetId(nextAssetId);
    const chosen = assets.find((a) => a.id === nextAssetId);
    if (chosen?.assignedEngineer) {
      setAssignedEngineer(chosen.assignedEngineer);
    }
  };

  return (
    <div className="space-y-4">
      {lastResolvedTicket && canExport && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-emerald-900">
            <span className="font-semibold">Repair Work Resolved:</span>{' '}
            <span className="font-mono font-semibold">{lastResolvedTicket.ticketNumber}</span> (
            <span className="font-mono">{lastResolvedTicket.assetCode}</span> —{' '}
            {lastResolvedTicket.assetName}).
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                exportBreakdownWorkReportExcel(
                  lastResolvedTicket,
                  assets.find((a) => a.id === lastResolvedTicket.assetId),
                  TODAY_ISO,
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-700 rounded-md hover:bg-teal-800 whitespace-nowrap"
            >
              <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
              Download Work Report (.xlsx)
            </button>
            <button
              type="button"
              onClick={() => setLastResolvedTicketId(null)}
              aria-label="Dismiss resolved breakdown notice"
              className="p-1 text-emerald-700 hover:text-emerald-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {escalatedMachines.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
              <PhoneCall className="h-3.5 w-3.5 text-amber-700 shrink-0" aria-hidden="true" />
              Repeat-Complaint Equipment Recommended for Manufacturer Support Call
            </p>
            <span className="font-mono text-xs text-amber-800 tabular-nums">
              {escalatedMachines.length} machine{escalatedMachines.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {escalatedMachines.map((stat) => {
              const support = getManufacturerSupport(stat.asset.manufacturer);
              return (
                <div
                  key={stat.asset.id}
                  className="bg-white border border-amber-200 rounded-md px-3 py-1.5 flex flex-wrap items-center gap-2.5 text-xs"
                >
                  <button
                    type="button"
                    onClick={() => onSelectAsset(stat.asset.id)}
                    className="font-mono font-semibold text-teal-800 hover:underline"
                  >
                    {stat.asset.assetCode}
                  </button>
                  <span className="text-slate-700 font-medium">{stat.asset.manufacturer}</span>
                  <span className="font-mono text-amber-800 tabular-nums">
                    {stat.totalComplaints} complaints ({stat.totalDowntimeHours.toFixed(1)}h)
                  </span>
                  <a
                    href={`tel:${support.supportPhone}`}
                    className="font-mono text-teal-700 hover:underline"
                  >
                    {support.supportPhone}
                  </a>
                  {canOrderOrCallOem && onOpenPartsOrCallOem && (
                    <button
                      type="button"
                      onClick={() => onOpenPartsOrCallOem(stat.asset.id)}
                      className="px-2 py-0.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded hover:bg-teal-100"
                    >
                      Call OEM / Order Parts
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          {(['All', 'Open', 'In Progress', 'Awaiting Parts', 'Resolved'] as BreakdownTab[]).map(
            (t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  tab === t
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t} ({counts[t]})
              </button>
            ),
          )}
        </div>

        {canReport && (
          <button
            type="button"
            onClick={() => {
              const firstAsset = assets[0];
              setAssetId(firstAsset?.id ?? '');
              if (firstAsset?.assignedEngineer) {
                setAssignedEngineer(firstAsset.assignedEngineer);
              }
              setReportOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 whitespace-nowrap shrink-0"
          >
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Report Breakdown
          </button>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-4">Ticket</th>
                <th className="py-2.5 px-4">Equipment & Fault</th>
                <th className="py-2.5 px-4">Department</th>
                <th className="py-2.5 px-4">Priority</th>
                <th className="py-2.5 px-4">Engineer</th>
                <th className="py-2.5 px-4 text-right">Downtime</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filtered.map((ticket) => {
                const asset = assets.find((a) => a.id === ticket.assetId);
                const stat = complaintStatByAssetId.get(ticket.assetId);
                return (
                  <tr key={ticket.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono text-xs font-semibold text-slate-800 whitespace-nowrap">
                      <div>{ticket.ticketNumber}</div>
                      <div className="text-slate-400 font-normal tabular-nums">
                        {ticket.reportedDate}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 max-w-md">
                      <button
                        type="button"
                        onClick={() => onSelectAsset(ticket.assetId)}
                        className="font-medium text-slate-900 hover:text-teal-700 text-left"
                      >
                        {ticket.assetName}
                      </button>
                      <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-slate-500">
                        <span>{ticket.assetCode}</span>
                        {stat && stat.needsOemEscalation && (
                          <span className="font-sans font-semibold text-amber-700">
                            · {stat.totalComplaints} complaints (OEM escalation)
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-600 line-clamp-2">
                        {ticket.faultDescription}
                      </p>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                      <div>{ticket.department}</div>
                      <div className="text-slate-400">{ticket.location}</div>
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
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-2">
                        {ticket.status === 'Resolved' && canExport && (
                          <button
                            type="button"
                            onClick={() => exportBreakdownWorkReportExcel(ticket, asset, TODAY_ISO)}
                            aria-label={`Download work report for ${ticket.ticketNumber}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100"
                          >
                            <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
                            Work Report
                          </button>
                        )}
                        {canOrderOrCallOem &&
                          onOpenPartsOrCallOem &&
                          ticket.status !== 'Resolved' &&
                          stat?.needsOemEscalation && (
                            <button
                              type="button"
                              onClick={() => onOpenPartsOrCallOem(ticket.assetId)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100"
                            >
                              <PhoneCall className="h-3.5 w-3.5" aria-hidden="true" />
                              Call OEM
                            </button>
                          )}
                        {canResolve ? (
                          <button
                            type="button"
                            onClick={() => openUpdateModal(ticket)}
                            aria-label={`Update ticket ${ticket.ticketNumber}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                          >
                            <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                            {ticket.status === 'Resolved' ? 'Details' : 'Update / Resolve'}
                          </button>
                        ) : (
                          ticket.status !== 'Resolved' && (
                            <span className="text-xs text-slate-400">Assigned</span>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 px-4 text-center text-sm text-slate-500">
                    No breakdown tickets match the selected status filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Report Breakdown Modal */}
      {reportOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-breakdown-title"
        >
          <div className="w-full max-w-lg rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 id="report-breakdown-title" className="text-base font-semibold text-slate-900">
                Register Equipment Breakdown Complaint
              </h2>
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                aria-label="Close report breakdown modal"
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleReportSubmit} className="p-6 space-y-4">
              <div>
                <label htmlFor="bd-asset" className="block text-xs font-medium text-slate-700 mb-1">
                  Equipment
                </label>
                <select
                  id="bd-asset"
                  value={assetId}
                  onChange={(e) => handleAssetChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:border-teal-700 focus:outline-none"
                >
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.assetCode} — {a.name} ({a.department} · {a.assignedEngineer})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="bd-priority" className="block text-xs font-medium text-slate-700 mb-1">
                    Clinical Priority
                  </label>
                  <select
                    id="bd-priority"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as BreakdownPriority)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:border-teal-700 focus:outline-none"
                  >
                    <option value="Critical">Critical (Life Support)</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="bd-engineer" className="block text-xs font-medium text-slate-700 mb-1">
                    Assign Engineer
                  </label>
                  <select
                    id="bd-engineer"
                    value={assignedEngineer}
                    onChange={(e) => setAssignedEngineer(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:border-teal-700 focus:outline-none"
                  >
                    {engineers.map((u) => (
                      <option key={u.id} value={u.name}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="bd-fault" className="block text-xs font-medium text-slate-700 mb-1">
                  Fault Description *
                </label>
                <textarea
                  id="bd-fault"
                  rows={3}
                  required
                  value={faultDescription}
                  onChange={(e) => setFaultDescription(e.target.value)}
                  placeholder="Describe error codes, alarms, or physical failure observed..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setReportOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800"
                >
                  Submit Breakdown Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Update / Resolve Breakdown Modal */}
      {editingTicket && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="resolve-breakdown-title"
        >
          <div className="w-full max-w-lg rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h2 id="resolve-breakdown-title" className="text-base font-semibold text-slate-900">
                  Update Breakdown — {editingTicket.ticketNumber}
                </h2>
                <p className="text-xs text-slate-500">
                  {editingTicket.assetCode} · {editingTicket.assetName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingTicket(null)}
                aria-label="Close breakdown update modal"
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateSubmit} className="p-6 space-y-4">
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-700">
                <span className="font-semibold">Reported Fault: </span>
                {editingTicket.faultDescription}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="bd-status" className="block text-xs font-medium text-slate-700 mb-1">
                    Repair Status
                  </label>
                  <select
                    id="bd-status"
                    value={ticketStatus}
                    onChange={(e) => setTicketStatus(e.target.value as BreakdownStatus)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:border-teal-700 focus:outline-none"
                  >
                    <option value="Open">Open</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Awaiting Parts">Awaiting Parts</option>
                    <option value="Resolved">Resolved</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="bd-downtime" className="block text-xs font-medium text-slate-700 mb-1">
                    Downtime (Hours)
                  </label>
                  <input
                    id="bd-downtime"
                    type="number"
                    min="0"
                    step="0.5"
                    value={downtimeHours}
                    onChange={(e) => setDowntimeHours(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="bd-upd-eng" className="block text-xs font-medium text-slate-700 mb-1">
                    Assigned Engineer
                  </label>
                  <select
                    id="bd-upd-eng"
                    value={ticketEngineer}
                    onChange={(e) => setTicketEngineer(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:border-teal-700 focus:outline-none"
                  >
                    {engineers.map((u) => (
                      <option key={u.id} value={u.name}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="bd-diagnosis" className="block text-xs font-medium text-slate-700 mb-1">
                  Fault Diagnosis
                </label>
                <textarea
                  id="bd-diagnosis"
                  rows={2}
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  placeholder="Root cause identified during bench or bedside troubleshooting..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="bd-corrective" className="block text-xs font-medium text-slate-700 mb-1">
                  Corrective Action
                </label>
                <textarea
                  id="bd-corrective"
                  rows={2}
                  value={correctiveAction}
                  onChange={(e) => setCorrectiveAction(e.target.value)}
                  placeholder="Parts replaced, calibration verified, safety test results..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200">
                <div>
                  {canOrderOrCallOem && onOpenPartsOrCallOem && (
                    <button
                      type="button"
                      onClick={() => {
                        const targetAssetId = editingTicket.assetId;
                        setEditingTicket(null);
                        onOpenPartsOrCallOem(targetAssetId);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100"
                    >
                      <PhoneCall className="h-3.5 w-3.5" aria-hidden="true" />
                      Order Parts / Call OEM
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingTicket(null)}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800"
                  >
                    Save Repair Log
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
