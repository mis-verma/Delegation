import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { DashboardViewConfig } from './dashboardView';
import {
  DEFAULT_CARD_ORDER,
  DEFAULT_CARD_SIZES,
  ADMIN_ONLY_CARDS,
  HOD_ONLY_CARDS,
  HOD_HIDDEN_CARDS,
  PC_HIDDEN_CARDS,
  REQUEST_REVIEWER_CARDS,
  LAYOUT_VERSION,
  NEW_IN_V3,
  LEGACY_V12_DEFAULT_ORDER,
  LEGACY_V13_DEFAULT_ORDER,
  LEGACY_V14_DEFAULT_ORDER,
  LEGACY_V16_DEFAULT_ORDER,
  TEAM_VIEW_CARDS,
  LEGACY_V1_DEFAULT_ORDER,
  LEGACY_V1_ADMIN_ONLY,
  type DashboardCardId,
  type DashboardCardSize,
} from './dashboardLayout';

interface StoredLayout {
  version?: number;
  order: DashboardCardId[];
  sizes: Partial<Record<DashboardCardId, DashboardCardSize>>;
  hidden?: DashboardCardId[];
}

interface LoadedLayout {
  version: number;
  rawOrder: string[];
  order: DashboardCardId[];
  sizes: Partial<Record<DashboardCardId, DashboardCardSize>>;
  hidden: DashboardCardId[];
}

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
      hidden: Array.isArray(parsed.hidden) ? (parsed.hidden as unknown[]).filter(isDashboardCardId) : [],
    };
  } catch {
    return null;
  }
};

const sizesFrom = (stored: LoadedLayout | null): Record<DashboardCardId, DashboardCardSize> => {
  const saved = { ...stored?.sizes };
  if (stored && stored.version < 4) delete saved.myScores;
  if (stored && stored.version < 10) { delete saved.needsApproval; delete saved.exceptions; }
  if (stored && stored.version < 9) delete saved.myScores;
  if (stored && stored.version < 6) delete saved.kpiStrip;
  if (stored && stored.version < 16) delete saved.streak;
  return { ...DEFAULT_CARD_SIZES, ...saved };
};

const moveItem = <T,>(list: readonly T[], from: number, to: number): T[] => {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

export const useDashboardLayout = (view: DashboardViewConfig) => {
  const { user } = useAuth();
  const isOrgWideRole = view.showOversightCards;
  const storageKey = `${view.layoutKeyPrefix}-${user?.id ?? 'anon'}`;

  const visibleCards = useMemo<DashboardCardId[]>(
    () => view.order.filter((id) => (isOrgWideRole || !ADMIN_ONLY_CARDS.has(id)) && (view.isHod || !HOD_ONLY_CARDS.has(id)) && !(view.isHod && HOD_HIDDEN_CARDS.has(id)) && !(view.isPc && PC_HIDDEN_CARDS.has(id)) && (view.reviewsTicketRequests || !REQUEST_REVIEWER_CARDS.has(id)) && (isOrgWideRole || view.isHod || !TEAM_VIEW_CARDS.has(id))),
    [view.order, isOrgWideRole, view.isHod, view.isPc, view.reviewsTicketRequests],
  );

  const reconcile = useCallback((storedOrder: DashboardCardId[]): DashboardCardId[] => {
    const visibleSet = new Set(visibleCards);
    const kept = storedOrder.filter((id) => visibleSet.has(id));
    const missing = visibleCards.filter((id) => !kept.includes(id));
    return [...kept, ...missing];
  }, [visibleCards]);

  const isUntouchedLegacyDefault = useCallback((rawOrder: string[]): boolean => {
    const legacyForRole = LEGACY_V1_DEFAULT_ORDER.filter((id) => isOrgWideRole || !LEGACY_V1_ADMIN_ONLY.has(id));
    return rawOrder.length === legacyForRole.length && rawOrder.every((id, i) => id === legacyForRole[i]);
  }, [isOrgWideRole]);

  const [order, setOrder] = useState<DashboardCardId[]>(() => {
    const stored = loadStoredLayout(storageKey);
    if (!stored) return [...visibleCards];
    if (stored.version < LAYOUT_VERSION && isUntouchedLegacyDefault(stored.rawOrder)) return [...visibleCards];
    if (stored.version < 3) {
      const front = NEW_IN_V3.filter((id) => visibleCards.includes(id));
      return [...front, ...reconcile(stored.order.filter((id) => !NEW_IN_V3.includes(id)))];
    }
    let next = reconcile(stored.order);
    if (stored.version < 12 && visibleCards.includes('ticketRequests')) {
      const rest: DashboardCardId[] = next.filter((id) => id !== 'ticketRequests');
      const at = rest.indexOf('needsApproval');
      rest.splice(at === -1 ? 0 : at, 0, 'ticketRequests');
      next = rest;
    }
    if (stored.version < LAYOUT_VERSION) {
      const withoutApproval = (ids: readonly DashboardCardId[]) => ids.filter((id) => id !== 'needsApproval');
      const sameAs = (old: readonly DashboardCardId[]) => {
        const expected = withoutApproval(old.filter((id) => visibleCards.includes(id)));
        const actual = withoutApproval(next);
        return actual.length === expected.length && actual.every((id, i) => id === expected[i]);
      };
      if (sameAs(LEGACY_V12_DEFAULT_ORDER) || sameAs(LEGACY_V13_DEFAULT_ORDER) || sameAs(LEGACY_V14_DEFAULT_ORDER) || sameAs(LEGACY_V16_DEFAULT_ORDER)) return [...visibleCards];
    }
    return next;
  });
  const [sizes, setSizes] = useState<Record<DashboardCardId, DashboardCardSize>>(() => sizesFrom(loadStoredLayout(storageKey)));
  const [hidden, setHidden] = useState<DashboardCardId[]>(() => loadStoredLayout(storageKey)?.hidden ?? []);
  const [isCustomizing, setIsCustomizing] = useState(false);

  const roleKey = `${isOrgWideRole}-${view.view}-${storageKey}`;
  const [prevRoleKey, setPrevRoleKey] = useState(roleKey);
  if (roleKey !== prevRoleKey) {
    setPrevRoleKey(roleKey);
    const stored = loadStoredLayout(storageKey);
    setOrder(stored ? reconcile(stored.order) : [...visibleCards]);
    setSizes(sizesFrom(stored));
    setHidden(stored?.hidden ?? []);
  }

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ version: LAYOUT_VERSION, order, sizes, hidden } satisfies StoredLayout));
    } catch {
    }
  }, [storageKey, order, sizes, hidden]);

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

  const toggleHidden = useCallback((id: DashboardCardId) => {
    setHidden((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const reset = useCallback(() => {
    setOrder([...visibleCards]);
    setSizes({ ...DEFAULT_CARD_SIZES });
    setHidden([]);
  }, [visibleCards]);

  return { order, sizes, hidden, isCustomizing, setIsCustomizing, moveCard, setCardSize, toggleHidden, reset };
};
