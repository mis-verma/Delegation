import { useCallback } from 'react';
import { useNavigate } from 'react-router';

const historyIndex = (): number => (window.history.state as { idx?: number } | null)?.idx ?? 0;

export const canGoBack = (): boolean => historyIndex() > 0;

interface GoBackOptions {
  replace?: boolean;
}

export const useGoBack = (fallback: string, { replace = false }: GoBackOptions = {}) => {
  const navigate = useNavigate();
  return useCallback(() => {
    if (canGoBack()) void navigate(-1);
    else void navigate(fallback, { replace });
  }, [navigate, fallback, replace]);
};
