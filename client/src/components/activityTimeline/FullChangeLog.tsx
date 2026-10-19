import { useState } from 'react';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { AuditEntityType } from '../../api/auditLogs';
import { ActivityTimeline } from './ActivityTimeline';
import { TONE } from './activityTones';

export const FullChangeLog = ({ entityType, entityId }: { entityType: AuditEntityType; entityId: string }) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  if (user?.role !== 'ADMIN' && user?.role !== 'PC') return null;

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex min-h-10 w-fit items-center gap-2 rounded-xl border border-border bg-surface px-2.5 text-xs font-display font-semibold text-text-secondary outline-none transition-colors hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-coarse:min-h-11"
      >
        <span className={'flex size-6 items-center justify-center rounded-md text-white ' + TONE.coral} aria-hidden="true">
          <ShieldCheck size={13} strokeWidth={2.5} />
        </span>
        {open ? 'Hide full change log' : 'Full change log (Admin)'}
        <ChevronDown size={13} strokeWidth={2.5} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && <ActivityTimeline entityType={entityType} entityId={entityId} />}
    </div>
  );
};
