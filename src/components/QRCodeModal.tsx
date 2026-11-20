import { ExternalLink, Printer, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { Asset } from '../types/biotrack';

interface QRCodeModalProps {
  asset: Asset | null;
  onClose: () => void;
  onOpenAssetRecord: (assetId: string) => void;
}

export function QRCodeModal({ asset, onClose, onOpenAssetRecord }: QRCodeModalProps) {
  if (!asset) return null;

  const qrUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?asset=${encodeURIComponent(asset.assetCode)}`
      : `https://biotrack.local/?asset=${encodeURIComponent(asset.assetCode)}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-modal-title"
    >
      <div className="w-full max-w-md rounded-xl bg-white border border-slate-200 shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 no-print">
          <div>
            <h2 id="qr-modal-title" className="text-base font-semibold text-slate-900">
              Equipment QR Tag
            </h2>
            <p className="text-xs text-slate-500">
              Scan to open live maintenance & calibration record
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close QR modal"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center text-center space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <QRCodeSVG value={qrUrl} size={184} level="M" includeMargin={false} />
          </div>

          <div className="space-y-1">
            <p className="font-mono text-sm font-semibold text-teal-800">{asset.assetCode}</p>
            <h3 className="text-base font-semibold text-slate-900">{asset.name}</h3>
            <p className="text-xs text-slate-600">
              {asset.manufacturer} · {asset.model}
            </p>
            <p className="font-mono text-xs text-slate-500">
              S/N: {asset.serialNumber} · {asset.department}
            </p>
          </div>

          <div className="w-full rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-left">
            <p className="text-xs text-slate-500">Encoded Asset Lookup URI</p>
            <p className="font-mono text-xs text-slate-700 break-all mt-0.5">{qrUrl}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-200 bg-slate-50 no-print">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            Print Label
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenAssetRecord(asset.id);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 whitespace-nowrap"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            Open Asset Record
          </button>
        </div>
      </div>
    </div>
  );
}
