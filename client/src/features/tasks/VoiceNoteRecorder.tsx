import { useEffect, useRef, useState } from 'react';
import { Mic, Square, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranscribeVoiceNoteMutation } from './hook';

interface VoiceNoteRecorderProps {
  disabled?: boolean;
  onTranscribed: (transcript: string) => void;
  onBusyChange?: (busy: boolean) => void;
}

type RecorderStatus = 'idle' | 'recording' | 'transcribing';

const MAX_DURATION_MS = 2 * 60 * 1000;
const MIN_DURATION_MS = 700;
const PREFERRED_MIME_TYPES = ['audio/webm', 'audio/mp4', 'audio/ogg'];

const pickMimeType = () => PREFERRED_MIME_TYPES.find(t => MediaRecorder.isTypeSupported(t));

const formatDuration = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const TRANSCRIBE_ERROR_MESSAGE = "Sorry, I couldn't transcribe that. Please try again or type your message.";
const MIC_BLOCKED_MESSAGE = "Microphone access is blocked. Turn it on in your browser's site settings, or type your message instead.";

// Records a short voice note (native MediaRecorder, no extra dependency), transcribes it via
// POST /tasks/ai/transcribe, and hands the resulting text back to the caller — which feeds it
// through the exact same parse/review pipeline a typed message would use. No preview/scrub step:
// a bad transcript just produces a low-confidence draft the review panel already surfaces.
export const VoiceNoteRecorder = ({ disabled, onTranscribed, onBusyChange }: VoiceNoteRecorderProps) => {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const cancelledRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const transcribeMutation = useTranscribeVoiceNoteMutation();

  useEffect(() => {
    onBusyChange?.(status !== 'idle');
  }, [status, onBusyChange]);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  const clearTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // Release the mic if this unmounts mid-recording (e.g. the modal is closed).
  useEffect(() => () => {
    clearTimer();
    stopTracks();
  }, []);

  const finishRecording = (cancelled: boolean) => {
    cancelledRef.current = cancelled;
    clearTimer();
    mediaRecorderRef.current?.stop();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      cancelledRef.current = false;
      chunksRef.current = [];

      const mimeType = pickMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stopTracks();
        clearTimer();
        const duration = Date.now() - startedAtRef.current;

        // Cancelled, or stopped almost instantly (changed their mind) — discard, no upload.
        if (cancelledRef.current || duration < MIN_DURATION_MS) {
          setStatus('idle');
          setElapsedMs(0);
          return;
        }

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setStatus('transcribing');
        transcribeMutation.mutate(blob, {
          onSuccess: (result) => {
            setStatus('idle');
            setElapsedMs(0);
            if (!result.transcript.trim()) {
              toast.error(TRANSCRIBE_ERROR_MESSAGE);
              return;
            }
            onTranscribed(result.transcript);
          },
          onError: () => {
            setStatus('idle');
            setElapsedMs(0);
            toast.error(TRANSCRIBE_ERROR_MESSAGE);
          },
        });
      };

      startedAtRef.current = Date.now();
      recorder.start();
      setStatus('recording');
      setElapsedMs(0);

      // Auto-stop (not cancel) at the cap — by two minutes there's almost certainly real content.
      intervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        setElapsedMs(elapsed);
        if (elapsed >= MAX_DURATION_MS) finishRecording(false);
      }, 250);
    } catch {
      toast.error(MIC_BLOCKED_MESSAGE);
    }
  };

  if (!navigator.mediaDevices?.getUserMedia) return null;

  if (status === 'transcribing') {
    return (
      <button
        type="button"
        disabled
        aria-label="Transcribing voice note"
        className="flex items-center justify-center size-10 rounded-lg bg-surface-hover text-text-muted shrink-0 cursor-not-allowed"
      >
        <Loader2 size={16} className="animate-spin" />
      </button>
    );
  }

  if (status === 'recording') {
    return (
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="flex items-center gap-1.5 px-2.5 h-10 rounded-lg bg-danger/10 text-danger text-xs font-display font-medium tabular-nums">
          <span className="size-2 rounded-full bg-danger animate-pulse" />
          {formatDuration(elapsedMs)}
        </span>
        <button
          type="button"
          onClick={() => finishRecording(true)}
          aria-label="Cancel recording"
          className="flex items-center justify-center size-10 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
        >
          <X size={16} />
        </button>
        <button
          type="button"
          onClick={() => finishRecording(false)}
          aria-label="Stop and send recording"
          className="flex items-center justify-center size-10 rounded-lg bg-danger text-white shadow-sm hover:bg-danger/90 transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
        >
          <Square size={14} fill="currentColor" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startRecording}
      disabled={disabled}
      aria-label="Record a voice note"
      className="flex items-center justify-center size-10 rounded-lg text-text-secondary border border-border bg-surface hover:bg-surface-hover hover:text-primary-700 transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
    >
      <Mic size={16} />
    </button>
  );
};
