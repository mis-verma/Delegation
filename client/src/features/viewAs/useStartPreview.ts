import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';

export const useStartPreview = () => {
  const { startViewAs } = useAuth();
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState<string | null>(null);

  const start = async (userId: string): Promise<boolean> => {
    setBusyId(userId);
    try {
      await startViewAs(userId);
      void navigate('/', { replace: true });
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start the preview. Try again.");
      return false;
    } finally {
      setBusyId(null);
    }
  };

  return { start, busyId };
};
