import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  DEFAULT_CARD_ORDER,
  DEFAULT_CARD_SIZES,
  ADMIN_ONLY_CARDS,
  LAYOUT_VERSION,
  NEW_IN_V3,
  LEGACY_V1_DEFAULT_ORDER,
  LEGACY_V1_ADMIN_ONLY,
  type DashboardCardId,
  type DashboardCardSize,
} from './dashboardLayout';

interface StoredLayout {
  /** Absent on layouts saved before versioning existed (those are version 1). */
  version?: number;
  order: DashboardCardId[];
  sizes: Partial<Record<DashboardCardId, DashboardCardSize>>;
}

interface LoadedLayout {
  version: number;
  /** Every id as it was saved, including ones this version no longer has. Only used to recognise
   *  an untouched old default. */
  rawOrder: string[];
  order: DashboardCardId[];
  sizes: Partial<Record<DashboardCardId, DashboardCardSize>>;
}

const STORAGE_PREFIX = 'tm-dashboard-layout';

const isDashboardCardId = (value: unknown): value is DashboardCardId =>
  typeof value === 'string' && (DEFAULT_CARD_ORDER as readonly string[]).includes(value);

const loadStoredLayout = (key: string): LoadedLayout | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredLayout>;
    if (!Array.isArray(parsed.order)) return null;
    const rawOrder = (parsed.order as unknown[]).filter((id): id is string => typeof id === 'string');
    return {
      version: typeof parsed.version === 'number' ? parsed.version : 1,
      rawOrder,
      order: rawOrder.filter(isDashboardCardId),
      sizes: parsed.sizes && typeof parsed.sizes === 'object' ? parsed.sizes : {},
    };
  } catch {
    // Corrupt or blocked storage reads the same as "nothing saved yet" — falls through to
    // DEFAULT_CARD_ORDER below rather than breaking the dashboard over a bad localStorage value.
    return null;
  }
};

// Drag-reorder without pulling @dnd-kit into the home bundle just for this helper.
const moveItem = <T,>(list: readonly T[], from: number, to: number): T[] => {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

/**
 * Drag-to-reorder and small/big sizing for the dashboard's card grid — gated behind an explicit
 * `isCustomizing` mode (HomePage only shows drag handles/size toggles while it's on) so the
 * default view stays exactly what it was before this existed.
 *
 * Saved per signed-in account, not per browser — a chosen layout is a personal preference tied to
 * who's logged in, not a device setting like the theme toggle.
 *
 * Versioned: when the default order changes (LAYOUT_VERSION), a saved layout that is still exactly
 * the previous default is moved to the new default, and one the user rearranged keeps their order.
 */
export const useDashboardLayout = (isOrgWideRole: boolean) => {
  const { user } = useAuth();
  const storageKey = `${STORAGE_PREFIX}-${user?.id ?? 'anon'}`;

  const visibleCards = useMemo(
    () => DEFAULT_CARD_ORDER.filter((id) => isOrgWideRole || !ADMIN_ONLY_CARDS.has(id)),
    [isOrgWideRole],
  );

  // Drops any id a stored order still has but this viewer can no longer see (e.g. their role
  // changed since they last customized), then appends any card they *can* see that the stored
  // order predates — at the end, not scattered in, so an old layout doesn't silently reshuffle
  // around a card the user never placed themselves.
  const reconcile = useCallback((storedOrder: DashboardCardId[]): DashboardCardId[] => {
    const visibleSet = new Set(visibleCards);
    const kept = storedOrder.filter((id) => visibleSet.has(id));
    const missing = visibleCards.filter((id) => !kept.includes(id));
    return [...kept, ...missing];
  }, [visibleCards]);

  // True when a v1 layout is just the old default for this viewer's role, i.e. the user never
  // rearranged anything and so has no custom order worth preserving.
  const isUntouchedLegacyDefault = useCallback((rawOrder: string[]): boolean => {
    const legacyForRole = LEGACY_V1_DEFAULT_ORDER.filter((id) => isOrgWideRole || !LEGACY_V1_ADMIN_ONLY.has(id));
    return rawOrder.length === legacyForRole.length && rawOrder.every((id, i) => id === legacyForRole[i]);
  }, [isOrgWideRole]);

  const [order, setOrder] = useState<DashboardCardId[]>(() => {
    const stored = loadStoredLayout(storageKey);
    if (!stored) return [...visibleCards];
    if (stored.version < LAYOUT_VERSION && isUntouchedLegacyDefault(stored.rawOrder)) return [...visibleCards];
    // A layout saved before version 3 predates the three worklist cards: they go first, where they used
    // to be pinned, and the rest keeps the order the person chose.
    if (stored.version < 3) {
      const front = NEW_IN_V3.filter((id) => visibleCards.includes(id));
      return [...front, ...reconcile(stored.order.filter((id) => !NEW_IN_V3.includes(id)))];
    }
    return reconcile(stored.order);
  });
  const [sizes, setSizes] = useState<Record<DashboardCardId, DashboardCardSize>>(() => {
    const stored = loadStoredLayout(storageKey);
    return { ...DEFAULT_CARD_SIZES, ...stored?.sizes };
  });
  const [isCustomizing, setIsCustomizing] = useState(false);

  // Re-reconciles if the viewer's visible card set changes after mount — `user` (and so
  // `isOrgWideRole`) is often still null on the very first render, right after a fresh login, so
  // without this an ADMIN would have Compliance/Compare permanently missing from `order` for the
  // rest of the session once their real role loads in a tick later. Adjusted during render
  // (React's documented pattern for resetting state off a prop change) rather than in an effect,
  // so it commits in the same render `isOrgWideRole` actually changes.
  const [prevIsOrgWideRole, setPrevIsOrgWideRole] = useState(isOrgWideRole);
  if (isOrgWideRole !== prevIsOrgWideRole) {
    setPrevIsOrgWideRole(isOrgWideRole);
    setOrder((prev) => reconcile(prev));
  }

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ version: LAYOUT_VERSION, order, sizes } satisfies StoredLayout));
    } catch {
      // A layout that can't be saved just resets on the next reload — not worth failing anything
      // over (private window, full storage, disabled site data).
    }
  }, [storageKey, order, sizes]);

  const moveCard = useCallback((activeId: DashboardCardId, overId: DashboardCardId) => {
    setOrder((prev) => {
      const from = prev.indexOf(activeId);
      const to = prev.indexOf(overId);
      if (from === -1 || to === -1 || from === to) return prev;
      return moveItem(prev, from, to);
    });
  }, []);

  const setCardSize = useCallback((id: DashboardCardId, size: DashboardCardSize) => {
    setSizes((prev) => ({ ...prev, [id]: size }));
  }, []);

  const reset = useCallback(() => {
    setOrder([...visibleCards]);
    setSizes({ ...DEFAULT_CARD_SIZES });
  }, [visibleCards]);

  return { order, sizes, isCustomizing, setIsCustomizing, moveCard, setCardSize, reset };
};
