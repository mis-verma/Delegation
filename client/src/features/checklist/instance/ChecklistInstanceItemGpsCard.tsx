import { useState } from 'react';
import { Loader2, MapPin, LocateFixed, AlertCircle } from 'lucide-react';
import { useSetChecklistInstanceItemDoneMutation } from '../hook';
import { ChecklistItemCardHeader } from './ChecklistItemCardHeader';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';

interface ChecklistInstanceItemGpsCardProps {
  item:       ChecklistInstanceItem;
  instanceId: string;
  canWork:    boolean;
  isLocked:   boolean;
}

// Mirrors checklistInstance.service.ts's haversineMeters — client-side only for the live "how far
// are you" hint shown before saving; the server re-checks the same math and is the real gate.
const EARTH_RADIUS_METERS = 6371000;
const haversineMeters = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
};

export const ChecklistInstanceItemGpsCard = ({ item, instanceId, canWork, isLocked }: ChecklistInstanceItemGpsCardProps) => {
  const setItemDone = useSetChecklistInstanceItemDoneMutation(instanceId);
  const [captured, setCaptured] = useState<{ lat: number; lng: number; accuracy: number } | null>(
    item.gpsLat != null && item.gpsLng != null ? { lat: item.gpsLat, lng: item.gpsLng, accuracy: item.gpsAccuracy ?? 0 } : null,
  );
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const interactive = canWork && !isLocked;

  const hasTarget = item.gpsTargetLat != null && item.gpsTargetLng != null;
  const distance = captured && hasTarget
    ? haversineMeters(captured.lat, captured.lng, item.gpsTargetLat!, item.gpsTargetLng!)
    : null;
  const withinRadius = distance != null && item.gpsRadiusMeters != null ? distance <= item.gpsRadiusMeters : null;

  const capture = () => {
    if (!interactive || !navigator.geolocation) {
      setCaptureError("This device can't share its location.");
      return;
    }
    setIsCapturing(true);
    setCaptureError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsCapturing(false);
        setCaptured({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        setIsCapturing(false);
        setCaptureError(error.code === error.PERMISSION_DENIED
          ? 'Location permission denied — allow it in your browser settings and try again.'
          : "Couldn't get your location — try again.");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <div className={`flex flex-col gap-3 p-4 rounded-lg border border-border bg-surface ${isLocked ? 'opacity-75' : ''}`}>
      <ChecklistItemCardHeader
        item={item}
        interactive={interactive}
        reopenPending={setItemDone.isPending}
        onReopen={() => setItemDone.mutate({
          itemId: item.id, isDone: false,
          gpsLat: item.gpsLat ?? undefined, gpsLng: item.gpsLng ?? undefined, gpsAccuracy: item.gpsAccuracy ?? undefined,
        })}
      />

      {/* The captured coordinates are NOT gated on `interactive` — they're evidence, and must stay
          visible to a reviewer/approver after the item (or the whole instance) locks. Only the
          capture/save controls are for the still-editable case. */}
      {captured && (
        <div className="flex flex-col gap-1 px-2.5 py-2 rounded-md bg-background border border-border/60 text-xs font-display text-text-secondary">
          <span className="flex items-center gap-1.5"><MapPin size={12} className="text-primary-500" /> {captured.lat.toFixed(6)}, {captured.lng.toFixed(6)} (±{Math.round(captured.accuracy)}m)</span>
          {hasTarget && distance != null && (
            <span className={withinRadius === false ? 'text-danger' : 'text-success'}>
              {Math.round(distance)}m from required location{item.gpsRadiusMeters ? ` (max ${item.gpsRadiusMeters}m)` : ''}
            </span>
          )}
        </div>
      )}

      {interactive && (
        <div className="flex flex-col gap-2">
          {setItemDone.isError && (
            <p className="text-xs text-danger">
              {setItemDone.error instanceof Error ? setItemDone.error.message : "Couldn't save that location."}
            </p>
          )}
          {!item.isDone && captureError && (
            <p className="flex items-center gap-1.5 text-xs text-danger"><AlertCircle size={12} /> {captureError}</p>
          )}

          {!item.isDone && (
            <div className="flex items-center gap-2">
              <button
                onClick={capture}
                disabled={isCapturing}
                className="flex items-center gap-1.5 text-xs font-display font-medium px-2.5 py-1.5 rounded-md border border-border text-text-secondary hover:bg-surface-hover cursor-pointer transition-colors disabled:opacity-50"
              >
                {isCapturing ? <Loader2 size={12} className="animate-spin" /> : <LocateFixed size={12} />}
                {captured ? 'Recapture location' : 'Capture location'}
              </button>
              {captured && (
                <button
                  onClick={() => setItemDone.mutate({ itemId: item.id, isDone: true, gpsLat: captured.lat, gpsLng: captured.lng, gpsAccuracy: captured.accuracy })}
                  disabled={setItemDone.isPending}
                  className="flex items-center gap-1.5 text-xs font-display font-medium px-2.5 py-1.5 rounded-md border border-primary-500/50 text-primary-600 hover:bg-primary-500/10 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {setItemDone.isPending && <Loader2 size={12} className="animate-spin" />}
                  Save
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
