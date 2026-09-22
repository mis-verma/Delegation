// Shared decorative overlay for the navy "hero" stat-card family (KpiStrip's cards, QuickFilterStats'
// lead tile, StatusBreakdownCard's navy variant — its only three callers). Used to be four
// concentric rings, a blurred glow and two skewed hairlines; trimmed down to one crisp ring and
// nothing else — the glow (a 10%-opacity coral blur) and the extra rings were reading as a fuzzy,
// washed-out smudge behind the number rather than a considered accent. One clean ring, full stop.
// `scale="wide"` sizes it for a short, wide surface; `scale="tall"` sizes it down for a narrower,
// taller one; `scale="compact"` is smaller still, for a small stat-card-sized surface where even
// the "tall" ring would overwhelm the available space.
interface AdminChromeAccentsProps {
  scale?: 'wide' | 'tall' | 'compact';
}

const RING: Record<Required<AdminChromeAccentsProps>['scale'], string> = {
  wide: '-top-20 -right-14 size-56',
  tall: '-top-10 -right-10 size-36',
  compact: '-top-8 -right-8 size-24',
};

export const AdminChromeAccents = ({ scale = 'wide' }: AdminChromeAccentsProps) => (
  <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
    <span className={`absolute rounded-full border border-white/15 ${RING[scale]}`} />
  </div>
);
