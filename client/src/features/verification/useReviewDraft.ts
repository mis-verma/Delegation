import { useCallback, useMemo, useState } from 'react';
import type { PickDefaults } from './correctionItems';

interface DraftState {
  runId: string | null;
  picked: Record<string, string>;
  photoOnly: string[];
  looksRight: string[];
  note: string;
  fixByHours: number | null;
  sending: boolean;
}

const fresh = (runId: string | null): DraftState => ({ runId, picked: {}, photoOnly: [], looksRight: [], note: '', fixByHours: null, sending: false });

export const useReviewDraft = (runId: string | null) => {
  const [state, setState] = useState<DraftState>(() => fresh(runId));

  const draft = state.runId === runId ? state : fresh(runId);
  if (state.runId !== runId) setState(draft);

  const update = useCallback((change: (prev: DraftState) => DraftState) => {
    setState((prev) => change(prev.runId === runId ? prev : fresh(runId)));
  }, [runId]);

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
  const setSending = useCallback((sending: boolean) => update((prev) => ({ ...prev, sending })), [update]);
  const reset = useCallback(() => setState(fresh(runId)), [runId]);
  const startSendBackFor = useCallback((id: string) => setState({ ...fresh(id), sending: true }), []);
  const startPickFor = useCallback((id: string, itemId: string) => setState({ ...fresh(id), picked: { [itemId]: '' }, sending: true }), []);

  const pickedIds = useMemo(() => Object.keys(draft.picked), [draft.picked]);
  const pickedSet = useMemo<ReadonlySet<string>>(() => new Set(pickedIds), [pickedIds]);

  const { picked, photoOnly, looksRight, note, fixByHours, sending } = draft;
  const photoOnlySet = useMemo<ReadonlySet<string>>(() => new Set(photoOnly), [photoOnly]);
  const looksRightSet = useMemo<ReadonlySet<string>>(() => new Set(looksRight), [looksRight]);
  return useMemo(
    () => ({ picked, pickedIds, pickedSet, photoOnlyIds: photoOnly, photoOnlySet, looksRightSet, note, fixByHours, sending, togglePicked, pickWith, toggleLooksRight, togglePhotoOnly, setItemNote, setNote, setFixBy, setSending, reset, startSendBackFor, startPickFor }),
    [picked, pickedIds, pickedSet, photoOnly, photoOnlySet, looksRightSet, note, fixByHours, sending, togglePicked, pickWith, toggleLooksRight, togglePhotoOnly, setItemNote, setNote, setFixBy, setSending, reset, startSendBackFor, startPickFor],
  );
};

export type ReviewDraft = ReturnType<typeof useReviewDraft>;
