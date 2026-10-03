import { memo, useState } from 'react';
import { MapPin, LocateFixed } from 'lucide-react';
import { useSetChecklistInstanceItemDoneMutation } from '../hook';
import { Button } from '../../../components';
import { ChecklistItemCardHeader } from './ChecklistItemCardHeader';
import { ItemCardShell } from './ItemCardShell';
import { ItemError } from './ItemError';
import { ItemActionButton } from './ItemActionButton';
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

export const ChecklistInstanceItemGpsCard = memo(function ChecklistInstanceItemGpsCard({ item, instanceId, canWork, isLocked }: ChecklistInstanceItemGpsCardProps) {
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
          ? 'Location permission denied. Allow it in your browser settings and try again.'
          : "Couldn't get your location. Try again.");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <ItemCardShell isLocked={isLocked}>
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
        <div className="flex flex-col gap-1 px-3 py-2 rounded-lg bg-surface-hover border border-border/60 text-xs font-display text-text-secondary">
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
          <ItemError error={setItemDone.error} fallback="Couldn't save that location." />
          {!item.isDone && <ItemError error={captureError} fallback="Couldn't get your location." />}

          {!item.isDone && (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={capture} isLoading={isCapturing}>
                {!isCapturing && <LocateFixed size={13} aria-hidden />}
                {captured ? 'Recapture location' : 'Capture location'}
              </Button>
              {captured && (
                <ItemActionButton
                  onClick={() => setItemDone.mutate({ itemId: item.id, isDone: true, gpsLat: captured.lat, gpsLng: captured.lng, gpsAccuracy: captured.accuracy })}
                  isLoading={setItemDone.isPending}
                >
                  Save
                </ItemActionButton>
              )}
            </div>
          )}
        </div>
      )}
    </ItemCardShell>
  );
});
