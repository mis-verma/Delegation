import { useState, type ReactNode } from 'react';
import { CreateButton } from '../../../components/createButton';
import { CheckCircle2, CircleOff, LayoutGrid, ListFilter, Table2, X } from 'lucide-react';
import {
  Button,
  SearchField,
  Skeleton,
  ViewToggle,
  type EntityStatusFilterValue,
  type ViewTab,
} from '../../../components';
import { OptionSection, OptionSegmented, OptionsSheet } from '../../../components/optionsSheet';
import type { DirectoryView } from './useDirectoryView';

const VIEW_TABS: ViewTab<DirectoryView>[] = [
  { key: 'cards', label: 'Cards', icon: LayoutGrid },
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
  onPreloadForm: () => void;
  activeCount: number;
  subtitle: string;
  showLabel: string;
  canReset: boolean;
  onReset: () => void;
  resultText: string | null;
  onClearFilters: () => void;
  children: ReactNode;
}

export const OrgToolbar = ({
  searchLabel, searchPlaceholder, searchText, onSearchText, view, onView, newLabel, onNew, onPreloadForm,
  activeCount, subtitle, showLabel, canReset, onReset, resultText, onClearFilters, children,
}: OrgToolbarProps) => {
  const [showOptions, setShowOptions] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          value={searchText}
          onChange={onSearchText}
          label={searchLabel}
          placeholder={searchPlaceholder}
          className="basis-40 sm:basis-56 sm:max-w-sm"
        />

        <div className="hidden sm:block">
          <ViewToggle tabs={VIEW_TABS} value={view} onChange={onView} storageKey="view:directory" />
        </div>

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

        <CreateButton label={newLabel} onClick={onNew} onPreload={onPreloadForm} />
      </div>

      <span className="sr-only" aria-live="polite">{resultText ?? ''}</span>
      {resultText && (
        <div className="flex items-center gap-2">
          <span aria-hidden className="t-meta font-display text-text-muted">{resultText}</span>
          <Button variant="ghost" size="sm" onClick={onClearFilters} className="pointer-coarse:min-h-11">
            <X className="size-3.5" aria-hidden />
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
};

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

export const OrgTableSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <div className="w-full overflow-hidden rounded-lg border border-border/60" role="status" aria-label="Loading">
    <div className="h-10 bg-primary-800" aria-hidden="true" />
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
