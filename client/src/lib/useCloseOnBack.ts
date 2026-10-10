import { useContext, useEffect, useRef } from 'react';
import { UNSAFE_DataRouterContext, type DataRouter } from 'react-router';

/**
 * Phone back button / iOS swipe-back closes the top-most open sheet instead of leaving the page.
 *
 * How it stays out of React Router's way (createBrowserRouter, v8):
 *
 * - Opening a sheet pushes ONE same-URL history entry. Its state is a copy of the router's own
 *   entry (`usr`, `key`) plus `idx + 1` and our `__sheet` id, so if the router later pushes on top
 *   of it, its own index arithmetic still matches the real stack.
 * - A popstate that only leaves a live sheet's entry (same URL) is handled here, in a capture
 *   listener, and stopped before the router hears it. The router never sees our entries come or go,
 *   so its `index` stays right and a page `useBlocker` (Settings, Checklist builder) never gets a
 *   delta of 0, which would make it call `history.go(0)` and reload the page.
 * - Closing a sheet any other way (X, Save, a parent unmounting it) removes its entry with
 *   `history.back()`, but only one tick later and only if the entry is still the current one and
 *   the router is idle. A link tapped inside the sheet pushes the router's own entry first, so the
 *   sheet's stale entry is left alone and the navigation is never undone.
 * - A stale entry (left after such a navigation, or a reload) is reused by the next sheet that
 *   opens on it instead of stacking another one.
 */

const KEY = '__sheet';

interface SheetEntry {
  id: string;
  /** Router history index of this sheet's entry, or null if the router had none. */
  idx: number | null;
  /** The URL the entry was pushed at; a pop to another URL is a real navigation. */
  href: string;
  /** Set once a back press has asked this sheet to close; its entry is already gone. */
  closing: boolean;
  onBack: () => unknown;
}

type HistoryState = { idx?: number; [KEY]?: string } & Record<string, unknown>;

const sheets: SheetEntry[] = [];
/** Ids whose entries should be popped on the next flush (closed by the app, not by back). */
const pendingRemoval = new Map<string, number | null>();
/** How many upcoming popstate events are our own `history.back()`/`go()` calls. */
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
  if (state?.[KEY] === top.id) return; // still on the top sheet's own entry

  const newIdx = typeof state?.idx === 'number' ? state.idx : null;
  // Every live sheet whose entry is now in the forward stack. With router indexes that is all of
  // them above newIdx; without, just the top one.
  const leaving = newIdx !== null && top.idx !== null ? live.filter((s) => s.idx !== null && s.idx > newIdx) : [top];
  if (!leaving.length) return;

  const sameUrl = window.location.href === top.href;
  // A plain one-step back off a sheet: the router must not see it (see the file comment).
  if (sameUrl) e.stopImmediatePropagation();

  for (let i = leaving.length - 1; i >= 0; i -= 1) {
    const sheet = leaving[i];
    sheet.closing = true;
    const result = sheet.onBack();
    // The sheet wants to stay (a "Discard changes?" prompt is up, or it said no): put its entry back
    // so the next back press is caught again. Only for the simple one-step case.
    if (sameUrl && leaving.length === 1 && (result === false || isPromiseLike(result))) {
      sheet.closing = false;
      sheet.idx = pushEntry(sheet.id);
    }
  }
};

const ensureListener = () => {
  if (listening) return;
  listening = true;
  // Capture so it runs before the router's own (bubble) popstate listener on window.
  window.addEventListener('popstate', onPopState, true);
};

const routerBusy = () => !!activeRouter && activeRouter.state.navigation.state !== 'idle';

/** Pops the entries of sheets the app closed itself, if they are still on top of the stack. */
const flush = () => {
  flushScheduled = false;
  if (!pendingRemoval.size) return;
  const state = readState();
  const currentId = state?.[KEY];
  if (!currentId || !pendingRemoval.has(currentId) || routerBusy()) {
    pendingRemoval.clear();
    return;
  }
  // Nested sheets closed together: walk back over every one of their entries in one go, but never
  // below a sheet that is still open.
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
  // A macrotask: any router navigation started in the same tap (a link inside the sheet) has pushed
  // its own entry by now, so the check in flush() sees it and leaves history alone.
  window.setTimeout(flush, 0);
};

const PHONE_QUERY = '(max-width: 767px)';

export interface UseCloseOnBackOptions {
  /** Default: phones only (max-width 767px, same as useIsMobile). Pass false to opt out. */
  enabled?: boolean;
}

/**
 * While `open`, the phone's back gesture calls `onBack` instead of leaving the page. Only the
 * top-most open sheet reacts to one back press.
 *
 * `onBack` may return `false` (or a promise, e.g. a "Discard changes?" prompt) to keep the sheet
 * open; the back entry is then restored. When it really closes, flip `open` to false as usual.
 */
export function useCloseOnBack(open: boolean, onBack: () => unknown, options: UseCloseOnBackOptions = {}) {
  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  });

  // Outside a data router (e.g. a dialog mounted above <RouterProvider>) this is null, and the
  // busy check simply never blocks.
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
    // Reuse a stale sheet entry we are standing on rather than stacking another one.
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
      if (entry.closing) return; // back already removed the entry
      pendingRemoval.set(id, entry.idx);
      scheduleFlush();
    };
  }, [open, enabledOpt, router]);
}
