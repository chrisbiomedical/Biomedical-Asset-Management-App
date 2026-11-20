import { useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Package,
  PhoneCall,
  Plus,
  Truck,
  UserCheck,
  X,
} from 'lucide-react';
import { getManufacturerSupport, TODAY_ISO } from '../data/mockData';
import type {
  Asset,
  BioTrackUser,
  BreakdownTicket,
  ManufacturerCallLog,
  PartOrder,
  PartOrderStatus,
  UserRole,
} from '../types/biotrack';
import {
  addMonthsISO,
  aggregateOrdersByEngineer,
  generateNextOrderNumber,
  getMachineComplaintStats,
  hasPermission,
} from '../utils/biotrackLogic';

interface PartsOrdersViewProps {
  partOrders: PartOrder[];
  manufacturerCalls: ManufacturerCallLog[];
  assets: Asset[];
  users: BioTrackUser[];
  breakdowns: BreakdownTicket[];
  currentUser: BioTrackUser;
  userRole: UserRole;
  onOrderPart: (order: PartOrder) => void;
  onUpdatePartOrderStatus: (orderId: string, status: PartOrderStatus) => void;
  onLogManufacturerCall: (call: ManufacturerCallLog) => void;
  onSelectAsset: (assetId: string) => void;
}

const ORDER_STATUS_COLORS: Record<PartOrderStatus, string> = {
  Ordered: 'text-amber-700',
  Shipped: 'text-teal-700',
  Delivered: 'text-emerald-700',
  Cancelled: 'text-slate-500',
};

