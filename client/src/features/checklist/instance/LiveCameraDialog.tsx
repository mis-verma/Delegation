import { useCallback, useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Camera, CameraOff, Check, Flashlight, FlashlightOff, RefreshCw, SwitchCamera, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../../../components';
import { useCloseOnBack } from '../../../lib/useCloseOnBack';
import { MAX_LIVE_PHOTOS, type CameraFacing } from './cameraSupport';

interface LiveCameraDialogProps {
  open: boolean;
  onClose: () => void;
  onCapture?: (file: File) => void;
  multi?: boolean;
  limit?: number;
  onDone?: (files: File[]) => void;
  onFallback?: () => void;
  initialFacing?: CameraFacing;
}

type CameraState = 'starting' | 'ready' | 'blocked' | 'missing';

interface Shot {
  id: string;
  file: File;
  url: string;
}

/** Torch isn't in TS's MediaTrack types yet, though Chromium and most Android browsers support it. */
type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };
type TorchConstraintSet = MediaTrackConstraintSet & { torch?: boolean };

const CONTROL_BUTTON =
  'flex size-11 items-center justify-center rounded-full bg-black/55 text-white outline-none transition-colors duration-150 ease-out hover:bg-black/75 disabled:opacity-40 disabled:hover:bg-black/55 cursor-pointer focus-visible:ring-2 focus-visible:ring-white/60 [-webkit-tap-highlight-color:transparent]';

const errorState = (err: unknown): CameraState => {
  const name = err instanceof DOMException ? err.name : '';
  return name === 'NotFoundError' || name === 'OverconstrainedError' ? 'missing' : 'blocked';
};

