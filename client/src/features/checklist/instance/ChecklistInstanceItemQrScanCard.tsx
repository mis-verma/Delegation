import { memo, useEffect, useId, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { ScanLine, X } from 'lucide-react';
import { useSetChecklistInstanceItemDoneMutation } from '../hook';
import { Button, Input } from '../../../components';
import { ChecklistItemCardHeader } from './ChecklistItemCardHeader';
import { ItemCardShell } from './ItemCardShell';
import { ItemError } from './ItemError';
import { ItemActionButton } from './ItemActionButton';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';

interface ChecklistInstanceItemQrScanCardProps {
  item:       ChecklistInstanceItem;
  instanceId: string;
  canWork:    boolean;
  isLocked:   boolean;
}

const READOUT_CLASS = 't-meta font-display px-3 py-2 rounded-lg bg-surface-hover border border-border/60 text-text-secondary w-fit max-w-full break-all';

export const ChecklistInstanceItemQrScanCard = memo(function ChecklistInstanceItemQrScanCard({ item, instanceId, canWork, isLocked }: ChecklistInstanceItemQrScanCardProps) {
  const codeInputId = useId();
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
      setError("Can't access the camera on this device. Enter the code by hand instead.");
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
      setError('Camera permission denied. Enter the code manually instead.');
      setManualEntry(true);
    }
  };

  return (
    <ItemCardShell isLocked={isLocked}>
      <ChecklistItemCardHeader
        item={item}
        interactive={interactive}
        reopenPending={setItemDone.isPending}
        onReopen={() => setItemDone.mutate({ itemId: item.id, isDone: false, textValue: item.textValue ?? undefined })}
      />

      {scannedValue && !interactive && (
        <p className={READOUT_CLASS}>Scanned: {scannedValue}</p>
      )}

      {interactive && (
        <div className="flex flex-col gap-2">
          <ItemError error={setItemDone.error} fallback="Couldn't save that code." />
          <ItemError error={error} fallback="Couldn't use the camera." />

          {!item.isDone && (
            <div className={`relative w-full max-w-sm rounded-lg overflow-hidden border border-border bg-black ${isScanning ? '' : 'hidden'}`}>
              <video ref={videoRef} muted playsInline className="w-full h-[220px] object-cover" />
              <div className="absolute inset-6 border-2 border-primary-400/80 rounded-lg pointer-events-none" />
              <button
                type="button"
                onClick={stopScan}
                className="absolute top-2 right-2 flex items-center justify-center size-11 sm:size-9 rounded-full bg-black/60 text-white cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                aria-label="Cancel scan"
              >
                <X size={16} />
              </button>
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />

          {!item.isDone && !isScanning && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={startScan}>
                <ScanLine size={13} aria-hidden /> {scannedValue ? 'Scan again' : 'Scan with camera'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setManualEntry(v => !v)} aria-expanded={manualEntry}>
                {manualEntry ? 'Hide manual entry' : 'Enter code manually'}
              </Button>
            </div>
          )}

          {scannedValue && (
            <p className={READOUT_CLASS}>Scanned: {scannedValue}</p>
          )}

          {!item.isDone && manualEntry && (
            <Input
              id={codeInputId}
              label="Code"
              labelClassName="sr-only"
              value={scannedValue}
              onChange={(e) => setScannedValue(e.target.value)}
              placeholder="Type the code…"
              containerClassName="max-w-xs"
              className="h-11 sm:h-9 rounded-lg"
            />
          )}

          {!item.isDone && (
            <ItemActionButton
              className="self-start"
              onClick={() => scannedValue.trim() && setItemDone.mutate({ itemId: item.id, isDone: true, textValue: scannedValue.trim() })}
              disabled={!scannedValue.trim()}
              isLoading={setItemDone.isPending}
            >
              Save
            </ItemActionButton>
          )}
        </div>
      )}
    </ItemCardShell>
  );
});
