import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

export type DirectoryView = 'cards' | 'table';

/**
 * Cards or table for the People & Teams tabs. Lives in the `view` search param (absent = cards) so
 * one choice carries across Users, Departments and Stores, survives a refresh and can be linked to.
 * Other params, `tab` included, are left alone.
 */
export const useDirectoryView = (): [DirectoryView, (view: DirectoryView) => void] => {
  const [searchParams, setSearchParams] = useSearchParams();
  const view: DirectoryView = searchParams.get('view') === 'table' ? 'table' : 'cards';

  const setView = useCallback((next: DirectoryView) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === 'table') params.set('view', 'table');
      else params.delete('view');
      return params;
    }, { replace: true });
  }, [setSearchParams]);

  return [view, setView];
};
