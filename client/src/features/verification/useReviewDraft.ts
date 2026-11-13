import { useCallback, useMemo, useState } from 'react';
import type { PickDefaults } from './correctionItems';

interface DraftState {
  picked: Record<string, string>;
  photoOnly: string[];
  looksRight: string[];
  note: string;
  fixByHours: number | null;
}

const EMPTY: DraftState = { picked: {}, photoOnly: [], looksRight: [], note: '', fixByHours: null };

export const useReviewDraft = (runId: string | null) => {
  const [drafts, setDrafts] = useState<Readonly<Record<string, DraftState>>>({});
  const [sendingFor, setSendingFor] = useState<string | null>(null);
  const draft = (runId && drafts[runId]) || EMPTY;
  const sending = runId !== null && sendingFor === runId;

  const updateRun = useCallback((id: string, change: (prev: DraftState) => DraftState) => {
    setDrafts((all) => {
      const prev = all[id] ?? EMPTY;
      const next = change(prev);
      return next === prev ? all : { ...all, [id]: next };
    });
  }, []);

  const update = useCallback((change: (prev: DraftState) => DraftState) => {
    if (runId) updateRun(runId, change);
  }, [runId, updateRun]);

  const togglePicked = useCallback((itemId: string) => update((prev) => {
    const picked = { ...prev.picked };
    if (itemId in picked) delete picked[itemId]; else picked[itemId] = '';
    return { ...prev, picked, photoOnly: prev.photoOnly.filter((id) => id in picked), looksRight: prev.looksRight.filter((id) => id !== itemId) };
  }), [update]);

  const pickWith = useCallback((itemId: string, defaults: PickDefaults) => update((prev) => {
    if (itemId in prev.picked) return prev;
    return {
      ...prev,
      picked: { ...prev.picked, [itemId]: defaults.note },
      photoOnly: defaults.photoOnly ? [...prev.photoOnly.filter((id) => id !== itemId), itemId] : prev.photoOnly,
      looksRight: prev.looksRight.filter((id) => id !== itemId),
    };
  }), [update]);

  const toggleLooksRight = useCallback((itemId: string) => update((prev) => {
    if (prev.looksRight.includes(itemId)) return { ...prev, looksRight: prev.looksRight.filter((id) => id !== itemId) };
    const picked = { ...prev.picked };
    delete picked[itemId];
    return { ...prev, picked, photoOnly: prev.photoOnly.filter((id) => id !== itemId), looksRight: [...prev.looksRight, itemId] };
  }), [update]);

  const togglePhotoOnly = useCallback((itemId: string) => update((prev) => {
    if (!(itemId in prev.picked)) return prev;
    const on = prev.photoOnly.includes(itemId);
    return { ...prev, photoOnly: on ? prev.photoOnly.filter((id) => id !== itemId) : [...prev.photoOnly, itemId] };
  }), [update]);

  const setItemNote = useCallback((itemId: string, text: string) => update((prev) => (
    itemId in prev.picked ? { ...prev, picked: { ...prev.picked, [itemId]: text } } : prev
  )), [update]);

  const setNote = useCallback((note: string) => update((prev) => ({ ...prev, note })), [update]);
  const setFixBy = useCallback((fixByHours: number | null) => update((prev) => ({ ...prev, fixByHours })), [update]);
  const setSending = useCallback((on: boolean) => setSendingFor(on ? runId : null), [runId]);
  const reset = useCallback(() => {
    if (!runId) return;
    setDrafts((all) => {
      if (!(runId in all)) return all;
      const next = { ...all };
      delete next[runId];
      return next;
    });
    setSendingFor((current) => (current === runId ? null : current));
  }, [runId]);
  const startSendBackFor = useCallback((id: string) => setSendingFor(id), []);
  const startPickFor = useCallback((id: string, itemId: string) => {
    updateRun(id, (prev) => (itemId in prev.picked ? prev : { ...prev, picked: { ...prev.picked, [itemId]: '' }, looksRight: prev.looksRight.filter((x) => x !== itemId) }));
    setSendingFor(id);
  }, [updateRun]);

  const pickedIds = useMemo(() => Object.keys(draft.picked), [draft.picked]);
  const pickedSet = useMemo<ReadonlySet<string>>(() => new Set(pickedIds), [pickedIds]);

  const { picked, photoOnly, looksRight, note, fixByHours } = draft;
  const photoOnlySet = useMemo<ReadonlySet<string>>(() => new Set(photoOnly), [photoOnly]);
  const looksRightSet = useMemo<ReadonlySet<string>>(() => new Set(looksRight), [looksRight]);
  return useMemo(
    () => ({ picked, pickedIds, pickedSet, photoOnlyIds: photoOnly, photoOnlySet, looksRightSet, note, fixByHours, sending, togglePicked, pickWith, toggleLooksRight, togglePhotoOnly, setItemNote, setNote, setFixBy, setSending, reset, startSendBackFor, startPickFor }),
    [picked, pickedIds, pickedSet, photoOnly, photoOnlySet, looksRightSet, note, fixByHours, sending, togglePicked, pickWith, toggleLooksRight, togglePhotoOnly, setItemNote, setNote, setFixBy, setSending, reset, startSendBackFor, startPickFor],
  );
};

export type ReviewDraft = ReturnType<typeof useReviewDraft>;
