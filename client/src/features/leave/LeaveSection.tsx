import type { ReactNode } from 'react';
import { GROUP_META, type GroupKey } from './leaveDisplay';

export const LeaveSection = ({ group, count, children }: { group: GroupKey; count: number; children: ReactNode }) => {
  const { title, hint } = GROUP_META[group];
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="flex items-center gap-2 t-card font-display font-bold text-text">
          {title}
          <span className="t-meta font-semibold tabular-nums text-text-muted">{count}</span>
        </h2>
        {hint && <p className="hidden t-meta text-text-muted sm:block">{hint}</p>}
      </div>
      {children}
    </section>
  );
};
