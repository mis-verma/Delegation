import type { MouseEvent } from 'react';
import { X, ChevronRight, type LucideIcon } from 'lucide-react';
import { AdminChromeAccents } from '../admin/AdminChromeAccents';
import { Badge } from '../../components/ui/badge';

export interface StatusBreakdownRow {
  label: string;
  value: number;
  onClick?: () => void;
}


export type StatusBreakdownVariant = 'navy' | 'surface';

interface StatusBreakdownCardProps {
  icon?: LucideIcon;
  title: string;
  total: number;
  totalLabel?: string;
  onOpen?: () => void;
  comingSoon?: boolean;
  rows?: StatusBreakdownRow[];
  onRemove?: (e: MouseEvent) => void;
  variant?: StatusBreakdownVariant;
}


const SHELL = {
  navy: {
    card: 'border-transparent bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700',
    hover: 'hover:border-primary-400/50 focus-visible:ring-primary-400/40',
    divider: 'border-white/10',
    title: 'text-white',
    icon: 'text-white/70',
    rowLabel: 'text-white/70',
    rowValue: 'text-white/90',
    rowHover: 'hover:bg-white/10',
    totalBox: 'border-white/15 bg-white/5',
    totalValue: 'text-white',
    totalLabel: 'text-white/70',
    soonBadge: 'border-white/20 text-white/70',
    comingSoonText: 'text-white/70',
    removeButton: 'text-white/50 hover:text-white hover:bg-white/10',
  },
  surface: {
    card: 'border-border/60 dark:border-white/[0.06] bg-surface',
    hover: 'hover:border-primary-500/40 focus-visible:ring-primary-500/40',
    divider: 'border-border/60',
    title: 'text-text',
    icon: 'text-text-muted',
    rowLabel: 'text-text-secondary',
    rowValue: 'text-text',
    rowHover: 'hover:bg-surface-hover',
    totalBox: 'border-border/60 bg-surface-hover/50',
    totalValue: 'text-text',
    totalLabel: 'text-text-muted',
    soonBadge: 'border-border text-text-light',
    comingSoonText: 'text-text-muted',
    removeButton: 'text-text-light hover:text-text hover:bg-surface-hover',
  },
} as const;

export const StatusBreakdownCard = ({
  icon: Icon,
  title,
  rows = [],
  total,
  totalLabel = 'Total',
  onOpen,
  comingSoon = false,
  onRemove,
  variant = 'navy',
}: StatusBreakdownCardProps) => {
  const shell = SHELL[variant];

  return (
    <div
      onClick={comingSoon ? undefined : onOpen}
      role={onOpen && !comingSoon ? 'button' : undefined}
      tabIndex={onOpen && !comingSoon ? 0 : undefined}
      onKeyDown={onOpen && !comingSoon ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } } : undefined}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border transition-all duration-300 ${shell.card} ${
        onOpen && !comingSoon ? `cursor-pointer outline-none hover:-translate-y-1 focus-visible:ring-2 ${shell.hover}` : ''
      } ${comingSoon ? 'opacity-70' : ''}`}
    >
      
      {variant === 'navy' && <AdminChromeAccents scale="compact" />}

      <div className={`relative z-10 flex items-start justify-between gap-2.5 px-4 py-3.5 border-b ${shell.divider}`}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {Icon && <Icon size={16} className={`${shell.icon} shrink-0 mt-0.5`} />}
          <span className={`text-sm font-display font-bold break-words ${shell.title}`}>
            {title}
          </span>
          {comingSoon && (
            <Badge variant="outline" className={`shrink-0 text-[10px] uppercase tracking-wide ${shell.soonBadge}`}>
              Soon
            </Badge>
          )}
        </div>

        {onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(e);
            }}
            className={`p-1 -mr-1 -mt-1 shrink-0 rounded-lg opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all outline-none ${shell.removeButton}`}
            aria-label="Remove card"
            title="Remove breakdown"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {comingSoon ? (
        <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-8 text-center">
          <p className={`text-xs font-display font-medium max-w-[16rem] ${shell.comingSoonText}`}>
            {title} isn't available yet, check back once it's ready.
          </p>
        </div>
      ) : (
        <div className="relative z-10 flex flex-1 items-stretch gap-3 p-3">
          <div className="flex-1 flex flex-col justify-center gap-1 min-w-0 px-1">
            {rows.map((row) => {
              const RowTag = row.onClick ? 'button' : 'div';
              return (
                <RowTag
                  key={row.label}
                  type={row.onClick ? 'button' : undefined}
                  onClick={
                    row.onClick
                      ? (e: MouseEvent) => {
                          e.stopPropagation();
                          row.onClick?.();  
                        }
                      : undefined
                  }
          
                  className={`flex items-center gap-2 min-h-11 text-sm font-display rounded-md px-1.5 -mx-1.5 transition-colors ${
                    row.onClick ? `cursor-pointer text-left ${shell.rowHover}` : ''
                  }`}
                >
                  <span className={`font-bold break-words flex-1 leading-tight ${shell.rowLabel}`}>
                    {row.label}
                  </span>
                  <span className={`font-bold tabular-nums shrink-0 ${shell.rowValue}`}>
                    {row.value}
                  </span>
                  
                  {row.onClick && (
                    <ChevronRight
                      size={14}
                      strokeWidth={2.5}
                      className={`shrink-0 ml-1 opacity-50 group-hover:opacity-100 transition-opacity duration-200 ${shell.rowLabel}`}
                    />
                  )}
                </RowTag>
              );
            })}
          </div>

          <div className={`flex flex-col items-center justify-center gap-0.5 w-24 sm:w-28 shrink-0 rounded-xl border transition-transform duration-300 group-hover:scale-[1.02] ${shell.totalBox}`}>
            <span className={`text-2xl sm:text-3xl font-display font-bold tabular-nums leading-none ${shell.totalValue}`}>
              {total}
            </span>
            <span className={`text-sm font-display font-medium tracking-wide ${shell.totalLabel}`}>
              {totalLabel}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};