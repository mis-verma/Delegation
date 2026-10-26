import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, RefreshCw } from 'lucide-react';
import { Button, Modal } from '../../../components';

interface LiveCameraDialogProps {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

type CameraState = 'starting' | 'ready' | 'blocked' | 'missing';

const errorState = (err: unknown): CameraState => {
  const name = err instanceof DOMException ? err.name : '';
  return name === 'NotFoundError' || name === 'OverconstrainedError' ? 'missing' : 'blocked';
};

export const LiveCameraDialog = ({ open, onClose, onCapture }: LiveCameraDialogProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>('starting');
  const [attempt, setAttempt] = useState(0);
  const [capturing, setCapturing] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
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
    if (!video || !video.videoWidth || capturing) return;
    setCapturing(true);
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        setCapturing(false);
        if (!blob) return;
        onCapture(new File([blob], `live-${Date.now()}.jpg`, { type: 'image/jpeg' }));
        onClose();
      },
      'image/jpeg',
      0.94,
    );
  };

  const failed = state === 'blocked' || state === 'missing';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Take a live photo"
      size="lg"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {failed ? (
            <Button onClick={() => { setState('starting'); setAttempt((n) => n + 1); }}>
              <RefreshCw size={15} aria-hidden />
              Try again
            </Button>
          ) : (
            <Button onClick={snap} disabled={state !== 'ready'} isLoading={capturing}>
              <Camera size={15} aria-hidden />
              Capture
            </Button>
          )}
        </div>
      }
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
        <video ref={videoRef} playsInline muted className="size-full object-cover" />
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
      </div>
    </Modal>
  );
};
