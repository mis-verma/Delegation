import { useMemo, useState } from 'react';
import { Tags, Trash2, X } from 'lucide-react';
import { Button, EmptyState, InlineError, PageHeader, SearchField, Skeleton, useConfirm } from '../../../components';
import { useAuth } from '../../../context/AuthContext';
import { useBulkDeleteTagsMutation, useMergeTagsMutation, useTagCleanupQuery } from '../../tags/hook';
import type { TagDuplicateGroup, TagUsage } from '../../../api/tags';
import { DuplicateGroups } from './DuplicateGroups';
import { LabelRow } from './LabelRow';

const matches = (tag: TagUsage, needle: string) => !needle || tag.name.toLowerCase().includes(needle);

export const LabelsPage = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const confirm = useConfirm();
  const { data, isPending, isError, refetch } = useTagCleanupQuery();
  const bulkDelete = useBulkDeleteTagsMutation();
  const merge = useMergeTagsMutation();
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [mergingKey, setMergingKey] = useState<string | null>(null);

  const tags = useMemo(() => data?.tags ?? [], [data]);
  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return tags.filter((tag) => matches(tag, needle));
  }, [tags, search]);
  const selected = useMemo(() => shown.filter((tag) => picked.has(tag.id)), [shown, picked]);
  const removable = selected.filter((tag) => tag.tickets + tag.tasks === 0);
  const unusedShown = shown.filter((tag) => tag.tickets + tag.tasks === 0);

  const toggle = (id: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const removeSelected = async () => {
    if (!removable.length) return;
    const inUse = selected.length - removable.length;
    const ok = await confirm({
      title: `Delete ${removable.length} ${removable.length === 1 ? 'label' : 'labels'}?`,
      description: `${removable.map((tag) => tag.name).join(', ')}. ${inUse > 0 ? `${inUse} more stay, because tickets or delegations still use them. ` : ''}This can't be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    bulkDelete.mutate(removable.map((tag) => tag.id), { onSuccess: () => setPicked(new Set()) });
  };

  const mergeGroup = async (group: TagDuplicateGroup) => {
    const ok = await confirm({
      title: `Merge into "${group.keep.name}"?`,
      description: `${group.merge.map((tag) => tag.name).join(', ')} will be replaced by "${group.keep.name}" everywhere they are used. Nothing loses its label. This can't be undone.`,
      confirmLabel: 'Merge',
      variant: 'danger',
    });
    if (!ok) return;
    setMergingKey(group.key);
    merge.mutate(
      { fromIds: group.merge.map((tag) => tag.id), intoId: group.keep.id },
      { onSettled: () => setMergingKey(null) },
    );
  };

  const header = (
    <>
      <PageHeader
        icon={Tags}
        title="Labels"
        subtitle="Every label people can put on a ticket or a delegation. Merge the ones written more than one way, and clear out the ones nothing uses."
      />
    </>
  );

  if (isError && !data) {
    return (
      <div className="flex w-full flex-col gap-5">
        {header}
        <InlineError message="Could not load the labels. Check your connection and try again." onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-5">
      {header}

      {isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : tags.length === 0 ? (
        <EmptyState icon={Tags} title="No labels yet" description="Labels are created while raising a ticket or a delegation. They will show up here once someone adds one." />
      ) : (
        <>
          <DuplicateGroups groups={data!.duplicates} busyKey={mergingKey} canMerge={isAdmin} onMerge={(group) => { void mergeGroup(group); }} />

          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-44 flex-1 sm:max-w-64">
              <SearchField value={search} onChange={setSearch} label="Search labels" placeholder="Search labels..." />
            </div>
            <span className="t-meta font-display text-text-muted tabular-nums">
              {shown.length} of {tags.length} shown, {unusedShown.length} unused
            </span>
            {isAdmin && (
              <div className="flex items-center gap-2 sm:ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={unusedShown.length === 0}
                  onClick={() => setPicked(new Set(unusedShown.map((tag) => tag.id)))}
                  className="h-9 font-display font-semibold max-sm:h-11"
                >
                  Select unused ({unusedShown.length})
                </Button>
                {picked.size > 0 && (
                  <>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={removable.length === 0}
                      isLoading={bulkDelete.isPending}
                      onClick={() => { void removeSelected(); }}
                      className="h-9 font-display font-semibold max-sm:h-11"
                    >
                      {!bulkDelete.isPending && <Trash2 size={15} aria-hidden />}
                      Delete ({removable.length})
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setPicked(new Set())} aria-label="Clear selection" className="h-9 font-display font-semibold max-sm:h-11">
                      <X size={15} aria-hidden />
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          {picked.size > 0 && removable.length < selected.length && (
            <p className="t-meta font-display text-text-muted" role="status">
              {selected.length - removable.length} of the ones you picked stay. A label on a ticket or a delegation is kept on purpose, so the history stays true. Merge it instead.
            </p>
          )}

          {shown.length === 0 ? (
            <EmptyState icon={Tags} title="No labels match" description="Try another word." action={{ label: 'Clear search', onClick: () => setSearch('') }} />
          ) : (
            <ul className="flex flex-col gap-2">
              {shown.map((tag) => (
                <LabelRow key={tag.id} tag={tag} selected={picked.has(tag.id)} onToggle={toggle} note={tag.tickets + tag.tasks === 0 ? 'Unused' : undefined} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
};
