import { useState, type ReactNode } from 'react';
import { CheckCircle2, CircleOff, LayoutGrid, ListFilter, Plus, Search, Table2, X } from 'lucide-react';
import {
  Button,
  Input,
  Skeleton,
  ViewToggle,
  type EntityStatusFilterValue,
  type ViewTab,
} from '../../../components';
import { OptionSection, OptionSegmented, OptionsSheet } from '../../../components/optionsSheet';
import type { DirectoryView } from './useDirectoryView';

const VIEW_TABS: ViewTab<DirectoryView>[] = [
  { key: 'cards', label: 'Cards', icon: LayoutGrid },
  // A wide table is not usable one-handed, so phones keep the cards.
  { key: 'table', label: 'Table', icon: Table2, mobileHidden: true },
];

interface OrgToolbarProps {
  searchLabel: string;
  searchPlaceholder: string;
  searchText: string;
  onSearchText: (value: string) => void;
  view: DirectoryView;
  onView: (view: DirectoryView) => void;
  newLabel: string;
  onNew: () => void;
  /** Starts downloading the form's code before it is needed. */
  onPreloadForm: () => void;
  /** Number on the Options badge (filters that narrow the list; sort is not counted). */
  activeCount: number;
  /** Under the sheet title, e.g. "4 of 9 departments". */
  subtitle: string;
  showLabel: string;
  canReset: boolean;
  onReset: () => void;
  /** "4 of 9 departments" while search or status narrows the list, otherwise null. */
  resultText: string | null;
  onClearFilters: () => void;
  /** Sheet body: usually an OrgStatusSection and a Sort by section. */
  children: ReactNode;
}

/**
 * One row for the Departments and Stores tabs: search, Cards/Table switch, a single Options button
 * and the New button. Filters live in the sheet so the row stays calm; when something narrows the
 * list, a slim line underneath says so and offers a way back.
 */
export const OrgToolbar = ({
  searchLabel, searchPlaceholder, searchText, onSearchText, view, onView, newLabel, onNew, onPreloadForm,
  activeCount, subtitle, showLabel, canReset, onReset, resultText, onClearFilters, children,
}: OrgToolbarProps) => {
  const [showOptions, setShowOptions] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 basis-56 min-w-0">
          <Input
            type="text"
            aria-label={searchLabel}
            placeholder={searchPlaceholder}
            autoComplete="off"
            value={searchText}
            onChange={(e) => onSearchText(e.target.value)}
            suffix={
              searchText ? (
                <button
                  type="button"
                  onClick={() => onSearchText('')}
                  aria-label="Clear search"
                  className="flex items-center justify-center size-8 -mr-2 rounded-md text-text-light hover:text-text cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
                >
                  <X size={15} />
                </button>
              ) : (
                <Search size={15} aria-hidden />
              )
            }
          />
        </div>

        <ViewToggle tabs={VIEW_TABS} value={view} onChange={onView} storageKey="view:directory" />

        <OptionsSheet
          isOpen={showOptions}
          setIsOpen={setShowOptions}
          activeCount={activeCount}
          subtitle={subtitle}
          onReset={onReset}
          canReset={canReset}
          showLabel={showLabel}
        >
          {children}
        </OptionsSheet>

        <Button
          variant="primary"
          size="sm"
          onClick={onNew}
          onMouseEnter={onPreloadForm}
          onFocus={onPreloadForm}
          className="group"
        >
          <Plus className="w-3.5 h-3.5 transition-transform duration-300 group-hover:rotate-90" />
          {newLabel}
        </Button>
      </div>

      <span className="sr-only" aria-live="polite">{resultText ?? ''}</span>
      {resultText && (
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-xs font-display text-text-muted">{resultText}</span>
          <Button variant="ghost" size="sm" onClick={onClearFilters}>
            <X className="size-3.5" aria-hidden />
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
};

/** The Status block of the Options sheet: All / Active / Deactivated, each with its count. */
export const OrgStatusSection = ({ value, onChange, counts }: {
  value: EntityStatusFilterValue;
  onChange: (value: EntityStatusFilterValue) => void;
  counts: { all: number; active: number; inactive: number };
}) => (
  <OptionSection icon={ListFilter} label="Status">
    <OptionSegmented
      options={[
        { value: 'all', label: `All ${counts.all}`, icon: ListFilter },
        { value: 'active', label: `Active ${counts.active}`, icon: CheckCircle2 },
        { value: 'inactive', label: `Deactivated ${counts.inactive}`, icon: CircleOff },
      ]}
      value={value}
      onChange={onChange}
    />
  </OptionSection>
);

/** Table-shaped loading placeholder: a few rows in the same bordered panel the real table uses. */
export const OrgTableSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <div className="w-full overflow-hidden rounded-lg border border-border/60" aria-busy="true">
    <div className="h-10 bg-primary-800" />
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center gap-4 px-3 py-3 border-b border-border/40 last:border-b-0">
        <Skeleton className="size-8 rounded-lg shrink-0" />
        <Skeleton className="h-3.5 w-40" />
        <div className="flex-1" />
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
    ))}
  </div>
);
