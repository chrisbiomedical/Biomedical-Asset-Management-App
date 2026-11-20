import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  PauseCircle,
  Wrench,
} from 'lucide-react';
import type {
  BreakdownPriority,
  BreakdownStatus,
  CalibrationResult,
  OperationalStatus,
  PMStatus,
} from '../types/biotrack';

export function OperationalStatusLabel({ status }: { status: OperationalStatus }) {
  switch (status) {
    case 'Operational':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Operational
        </span>
      );
    case 'Under Repair':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Under Repair
        </span>
      );
    case 'Under Maintenance':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
          <Wrench className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Under Maintenance
        </span>
      );
    case 'Calibration Due':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Calibration Due
        </span>
      );
    case 'Out of Service':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 whitespace-nowrap">
          <PauseCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Out of Service
        </span>
      );
  }
}

export function PMStatusLabel({ status }: { status: PMStatus }) {
  switch (status) {
    case 'Completed':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Completed
        </span>
      );
    case 'Overdue':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Overdue
        </span>
      );
    case 'In Progress':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
          <Wrench className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          In Progress
        </span>
      );
    case 'Scheduled':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 whitespace-nowrap">
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Scheduled
        </span>
      );
  }
}

export function BreakdownStatusLabel({ status }: { status: BreakdownStatus }) {
  switch (status) {
    case 'Resolved':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Resolved
        </span>
      );
    case 'Open':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Open
        </span>
      );
    case 'In Progress':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
          <Wrench className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          In Progress
        </span>
      );
    case 'Awaiting Parts':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Awaiting Parts
        </span>
      );
  }
}

export function PriorityLabel({ priority }: { priority: BreakdownPriority }) {
  switch (priority) {
    case 'Critical':
      return <span className="text-xs font-semibold text-red-700">Critical</span>;
    case 'High':
      return <span className="text-xs font-semibold text-amber-700">High</span>;
    case 'Medium':
      return <span className="text-xs font-medium text-slate-700">Medium</span>;
    case 'Low':
      return <span className="text-xs font-medium text-slate-500">Low</span>;
  }
}

export function CalibrationResultLabel({ result }: { result: CalibrationResult }) {
  switch (result) {
    case 'Pass':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Pass
        </span>
      );
    case 'Fail':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Fail
        </span>
      );
    case 'Conditional':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Conditional
        </span>
      );
  }
}
