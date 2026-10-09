import { useEffect, useState, type ReactNode } from 'react';
import { Filter, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from '@/components/ui/dropdown-menu';
import { Button } from '../button';
import { CountBadge } from '../countBadge';
import { Modal } from '../modal';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface FilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

export const PillButton = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex items-center justify-center w-full px-4 py-2.5 rounded-xl text-xs font-bold tracking-wide transition-all duration-200 cursor-pointer active:scale-95",
      active
        ? "bg-primary-50 text-primary-700 border border-primary-200 ring-2 ring-primary-100/50 shadow-sm"
        : "bg-surface border border-border text-text-muted hover:text-text hover:bg-surface-hover hover:border-border-hover shadow-sm"
    )}
  >
    {children}
  </button>
);

export const FilterSection = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="flex flex-col gap-2.5">
    <span className="t-meta font-bold text-text-light tracking-widest pl-2">
      {title}
    </span>
    <div className="p-4 rounded-2xl bg-surface-hover border border-border">
      {children}
    </div>
  </div>
);

interface FiltersPopoverProps<TFilters> {
  filters: TFilters;
  onChange: (patch: Partial<TFilters>) => void;
  onClearAll: () => void;
  activeCount: number;
  renderSections: (draft: TFilters, updateDraft: (fn: (d: TFilters) => TFilters) => void, closePopover: () => void) => ReactNode;
  renderChips: (draft: TFilters, updateDraft: (fn: (d: TFilters) => TFilters) => void) => FilterChip[];
  renderMobileOnlySections?: (draft: TFilters, updateDraft: (fn: (d: TFilters) => TFilters) => void) => ReactNode;
}

const MOBILE_QUERY = '(max-width: 639px)';

export function FiltersPopover<TFilters extends object>({
  filters, onChange, onClearAll, activeCount, renderSections, renderChips, renderMobileOnlySections,
}: FiltersPopoverProps<TFilters>) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<TFilters>(filters);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onMqChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', onMqChange);
    return () => mq.removeEventListener('change', onMqChange);
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (next) setDraft(filters);
    setOpen(next);
  };

  const openMobile = () => {
    setDraft(filters);
    setOpen(true);
  };

  const apply = () => {
    onChange(draft);
    setOpen(false);
  };

  const updateDraft = (updater: (d: TFilters) => TFilters) => {
    setDraft((prev) => updater(prev));
  };

  const closePopover = () => setOpen(false);

  const chips = renderChips(draft, updateDraft);

  const triggerInner = (
    <>
      <Filter size={16} strokeWidth={2.5} fill={activeCount > 0 ? 'currentColor' : 'none'} className={activeCount > 0 ? "text-primary-600" : "text-text-muted"} />
      <span className={cn("text-sm font-bold hidden md:inline", activeCount > 0 ? "text-primary-700" : "text-text-secondary")}>
        Filters
      </span>
      <CountBadge count={activeCount} label={`${activeCount} ${activeCount === 1 ? 'filter' : 'filters'} on`} className="ml-1" />
    </>
  );

  const triggerClassName = cn(
    "h-11 px-4 gap-2.5 rounded-xl border transition-all duration-200 shadow-sm active:scale-95",
    activeCount > 0
      ? "bg-primary-50 border-primary-200 hover:bg-primary-100 hover:border-primary-300 ring-4 ring-transparent focus-visible:ring-primary-100"
      : "bg-surface border-border hover:bg-surface-hover hover:border-border-hover ring-4 ring-transparent focus-visible:ring-surface-hover"
  );

  const chipsRow = chips.length > 0 && (
    <div className="flex gap-2 overflow-x-auto pb-2 -mb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="flex items-center gap-1.5 pl-3.5 pr-1.5 py-1.5 t-meta font-bold tracking-widest rounded-full bg-primary-50 text-primary-700 border border-primary-200 shadow-sm shrink-0"
        >
          {chip.label}
          <button
            type="button"
            onClick={chip.onRemove}
            aria-label={`Remove ${chip.label}`}
            className="p-1 rounded-full hover:bg-primary-200/50 text-primary-500 hover:text-primary-700 transition-all cursor-pointer active:scale-90"
          >
            <X size={12} strokeWidth={3} />
          </button>
        </span>
      ))}
    </div>
  );

  const sectionsBody = renderSections(draft, updateDraft, closePopover);
  const mobileOnlyBody = renderMobileOnlySections?.(draft, updateDraft);

  const footerButtons = (
    <>
      <button
        type="button"
        onClick={() => { onClearAll(); setOpen(false); }}
        disabled={activeCount === 0}
        className="text-sm font-bold text-text-muted hover:text-danger transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2.5 rounded-xl hover:bg-danger/10 active:scale-95"
      >
        Clear all
      </button>
      <Button 
        variant="primary" 
        size="md" 
        className="flex-1 h-11 rounded-xl font-bold text-sm shadow-md shadow-primary-600/20 active:scale-95" 
        onClick={apply}
      >
        Apply filters
      </Button>
    </>
  );

  return (
    <>
      {isMobile ? (
        <Button
          variant="secondary"
          size="sm"
          className={triggerClassName}
          aria-label="Filters"
          title="Filters"
          onClick={openMobile}
        >
          {triggerInner}
        </Button>
      ) : (
        <DropdownMenu open={open} onOpenChange={handleOpenChange}>
          <DropdownMenuTrigger asChild className="focus:outline-none">
            <Button variant="secondary" size="sm" className={triggerClassName} aria-label="Filters" title="Filters">
              {triggerInner}
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="start"
            className="w-[28rem] max-h-[85vh] p-0 flex flex-col rounded-[1.5rem] border border-border shadow-2xl overflow-hidden bg-surface animate-in fade-in-80 zoom-in-95 duration-200"
          >
            {/* 1. STICKY HEADER */}
            <div className="flex flex-col gap-4 p-5 border-b border-border  backdrop-blur-md sticky top-0 z-20 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-primary-50 text-primary-600 ring-1 ring-primary-100/50">
                    <Filter size={18} strokeWidth={2.5} />
                  </div>
                  <span className="text-base font-bold tracking-tight text-text">Refine View</span>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close filters"
                  className="p-2 rounded-full text-text-light hover:text-text hover:bg-surface-hover transition-all duration-200 cursor-pointer active:scale-90"
                >
                  <X size={18} strokeWidth={2.5} />
                </button>
              </div>

              {chipsRow}
            </div>

            {/* 2. SCROLLABLE BODY */}
            <div className="flex flex-col gap-6 p-6 flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar bg-surface">
              {sectionsBody}
            </div>

            {/* 3. STICKY FOOTER */}
            <div className="flex items-center justify-between gap-4 p-5 border-t border-border bg-surface/95 backdrop-blur-md sticky bottom-0 z-20 shrink-0">
              {footerButtons}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {isMobile && (
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          icon={<Filter className="size-5 text-primary-600" />}
          title={<span className="text-lg font-bold text-text">Refine view</span>}
          size="lg"
          bodyClassName="gap-6 pb-6"
        >
          {chipsRow}
          {sectionsBody}
          {mobileOnlyBody}
          <div className="flex items-center justify-between gap-4 pt-4 border-t border-border mt-4">
            {footerButtons}
          </div>
        </Modal>
      )}
    </>
  );
}