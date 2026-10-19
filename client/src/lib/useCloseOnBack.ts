import { useContext, useEffect, useRef } from 'react';
import { UNSAFE_DataRouterContext, type DataRouter } from 'react-router';

const KEY = '__sheet';

interface SheetEntry {
  id: string;
  idx: number | null;
  href: string;
  closing: boolean;
  onBack: () => unknown;
}

type HistoryState = { idx?: number; [KEY]?: string } & Record<string, unknown>;

const sheets: SheetEntry[] = [];
const pendingRemoval = new Map<string, number | null>();
let ownPops = 0;
let flushScheduled = false;
let listening = false;
let activeRouter: DataRouter | null = null;
let seq = 0;

const readState = (): HistoryState | null => (window.history.state as HistoryState | null) ?? null;
const isPromiseLike = (v: unknown): v is PromiseLike<unknown> =>
  !!v && typeof (v as PromiseLike<unknown>).then === 'function';

const pushEntry = (id: string): number | null => {
  const state = readState();
  const idx = typeof state?.idx === 'number' ? state.idx + 1 : null;
  window.history.pushState({ ...state, ...(idx !== null ? { idx } : {}), [KEY]: id }, '');
  return idx;
};

const liveSheets = () => sheets.filter((s) => !s.closing);

const onPopState = (e: PopStateEvent) => {
  if (ownPops > 0) {
    ownPops -= 1;
    e.stopImmediatePropagation();
    return;
  }
  const live = liveSheets();
  if (!live.length) return;

  const state = readState();
  const top = live[live.length - 1];
  if (state?.[KEY] === top.id) return;

  const newIdx = typeof state?.idx === 'number' ? state.idx : null;
  const leaving = newIdx !== null && top.idx !== null ? live.filter((s) => s.idx !== null && s.idx > newIdx) : [top];
  if (!leaving.length) return;

  const sameUrl = window.location.href === top.href;
  if (sameUrl) e.stopImmediatePropagation();

  for (let i = leaving.length - 1; i >= 0; i -= 1) {
    const sheet = leaving[i];
    sheet.closing = true;
    const result = sheet.onBack();
    if (sameUrl && leaving.length === 1 && (result === false || isPromiseLike(result))) {
      sheet.closing = false;
      sheet.idx = pushEntry(sheet.id);
    }
  }
};

const ensureListener = () => {
  if (listening) return;
  listening = true;
  window.addEventListener('popstate', onPopState, true);
};

const routerBusy = () => !!activeRouter && activeRouter.state.navigation.state !== 'idle';

const flush = () => {
  flushScheduled = false;
  if (!pendingRemoval.size) return;
  const state = readState();
  const currentId = state?.[KEY];
  if (!currentId || !pendingRemoval.has(currentId) || routerBusy()) {
    pendingRemoval.clear();
    return;
  }
  let steps = 1;
  const currentIdx = typeof state?.idx === 'number' ? state.idx : null;
  if (currentIdx !== null) {
    const liveMax = Math.max(-Infinity, ...liveSheets().map((s) => s.idx ?? -Infinity));
    const lows = [...pendingRemoval.values()].filter((i): i is number => i !== null && i > liveMax && i <= currentIdx);
    if (lows.length) steps = currentIdx - Math.min(...lows) + 1;
  }
  pendingRemoval.clear();
  ownPops += 1;
  window.history.go(-steps);
};

const scheduleFlush = () => {
  if (flushScheduled) return;
  flushScheduled = true;
  window.setTimeout(flush, 0);
};

const PHONE_QUERY = '(max-width: 767px)';

export interface UseCloseOnBackOptions {
  enabled?: boolean;
}

export function useCloseOnBack(open: boolean, onBack: () => unknown, options: UseCloseOnBackOptions = {}) {
  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  });

  const router = useContext(UNSAFE_DataRouterContext)?.router ?? null;
  const enabledOpt = options.enabled;

  useEffect(() => {
    if (!open) return;
    if (enabledOpt === false) return;
    if (enabledOpt === undefined && !window.matchMedia(PHONE_QUERY).matches) return;
    if (router) activeRouter = router;
    ensureListener();

    seq += 1;
    const id = `s${Date.now().toString(36)}${seq}`;
    const state = readState();
    const currentId = state?.[KEY];
    let idx: number | null;
    if (currentId && !sheets.some((s) => s.id === currentId)) {
      pendingRemoval.delete(currentId);
      window.history.replaceState({ ...state, [KEY]: id }, '');
      idx = typeof state?.idx === 'number' ? state.idx : null;
    } else {
      idx = pushEntry(id);
    }

    const entry: SheetEntry = { id, idx, href: window.location.href, closing: false, onBack: () => onBackRef.current() };
    sheets.push(entry);

    return () => {
      const at = sheets.indexOf(entry);
      if (at !== -1) sheets.splice(at, 1);
      if (entry.closing) return;
      pendingRemoval.set(id, entry.idx);
      scheduleFlush();
    };
  }, [open, enabledOpt, router]);
}