export function PartsOrdersView({
  partOrders,
  manufacturerCalls,
  assets,
  users,
  breakdowns,
  currentUser,
  userRole,
  onOrderPart,
  onUpdatePartOrderStatus,
  onLogManufacturerCall,
  onSelectAsset,
}: PartsOrdersViewProps) {
  const [engineerFilter, setEngineerFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | PartOrderStatus>('All');

  // Order Spare Parts Modal
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderAssetId, setOrderAssetId] = useState(assets[0]?.id ?? '');
  const [partName, setPartName] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('250');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(
    addMonthsISO(TODAY_ISO, 0).slice(0, 8) + '25',
  );
  const [orderNotes, setOrderNotes] = useState('');

  // Manufacturer Call Modal
  const [callAssetId, setCallAssetId] = useState<string | null>(null);
  const [callReason, setCallReason] = useState('');
  const [oemReferenceId, setOemReferenceId] = useState('');
  const [outcomeNotes, setOutcomeNotes] = useState('');

  const canOrderParts = hasPermission(userRole, 'order_parts');

  const engineerSummaries = aggregateOrdersByEngineer(partOrders, users);
  const complaintStats = getMachineComplaintStats(assets, breakdowns);
  const escalatedMachines = complaintStats.filter((s) => s.needsOemEscalation);

  const selectedOrderAsset = assets.find((a) => a.id === orderAssetId) ?? assets[0];
  const selectedOrderSupport = selectedOrderAsset
    ? getManufacturerSupport(selectedOrderAsset.manufacturer)
    : null;

  const callModalAsset = callAssetId ? assets.find((a) => a.id === callAssetId) ?? null : null;
  const callModalSupport = callModalAsset
    ? getManufacturerSupport(callModalAsset.manufacturer)
    : null;

  const filteredOrders = partOrders.filter((order) => {
    if (engineerFilter !== 'All' && order.orderedBy !== engineerFilter) return false;
    if (statusFilter !== 'All' && order.status !== statusFilter) return false;
    return true;
  });

  const totalOrdersCount = partOrders.length;
  const pendingDeliveryCount = partOrders.filter(
    (o) => o.status === 'Ordered' || o.status === 'Shipped',
  ).length;
  const deliveredCount = partOrders.filter((o) => o.status === 'Delivered').length;
  const totalSpend = partOrders
    .filter((o) => o.status !== 'Cancelled')
    .reduce((sum, o) => sum + o.quantity * o.unitCost, 0);

  const openOrderModal = (preselectedAssetId?: string) => {
    const chosenId = preselectedAssetId ?? assets[0]?.id ?? '';
    setOrderAssetId(chosenId);
    setPartName('');
    setPartNumber('');
    setQuantity('1');
    setUnitCost('250');
    setExpectedDeliveryDate('2026-11-24');
    setOrderNotes('');
    setOrderModalOpen(true);
  };

  const handleOrderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const asset = assets.find((a) => a.id === orderAssetId);
    if (!asset || !partName.trim() || !partNumber.trim()) return;

    const qty = Math.max(1, Math.round(Number(quantity) || 1));
    const cost = Math.max(0, Number(unitCost) || 0);

    const newOrder: PartOrder = {
      id: `po-${Date.now()}`,
      orderNumber: generateNextOrderNumber(partOrders),
      assetId: asset.id,
      assetCode: asset.assetCode,
      assetName: asset.name,
      manufacturer: asset.manufacturer,
      department: asset.department,
      partName: partName.trim(),
      partNumber: partNumber.trim(),
      quantity: qty,
      unitCost: cost,
      orderedBy: currentUser.name,
      orderDate: TODAY_ISO,
      expectedDeliveryDate,
      status: 'Ordered',
      notes: orderNotes.trim() || undefined,
    };

    onOrderPart(newOrder);
    setOrderModalOpen(false);
  };

  const openCallModal = (assetId: string, defaultReason?: string) => {
    setCallAssetId(assetId);
    setCallReason(
      defaultReason ??
        'Technical escalation regarding repeated equipment faults and spare part compatibility',
    );
    setOemReferenceId(`OEM-${Math.floor(10000 + Math.random() * 90000)}`);
    setOutcomeNotes('');
  };

  const handleCallSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!callModalAsset || !callModalSupport || !callReason.trim() || !outcomeNotes.trim()) return;

    const newCall: ManufacturerCallLog = {
      id: `call-${Date.now()}`,
      assetId: callModalAsset.id,
      assetCode: callModalAsset.assetCode,
      assetName: callModalAsset.name,
      manufacturer: callModalAsset.manufacturer,
      supportPhone: callModalSupport.supportPhone,
      calledBy: currentUser.name,
      calledAt: `${TODAY_ISO} ${new Date().toISOString().slice(11, 16)}`,
      reason: callReason.trim(),
      oemReferenceId: oemReferenceId.trim() || 'UNASSIGNED',
      outcomeNotes: outcomeNotes.trim(),
    };

    onLogManufacturerCall(newCall);
    setCallAssetId(null);
  };

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Total Part Orders</span>
            <Package className="h-4 w-4 text-teal-700" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {totalOrdersCount}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">Direct OEM requisitions</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Pending Delivery</span>
            <Truck className="h-4 w-4 text-amber-600" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-amber-700 tabular-nums">
            {pendingDeliveryCount}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">Ordered or in transit</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Delivered Parts</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
            {deliveredCount}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">Received by Biomed bench</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Active Parts Spend</span>
            <Building2 className="h-4 w-4 text-slate-600" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            ${totalSpend.toLocaleString()}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {escalatedMachines.length} repeat-complaint OEM alert
            {escalatedMachines.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {/* Parts Ordered by Each Engineer */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-teal-700" aria-hidden="true" />
              Parts Ordered by Each Engineer
            </h2>
            <p className="text-xs text-slate-500">
              Complete itemized log of spare parts ordered from machine manufacturers per biomedical engineer
            </p>
          </div>
          {engineerFilter !== 'All' && (
            <button
              type="button"
              onClick={() => setEngineerFilter('All')}
              className="px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100 self-start sm:self-auto"
            >
              Show All Engineers ({engineerFilter} filtered)
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-5">
          {engineerSummaries.map((eng) => {
            const isSelected = engineerFilter === eng.engineerName;
            return (
              <div
                key={eng.engineerName}
                className={`border rounded-lg p-4 flex flex-col justify-between gap-3 transition-colors ${
                  isSelected
                    ? 'border-teal-700 bg-teal-50/40'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-slate-900 truncate">
                        {eng.engineerName}
                      </h3>
                      <p className="text-xs text-slate-500 truncate">{eng.specialty}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setEngineerFilter(isSelected ? 'All' : eng.engineerName)
                      }
                      className={`px-2.5 py-1 text-xs font-medium rounded-md border shrink-0 ${
                        isSelected
                          ? 'bg-teal-700 text-white border-teal-700'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {isSelected ? 'Filtered' : 'Filter Table'}
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 py-2 border-y border-slate-100 text-xs">
                    <div>
                      <span className="text-slate-500 block">Orders</span>
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">
                        {eng.orderCount} ({eng.totalUnitsOrdered} qty)
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Pending</span>
                      <span className="font-mono font-semibold text-amber-700 tabular-nums">
                        {eng.pendingCount}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Total Spend</span>
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">
                        ${eng.totalSpend.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {eng.orders.length === 0 ? (
                    <p className="mt-3 text-xs text-slate-400">No parts ordered yet.</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {eng.orders.map((order) => (
                        <li
                          key={order.id}
                          className="text-xs bg-slate-50 border border-slate-200/80 rounded-md px-2.5 py-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-semibold text-slate-800">
                              {order.orderNumber} · {order.assetCode}
                            </span>
                            <span
                              className={`font-semibold ${ORDER_STATUS_COLORS[order.status]}`}
                            >
                              {order.status}
                            </span>
                          </div>
                          <p className="mt-0.5 font-medium text-slate-800 truncate">
                            {order.partName}
                          </p>
                          <p className="text-slate-500 flex items-center justify-between gap-2 mt-0.5">
                            <span>OEM: {order.manufacturer}</span>
                            <span className="font-mono tabular-nums">
                              {order.quantity}× ${(order.unitCost * order.quantity).toLocaleString()}
                            </span>
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Master Part Orders Table */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              All Maintenance Part Orders (Direct from Manufacturer)
            </h2>
            <p className="text-xs text-slate-500">
              Track spare parts ordered directly from each machine&apos;s manufacturing company
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={engineerFilter}
              onChange={(e) => setEngineerFilter(e.target.value)}
              aria-label="Filter part orders by engineer"
              className="px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg bg-white text-slate-700 focus:border-teal-700 focus:outline-none"
            >
              <option value="All">All Engineers</option>
              {engineerSummaries.map((eng) => (
                <option key={eng.engineerName} value={eng.engineerName}>
                  {eng.engineerName} ({eng.orderCount})
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'All' | PartOrderStatus)}
              aria-label="Filter part orders by delivery status"
              className="px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg bg-white text-slate-700 focus:border-teal-700 focus:outline-none"
            >
              <option value="All">All Statuses</option>
              <option value="Ordered">Ordered</option>
              <option value="Shipped">Shipped</option>
              <option value="Delivered">Delivered</option>
              <option value="Cancelled">Cancelled</option>
            </select>

            {canOrderParts && (
              <button
                type="button"
                onClick={() => openOrderModal()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 whitespace-nowrap shrink-0"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Order Spare Parts
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-4">Order #</th>
                <th className="py-2.5 px-4">Machine & Manufacturer</th>
                <th className="py-2.5 px-4">Part Name & OEM Part #</th>
                <th className="py-2.5 px-4 text-right">Qty & Cost</th>
                <th className="py-2.5 px-4">Ordered By</th>
                <th className="py-2.5 px-4">Expected Delivery</th>
                <th className="py-2.5 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredOrders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4 font-mono text-xs font-semibold text-slate-800 whitespace-nowrap">
                    <div>{order.orderNumber}</div>
                    <div className="text-slate-400 font-normal tabular-nums">
                      {order.orderDate}
                    </div>
                  </td>
                  <td className="py-2.5 px-4">
                    <button
                      type="button"
                      onClick={() => onSelectAsset(order.assetId)}
                      className="font-medium text-slate-900 hover:text-teal-700 text-left"
                    >
                      {order.assetName}
                    </button>
                    <div className="text-xs text-slate-500">
                      <span className="font-mono">{order.assetCode}</span> · OEM:{' '}
                      <strong className="font-medium text-slate-700">{order.manufacturer}</strong>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 max-w-xs">
                    <div className="font-medium text-slate-900 text-xs sm:text-sm">
                      {order.partName}
                    </div>
                    <div className="font-mono text-xs text-slate-500">
                      P/N: {order.partNumber}
                    </div>
                    {order.notes && (
                      <p className="text-xs text-slate-500 truncate mt-0.5">{order.notes}</p>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                    <div className="font-semibold text-slate-900">
                      ${(order.quantity * order.unitCost).toLocaleString()}
                    </div>
                    <div className="text-slate-500">
                      {order.quantity} × ${order.unitCost.toLocaleString()}
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-xs font-medium text-slate-700 whitespace-nowrap">
                    {order.orderedBy}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                    {order.expectedDeliveryDate}
                  </td>
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    {canOrderParts ? (
                      <select
                        value={order.status}
                        onChange={(e) =>
                          onUpdatePartOrderStatus(order.id, e.target.value as PartOrderStatus)
                        }
                        aria-label={`Update status for ${order.orderNumber}`}
                        className={`px-2 py-1 text-xs font-semibold border border-slate-300 rounded-md bg-white focus:border-teal-700 focus:outline-none ${ORDER_STATUS_COLORS[order.status]}`}
                      >
                        <option value="Ordered">Ordered</option>
                        <option value="Shipped">Shipped</option>
                        <option value="Delivered">Delivered</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>
                    ) : (
                      <span className={`text-xs font-semibold ${ORDER_STATUS_COLORS[order.status]}`}>
                        {order.status}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 px-4 text-center text-sm text-slate-500">
                    No spare part orders match the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* High-Complaint Machines & Manufacturer Support Escalation */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
              Repeat-Complaint Machines &amp; Manufacturer Support Escalation
            </h2>
            <p className="text-xs text-slate-500">
              Machines with multiple breakdown complaints or critical faults—call the manufacturing company directly for engineering guidance
            </p>
          </div>
          {canOrderParts && assets[0] && (
            <button
              type="button"
              onClick={() => openCallModal(assets[0].id)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 whitespace-nowrap self-start sm:self-auto"
            >
              <PhoneCall className="h-3.5 w-3.5" aria-hidden="true" />
              Log OEM Support Call
            </button>
          )}
        </div>

        <div className="p-5 space-y-4">
          {escalatedMachines.length === 0 ? (
            <p className="text-sm text-slate-500">
              No machines currently meet the repeat-complaint threshold (2+ complaints).
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {escalatedMachines.map((stat) => {
                const support = getManufacturerSupport(stat.asset.manufacturer);
                return (
                  <div
                    key={stat.asset.id}
                    className="border border-amber-200 bg-amber-50/40 rounded-lg p-4 flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => onSelectAsset(stat.asset.id)}
                          className="font-mono font-semibold text-teal-800 hover:underline"
                        >
                          {stat.asset.assetCode}
                        </button>
                        <span className="font-mono font-semibold text-amber-800 tabular-nums">
                          {stat.totalComplaints} complaints ({stat.openComplaints} open)
                        </span>
                      </div>
                      <h3 className="mt-1 text-sm font-semibold text-slate-900">
                        {stat.asset.name}
                      </h3>
                      <p className="text-xs text-slate-600 mt-0.5">
                        OEM: <strong>{stat.asset.manufacturer}</strong> · Assigned:{' '}
                        {stat.asset.assignedEngineer}
                      </p>
                      <p className="font-mono text-xs text-slate-500 mt-1 tabular-nums">
                        Total Downtime: {stat.totalDowntimeHours.toFixed(1)} hrs
                      </p>
                      {stat.latestTicket && (
                        <p className="mt-2 text-xs text-slate-700 bg-white border border-amber-200/80 rounded p-2 line-clamp-2">
                          Latest ({stat.latestTicket.ticketNumber}):{' '}
                          {stat.latestTicket.faultDescription}
                        </p>
                      )}
                      <div className="mt-2 text-xs text-slate-600">
                        <div className="font-mono text-slate-800">{support.supportPhone}</div>
                        <div className="text-slate-500">{support.hours}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-amber-200/70">
                      <a
                        href={`tel:${support.supportPhone}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-700 rounded-md hover:bg-teal-800"
                      >
                        <PhoneCall className="h-3.5 w-3.5" aria-hidden="true" />
                        Call {stat.asset.manufacturer}
                      </a>
                      {canOrderParts && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              openCallModal(
                                stat.asset.id,
                                `Repeat complaint escalation (${stat.totalComplaints} tickets) for ${stat.asset.assetCode}`,
                              )
                            }
                            className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                          >
                            Log Call Notes
                          </button>
                          <button
                            type="button"
                            onClick={() => openOrderModal(stat.asset.id)}
                            className="px-2.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100"
                          >
                            Order Parts
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Recent Manufacturer Call Logs */}
          <div className="pt-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Manufacturer Technical Support Call History
            </h3>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <th className="py-2 px-3">Date / Time</th>
                    <th className="py-2 px-3">Machine & OEM</th>
                    <th className="py-2 px-3">Engineer</th>
                    <th className="py-2 px-3">OEM Case Ref</th>
                    <th className="py-2 px-3">Reason &amp; Manufacturer Guidance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {manufacturerCalls.map((call) => (
                    <tr key={call.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono text-slate-600 tabular-nums whitespace-nowrap">
                        {call.calledAt}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onSelectAsset(call.assetId)}
                          className="font-mono font-semibold text-teal-800 hover:underline"
                        >
                          {call.assetCode}
                        </button>
                        <div className="text-slate-700 font-medium">{call.manufacturer}</div>
                        <div className="font-mono text-slate-400">{call.supportPhone}</div>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-800 whitespace-nowrap">
                        {call.calledBy}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-800 whitespace-nowrap">
                        {call.oemReferenceId}
                      </td>
                      <td className="py-2.5 px-3 max-w-lg">
                        <div className="font-medium text-slate-900">{call.reason}</div>
                        <p className="text-slate-600 mt-0.5">{call.outcomeNotes}</p>
                      </td>
                    </tr>
                  ))}
                  {manufacturerCalls.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 px-3 text-center text-slate-500">
                        No manufacturer support calls logged yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Order Spare Parts Modal */}
      {orderModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="order-parts-title"
        >
          <div className="w-full max-w-lg rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 id="order-parts-title" className="text-base font-semibold text-slate-900">
                Order Maintenance Spare Parts from Manufacturer
              </h2>
              <button
                type="button"
                onClick={() => setOrderModalOpen(false)}
                aria-label="Close order parts modal"
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleOrderSubmit} className="p-6 space-y-4">
              <div>
                <label htmlFor="po-asset" className="block text-xs font-medium text-slate-700 mb-1">
                  Select Machine
                </label>
                <select
                  id="po-asset"
                  value={orderAssetId}
                  onChange={(e) => setOrderAssetId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:border-teal-700 focus:outline-none"
                >
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.assetCode} — {a.name} ({a.manufacturer})
                    </option>
                  ))}
                </select>
              </div>

              {selectedOrderAsset && selectedOrderSupport && (
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-700 space-y-1">
                  <div className="flex items-center justify-between">
                    <span>
                      Manufacturing Company:{' '}
                      <strong className="text-slate-900">
                        {selectedOrderAsset.manufacturer}
                      </strong>
                    </span>
                    <span className="font-mono text-teal-800">
                      {selectedOrderSupport.supportPhone}
                    </span>
                  </div>
                  <div className="text-slate-500">
                    OEM Parts Desk: <span className="font-mono">{selectedOrderSupport.partsEmail}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="po-part-name" className="block text-xs font-medium text-slate-700 mb-1">
                    Part / Assembly Name *
                  </label>
                  <input
                    id="po-part-name"
                    type="text"
                    required
                    value={partName}
                    onChange={(e) => setPartName(e.target.value)}
                    placeholder="e.g. Expiratory Flow Sensor"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="po-part-num" className="block text-xs font-medium text-slate-700 mb-1">
                    OEM Part Number *
                  </label>
                  <input
                    id="po-part-num"
                    type="text"
                    required
                    value={partNumber}
                    onChange={(e) => setPartNumber(e.target.value)}
                    placeholder="e.g. 8403735"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="po-qty" className="block text-xs font-medium text-slate-700 mb-1">
                    Quantity *
                  </label>
                  <input
                    id="po-qty"
                    type="number"
                    min="1"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="po-cost" className="block text-xs font-medium text-slate-700 mb-1">
                    Unit Cost ($)
                  </label>
                  <input
                    id="po-cost"
                    type="number"
                    min="0"
                    step="1"
                    value={unitCost}
                    onChange={(e) => setUnitCost(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="po-delivery" className="block text-xs font-medium text-slate-700 mb-1">
                    Expected Delivery
                  </label>
                  <input
                    id="po-delivery"
                    type="date"
                    required
                    value={expectedDeliveryDate}
                    onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="po-notes" className="block text-xs font-medium text-slate-700 mb-1">
                  Maintenance / Breakdown Reference Notes
                </label>
                <textarea
                  id="po-notes"
                  rows={2}
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Linked breakdown ticket or scheduled PM work order..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                <span className="text-xs text-slate-500">
                  Ordered by: <strong className="text-slate-800">{currentUser.name}</strong>
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setOrderModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800"
                  >
                    Place OEM Order
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manufacturer Support Call Log Modal */}
      {callModalAsset && callModalSupport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="oem-call-title"
        >
          <div className="w-full max-w-lg rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h2 id="oem-call-title" className="text-base font-semibold text-slate-900">
                  Call Manufacturer &amp; Log Technical Escalation
                </h2>
                <p className="text-xs text-slate-500">
                  {callModalAsset.assetCode} · {callModalAsset.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCallAssetId(null)}
                aria-label="Close manufacturer call modal"
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCallSubmit} className="p-6 space-y-4">
              <div>
                <label htmlFor="oem-asset-select" className="block text-xs font-medium text-slate-700 mb-1">
                  Equipment
                </label>
                <select
                  id="oem-asset-select"
                  value={callAssetId ?? ''}
                  onChange={(e) => setCallAssetId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:border-teal-700 focus:outline-none"
                >
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.assetCode} — {a.name} ({a.manufacturer})
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-lg bg-teal-50 border border-teal-200 p-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs">
                  <div className="font-semibold text-teal-900">
                    {callModalAsset.manufacturer} Technical Support
                  </div>
                  <div className="text-teal-800">{callModalSupport.hours}</div>
                </div>
                <a
                  href={`tel:${callModalSupport.supportPhone}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-700 rounded-md hover:bg-teal-800 font-mono"
                >
                  <PhoneCall className="h-3.5 w-3.5" aria-hidden="true" />
                  {callModalSupport.supportPhone}
                </a>
              </div>

              <div>
                <label htmlFor="oem-reason" className="block text-xs font-medium text-slate-700 mb-1">
                  Reason for Calling Manufacturer *
                </label>
                <input
                  id="oem-reason"
                  type="text"
                  required
                  value={callReason}
                  onChange={(e) => setCallReason(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="oem-ref" className="block text-xs font-medium text-slate-700 mb-1">
                  OEM Case / RMA Reference #
                </label>
                <input
                  id="oem-ref"
                  type="text"
                  value={oemReferenceId}
                  onChange={(e) => setOemReferenceId(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="oem-notes" className="block text-xs font-medium text-slate-700 mb-1">
                  Technical Guidance / Outcome Notes *
                </label>
                <textarea
                  id="oem-notes"
                  rows={3}
                  required
                  value={outcomeNotes}
                  onChange={(e) => setOutcomeNotes(e.target.value)}
                  placeholder="Record diagnostic steps, tolerances, or part numbers advised by the manufacturer engineer..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setCallAssetId(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800"
                >
                  Save OEM Call Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
