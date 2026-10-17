import { ChevronRight, FileClock, Trash2 } from 'lucide-react';
import { Button, EmptyState, InlineError, Modal, Skeleton, useConfirm } from '../../components';
import type { Draft, DraftKind } from '../../api/drafts';
import { formatRelativeTime } from '../dashboard/dashboardDisplay';
import { useDeleteDraftMutation, useDraftsQuery } from './hook';

const NOUN: Record<DraftKind, string> = { TICKET: 'ticket', CHECKLIST: 'checklist' };

interface DraftsDialogProps {
  kind: DraftKind;
  open: boolean;
  onClose: () => void;
  onOpenDraft: (draft: Draft) => void;
}

export const DraftsDialog = ({ kind, open, onClose, onOpenDraft }: DraftsDialogProps) => {
  const { data, isPending, isError, refetch } = useDraftsQuery(kind, open);
  const remove = useDeleteDraftMutation(kind);
  const confirm = useConfirm();
  const noun = NOUN[kind];

  const askDelete = async (draft: Draft) => {
    const ok = await confirm({
      title: `Delete "${draft.title}"?`,
      description: 'This draft will be gone for good.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (ok) remove.mutate(draft.id);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      icon={<FileClock className="size-5" />}
      title="Drafts"
      description={`Saved ${noun}s that are not sent yet. Only you can see them.`}
    >
      {isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : isError ? (
        <InlineError message="Couldn't load your drafts." onRetry={() => void refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          size="compact"
          icon={FileClock}
          title="No drafts"
          description={`Use Save draft on a new ${noun} when the person it is for is not set up yet.`}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {data.map((draft) => (
            <li key={draft.id} className="flex items-center gap-2 rounded-lg border border-border/60 bg-surface pl-3 pr-1.5 py-1.5 transition-colors duration-150 hover:border-primary-300">
              <button
                type="button"
                onClick={() => onOpenDraft(draft)}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left outline-none rounded-md focus-visible:ring-2 focus-visible:ring-primary-500/40 cursor-pointer"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-500/10 text-primary-700 dark:text-primary-300" aria-hidden>
                  <FileClock className="size-4" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="t-card font-display font-semibold text-text truncate">{draft.title}</span>
                  <span className="t-meta text-text-muted">Saved {formatRelativeTime(draft.updatedAt)}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-text-light" aria-hidden />
              </button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void askDelete(draft)}
                aria-label={`Delete ${draft.title}`}
                className="size-11 sm:size-9 px-0 text-text-muted hover:text-danger"
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};
