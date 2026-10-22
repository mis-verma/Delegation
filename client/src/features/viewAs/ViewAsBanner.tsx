import { useNavigate } from 'react-router';
import { Eye, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ROLE_LABEL } from '../admin/roleBadge';

export const ViewAsBanner = () => {
  const { user, isPreviewing, stopViewAs } = useAuth();
  const navigate = useNavigate();
  if (!isPreviewing || !user) return null;

  const exit = () => {
    stopViewAs();
    void navigate('/admin/directory', { replace: true });
  };

  return (
    <div role="status" className="flex shrink-0 items-center gap-2.5 bg-linear-to-r from-primary-800 to-primary-600 px-3 py-2 text-white sm:px-5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/15" aria-hidden="true">
        <Eye className="size-4" strokeWidth={2.25} />
      </span>
      <p className="min-w-0 flex-1 t-meta font-display font-medium leading-snug">
        <span className="font-bold">Previewing as {user.name}</span>
        <span className="text-white/80"> · {ROLE_LABEL[user.role]}</span>
        <span className="hidden text-white/80 sm:inline"> · Read only. You see exactly what they see, and nothing is saved.</span>
      </p>
      <button
        type="button"
        onClick={exit}
        className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-white/30 bg-white/10 px-3 t-meta font-display font-semibold text-white outline-none transition-all duration-200 cursor-pointer hover:bg-white/20 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-white/60 sm:h-9"
      >
        <LogOut className="size-3.5" aria-hidden="true" />
        Exit preview
      </button>
    </div>
  );
};
