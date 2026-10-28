import { useState } from 'react';

export type FocusView = 'work' | 'team';

const keyFor = (userId: string | undefined) => `tm-focus-view-${userId ?? 'anon'}`;

const read = (userId: string | undefined): FocusView => {
  try {
    return window.localStorage.getItem(keyFor(userId)) === 'team' ? 'team' : 'work';
  } catch {
    return 'work';
  }
};

export const useFocusView = (userId: string | undefined) => {
  const [view, setView] = useState<FocusView>(() => read(userId));
  const update = (next: FocusView) => {
    setView(next);
    try {
      window.localStorage.setItem(keyFor(userId), next);
    } catch {
      return;
    }
  };
  return [view, update] as const;
};
