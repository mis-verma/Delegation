import { AlertTriangle, Info } from 'lucide-react';
import { Button, NoticeBanner } from '../../../../components';

interface HiddenPeopleNoticeProps {
  /** The whole sentence, already worded for the case ("2 people are not in the selected stores"). */
  message: string;
  onRemove: () => void;
  tone?: 'warning' | 'info';
  className?: string;
}

// Picked people the list below no longer shows (their store was unticked, or they were
// deactivated) are still counted by the form and rejected by the server, so say so and offer a
// one-tap clean-up instead of leaving them invisible.
export const HiddenPeopleNotice = ({ message, onRemove, tone = 'warning', className }: HiddenPeopleNoticeProps) => (
  <NoticeBanner tone={tone} icon={tone === 'info' ? Info : AlertTriangle} className={className}>
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <span className="min-w-0">{message}</span>
      <Button variant="outline" size="sm" onClick={onRemove} className="shrink-0">
        Remove them
      </Button>
    </div>
  </NoticeBanner>
);
