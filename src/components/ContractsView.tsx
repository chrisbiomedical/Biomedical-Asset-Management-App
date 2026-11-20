import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { TODAY_ISO } from '../data/mockData';
import type { Asset, ContractType, ServiceContract, UserRole } from '../types/biotrack';
import { addMonthsISO, deriveContractStatus, hasPermission } from '../utils/biotrackLogic';

interface ContractsViewProps {
  contracts: ServiceContract[];
  assets: Asset[];
  userRole: UserRole;
  onAddContract: (contract: ServiceContract) => void;
  onSelectAsset: (assetId: string) => void;
}

type ContractTab = 'All' | 'Expiring Soon' | 'Expired' | 'Active';

export function ContractsView({
  contracts,
  assets,
  userRole,
  onAddContract,
  onSelectAsset,
}: ContractsViewProps) {
  const [tab, setTab] = useState<ContractTab>('All');
  const [modalOpen, setModalOpen] = useState(false);

  const [assetId, setAssetId] = useState(assets[0]?.id ?? '');
  const [contractType, setContractType] = useState<ContractType>('AMC');
  const [vendor, setVendor] = useState('');
  const [contractNumber, setContractNumber] = useState('');
  const [startDate, setStartDate] = useState(TODAY_ISO);
  const [endDate, setEndDate] = useState(addMonthsISO(TODAY_ISO, 12));
  const [annualCost, setAnnualCost] = useState('3500');
  const [coverageDetails, setCoverageDetails] = useState('');
  const [contactPhone, setContactPhone] = useState('+1 (800) 555-0199');

  const canManage = hasPermission(userRole, 'manage_contracts');

  const enriched = contracts.map((c) => ({
    ...c,
    derived: deriveContractStatus(c, TODAY_ISO),
  }));

  const counts: Record<ContractTab, number> = {
    All: enriched.length,
    'Expiring Soon': enriched.filter((c) => c.derived.status === 'Expiring Soon').length,
    Expired: enriched.filter((c) => c.derived.status === 'Expired').length,
    Active: enriched.filter((c) => c.derived.status === 'Active').length,
  };

  const filtered = enriched.filter((c) => (tab === 'All' ? true : c.derived.status === tab));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const asset = assets.find((a) => a.id === assetId);
    if (!asset || !vendor.trim() || !contractNumber.trim()) return;

    const newContract: ServiceContract = {
      id: `ctr-${Date.now()}`,
      assetId: asset.id,
      assetCode: asset.assetCode,
      assetName: asset.name,
      department: asset.department,
      contractType,
      vendor: vendor.trim(),
      contractNumber: contractNumber.trim(),
      startDate,
      endDate,
      annualCost: Math.max(0, Number(annualCost) || 0),
      coverageDetails: coverageDetails.trim() || `${contractType} preventive and breakdown service coverage.`,
      contactPhone: contactPhone.trim(),
    };

    onAddContract(newContract);
    setModalOpen(false);
    setVendor('');
    setContractNumber('');
    setCoverageDetails('');
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          {(['All', 'Expiring Soon', 'Expired', 'Active'] as ContractTab[]).map((t) => (
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
              setAssetId(assets[0]?.id ?? '');
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Contract
          </button>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-4">Contract #</th>
                <th className="py-2.5 px-4">Equipment</th>
                <th className="py-2.5 px-4">Type & Vendor</th>
                <th className="py-2.5 px-4">Term</th>
                <th className="py-2.5 px-4 text-right">Annual Cost</th>
                <th className="py-2.5 px-4">Expiry Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filtered.map((ctr) => {
                const { status, daysRemaining } = ctr.derived;
                return (
                  <tr key={ctr.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono text-xs font-medium text-slate-800 whitespace-nowrap">
                      {ctr.contractNumber}
                    </td>
                    <td className="py-2.5 px-4">
                      <button
                        type="button"
                        onClick={() => onSelectAsset(ctr.assetId)}
                        className="font-medium text-slate-900 hover:text-teal-700 text-left"
                      >
                        {ctr.assetName}
                      </button>
                      <div className="font-mono text-xs text-slate-500">
                        {ctr.assetCode} · {ctr.department}
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="text-xs font-semibold text-slate-800">{ctr.contractType}</div>
                      <div className="text-xs text-slate-600">{ctr.vendor}</div>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                      <div>{ctr.startDate}</div>
                      <div className="text-slate-500">to {ctr.endDate}</div>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs text-slate-800 tabular-nums whitespace-nowrap">
                      {ctr.annualCost === 0 ? 'Included' : `$${ctr.annualCost.toLocaleString()}`}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <div
                        className={`text-xs font-semibold ${
                          status === 'Expired'
                            ? 'text-red-700'
                            : status === 'Expiring Soon'
                              ? 'text-amber-700'
                              : 'text-emerald-700'
                        }`}
                      >
                        {status}
                      </div>
                      <div className="font-mono text-xs text-slate-500 tabular-nums">
                        {daysRemaining < 0
                          ? `${Math.abs(daysRemaining)}d overdue`
                          : `${daysRemaining}d remaining`}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 px-4 text-center text-sm text-slate-500">
                    No contracts match this status filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-contract-title"
        >
          <div className="w-full max-w-lg rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 id="add-contract-title" className="text-base font-semibold text-slate-900">
                Add Warranty / AMC / CMC Contract
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close contract modal"
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label htmlFor="ctr-asset" className="block text-xs font-medium text-slate-700 mb-1">
                  Equipment
                </label>
                <select
                  id="ctr-asset"
                  value={assetId}
                  onChange={(e) => setAssetId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:border-teal-700 focus:outline-none"
                >
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.assetCode} — {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ctr-type" className="block text-xs font-medium text-slate-700 mb-1">
                    Contract Type
                  </label>
                  <select
                    id="ctr-type"
                    value={contractType}
                    onChange={(e) => setContractType(e.target.value as ContractType)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:border-teal-700 focus:outline-none"
                  >
                    <option value="Manufacturer Warranty">Manufacturer Warranty</option>
                    <option value="AMC">AMC (Annual Maintenance)</option>
                    <option value="CMC">CMC (Comprehensive)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="ctr-number" className="block text-xs font-medium text-slate-700 mb-1">
                    Contract Number *
                  </label>
                  <input
                    id="ctr-number"
                    type="text"
                    required
                    value={contractNumber}
                    onChange={(e) => setContractNumber(e.target.value)}
                    placeholder="e.g. AMC-2026-901"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ctr-vendor" className="block text-xs font-medium text-slate-700 mb-1">
                    Service Vendor *
                  </label>
                  <input
                    id="ctr-vendor"
                    type="text"
                    required
                    value={vendor}
                    onChange={(e) => setVendor(e.target.value)}
                    placeholder="e.g. Philips Healthcare"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="ctr-cost" className="block text-xs font-medium text-slate-700 mb-1">
                    Annual Cost (USD)
                  </label>
                  <input
                    id="ctr-cost"
                    type="number"
                    min="0"
                    value={annualCost}
                    onChange={(e) => setAnnualCost(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ctr-start" className="block text-xs font-medium text-slate-700 mb-1">
                    Start Date
                  </label>
                  <input
                    id="ctr-start"
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="ctr-end" className="block text-xs font-medium text-slate-700 mb-1">
                    Expiry Date
                  </label>
                  <input
                    id="ctr-end"
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="ctr-phone" className="block text-xs font-medium text-slate-700 mb-1">
                  Vendor Support Hotline
                </label>
                <input
                  id="ctr-phone"
                  type="text"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="ctr-coverage" className="block text-xs font-medium text-slate-700 mb-1">
                  Coverage Scope
                </label>
                <textarea
                  id="ctr-coverage"
                  rows={2}
                  value={coverageDetails}
                  onChange={(e) => setCoverageDetails(e.target.value)}
                  placeholder="Parts included, SLA response time, PM visits per year..."
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
                  Save Contract
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
