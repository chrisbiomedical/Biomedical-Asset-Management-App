import { useState } from 'react';
import { ClipboardCheck, FileDown, Plus, X } from 'lucide-react';
import { DEFAULT_PM_CHECKLIST, TODAY_ISO } from '../data/mockData';
import type {
  Asset,
  BioTrackUser,
  PMFrequency,
  PreventiveMaintenance,
  UserRole,
} from '../types/biotrack';
import { derivePMStatus, hasPermission } from '../utils/biotrackLogic';
import { exportPMWorkReportExcel } from '../utils/exporters';
import { PMStatusLabel } from './StatusText';

interface PMViewProps {
  pms: PreventiveMaintenance[];
  assets: Asset[];
  users: BioTrackUser[];
  userRole: UserRole;
  onSchedulePM: (pm: PreventiveMaintenance) => void;
  onCompletePM: (
    pmId: string,
    completionData: {
      completedDate: string;
      remarks: string;
      partsReplaced: string;
      checklist: PreventiveMaintenance['checklist'];
    },
  ) => void;
  onSelectAsset: (assetId: string) => void;
}

type PMTab = 'All' | 'Upcoming' | 'Overdue' | 'Completed';

export function PMView({
  pms,
  assets,
  users,
  userRole,
  onSchedulePM,
  onCompletePM,
  onSelectAsset,
}: PMViewProps) {
  const [tab, setTab] = useState<PMTab>('All');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [executePm, setExecutePm] = useState<PreventiveMaintenance | null>(null);
  const [lastCompletedPmId, setLastCompletedPmId] = useState<string | null>(null);

  const engineers = users.filter(
    (u) => u.active && (u.role === 'Biomedical Engineer' || u.role === 'Supervisor'),
  );

  // Schedule form state
  const [assetId, setAssetId] = useState(assets[0]?.id ?? '');
  const [frequency, setFrequency] = useState<PMFrequency>('Quarterly');
  const [scheduledDate, setScheduledDate] = useState(TODAY_ISO);
  const [assignedEngineer, setAssignedEngineer] = useState(
    assets[0]?.assignedEngineer || engineers[0]?.name || 'Rohan Nair',
  );
  const [remarks, setRemarks] = useState('');

  // Execute PM modal state
  const [checklistState, setChecklistState] = useState<PreventiveMaintenance['checklist']>([]);
  const [execRemarks, setExecRemarks] = useState('');
  const [partsReplaced, setPartsReplaced] = useState('');
  const [completedDate, setCompletedDate] = useState(TODAY_ISO);

  const canSchedule = hasPermission(userRole, 'schedule_pm');
  const canExecute = hasPermission(userRole, 'execute_pm');
  const canExport = hasPermission(userRole, 'export_reports');

  const lastCompletedPm = lastCompletedPmId
    ? pms.find((p) => p.id === lastCompletedPmId) ?? null
    : null;

  const enriched = pms.map((pm) => ({
    ...pm,
    effectiveStatus: derivePMStatus(pm, TODAY_ISO),
  }));

  const filtered = enriched.filter((pm) => {
    if (tab === 'All') return true;
    if (tab === 'Overdue') return pm.effectiveStatus === 'Overdue';
    if (tab === 'Completed') return pm.effectiveStatus === 'Completed';
    return pm.effectiveStatus === 'Scheduled' || pm.effectiveStatus === 'In Progress';
  });

  const counts = {
    All: enriched.length,
    Upcoming: enriched.filter(
      (p) => p.effectiveStatus === 'Scheduled' || p.effectiveStatus === 'In Progress',
    ).length,
    Overdue: enriched.filter((p) => p.effectiveStatus === 'Overdue').length,
    Completed: enriched.filter((p) => p.effectiveStatus === 'Completed').length,
  };

  const handleScheduleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return;

    const newPm: PreventiveMaintenance = {
      id: `pm-${Date.now()}`,
      assetId: asset.id,
      assetCode: asset.assetCode,
      assetName: asset.name,
      department: asset.department,
      frequency,
      scheduledDate,
      assignedEngineer,
      status: 'Scheduled',
      checklist: DEFAULT_PM_CHECKLIST.map((label, i) => ({
        id: `chk-${Date.now()}-${i}`,
        label,
        checked: false,
      })),
      remarks: remarks.trim() || 'Routine preventive maintenance inspection.',
    };

    onSchedulePM(newPm);
    setScheduleOpen(false);
    setRemarks('');
  };

  const openExecuteModal = (pm: PreventiveMaintenance) => {
    setExecutePm(pm);
    setChecklistState(pm.checklist.map((item) => ({ ...item })));
    setExecRemarks(pm.remarks);
    setPartsReplaced(pm.partsReplaced ?? 'None');
    setCompletedDate(TODAY_ISO);
  };

  const handleExecuteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!executePm) return;
    const completedId = executePm.id;
    onCompletePM(completedId, {
      completedDate,
      remarks: execRemarks.trim() || 'Completed preventive maintenance checklist.',
      partsReplaced: partsReplaced.trim() || 'None',
      checklist: checklistState,
    });
    setLastCompletedPmId(completedId);
    setExecutePm(null);
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
      {lastCompletedPm && canExport && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-emerald-900">
            <span className="font-semibold">PM Work Completed:</span>{' '}
            <span className="font-mono font-semibold">{lastCompletedPm.assetCode}</span> —{' '}
            {lastCompletedPm.assetName} ({lastCompletedPm.completedDate ?? TODAY_ISO}).
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                exportPMWorkReportExcel(
                  lastCompletedPm,
                  assets.find((a) => a.id === lastCompletedPm.assetId),
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
              onClick={() => setLastCompletedPmId(null)}
              aria-label="Dismiss completed PM notice"
              className="p-1 text-emerald-700 hover:text-emerald-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          {(['All', 'Upcoming', 'Overdue', 'Completed'] as PMTab[]).map((t) => (
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
          ))}
        </div>

        {canSchedule && (
          <button
            type="button"
            onClick={() => {
              const firstAsset = assets[0];
              setAssetId(firstAsset?.id ?? '');
              if (firstAsset?.assignedEngineer) {
                setAssignedEngineer(firstAsset.assignedEngineer);
              }
              setScheduleOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Schedule PM
          </button>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-4">Asset</th>
                <th className="py-2.5 px-4">Department</th>
                <th className="py-2.5 px-4">Frequency</th>
                <th className="py-2.5 px-4">Scheduled Date</th>
                <th className="py-2.5 px-4">Assigned Engineer</th>
                <th className="py-2.5 px-4">Checklist</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filtered.map((pm) => {
                const doneCount = pm.checklist.filter((c) => c.checked).length;
                return (
                  <tr key={pm.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4">
                      <button
                        type="button"
                        onClick={() => onSelectAsset(pm.assetId)}
                        className="font-medium text-slate-900 hover:text-teal-700 text-left"
                      >
                        {pm.assetName}
                      </button>
                      <div className="font-mono text-xs text-slate-500">{pm.assetCode}</div>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                      {pm.department}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-700 whitespace-nowrap">
                      {pm.frequency}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                      {pm.scheduledDate}
                      {pm.completedDate && (
                        <div className="text-emerald-700">Done {pm.completedDate}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-700 whitespace-nowrap">
                      {pm.assignedEngineer}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                      {doneCount}/{pm.checklist.length}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <PMStatusLabel status={pm.effectiveStatus} />
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      {pm.effectiveStatus !== 'Completed' && canExecute ? (
                        <button
                          type="button"
                          onClick={() => openExecuteModal(pm)}
                          aria-label={`Execute PM for ${pm.assetCode}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100"
                        >
                          <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          Execute PM
                        </button>
                      ) : pm.effectiveStatus === 'Completed' && canExport ? (
                        <button
                          type="button"
                          onClick={() =>
                            exportPMWorkReportExcel(
                              pm,
                              assets.find((a) => a.id === pm.assetId),
                              TODAY_ISO,
                            )
                          }
                          aria-label={`Download PM work report for ${pm.assetCode}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                        >
                          <FileDown className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
                          Work Report
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">
                          {pm.effectiveStatus === 'Completed' ? 'Archived' : 'Read only'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 px-4 text-center text-sm text-slate-500">
                    No preventive maintenance tasks found in this category.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Schedule PM Modal */}
      {scheduleOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="schedule-pm-title"
        >
          <div className="w-full max-w-lg rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 id="schedule-pm-title" className="text-base font-semibold text-slate-900">
                Schedule Preventive Maintenance
              </h2>
              <button
                type="button"
                onClick={() => setScheduleOpen(false)}
                aria-label="Close schedule PM modal"
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleScheduleSubmit} className="p-6 space-y-4">
              <div>
                <label htmlFor="pm-asset" className="block text-xs font-medium text-slate-700 mb-1">
                  Medical Equipment
                </label>
                <select
                  id="pm-asset"
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
                  <label htmlFor="pm-freq" className="block text-xs font-medium text-slate-700 mb-1">
                    Maintenance Cycle
                  </label>
                  <select
                    id="pm-freq"
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as PMFrequency)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:border-teal-700 focus:outline-none"
                  >
                    <option value="Quarterly">Quarterly</option>
                    <option value="Semi-Annual">Semi-Annual</option>
                    <option value="Annual">Annual</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="pm-date" className="block text-xs font-medium text-slate-700 mb-1">
                    Scheduled Date
                  </label>
                  <input
                    id="pm-date"
                    type="date"
                    required
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="pm-engineer" className="block text-xs font-medium text-slate-700 mb-1">
                  Assign Biomedical Engineer
                </label>
                <select
                  id="pm-engineer"
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

              <div>
                <label htmlFor="pm-remarks" className="block text-xs font-medium text-slate-700 mb-1">
                  Protocol Notes
                </label>
                <textarea
                  id="pm-remarks"
                  rows={2}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Special instructions or test simulator required..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setScheduleOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800"
                >
                  Save Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Execute PM Checklist Modal */}
      {executePm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="execute-pm-title"
        >
          <div className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h2 id="execute-pm-title" className="text-base font-semibold text-slate-900">
                  Execute Preventive Maintenance
                </h2>
                <p className="text-xs text-slate-500">
                  {executePm.assetCode} · {executePm.assetName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExecutePm(null)}
                aria-label="Close execute PM modal"
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-700">
                    Biomedical Safety & Inspection Checklist
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setChecklistState((prev) => prev.map((c) => ({ ...c, checked: true })))
                    }
                    className="text-xs font-medium text-teal-700 hover:text-teal-800"
                  >
                    Mark All Passed
                  </button>
                </div>
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                  {checklistState.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-start gap-3 p-3 cursor-pointer hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={(e) =>
                          setChecklistState((prev) =>
                            prev.map((c) =>
                              c.id === item.id ? { ...c, checked: e.target.checked } : c,
                            ),
                          )
                        }
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                      />
                      <span className="text-xs text-slate-700 leading-relaxed">{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="pm-completed-date" className="block text-xs font-medium text-slate-700 mb-1">
                    Completion Date
                  </label>
                  <input
                    id="pm-completed-date"
                    type="date"
                    required
                    value={completedDate}
                    onChange={(e) => setCompletedDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="pm-parts" className="block text-xs font-medium text-slate-700 mb-1">
                    Parts / Consumables Replaced
                  </label>
                  <input
                    id="pm-parts"
                    type="text"
                    value={partsReplaced}
                    onChange={(e) => setPartsReplaced(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="pm-exec-remarks" className="block text-xs font-medium text-slate-700 mb-1">
                  Engineer Test Remarks
                </label>
                <textarea
                  id="pm-exec-remarks"
                  rows={2}
                  required
                  value={execRemarks}
                  onChange={(e) => setExecRemarks(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setExecutePm(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800"
                >
                  Complete PM
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
