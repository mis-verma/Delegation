import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, RefreshCw, X } from 'lucide-react';
import { Button, Modal } from '../../../components';
import { MAX_LIVE_PHOTOS } from './cameraSupport';

interface LiveCameraDialogProps {
  open: boolean;
  onClose: () => void;
  onCapture?: (file: File) => void;
  multi?: boolean;
  limit?: number;
  onDone?: (files: File[]) => void;
  onFallback?: () => void;
}

type CameraState = 'starting' | 'ready' | 'blocked' | 'missing';

interface Shot {
  id: string;
  file: File;
  url: string;
}

const errorState = (err: unknown): CameraState => {
  const name = err instanceof DOMException ? err.name : '';
  return name === 'NotFoundError' || name === 'OverconstrainedError' ? 'missing' : 'blocked';
};

export const LiveCameraDialog = ({ open, onClose, onCapture, multi = false, limit = MAX_LIVE_PHOTOS, onDone, onFallback }: LiveCameraDialogProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const shotsRef = useRef<Shot[]>([]);
  const [state, setState] = useState<CameraState>('starting');
  const [attempt, setAttempt] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [shots, setShots] = useState<Shot[]>([]);
  const cap = Math.max(1, Math.min(limit, MAX_LIVE_PHOTOS));
  const full = multi && shots.length >= cap;

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    shotsRef.current = shots;
  }, [shots]);

  useEffect(() => () => {
    for (const shot of shotsRef.current) URL.revokeObjectURL(shot.url);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          void video.play().catch(() => undefined);
        }
        setState('ready');
      })
      .catch((err: unknown) => {
        if (!cancelled) setState(errorState(err));
      });
    return () => {
      cancelled = true;
      stop();
    };
  }, [open, attempt, stop]);

  const snap = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || capturing || full) return;
    setCapturing(true);
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        setCapturing(false);
        if (!blob) return;
        const file = new File([blob], `live-${Date.now()}.jpg`, { type: 'image/jpeg' });
        if (multi) {
          setShots((prev) => [...prev, { id: `${file.name}-${prev.length}`, file, url: URL.createObjectURL(file) }]);
          return;
        }
        onCapture?.(file);
        onClose();
      },
      'image/jpeg',
      0.94,
    );
  };

  const removeShot = (id: string) => {
    setShots((prev) => {
      const gone = prev.find((shot) => shot.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((shot) => shot.id !== id);
    });
  };

  const finish = () => {
    if (shots.length) onDone?.(shots.map((shot) => shot.file));
    onClose();
  };

  const failed = state === 'blocked' || state === 'missing';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={multi ? 'Take live photos' : 'Take a live photo'}
      size="lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} className="max-sm:h-11">Cancel</Button>
          {failed ? (
            <>
              {onFallback && <Button variant="outline" onClick={onFallback} className="max-sm:h-11">Use the phone camera</Button>}
              <Button onClick={() => { setState('starting'); setAttempt((n) => n + 1); }} className="max-sm:h-11">
                <RefreshCw size={15} aria-hidden />
                Try again
              </Button>
            </>
          ) : (
            <>
              <Button variant={multi && shots.length ? 'outline' : 'primary'} onClick={snap} disabled={state !== 'ready' || full} isLoading={capturing} className="max-sm:h-11">
                <Camera size={15} aria-hidden />
                {full ? 'Limit reached' : 'Capture'}
              </Button>
              {multi && (
                <Button onClick={finish} disabled={shots.length === 0} className="max-sm:h-11">
                  {shots.length === 0 ? 'Done' : `Done, add ${shots.length}`}
                </Button>
              )}
            </>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="relative w-full overflow-hidden rounded-xl bg-black max-sm:aspect-[3/4] sm:aspect-video">
          <video ref={videoRef} playsInline muted className="size-full object-contain" />
          {state === 'starting' && (
            <p className="absolute inset-0 flex items-center justify-center t-meta font-display font-semibold text-white/80">Starting the camera...</p>
          )}
          {failed && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-white">
              <CameraOff className="size-8" aria-hidden />
              <p className="t-card font-display font-semibold">
                {state === 'blocked' ? 'The camera is blocked' : 'No camera found'}
              </p>
              <p className="t-meta font-display text-white/70">
                {state === 'blocked'
                  ? 'Allow camera access for this site in your browser, then press Try again.'
                  : 'Connect a camera, or open this checklist on a phone.'}
              </p>
            </div>
          )}
          {multi && !failed && (
            <span role="status" className="absolute left-2 top-2 rounded-full bg-black/60 px-2.5 py-1 t-meta font-display font-semibold tabular-nums text-white">
              {shots.length} of {cap}
            </span>
          )}
        </div>
        {multi && shots.length > 0 && (
          <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Photos taken">
            {shots.map((shot, index) => (
              <li key={shot.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => removeShot(shot.id)}
                  aria-label={`Remove photo ${index + 1}`}
                  className="relative block size-16 cursor-pointer overflow-hidden rounded-lg border border-border outline-none transition-colors duration-150 hover:border-danger focus-visible:ring-2 focus-visible:ring-primary-500/50 pointer-coarse:size-20"
                >
                  <img src={shot.url} alt="" className="size-full object-cover" />
                  <span className="absolute right-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-black/70 text-white">
                    <X size={12} aria-hidden />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
};
