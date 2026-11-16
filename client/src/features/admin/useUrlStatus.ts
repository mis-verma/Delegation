import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import type { EntityStatusFilterValue } from '../../components';

export const useUrlStatus = (): [EntityStatusFilterValue, (next: EntityStatusFilterValue) => void] => {
  const [params, setParams] = useSearchParams();
  const raw = params.get('status');
  const value: EntityStatusFilterValue = raw === 'active' || raw === 'inactive' ? raw : 'all';

  const set = useCallback((next: EntityStatusFilterValue) => {
    setParams((prev) => {
      const out = new URLSearchParams(prev);
      if (next === 'all') out.delete('status');
      else out.set('status', next);
      return out;
    }, { replace: true });
  }, [setParams]);

  return [value, set];
};
