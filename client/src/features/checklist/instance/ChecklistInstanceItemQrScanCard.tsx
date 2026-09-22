import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Loader2, ScanLine, AlertCircle, X } from 'lucide-react';
import { useSetChecklistInstanceItemDoneMutation } from '../hook';
import { ChecklistItemCardHeader } from './ChecklistItemCardHeader';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';

interface ChecklistInstanceItemQrScanCardProps {
  item:       ChecklistInstanceItem;
  instanceId: string;
  canWork:    boolean;
  isLocked:   boolean;
}

// Live camera QR/barcode scanning: jsQR only decodes QR codes (not 1D formats like Code128/EAN),
// which is what the reference design's scan icon calls for — grabs frames from a hidden <video>
// onto an offscreen <canvas> every animation frame and runs jsQR against the pixel data until it
// finds a code. A manual text-entry fallback covers devices without a camera, or a denied
// permission, without blocking the item.
export const ChecklistInstanceItemQrScanCard = ({ item, instanceId, canWork, isLocked }: ChecklistInstanceItemQrScanCardProps) => {
  const setItemDone = useSetChecklistInstanceItemDoneMutation(instanceId);
  const [scannedValue, setScannedValue] = useState(item.textValue ?? '');
  const [isScanning, setIsScanning] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const interactive = canWork && !isLocked;

  const stopScan = () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setIsScanning(false);
  };

  useEffect(() => () => stopScan(), []);

  const tick = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    if (code?.data) {
      setScannedValue(code.data);
      stopScan();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  const startScan = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Can't access the camera on this device — enter the code by hand instead.");
      setManualEntry(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsScanning(true);
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setError('Camera permission denied — enter the code manually instead.');
      setManualEntry(true);
    }
  };

  return (
    <div className={`flex flex-col gap-3 p-4 rounded-lg border border-border bg-surface ${isLocked ? 'opacity-75' : ''}`}>
      <ChecklistItemCardHeader
        item={item}
        interactive={interactive}
        reopenPending={setItemDone.isPending}
        onReopen={() => setItemDone.mutate({ itemId: item.id, isDone: false, textValue: item.textValue ?? undefined })}
      />

      {/* The scanned value display is NOT gated on `interactive` — it's evidence, and must stay
          visible to a reviewer/approver after the item (or the whole instance) locks. Only the
          scan/manual-entry/save controls are for the still-editable case. */}
      {scannedValue && !interactive && (
        <p className="text-xs font-display px-2.5 py-1.5 rounded-md bg-background border border-border/60 text-text-secondary w-fit max-w-full break-all">
          Scanned: {scannedValue}
        </p>
      )}

      {interactive && (
        <div className="flex flex-col gap-2">
          {setItemDone.isError && (
            <p className="text-xs text-danger">
              {setItemDone.error instanceof Error ? setItemDone.error.message : "Couldn't save that code."}
            </p>
          )}
          {error && <p className="flex items-center gap-1.5 text-xs text-danger"><AlertCircle size={12} /> {error}</p>}

          {!item.isDone && isScanning && (
            <div className="relative w-full max-w-sm rounded-md overflow-hidden border border-border bg-black">
              <video ref={videoRef} muted playsInline className="w-full h-[220px] object-cover" />
              <div className="absolute inset-6 border-2 border-primary-400/80 rounded-lg pointer-events-none" />
              <button
                onClick={stopScan}
                className="absolute top-2 right-2 flex items-center justify-center size-9 rounded-full bg-black/60 text-white cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                aria-label="Cancel scan"
              >
                <X size={16} />
              </button>
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />

          {!item.isDone && !isScanning && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={startScan}
                className="flex items-center gap-1.5 text-xs font-display font-medium px-2.5 py-1.5 rounded-md border border-border text-text-secondary hover:bg-surface-hover cursor-pointer transition-colors"
              >
                <ScanLine size={12} /> {scannedValue ? 'Scan again' : 'Scan with camera'}
              </button>
              <button
                onClick={() => setManualEntry(v => !v)}
                className="text-[11px] font-display text-text-muted hover:text-text underline decoration-dotted cursor-pointer"
              >
                {manualEntry ? 'Hide manual entry' : 'Enter code manually'}
              </button>
            </div>
          )}

          {scannedValue && (
            <p className="text-xs font-display px-2.5 py-1.5 rounded-md bg-background border border-border/60 text-text-secondary w-fit max-w-full break-all">
              Scanned: {scannedValue}
            </p>
          )}

          {!item.isDone && manualEntry && (
            <input
              value={scannedValue}
              onChange={(e) => setScannedValue(e.target.value)}
              placeholder="Type the code…"
              className="w-full max-w-xs px-2.5 py-1.5 text-sm font-display bg-surface text-text rounded-md border border-border focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
            />
          )}

          {!item.isDone && (
            <button
              onClick={() => scannedValue.trim() && setItemDone.mutate({ itemId: item.id, isDone: true, textValue: scannedValue.trim() })}
              disabled={!scannedValue.trim() || setItemDone.isPending}
              className="w-fit flex items-center gap-1.5 text-xs font-display font-medium px-2.5 py-1.5 rounded-md border border-primary-500/50 text-primary-600 hover:bg-primary-500/10 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {setItemDone.isPending && <Loader2 size={12} className="animate-spin" />}
              Save
            </button>
          )}
        </div>
      )}
    </div>
  );
};
