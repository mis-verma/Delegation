import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Plus, AlertCircle, ClipboardList, FileDown, Upload } from 'lucide-react';
import { Button, Skeleton } from '../../../components';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '../../../context/AuthContext';
import { useChecklistDefinitionsQuery } from '../hook';
import { ChecklistDefinitionCard } from './ChecklistDefinitionCard';
import { ChecklistBulkImportModal } from './bulkImport/ChecklistBulkImportModal';
import { ExportDialog } from '../../reports';

interface ChecklistTemplatesGridProps {
  className?: string;
}

export const ChecklistTemplatesGrid = ({ className = '' }: ChecklistTemplatesGridProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  // This grid's route (`/admin/scheduled-checklists`) is open to ADMIN and PC alike, but creating,
  // importing, and exporting checklist definitions is an ADMIN-only action — PC gets read access
  // to the grid (browsing/opening existing definitions) without the ability to add or bulk-change
  // them.
  const isAdmin = user?.role === 'ADMIN';
  const [showExport, setShowExport] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const { data, isPending, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useChecklistDefinitionsQuery();
  const definitions = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);
  const total = data?.pages[0]?.meta?.total ?? definitions.length;

  return (
    <div className={`flex flex-col gap-6 w-full ${className}`}>
      {/* Header & Page Actions */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-1">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="font-display text-xl sm:text-2xl font-bold text-text tracking-tight">
              Checklist Templates
            </h1>
            {!isPending && !isError && (
              <Badge variant="outline" className="font-mono text-xs py-0.5 px-2 font-semibold">
                {total}
              </Badge>
            )}
          </div>
          <p className="text-xs sm:text-sm font-display text-text-muted leading-relaxed max-w-2xl">
            Question sets, proof rules and versions — recurring checklists deployed across your stores.
          </p>
        </div>

        {/* Top Action Buttons — create/import/export are ADMIN-only, see the isAdmin comment above. */}
        {isAdmin && (
          <div className="flex items-center gap-2.5 shrink-0">
            <Button
              size="sm"
              variant="secondary"
              className="gap-1.5 text-xs font-display font-medium"
              onClick={() => setShowExport(true)}
            >
              <FileDown size={14} className="text-text-muted" />
              <span>Export</span>
            </Button>

            <Button
              size="sm"
              variant="secondary"
              className="gap-1.5 text-xs font-display font-medium"
              onClick={() => setShowBulkImport(true)}
            >
              <Upload size={14} className="text-text-muted" />
              <span>Import</span>
            </Button>

            <Button
              size="sm"
              variant="primary"
              className="gap-1.5 text-xs font-display font-medium"
              onClick={() => navigate('/admin/scheduled-checklists/builder')}
            >
              <Plus size={14} />
              <span>New checklist</span>
            </Button>
          </div>
        )}
      </div>

      {/* Loading Skeleton */}
      {isPending && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-4 p-5 rounded-lg border border-border bg-surface"
            >
              <div className="flex items-center justify-between">
                <Skeleton className="size-10 rounded-lg" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
              <Skeleton className="h-5 w-3/4 rounded-md" />
              <Skeleton className="h-4 w-1/2 rounded-md" />
              <div className="pt-3 border-t border-border/50 flex items-center justify-between">
                <Skeleton className="h-4 w-20 rounded-md" />
                <Skeleton className="h-4 w-16 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error Alert */}
      {isError && (
        <div
          role="alert"
          className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm font-display shadow-xs"
        >
          <AlertCircle size={18} className="shrink-0" />
          <span className="flex-1">Failed to load checklist templates. Please check your connection and try again.</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="shrink-0 px-3 py-1.5 rounded-md text-xs font-display font-semibold border border-danger/30 hover:bg-danger/10 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isPending && !isError && definitions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-6 border border-dashed border-border/70 rounded-xl bg-surface/30 text-center">
          <span className="flex items-center justify-center size-12 rounded-lg border border-border/60 bg-muted/60 text-text-muted mb-4">
            <ClipboardList className="size-6" strokeWidth={2.25} />
          </span>
          <h2 className="text-base sm:text-lg font-display font-bold text-text mb-1.5">
            No checklist templates yet
          </h2>
          <p className="text-xs sm:text-sm font-display text-text-muted max-w-sm mb-6 leading-relaxed">
            {isAdmin
              ? 'Create your first recurring checklist to standardize procedures, quality audits, and safety checks across your store fleet.'
              : 'An admin hasn’t created any recurring checklists yet.'}
          </p>
          {isAdmin && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate('/admin/scheduled-checklists/builder')}
              className="gap-1.5 text-xs sm:text-sm font-display font-medium"
            >
              <Plus size={15} />
              <span>Create new checklist</span>
            </Button>
          )}
        </div>
      )}

      {/* Templates Grid */}
      {!isPending && !isError && definitions.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {definitions.map((d) => (
            <ChecklistDefinitionCard key={d.id} definition={d} />
          ))}
        </div>
      )}

      {!isPending && !isError && hasNextPage && (
        <button
          type="button"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="self-center inline-flex items-center gap-1.5 h-9 px-4 rounded-xl border border-border/60 bg-surface text-xs font-display font-semibold text-text-secondary hover:bg-surface-hover hover:border-border hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 transition-all duration-200 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isFetchingNextPage ? 'Loading…' : `Load more (${total - definitions.length} remaining)`}
        </button>
      )}

      {/* Export Dialog */}
      {showExport && (
        <ExportDialog
          reportModule="checklists"
          title="Export Checklists"
          description="Every recurring checklist instance generated in the selected period — completion progress per instance."
          onClose={() => setShowExport(false)}
        />
      )}

      <ChecklistBulkImportModal open={showBulkImport} onClose={() => setShowBulkImport(false)} />
    </div>
  );
};