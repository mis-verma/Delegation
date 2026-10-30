import { AlarmClock, MessageSquarePlus } from 'lucide-react';
import { Button } from '../../../components';

interface OverdueBannerProps {
  since: string;
  canPost: boolean;
  composerId: string;
}

const scrollToComposer = (id: string) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.focus({ preventScroll: true });
};

export const OverdueBanner = ({ since, canPost, composerId }: OverdueBannerProps) => (
  <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/40 border-l-[3px] border-l-danger bg-danger/8 px-3.5 py-3">
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-danger to-danger/70 text-white" aria-hidden="true">
      <AlarmClock size={17} strokeWidth={2.4} />
    </span>
    <div className="min-w-0 flex-1">
      <p className="t-card font-display font-bold text-danger">This ticket is overdue</p>
      <p className="t-meta font-medium text-text-secondary">{since}. Post an update so everyone knows where it stands.</p>
    </div>
    {canPost && (
      <Button type="button" variant="outline" size="sm" onClick={() => scrollToComposer(composerId)} className="h-11 gap-1.5 font-display font-semibold sm:h-9">
        <MessageSquarePlus size={15} aria-hidden="true" />
        Add update
      </Button>
    )}
  </div>
);
