import { memo, useRef, useState, type PointerEvent } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '../../../components';

const MIN_INK_PX = 40;

interface SignaturePadCanvasProps {
  label:    string;
  disabled?: boolean;
  onChange: (dataUrl: string | null) => void;
}

export const SignaturePadCanvas = memo(function SignaturePadCanvas({ label, disabled, onChange }: SignaturePadCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const inkRef = useRef(0);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const getContext = () => canvasRef.current?.getContext('2d') ?? null;

  const pointFromEvent = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handlePointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const ctx = getContext();
    if (!ctx) return;
    drawingRef.current = true;
    const { x, y } = pointFromEvent(e);
    lastPointRef.current = { x, y };
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handlePointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (disabled || !drawingRef.current) return;
    const ctx = getContext();
    if (!ctx) return;
    const { x, y } = pointFromEvent(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e293b';
    ctx.lineTo(x, y);
    ctx.stroke();
    const last = lastPointRef.current;
    if (last) inkRef.current += Math.hypot(x - last.x, y - last.y);
    lastPointRef.current = { x, y };
    if (!hasDrawn) setHasDrawn(true);
  };

  const finishStroke = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    const canvas = canvasRef.current;
    if (canvas && inkRef.current >= MIN_INK_PX) onChange(canvas.toDataURL('image/png'));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    inkRef.current = 0;
    setHasDrawn(false);
    onChange(null);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 min-h-8">
        <span className="text-xs font-display font-medium text-text-secondary">{label}</span>
        {hasDrawn && !disabled && (
          <Button variant="ghost" size="sm" onClick={clear}>
            <RotateCcw size={12} aria-hidden /> Clear
          </Button>
        )}
      </div>
      <div className="rounded-lg border border-border bg-surface p-1.5">
        <canvas
          ref={canvasRef}
          width={480}
          height={140}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerLeave={finishStroke}
          className={`w-full h-[140px] rounded-sm bg-white touch-none ${disabled ? 'opacity-60' : 'cursor-crosshair'}`}
        />
      </div>
    </div>
  );
});
