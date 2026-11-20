import { useState } from 'react';
import { FileCheck, FileDown, Plus, Upload, X } from 'lucide-react';
import { TODAY_ISO } from '../data/mockData';
import type {
  Asset,
  BioTrackUser,
  CalibrationRecord,
  CalibrationResult,
  UserRole,
} from '../types/biotrack';
import {
  addMonthsISO,
  deriveCalibrationStatus,
  hasPermission,
} from '../utils/biotrackLogic';
import { exportCalibrationWorkReportExcel } from '../utils/exporters';
import { CalibrationResultLabel } from './StatusText';

interface CalibrationViewProps {
  calibrations: CalibrationRecord[];
  assets: Asset[];
  users: BioTrackUser[];
  userRole: UserRole;
  onAddCalibration: (record: CalibrationRecord) => void;
  onSelectAsset: (assetId: string) => void;
}

type CalTab = 'All' | 'Overdue' | 'Due Soon' | 'Compliant';

export function CalibrationView({
  calibrations,
  assets,
  users,
  userRole,
  onAddCalibration,
  onSelectAsset,
}: CalibrationViewProps) {
  const [tab, setTab] = useState<CalTab>('All');
  const [modalOpen, setModalOpen] = useState(false);
  const [previewRecord, setPreviewRecord] = useState<CalibrationRecord | null>(null);
  const [lastLoggedCalId, setLastLoggedCalId] = useState<string | null>(null);

  const engineers = users.filter(
    (u) => u.active && (u.role === 'Biomedical Engineer' || u.role === 'Supervisor'),
  );

  const [assetId, setAssetId] = useState(assets[0]?.id ?? '');
  const [calibrationDate, setCalibrationDate] = useState(TODAY_ISO);
  const [dueDate, setDueDate] = useState(addMonthsISO(TODAY_ISO, 6));
  const [performedBy, setPerformedBy] = useState(
    assets[0]?.assignedEngineer || engineers[0]?.name || 'Rohan Nair',
  );
  const [standardUsed, setStandardUsed] = useState('Fluke ProSim 8 Vital Signs Simulator');
  const [result, setResult] = useState<CalibrationResult>('Pass');
  const [deviationNotes, setDeviationNotes] = useState('');
  const [certificateFileName, setCertificateFileName] = useState('');

  const canManage = hasPermission(userRole, 'manage_calibration');
  const canExport = hasPermission(userRole, 'export_reports');

  const lastLoggedCal = lastLoggedCalId
    ? calibrations.find((c) => c.id === lastLoggedCalId) ?? null
    : null;

  const assetStatusMap = new Map(
    assets.map((a) => [a.id, deriveCalibrationStatus(a.nextCalibrationDate, TODAY_ISO)]),
  );

  const counts: Record<CalTab, number> = {
    All: calibrations.length,
    Overdue: calibrations.filter(
      (c) => (assetStatusMap.get(c.assetId) ?? deriveCalibrationStatus(c.dueDate, TODAY_ISO)).status === 'Overdue',
    ).length,
    'Due Soon': calibrations.filter(
      (c) => (assetStatusMap.get(c.assetId) ?? deriveCalibrationStatus(c.dueDate, TODAY_ISO)).status === 'Due Soon',
    ).length,
    Compliant: calibrations.filter(
      (c) => (assetStatusMap.get(c.assetId) ?? deriveCalibrationStatus(c.dueDate, TODAY_ISO)).status === 'Compliant',
    ).length,
  };

  const filtered = calibrations.filter((c) => {
    if (tab === 'All') return true;
    const st = assetStatusMap.get(c.assetId) ?? deriveCalibrationStatus(c.dueDate, TODAY_ISO);
    return st.status === tab;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const asset = assets.find((a) => a.id === assetId);
    if (!asset || !standardUsed.trim()) return;

    const certCode = `CAL-${calibrationDate.replace(/-/g, '')}-${asset.assetCode.replace('BIO-', '')}`;
    const newRec: CalibrationRecord = {
      id: `cal-${Date.now()}`,
      assetId: asset.id,
      assetCode: asset.assetCode,
      assetName: asset.name,
      department: asset.department,
      calibrationDate,
      dueDate,
      performedBy,
      standardUsed: standardUsed.trim(),
      result,
      deviationNotes: deviationNotes.trim() || 'All measured test points within OEM tolerance.',
      certificateId: certCode,
      certificateFileName: certificateFileName || `${asset.assetCode}_CalCert_${calibrationDate}.pdf`,
    };

    onAddCalibration(newRec);
    setLastLoggedCalId(newRec.id);
    setModalOpen(false);
    setDeviationNotes('');
    setCertificateFileName('');
  };

  const handleAssetChange = (nextAssetId: string) => {
    setAssetId(nextAssetId);
    const chosen = assets.find((a) => a.id === nextAssetId);
    if (chosen?.assignedEngineer) {
      setPerformedBy(chosen.assignedEngineer);
    }
  };

  return (
    <div className="space-y-4">
      {lastLoggedCal && canExport && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-emerald-900">
            <span className="font-semibold">Calibration Logged:</span>{' '}
            <span className="font-mono font-semibold">{lastLoggedCal.certificateId}</span> for{' '}
            <span className="font-mono">{lastLoggedCal.assetCode}</span> ({lastLoggedCal.result}).
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                exportCalibrationWorkReportExcel(
                  lastLoggedCal,
                  assets.find((a) => a.id === lastLoggedCal.assetId),
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
              onClick={() => setLastLoggedCalId(null)}
              aria-label="Dismiss logged calibration notice"
              className="p-1 text-emerald-700 hover:text-emerald-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          {(['All', 'Overdue', 'Due Soon', 'Compliant'] as CalTab[]).map((t) => (
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

        {canManage && (
          <button
            type="button"
            onClick={() => {
              const firstAsset = assets[0];
              setAssetId(firstAsset?.id ?? '');
              if (firstAsset?.assignedEngineer) {
                setPerformedBy(firstAsset.assignedEngineer);
              }
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Log Calibration
          </button>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-4">Certificate ID</th>
                <th className="py-2.5 px-4">Equipment</th>
                <th className="py-2.5 px-4">Reference Standard</th>
                <th className="py-2.5 px-4">Calibrated On</th>
                <th className="py-2.5 px-4">Next Due</th>
                <th className="py-2.5 px-4">Test Result</th>
                <th className="py-2.5 px-4 text-right">Certificate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filtered.map((rec) => {
                const dueStatus = deriveCalibrationStatus(rec.dueDate, TODAY_ISO);
                return (
                  <tr key={rec.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono text-xs font-medium text-slate-800 whitespace-nowrap">
                      {rec.certificateId}
                    </td>
                    <td className="py-2.5 px-4">
                      <button
                        type="button"
                        onClick={() => onSelectAsset(rec.assetId)}
                        className="font-medium text-slate-900 hover:text-teal-700 text-left"
                      >
                        {rec.assetName}
                      </button>
                      <div className="font-mono text-xs text-slate-500">
                        {rec.assetCode} · {rec.department}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-700 max-w-xs">
                      <div>{rec.standardUsed}</div>
                      <div className="text-slate-500 truncate">{rec.deviationNotes}</div>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                      <div>{rec.calibrationDate}</div>
                      <div className="text-slate-400 font-sans">{rec.performedBy}</div>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs tabular-nums whitespace-nowrap">
                      <div
                        className={
                          dueStatus.status === 'Overdue'
                            ? 'text-red-700 font-semibold'
                            : dueStatus.status === 'Due Soon'
                              ? 'text-amber-700 font-semibold'
                              : 'text-slate-700'
                        }
                      >
                        {rec.dueDate}
                      </div>
                      <div className="text-slate-500">{dueStatus.status}</div>
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <CalibrationResultLabel result={rec.result} />
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {canExport && (
                          <button
                            type="button"
                            onClick={() =>
                              exportCalibrationWorkReportExcel(
                                rec,
                                assets.find((a) => a.id === rec.assetId),
                                TODAY_ISO,
                              )
                            }
                            aria-label={`Download work report for ${rec.certificateId}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100"
                          >
                            <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
                            Work Report
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setPreviewRecord(rec)}
                          aria-label={`View certificate ${rec.certificateId}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                        >
                          <FileCheck className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
                          Certificate
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 px-4 text-center text-sm text-slate-500">
                    No calibration records match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log Calibration Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="log-cal-title"
        >
          <div className="w-full max-w-lg rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 id="log-cal-title" className="text-base font-semibold text-slate-900">
                Record Equipment Calibration
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close calibration modal"
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label htmlFor="cal-asset" className="block text-xs font-medium text-slate-700 mb-1">
                  Medical Equipment
                </label>
                <select
                  id="cal-asset"
                  value={assetId}
                  onChange={(e) => handleAssetChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:border-teal-700 focus:outline-none"
                >
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.assetCode} — {a.name} ({a.assignedEngineer})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="cal-date" className="block text-xs font-medium text-slate-700 mb-1">
                    Calibration Date
                  </label>
                  <input
                    id="cal-date"
                    type="date"
                    required
                    value={calibrationDate}
                    onChange={(e) => {
                      setCalibrationDate(e.target.value);
                      setDueDate(addMonthsISO(e.target.value, 6));
                    }}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="cal-due" className="block text-xs font-medium text-slate-700 mb-1">
                    Next Due Date
                  </label>
                  <input
                    id="cal-due"
                    type="date"
                    required
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="cal-eng" className="block text-xs font-medium text-slate-700 mb-1">
                    Performed By
                  </label>
                  <select
                    id="cal-eng"
                    value={performedBy}
                    onChange={(e) => setPerformedBy(e.target.value)}
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
                  <label htmlFor="cal-result" className="block text-xs font-medium text-slate-700 mb-1">
                    Test Result
                  </label>
                  <select
                    id="cal-result"
                    value={result}
                    onChange={(e) => setResult(e.target.value as CalibrationResult)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:border-teal-700 focus:outline-none"
                  >
                    <option value="Pass">Pass</option>
                    <option value="Conditional">Conditional</option>
                    <option value="Fail">Fail</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="cal-standard" className="block text-xs font-medium text-slate-700 mb-1">
                  Traceable Reference Standard / Analyzer *
                </label>
                <input
                  id="cal-standard"
                  type="text"
                  required
                  value={standardUsed}
                  onChange={(e) => setStandardUsed(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="cal-notes" className="block text-xs font-medium text-slate-700 mb-1">
                  Test Measurements & Deviation Notes
                </label>
                <textarea
                  id="cal-notes"
                  rows={2}
                  value={deviationNotes}
                  onChange={(e) => setDeviationNotes(e.target.value)}
                  placeholder="Measured readings and tolerance verification..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="cal-file" className="block text-xs font-medium text-slate-700 mb-1">
                  Upload Calibration Certificate (PDF)
                </label>
                <label className="flex items-center justify-between gap-3 px-3 py-2 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
                  <span className="flex items-center gap-2 text-xs text-slate-600 truncate">
                    <Upload className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
                    {certificateFileName || 'Choose certificate file (optional)'}
                  </span>
                  <input
                    id="cal-file"
                    type="file"
                    accept=".pdf,.png,.jpg"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setCertificateFileName(f.name);
                    }}
                  />
                  <span className="text-xs font-medium text-teal-700 shrink-0">Browse</span>
                </label>
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
                  Save Calibration Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Certificate Preview Modal */}
      {previewRecord && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cert-preview-title"
        >
          <div className="w-full max-w-lg rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 id="cert-preview-title" className="text-base font-semibold text-slate-900">
                Calibration Certificate — {previewRecord.certificateId}
              </h2>
              <button
                type="button"
                onClick={() => setPreviewRecord(null)}
                aria-label="Close certificate preview"
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-teal-800">
                    {previewRecord.assetCode}
                  </span>
                  <CalibrationResultLabel result={previewRecord.result} />
                </div>
                <h3 className="text-base font-semibold text-slate-900">
                  {previewRecord.assetName}
                </h3>
                <dl className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-slate-200">
                  <div>
                    <dt className="text-slate-500">Test Date</dt>
                    <dd className="font-mono text-slate-900">{previewRecord.calibrationDate}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Valid Until</dt>
                    <dd className="font-mono text-slate-900">{previewRecord.dueDate}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Performed By</dt>
                    <dd className="text-slate-900">{previewRecord.performedBy}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Attached File</dt>
                    <dd className="font-mono text-teal-700 truncate">
                      {previewRecord.certificateFileName}
                    </dd>
                  </div>
                </dl>
                <div className="pt-2 border-t border-slate-200 text-xs">
                  <p className="text-slate-500">Reference Standard</p>
                  <p className="font-medium text-slate-800">{previewRecord.standardUsed}</p>
                  <p className="mt-2 text-slate-500">Observed Deviations / Notes</p>
                  <p className="text-slate-700">{previewRecord.deviationNotes}</p>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Print Certificate
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewRecord(null)}
                  className="px-4 py-2 text-xs font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
