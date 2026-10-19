import { useCallback, useMemo, useState } from 'react';

interface DraftState {
  runId: string | null;
  picked: Record<string, string>;
  note: string;
  sending: boolean;
}

const fresh = (runId: string | null): DraftState => ({ runId, picked: {}, note: '', sending: false });

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
    return { ...prev, picked };
  }), [update]);

  const setItemNote = useCallback((itemId: string, text: string) => update((prev) => (
    itemId in prev.picked ? { ...prev, picked: { ...prev.picked, [itemId]: text } } : prev
  )), [update]);

  const setNote = useCallback((note: string) => update((prev) => ({ ...prev, note })), [update]);
  const setSending = useCallback((sending: boolean) => update((prev) => ({ ...prev, sending })), [update]);
  const reset = useCallback(() => setState(fresh(runId)), [runId]);
  const startSendBackFor = useCallback((id: string) => setState({ ...fresh(id), sending: true }), []);

  const pickedIds = useMemo(() => Object.keys(draft.picked), [draft.picked]);
  const pickedSet = useMemo<ReadonlySet<string>>(() => new Set(pickedIds), [pickedIds]);

  const { picked, note, sending } = draft;
  return useMemo(
    () => ({ picked, pickedIds, pickedSet, note, sending, togglePicked, setItemNote, setNote, setSending, reset, startSendBackFor }),
    [picked, pickedIds, pickedSet, note, sending, togglePicked, setItemNote, setNote, setSending, reset, startSendBackFor],
  );
};

export type ReviewDraft = ReturnType<typeof useReviewDraft>;
