import { startTransition, useOptimistic } from 'react';

export const useInstantChoice = <T,>(value: T, onChange: (next: T) => void) => {
  const [shown, setShown] = useOptimistic(value);
  const choose = (next: T) => {
    if (Object.is(next, shown)) return;
    startTransition(() => {
      setShown(next);
      onChange(next);
    });
  };
  return [shown, choose] as const;
};
