import { useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { DEPARTMENTS, TODAY_ISO } from '../data/mockData';
import type {
  Asset,
  BioTrackUser,
  CalendarEventStatus,
  NavSection,
  PreventiveMaintenance,
} from '../types/biotrack';
import {
  computeMaintenanceCalendarMonth,
  shiftYearMonth,
} from '../utils/biotrackLogic';

interface MaintenanceCalendarViewProps {
  assets: Asset[];
  pms: PreventiveMaintenance[];
  users: BioTrackUser[];
  onSelectAsset: (assetId: string) => void;
  onNavigate: (section: NavSection) => void;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseYearMonth(isoDate: string): { year: number; month: number } {
  const [y, m] = isoDate.slice(0, 7).split('-').map(Number);
  return { year: y || 2026, month: m || 11 };
}

function formatReadableDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function getEventButtonStyles(type: 'pm' | 'calibration', status: CalendarEventStatus): string {
  if (status === 'Overdue') {
    return 'bg-red-50 border-red-200 text-red-800 hover:bg-red-100';
  }
  if (status === 'Completed') {
    return 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100';
  }
  if (type === 'pm') {
    return 'bg-teal-50 border-teal-200 text-teal-800 hover:bg-teal-100';
  }
  if (status === 'Due Soon') {
    return 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100';
  }
  return 'bg-sky-50 border-sky-200 text-sky-800 hover:bg-sky-100';
}

function getStatusTextColor(status: CalendarEventStatus): string {
  switch (status) {
    case 'Overdue':
      return 'text-red-700 font-semibold';
    case 'Due Soon':
    case 'In Progress':
      return 'text-amber-700 font-medium';
    case 'Completed':
    case 'Compliant':
      return 'text-emerald-700 font-medium';
    case 'Scheduled':
      return 'text-teal-700 font-medium';
  }
}

export function MaintenanceCalendarView({
  assets,
  pms,
  users,
  onSelectAsset,
  onNavigate,
}: MaintenanceCalendarViewProps) {
  const todayYM = parseYearMonth(TODAY_ISO);
  const [currentYM, setCurrentYM] = useState<{ year: number; month: number }>(todayYM);
  const [selectedDate, setSelectedDate] = useState<string>(TODAY_ISO);
  const [eventTypeFilter, setEventTypeFilter] = useState<'all' | 'pm' | 'calibration'>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('All');
  const [engineerFilter, setEngineerFilter] = useState<string>('All');

  const engineers = useMemo(
    () => users.filter((u) => u.active && u.role === 'Biomedical Engineer'),
    [users],
  );

  const calendarSummary = useMemo(
    () =>
      computeMaintenanceCalendarMonth(
        assets,
        pms,
        currentYM.year,
        currentYM.month,
        TODAY_ISO,
        {
          type: eventTypeFilter,
          department: departmentFilter,
          engineer: engineerFilter,
        },
      ),
    [assets, pms, currentYM.year, currentYM.month, eventTypeFilter, departmentFilter, engineerFilter],
  );

  const selectedDay = useMemo(() => {
    const exact = calendarSummary.days.find((d) => d.dateISO === selectedDate && d.inCurrentMonth);
    if (exact) return exact;
    const todayInView = calendarSummary.days.find((d) => d.isToday && d.inCurrentMonth);
    if (todayInView) return todayInView;
    const firstWithEvents = calendarSummary.days.find((d) => d.inCurrentMonth && d.events.length > 0);
    if (firstWithEvents) return firstWithEvents;
    return calendarSummary.days.find((d) => d.inCurrentMonth) ?? calendarSummary.days[0];
  }, [calendarSummary.days, selectedDate]);

  const handleShiftMonth = (delta: number) => {
    const next = shiftYearMonth(currentYM.year, currentYM.month, delta);
    setCurrentYM(next);
    const nextMonthKey = `${next.year}-${String(next.month).padStart(2, '0')}`;
    if (TODAY_ISO.startsWith(nextMonthKey)) {
      setSelectedDate(TODAY_ISO);
    } else {
      setSelectedDate(`${nextMonthKey}-01`);
    }
  };

  const handleJumpToday = () => {
    setCurrentYM(todayYM);
    setSelectedDate(TODAY_ISO);
  };

  const nextDeadlineDay = useMemo(
    () =>
      calendarSummary.days.find(
        (d) => d.inCurrentMonth && d.events.length > 0 && d.dateISO !== selectedDay?.dateISO,
      ) ?? null,
    [calendarSummary.days, selectedDay?.dateISO],
  );

  const isViewingCurrentMonth =
    currentYM.year === todayYM.year && currentYM.month === todayYM.month;

  return (
    <div className="space-y-6">
      {/* Monthly Summary Strip */}
      <section aria-label="Monthly calendar summary" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500">PM Tasks ({calendarSummary.monthLabel})</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-teal-700 tabular-nums">
            {calendarSummary.pmCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">Scheduled & completed inspections</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500">Calibration Deadlines</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {calendarSummary.calibrationCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">Metrological & safety verifications</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500">Overdue Deadlines</p>
          <p
            className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
              calendarSummary.overdueCount > 0 ? 'text-red-700' : 'text-slate-900'
            }`}
          >
            {calendarSummary.overdueCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">Past-due PM or calibration checks</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500">Upcoming Remaining</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-amber-700 tabular-nums">
            {calendarSummary.upcomingCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">Scheduled from {TODAY_ISO} onward</p>
        </div>
      </section>

      {/* Calendar Controls & Legend */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => handleShiftMonth(-1)}
                aria-label="Previous month"
                className="p-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-r border-slate-300"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="px-4 py-1.5 text-sm font-semibold text-slate-900 min-w-[155px] text-center">
                {calendarSummary.monthLabel}
              </span>
              <button
                type="button"
                onClick={() => handleShiftMonth(1)}
                aria-label="Next month"
                className="p-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-l border-slate-300"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {!isViewingCurrentMonth && (
              <button
                type="button"
                onClick={handleJumpToday}
                className="px-3 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 whitespace-nowrap"
              >
                Today ({TODAY_ISO})
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div
              className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
              role="group"
              aria-label="Filter calendar by maintenance type"
            >
              <button
                type="button"
                onClick={() => setEventTypeFilter('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  eventTypeFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Events
              </button>
              <button
                type="button"
                onClick={() => setEventTypeFilter('pm')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  eventTypeFilter === 'pm'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                PM Only
              </button>
              <button
                type="button"
                onClick={() => setEventTypeFilter('calibration')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  eventTypeFilter === 'calibration'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Calibration Only
              </button>
            </div>

            <select
              aria-label="Filter calendar by department"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
            >
              <option value="All">All Departments</option>
              {DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter calendar by engineer"
              value={engineerFilter}
              onChange={(e) => setEngineerFilter(e.target.value)}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg focus:border-teal-700 focus:outline-none"
            >
              <option value="All">All Engineers</option>
              {engineers.map((eng) => (
                <option key={eng.id} value={eng.name}>
                  {eng.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Legend Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-5">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-xs bg-teal-600 inline-block" aria-hidden="true" />
              Preventive Maintenance
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-xs bg-sky-600 inline-block" aria-hidden="true" />
              Calibration Scheduled
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-xs bg-amber-500 inline-block" aria-hidden="true" />
              Calibration Due Soon
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-xs bg-red-600 inline-block" aria-hidden="true" />
              Overdue
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-xs bg-emerald-600 inline-block" aria-hidden="true" />
              Completed
            </span>
          </div>
          <span className="text-[11px] text-slate-500">
            Click a day to view its agenda or click an asset code to open its full record
          </span>
        </div>

        {/* 7-Column Calendar Grid */}
        <div className="overflow-x-auto">
          <div className="min-w-[820px]">
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
              {WEEKDAY_LABELS.map((dayName) => (
                <div
                  key={dayName}
                  className="py-2.5 px-3 text-xs font-semibold text-slate-500 border-r border-slate-200 last:border-r-0"
                >
                  {dayName}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7" role="grid" aria-label={`${calendarSummary.monthLabel} maintenance schedule`}>
              {calendarSummary.days.map((day) => {
                const isSelected = day.inCurrentMonth && selectedDay?.dateISO === day.dateISO;
                const visibleEvents = day.events.slice(0, 3);
                const hiddenCount = day.events.length - visibleEvents.length;

                return (
                  <div
                    key={day.dateISO}
                    role="gridcell"
                    aria-selected={isSelected}
                    onClick={() => {
                      if (day.inCurrentMonth) {
                        setSelectedDate(day.dateISO);
                      }
                    }}
                    className={`min-h-[118px] p-2 border-b border-r border-slate-200 last:border-r-0 transition-colors flex flex-col ${
                      !day.inCurrentMonth
                        ? 'bg-slate-50/70 text-slate-400'
                        : isSelected
                          ? 'bg-teal-50/30 ring-2 ring-inset ring-teal-700 cursor-pointer'
                          : 'bg-white hover:bg-slate-50/70 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span
                        className={`font-mono text-xs tabular-nums ${
                          day.isToday
                            ? 'font-bold text-teal-800'
                            : day.inCurrentMonth
                              ? 'font-semibold text-slate-700'
                              : 'text-slate-400'
                        }`}
                      >
                        {day.dayOfMonth}
                      </span>
                      {day.isToday && (
                        <span className="text-[11px] font-semibold text-teal-700">Today</span>
                      )}
                      {!day.isToday && day.events.length > 0 && (
                        <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                          {day.events.length}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1 flex-1">
                      {visibleEvents.map((evt) => (
                        <button
                          key={evt.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDate(day.dateISO);
                            onSelectAsset(evt.assetId);
                          }}
                          title={`${evt.title} · ${evt.assetCode} ${evt.assetName} (${evt.status})`}
                          className={`w-full text-left px-1.5 py-1 rounded-sm border text-[11px] leading-tight transition-colors ${getEventButtonStyles(
                            evt.type,
                            evt.status,
                          )}`}
                        >
                          <div className="font-mono font-semibold whitespace-nowrap">
                            {evt.type === 'pm' ? 'PM' : 'CAL'} · {evt.assetCode}
                          </div>
                          <div className="truncate opacity-90 font-sans mt-0.5">
                            {evt.status === 'Overdue'
                              ? 'Overdue · '
                              : evt.status === 'Completed'
                                ? 'Done · '
                                : ''}
                            {evt.assetName}
                          </div>
                        </button>
                      ))}

                      {hiddenCount > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDate(day.dateISO);
                          }}
                          className="w-full text-left px-1.5 py-0.5 text-[11px] font-medium text-teal-700 hover:text-teal-900"
                        >
                          +{hiddenCount} more scheduled
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Selected Day Deadlines Panel */}
      <section
        aria-labelledby="selected-day-agenda-heading"
        className="bg-white border border-slate-200 rounded-lg overflow-hidden"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <CalendarDays className="h-4.5 w-4.5 text-teal-700" aria-hidden="true" />
            <div>
              <h2 id="selected-day-agenda-heading" className="text-base font-semibold text-slate-900">
                {selectedDay ? formatReadableDate(selectedDay.dateISO) : 'Selected Date'}
                {selectedDay?.isToday && (
                  <span className="ml-2 text-xs font-medium text-teal-700">Today</span>
                )}
              </h2>
              <p className="text-xs text-slate-500">
                {selectedDay?.events.length ?? 0} preventive maintenance & calibration deadline
                {(selectedDay?.events.length ?? 0) === 1 ? '' : 's'} scheduled
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('pm')}
              className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 whitespace-nowrap"
            >
              PM Schedule
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <span className="text-slate-300" aria-hidden="true">
              |
            </span>
            <button
              type="button"
              onClick={() => onNavigate('calibration')}
              className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 whitespace-nowrap"
            >
              Calibration Log
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {selectedDay && selectedDay.events.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Type</th>
                  <th className="py-2.5 px-4">Equipment</th>
                  <th className="py-2.5 px-4">Department</th>
                  <th className="py-2.5 px-4">Assigned Engineer</th>
                  <th className="py-2.5 px-4">Task</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {selectedDay.events.map((evt) => (
                  <tr key={evt.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 text-xs font-medium text-slate-700 whitespace-nowrap">
                      {evt.type === 'pm' ? 'Preventive Maint.' : 'Calibration'}
                    </td>
                    <td className="py-2.5 px-4">
                      <button
                        type="button"
                        onClick={() => onSelectAsset(evt.assetId)}
                        className="font-medium text-slate-900 hover:text-teal-700 text-left"
                      >
                        {evt.assetName}
                      </button>
                      <div className="font-mono text-xs text-slate-500">{evt.assetCode}</div>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                      {evt.department}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-700 whitespace-nowrap">
                      {evt.assignedEngineer}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                      {evt.title}
                    </td>
                    <td className={`py-2.5 px-4 text-xs whitespace-nowrap ${getStatusTextColor(evt.status)}`}>
                      {evt.status}
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onSelectAsset(evt.assetId)}
                        className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                      >
                        Open Record
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-8 flex flex-wrap items-center justify-between gap-4 text-sm text-slate-500">
            <span>
              No preventive maintenance or calibration deadlines match the current filters on{' '}
              <span className="font-mono text-slate-700">{selectedDay?.dateISO}</span>.
            </span>
            {nextDeadlineDay && (
              <button
                type="button"
                onClick={() => setSelectedDate(nextDeadlineDay.dateISO)}
                className="px-3 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100 whitespace-nowrap"
              >
                Jump to {nextDeadlineDay.dateISO} ({nextDeadlineDay.events.length} scheduled)
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