export const LiveCameraDialog = ({ open, onClose, onCapture, multi = false, limit = MAX_LIVE_PHOTOS, onDone, onFallback, initialFacing = 'environment' }: LiveCameraDialogProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const shotsRef = useRef<Shot[]>([]);
  const [state, setState] = useState<CameraState>('starting');
  const [attempt, setAttempt] = useState(0);
  const [facing, setFacing] = useState<CameraFacing>(initialFacing);
  const [capturing, setCapturing] = useState(false);
  const [shots, setShots] = useState<Shot[]>([]);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const cap = Math.max(1, Math.min(limit, MAX_LIVE_PHOTOS));
  const full = multi && shots.length >= cap;
  const front = facing === 'user';

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    trackRef.current = null;
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
      .getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 2560 }, height: { ideal: 1440 } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0] ?? null;
        trackRef.current = track;
        const caps = track?.getCapabilities?.() as TorchCapabilities | undefined;
        setTorchSupported(!!caps?.torch);
        setTorchOn(false);
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
  }, [open, attempt, facing, stop]);

  useCloseOnBack(open, () => {
    onClose();
    return true;
  });

  const flip = () => {
    setState('starting');
    setFacing((f) => (f === 'environment' ? 'user' : 'environment'));
  };

  const toggleTorch = async () => {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as TorchConstraintSet] });
      setTorchOn(next);
    } catch {
      // Some browsers report torch as a capability but refuse the constraint mid-stream; leave the toggle as it was.
    }
  };

  /**
   * The front preview is flipped so framing yourself feels like a mirror, but the canvas draws
   * the frame as the camera sees it. What gets saved is the real scene, so text in a selfie
   * reads the right way round.
   */
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
  const title = multi ? 'Take live photos' : 'Take a live photo';

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[90] bg-black" />
        <DialogPrimitive.Content aria-label={title} aria-describedby={undefined} className="fixed inset-0 z-[90] flex flex-col overflow-hidden bg-black outline-none">
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>

          <div className="relative flex-1 min-h-0">
            <video ref={videoRef} playsInline muted className={cn('absolute inset-0 size-full object-cover', front && '-scale-x-100')} />

            {state === 'starting' && !failed && (
              <p className="absolute inset-0 flex items-center justify-center t-card font-display font-semibold text-white/80">Starting the camera...</p>
            )}

            {failed && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-white">
                <CameraOff className="size-10" aria-hidden />
                <p className="t-section font-display font-semibold">
                  {state === 'blocked' ? 'The camera is blocked' : 'No camera found'}
                </p>
                <p className="t-card font-display text-white/70 max-w-xs">
                  {state === 'blocked'
                    ? 'Allow camera access for this site in your browser, then press Try again.'
                    : 'Connect a camera, or open this checklist on a phone.'}
                </p>
              </div>
            )}

            <div
              style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
              className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 px-3"
            >
              <button type="button" onClick={onClose} aria-label="Close camera" className={cn('pointer-events-auto', CONTROL_BUTTON)}>
                <X size={20} aria-hidden />
              </button>
              {multi && !failed && (
                <span role="status" className="pointer-events-auto rounded-full bg-black/55 px-3 py-2 t-meta font-display font-semibold tabular-nums text-white">
                  {shots.length} of {cap}
                </span>
              )}
              {!failed && torchSupported && !front && (
                <button
                  type="button"
                  onClick={() => void toggleTorch()}
                  disabled={state !== 'ready'}
                  aria-label={torchOn ? 'Turn off the flashlight' : 'Turn on the flashlight'}
                  aria-pressed={torchOn}
                  title={torchOn ? 'Turn off the flashlight' : 'Turn on the flashlight'}
                  className={cn('pointer-events-auto', CONTROL_BUTTON, torchOn && 'bg-white text-black hover:bg-white/90')}
                >
                  {torchOn ? <Flashlight size={18} aria-hidden /> : <FlashlightOff size={18} aria-hidden />}
                </button>
              )}
            </div>

            {!failed && (
              <button
                type="button"
                onClick={flip}
                disabled={state !== 'ready'}
                aria-label={front ? 'Switch to back camera' : 'Switch to front camera'}
                title={front ? 'Switch to back camera' : 'Switch to front camera'}
                style={{ bottom: 'max(7rem, calc(env(safe-area-inset-bottom) + 6.5rem))' }}
                className={cn('absolute right-3 z-10', CONTROL_BUTTON)}
              >
                <SwitchCamera size={18} aria-hidden />
              </button>
            )}

            {front && !failed && (
              <p className="pointer-events-none absolute inset-x-0 top-14 z-10 px-6 text-center t-meta font-display font-medium text-white/70">
                The preview is flipped like a mirror so you can frame yourself. The photo saves the way the camera sees it.
              </p>
            )}
          </div>

          <div
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
            className="relative z-10 flex shrink-0 flex-col gap-3 bg-black px-4 pt-3"
          >
            {multi && shots.length > 0 && (
              <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Photos taken">
                {shots.map((shot, index) => (
                  <li key={shot.id} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => removeShot(shot.id)}
                      aria-label={`Remove photo ${index + 1}`}
                      className="relative block size-16 cursor-pointer overflow-hidden rounded-lg border border-white/20 outline-none transition-colors duration-150 hover:border-danger focus-visible:ring-2 focus-visible:ring-white/60 pointer-coarse:size-20"
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

            {failed ? (
              <div className="flex items-center justify-center gap-2 pb-2">
                {onFallback && (
                  <Button variant="outline" onClick={onFallback} className="h-11 border-white/30 bg-transparent text-white hover:bg-white/10">
                    Use the phone camera
                  </Button>
                )}
                <Button onClick={() => { setState('starting'); setAttempt((n) => n + 1); }} className="h-11">
                  <RefreshCw size={15} aria-hidden />
                  Try again
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-6 pb-2">
                <button
                  type="button"
                  onClick={snap}
                  disabled={state !== 'ready' || full || capturing}
                  aria-label={full ? 'Photo limit reached' : 'Capture photo'}
                  className="group relative flex size-18 shrink-0 items-center justify-center rounded-full border-4 border-white outline-none transition-transform duration-150 ease-out disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-white/70 active:scale-95 [-webkit-tap-highlight-color:transparent]"
                >
                  <span className={cn('flex size-14 items-center justify-center rounded-full bg-white transition-transform duration-150 ease-out', capturing ? 'scale-75' : 'group-active:scale-90')}>
                    {capturing && <Camera size={22} className="text-black/60 motion-safe:animate-pulse" aria-hidden />}
                  </span>
                </button>
                {multi && (
                  <button
                    type="button"
                    onClick={finish}
                    disabled={shots.length === 0}
                    aria-label={shots.length === 0 ? 'Done' : `Done, add ${shots.length} photos`}
                    className={cn('absolute right-4 flex h-11 items-center gap-1.5 rounded-full px-4 t-meta font-display font-semibold outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-white/60', shots.length === 0 ? 'cursor-not-allowed bg-white/15 text-white/40' : 'cursor-pointer bg-white text-black hover:bg-white/90')}
                  >
                    <Check size={16} aria-hidden />
                    {shots.length === 0 ? 'Done' : `Add ${shots.length}`}
                  </button>
                )}
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
