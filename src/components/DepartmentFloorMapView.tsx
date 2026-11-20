import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  Layers,
  MapPin,
  Search,
  Wrench,
} from 'lucide-react';
import type {
  Asset,
  BreakdownTicket,
  FloorPlanBreakdownSeverity,
  FloorPlanColorMode,
  FloorPlanDensityTier,
  FloorPlanDepartmentZone,
  FloorPlanLocationNode,
  NavSection,
} from '../types/biotrack';
import { computeFloorPlanDepartments } from '../utils/biotrackLogic';
import { OperationalStatusLabel, PriorityLabel } from './StatusText';

interface DepartmentFloorMapViewProps {
  assets: Asset[];
  breakdowns: BreakdownTicket[];
  onSelectAsset: (assetId: string) => void;
  onNavigate?: (section: NavSection) => void;
}

const DENSITY_CARD_STYLES: Record<FloorPlanDensityTier, string> = {
  'Asset-Heavy': 'bg-teal-100/80 border-teal-600 text-slate-900',
  Moderate: 'bg-teal-50/90 border-teal-300 text-slate-900',
  Standard: 'bg-slate-50 border-slate-300 text-slate-800',
};

const SEVERITY_CARD_STYLES: Record<FloorPlanBreakdownSeverity, string> = {
  'High Breakdown': 'bg-red-50/90 border-red-400 text-slate-900',
  Watch: 'bg-amber-50/85 border-amber-300 text-slate-900',
  Nominal: 'bg-emerald-50/70 border-emerald-300 text-slate-900',
};

const DENSITY_BAY_STYLES: Record<FloorPlanDensityTier, string> = {
  'Asset-Heavy': 'bg-white/95 border-teal-500 text-slate-900',
  Moderate: 'bg-white/95 border-teal-300 text-slate-900',
  Standard: 'bg-white/90 border-slate-200 text-slate-800',
};

const SEVERITY_BAY_STYLES: Record<FloorPlanBreakdownSeverity, string> = {
  'High Breakdown': 'bg-white/95 border-red-400 text-red-950',
  Watch: 'bg-white/95 border-amber-300 text-amber-950',
  Nominal: 'bg-white/90 border-emerald-200 text-slate-800',
};

function getBayDensityTier(totalAssets: number): FloorPlanDensityTier {
  if (totalAssets >= 3) return 'Asset-Heavy';
  if (totalAssets === 2) return 'Moderate';
  return 'Standard';
}

