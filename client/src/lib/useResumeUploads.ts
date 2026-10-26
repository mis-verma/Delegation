import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { resumePendingUploads } from './persistentUpload';

export const useResumeUploads = () => {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    const run = async () => {
      const finished = await resumePendingUploads();
      if (cancelled || finished === 0) return;
      toast.success(finished === 1 ? 'A saved photo upload finished.' : `${finished} saved photo uploads finished.`);
      void queryClient.invalidateQueries({ queryKey: ['checklist-instances'] });
    };
    void run();
    window.addEventListener('online', run);
    return () => {
      cancelled = true;
      window.removeEventListener('online', run);
    };
  }, [token, queryClient]);
};
