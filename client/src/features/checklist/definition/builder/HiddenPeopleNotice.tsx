import { AlertTriangle, Info } from 'lucide-react';
import { Button, NoticeBanner } from '../../../../components';

interface HiddenPeopleNoticeProps {
  message: string;
  onRemove: () => void;
  tone?: 'warning' | 'info';
  className?: string;
}

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
