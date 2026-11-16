import { useLocation } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { readDashboardOrigin } from '../../lib/dashboardOrigin';
import { useGoBack } from '../../lib/historyBack';

export const PageBackButton = () => {
  const { pathname } = useLocation();
  const found = readDashboardOrigin();
  const origin = found && found.to === pathname ? found : null;
  const goBack = useGoBack(origin?.back ?? '/');
  if (!origin) return null;
  return (
    <button
      type="button"
      onClick={goBack}
      className="inline-flex h-11 w-fit cursor-pointer items-center gap-1.5 rounded-xl border border-border/60 bg-surface px-3 t-meta font-display font-semibold text-text-secondary outline-none transition-[border-color,color,transform] duration-150 ease-out hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.985] pointer-fine:h-9"
    >
      <ArrowLeft size={16} aria-hidden="true" />
      Back to Home
    </button>
  );
};