export function DepartmentFloorMapView({
  assets,
  breakdowns,
  onSelectAsset,
  onNavigate,
}: DepartmentFloorMapViewProps) {
  const [colorMode, setColorMode] = useState<FloorPlanColorMode>('equipment');
  const [floorFilter, setFloorFilter] = useState<'all' | 1 | 2 | 3>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('Operating Theatre');
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);

  const zones = useMemo(
    () => computeFloorPlanDepartments(assets, breakdowns),
    [assets, breakdowns],
  );

  const filteredZones = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return zones.filter((zone) => {
      if (floorFilter !== 'all' && zone.floorNumber !== floorFilter) return false;
      if (!q) return true;
      if (
        zone.department.toLowerCase().includes(q) ||
        zone.wingCode.toLowerCase().includes(q) ||
        zone.wingLabel.toLowerCase().includes(q)
      ) {
        return true;
      }
      if (zone.locations.some((loc) => loc.location.toLowerCase().includes(q))) {
        return true;
      }
      return zone.assets.some(
        (a) =>
          a.assetCode.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q) ||
          a.assignedEngineer.toLowerCase().includes(q),
      );
    });
  }, [zones, floorFilter, searchQuery]);

  const activeZone: FloorPlanDepartmentZone | undefined =
    filteredZones.find((z) => z.department === selectedDepartment) ??
    filteredZones[0] ??
    zones[0];

  const activeLocationNode: FloorPlanLocationNode | undefined =
    activeZone && selectedLocation
      ? activeZone.locations.find((loc) => loc.location === selectedLocation)
      : undefined;

  const displayedAssets = activeLocationNode
    ? activeLocationNode.assets
    : (activeZone?.assets ?? []);

  const displayedOpenTickets = useMemo(() => {
    if (!activeZone) return [];
    if (!activeLocationNode) return activeZone.openTickets;
    const locAssetIds = new Set(activeLocationNode.assets.map((a) => a.id));
    return activeZone.openTickets.filter(
      (t) => locAssetIds.has(t.assetId) || t.location === activeLocationNode.location,
    );
  }, [activeZone, activeLocationNode]);

  const assetHeavyCount = zones.filter((z) => z.densityTier === 'Asset-Heavy').length;
  const highBreakdownCount = zones.filter((z) => z.breakdownSeverity === 'High Breakdown').length;
  const totalLocationsCount = zones.reduce((sum, z) => sum + z.locations.length, 0);

  const floorsToRender = ([1, 2, 3] as const).filter((floorNum) =>
    filteredZones.some((z) => z.floorNumber === floorNum),
  );

  const handleSelectZone = (dept: string) => {
    setSelectedDepartment(dept);
    setSelectedLocation(null);
  };

  const handleSelectBay = (dept: string, locationName: string) => {
    setSelectedDepartment(dept);
    setSelectedLocation((prev) =>
      selectedDepartment === dept && prev === locationName ? null : locationName,
    );
  };

  return (
    <div className="space-y-5">
      {/* Control Strip & Color Legend */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Color Mode Segmented Switch */}
            <div
              role="group"
              aria-label="Floor plan color-coding mode"
              className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0"
            >
              <button
                type="button"
                onClick={() => setColorMode('equipment')}
                aria-pressed={colorMode === 'equipment'}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  colorMode === 'equipment'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
                Equipment Count
              </button>
              <button
                type="button"
                onClick={() => setColorMode('breakdowns')}
                aria-pressed={colorMode === 'breakdowns'}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  colorMode === 'breakdowns'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <AlertTriangle className="h-3.5 w-3.5 text-red-600" aria-hidden="true" />
                Breakdown Status
              </button>
            </div>

            {/* Floor Selector */}
            <div
              role="group"
              aria-label="Filter by hospital floor level"
              className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0"
            >
              {(['all', 1, 2, 3] as const).map((lvl) => (
                <button
                  key={String(lvl)}
                  type="button"
                  onClick={() => setFloorFilter(lvl)}
                  aria-pressed={floorFilter === lvl}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    floorFilter === lvl
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {lvl === 'all' ? 'All Floors' : `Level ${lvl}`}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative min-w-[235px]">
              <Search
                className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search dept, bay, or BIO ID..."
                aria-label="Search floor plan departments and rooms"
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
              />
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-600 whitespace-nowrap font-mono tabular-nums">
              <span>{zones.length} depts</span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span>{totalLocationsCount} bays</span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span>{assets.length} units</span>
            </div>
          </div>
        </div>

        {/* Dynamic Semantic Color Legend */}
        <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          {colorMode === 'equipment' ? (
            <div className="flex flex-wrap items-center gap-5 text-slate-700">
              <span className="font-medium text-slate-500">Asset Density Scale:</span>
              <span className="inline-flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-xs bg-teal-100 border-2 border-teal-600 inline-block" aria-hidden="true" />
                <span>
                  Asset-Heavy (4+ units) · <strong className="font-mono tabular-nums">{assetHeavyCount}</strong> depts
                </span>
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-xs bg-teal-50 border-2 border-teal-300 inline-block" aria-hidden="true" />
                <span>Moderate Density (3 units)</span>
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-xs bg-slate-50 border-2 border-slate-300 inline-block" aria-hidden="true" />
                <span>Standard (0–2 units)</span>
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-5 text-slate-700">
              <span className="font-medium text-slate-500">Breakdown Alert Scale:</span>
              <span className="inline-flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-xs bg-red-50 border-2 border-red-400 inline-block" aria-hidden="true" />
                <span>
                  High Breakdown (Critical/High open) · <strong className="font-mono tabular-nums">{highBreakdownCount}</strong> depts
                </span>
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-xs bg-amber-50 border-2 border-amber-300 inline-block" aria-hidden="true" />
                <span>Watch (Open minor fault / Service due)</span>
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-xs bg-emerald-50 border-2 border-emerald-300 inline-block" aria-hidden="true" />
                <span>Nominal (All operational)</span>
              </span>
            </div>
          )}

          <span className="text-slate-500">
            Select any wing or room bay to inspect equipment
          </span>
        </div>
      </div>

      {/* Floor Plan Canvas + Right-Side Location Inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Interactive Architectural Floor Plan */}
        <section
          aria-label="Hospital department floor plan schematic"
          className="xl:col-span-8 bg-white border border-slate-200 rounded-lg p-5 space-y-5"
        >
          {floorsToRender.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <p className="text-sm font-medium text-slate-700">
                No departments or room bays match "{searchQuery}".
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setFloorFilter('all');
                }}
                className="px-3.5 py-2 text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100"
              >
                Reset Floor Filters
              </button>
            </div>
          ) : (
            floorsToRender.map((floorNum) => {
              const floorZones = filteredZones.filter((z) => z.floorNumber === floorNum);
              const floorTitle = floorZones[0]?.floorLabel ?? `Level ${floorNum}`;
              const floorAssetTotal = floorZones.reduce((sum, z) => sum + z.totalAssets, 0);
              const floorOpenFaults = floorZones.reduce((sum, z) => sum + z.openBreakdownsCount, 0);

              return (
                <div key={floorNum} className="space-y-2.5">
                  {/* Architectural Level Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-slate-500 shrink-0" aria-hidden="true" />
                      <h2 className="font-display text-sm font-semibold text-slate-900">
                        {floorTitle}
                      </h2>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 font-mono tabular-nums">
                      <span>{floorAssetTotal} units</span>
                      <span aria-hidden="true">·</span>
                      <span className={floorOpenFaults > 0 ? 'text-red-700 font-semibold' : ''}>
                        {floorOpenFaults} open faults
                      </span>
                    </div>
                  </div>

                  {/* Architectural Wing Grid + Central Corridor Spine */}
                  <div className="bg-slate-50/70 border border-slate-200 rounded-lg p-3 space-y-2.5">
                    <div
                      className={`grid grid-cols-1 gap-3 ${
                        floorZones.length >= 3
                          ? 'md:grid-cols-3'
                          : floorZones.length === 2
                            ? 'md:grid-cols-2'
                            : 'md:grid-cols-1'
                      }`}
                    >
                      {floorZones.map((zone) => {
                        const isZoneSelected = activeZone?.department === zone.department;
                        const zoneStyle =
                          colorMode === 'equipment'
                            ? DENSITY_CARD_STYLES[zone.densityTier]
                            : SEVERITY_CARD_STYLES[zone.breakdownSeverity];

                        const statusHeadline =
                          colorMode === 'equipment'
                            ? `${zone.densityTier} · ${zone.totalAssets}u`
                            : `${zone.breakdownSeverity} · ${zone.openBreakdownsCount} open`;

                        return (
                          <div
                            key={zone.department}
                            data-testid={`floor-zone-${zone.department}`}
                            data-color-tier={
                              colorMode === 'equipment'
                                ? zone.densityTier
                                : zone.breakdownSeverity
                            }
                            className={`rounded-lg border-2 p-3 flex flex-col justify-between gap-2.5 transition-all ${zoneStyle} ${
                              isZoneSelected
                                ? 'ring-2 ring-slate-900 ring-offset-1'
                                : 'hover:shadow-xs'
                            }`}
                          >
                            {/* Department Zone Header Button */}
                            <button
                              type="button"
                              onClick={() => handleSelectZone(zone.department)}
                              aria-pressed={isZoneSelected && !selectedLocation}
                              aria-label={`Select ${zone.department} zone (${zone.totalAssets} assets, ${zone.openBreakdownsCount} open breakdowns)`}
                              className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 rounded"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div
                                    title={`${zone.wingCode} · ${zone.wingLabel}`}
                                    className="font-mono text-[11px] font-semibold text-slate-500 truncate"
                                  >
                                    {zone.wingCode} · {zone.wingLabel}
                                  </div>
                                  <h3 className="text-sm font-bold text-slate-900 truncate">
                                    {zone.department}
                                  </h3>
                                </div>
                                <span className="font-mono text-base font-bold tabular-nums text-slate-900 shrink-0">
                                  {zone.totalAssets}
                                </span>
                              </div>

                              <div className="mt-1 flex items-center justify-between gap-2 text-[11px] font-semibold">
                                <span
                                  className={`whitespace-nowrap ${
                                    colorMode === 'breakdowns' &&
                                    zone.breakdownSeverity === 'High Breakdown'
                                      ? 'text-red-800'
                                      : colorMode === 'breakdowns' &&
                                          zone.breakdownSeverity === 'Watch'
                                        ? 'text-amber-800'
                                        : colorMode === 'equipment' &&
                                            zone.densityTier === 'Asset-Heavy'
                                          ? 'text-teal-900'
                                          : 'text-slate-700'
                                  }`}
                                >
                                  {statusHeadline}
                                </span>
                                <span className="font-mono tabular-nums text-slate-600 whitespace-nowrap shrink-0">
                                  {zone.totalDowntimeHours}h down
                                </span>
                              </div>
                            </button>

                            {/* Sub-Location Architectural Room Bays */}
                            <div className="space-y-1.5 pt-2 border-t border-slate-900/10">
                              <div className="text-[11px] font-medium text-slate-600">
                                Clinical Bays ({zone.locations.length})
                              </div>
                              <div className="grid grid-cols-1 gap-1.5">
                                {zone.locations.map((loc) => {
                                  const isBaySelected =
                                    activeZone?.department === zone.department &&
                                    selectedLocation === loc.location;
                                  const bayTier = getBayDensityTier(loc.totalAssets);
                                  const bayStyle =
                                    colorMode === 'equipment'
                                      ? DENSITY_BAY_STYLES[bayTier]
                                      : SEVERITY_BAY_STYLES[loc.severity];

                                  return (
                                    <button
                                      key={loc.location}
                                      type="button"
                                      title={`${loc.location} — ${loc.totalAssets} unit(s), ${loc.openBreakdownsCount} open fault(s)`}
                                      onClick={() => handleSelectBay(zone.department, loc.location)}
                                      aria-pressed={isBaySelected}
                                      aria-label={`Inspect room ${loc.location} in ${zone.department} (${loc.totalAssets} assets, ${loc.openBreakdownsCount} open faults)`}
                                      className={`w-full text-left px-2 py-1.5 rounded border text-[11px] transition-colors flex items-center justify-between gap-1.5 ${bayStyle} ${
                                        isBaySelected
                                          ? 'ring-2 ring-teal-700 font-semibold'
                                          : 'hover:border-slate-500'
                                      }`}
                                    >
                                      <span className="truncate font-medium text-slate-800">
                                        {loc.location}
                                      </span>
                                      <span className="inline-flex items-center gap-1 font-mono text-[11px] tabular-nums shrink-0 whitespace-nowrap">
                                        {loc.openBreakdownsCount > 0 && (
                                          <span className="text-red-700 font-semibold">
                                            {loc.openBreakdownsCount}f
                                          </span>
                                        )}
                                        <span className="text-slate-600">
                                          {loc.totalAssets}u
                                        </span>
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Architectural Main Corridor Indicator */}
                    <div className="flex items-center justify-between px-3 py-1 bg-slate-200/70 rounded text-[11px] font-mono text-slate-600">
                      <span>Level {floorNum} Clinical Corridor · West Wing</span>
                      <span>Elevator Core {floorNum}</span>
                      <span>East Wing</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </section>

        {/* Right-Hand Location & Asset Inspector */}
        <aside
          aria-label="Selected department or room inspector"
          className="xl:col-span-4 bg-white border border-slate-200 rounded-lg overflow-hidden xl:sticky xl:top-20"
        >
          {activeZone ? (
            <>
              {/* Inspector Header */}
              <div className="p-4 border-b border-slate-200 bg-slate-50/70 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-500 min-w-0">
                      <MapPin className="h-3.5 w-3.5 text-teal-700 shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        {activeZone.wingCode} · {activeZone.wingLabel}
                      </span>
                    </div>
                    <h2 className="font-display text-base font-bold text-slate-900 mt-0.5">
                      {activeLocationNode
                        ? activeLocationNode.location
                        : activeZone.department}
                    </h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {activeLocationNode
                        ? `${activeZone.department} · Bay Scope`
                        : `Lead engineers: ${
                            activeZone.leadEngineers.slice(0, 2).join(', ') || 'Unassigned'
                          }`}
                    </p>
                  </div>

                  {activeLocationNode && (
                    <button
                      type="button"
                      onClick={() => setSelectedLocation(null)}
                      className="px-2.5 py-1 text-xs font-medium text-teal-700 bg-white border border-teal-300 rounded-md hover:bg-teal-50 whitespace-nowrap shrink-0"
                    >
                      All {activeZone.department} bays
                    </button>
                  )}
                </div>

                {/* Semantic Zone Summary Line */}
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 pt-1">
                  <span className="font-semibold text-slate-800">{activeZone.densityTier}</span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={
                      activeZone.breakdownSeverity === 'High Breakdown'
                        ? 'font-semibold text-red-700'
                        : activeZone.breakdownSeverity === 'Watch'
                          ? 'font-semibold text-amber-700'
                          : 'font-semibold text-emerald-700'
                    }
                  >
                    {activeZone.breakdownSeverity}
                  </span>
                </div>
              </div>

              {/* 4-Metric Hairline Strip */}
              <div className="grid grid-cols-4 divide-x divide-slate-200 border-b border-slate-200 text-center">
                <div className="py-2.5 px-2">
                  <div className="font-mono text-base font-bold text-slate-900 tabular-nums">
                    {activeLocationNode ? activeLocationNode.totalAssets : activeZone.totalAssets}
                  </div>
                  <div className="text-[11px] text-slate-500">Units</div>
                </div>
                <div className="py-2.5 px-2">
                  <div className="font-mono text-base font-bold text-emerald-700 tabular-nums">
                    {activeLocationNode
                      ? activeLocationNode.operationalAssets
                      : activeZone.operationalAssets}
                  </div>
                  <div className="text-[11px] text-slate-500">Ready</div>
                </div>
                <div className="py-2.5 px-2">
                  <div
                    className={`font-mono text-base font-bold tabular-nums ${
                      displayedOpenTickets.length > 0 ? 'text-red-700' : 'text-slate-900'
                    }`}
                  >
                    {displayedOpenTickets.length}
                  </div>
                  <div className="text-[11px] text-slate-500">Open Faults</div>
                </div>
                <div className="py-2.5 px-2">
                  <div className="font-mono text-base font-bold text-slate-900 tabular-nums">
                    {(activeLocationNode
                      ? activeLocationNode.totalDowntimeHours
                      : activeZone.totalDowntimeHours
                    ).toFixed(1)}
                    h
                  </div>
                  <div className="text-[11px] text-slate-500">Downtime</div>
                </div>
              </div>

              {/* Active Fault Tickets in Selected Zone */}
              {displayedOpenTickets.length > 0 && (
                <div className="p-4 border-b border-slate-200 bg-red-50/40 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold text-red-900 flex items-center gap-1.5">
                      <Wrench className="h-3.5 w-3.5 text-red-700 shrink-0" aria-hidden="true" />
                      Active Breakdowns ({displayedOpenTickets.length})
                    </h3>
                    {onNavigate && (
                      <button
                        type="button"
                        onClick={() => onNavigate('breakdowns')}
                        className="text-xs font-medium text-red-800 hover:underline whitespace-nowrap"
                      >
                        Tickets queue
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {displayedOpenTickets.map((ticket) => (
                      <button
                        key={ticket.id}
                        type="button"
                        onClick={() => onSelectAsset(ticket.assetId)}
                        className="w-full text-left p-2.5 rounded-md bg-white border border-red-200 hover:border-red-400 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-semibold text-red-800">
                            {ticket.ticketNumber} · {ticket.assetCode}
                          </span>
                          <PriorityLabel priority={ticket.priority} />
                        </div>
                        <p className="text-xs font-medium text-slate-900 mt-0.5 truncate">
                          {ticket.assetName}
                        </p>
                        <p className="text-[11px] text-slate-600 truncate">
                          {ticket.location} · Assigned: {ticket.assignedEngineer} ·{' '}
                          {ticket.downtimeHours}h
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Equipment Inventory Inside Selected Department / Bay */}
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-slate-900">
                    Equipment Located Here ({displayedAssets.length})
                  </h3>
                  <span className="text-[11px] text-slate-500">Click to open record</span>
                </div>

                {displayedAssets.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">
                    No biomedical equipment currently assigned to this zone.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-md overflow-hidden">
                    {displayedAssets.map((asset) => (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => onSelectAsset(asset.id)}
                        className="w-full text-left p-3 hover:bg-slate-50 transition-colors flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-teal-800">
                              {asset.assetCode}
                            </span>
                            <OperationalStatusLabel status={asset.status} />
                          </div>
                          <p className="text-xs font-semibold text-slate-900 truncate">
                            {asset.name}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {asset.location} · {asset.assignedEngineer}
                          </p>
                        </div>
                        <ArrowUpRight
                          className="h-4 w-4 text-slate-400 shrink-0 mt-0.5"
                          aria-hidden="true"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="p-6 text-center text-xs text-slate-500">
              Select a department zone on the floor plan to view its assets.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
