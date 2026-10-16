import { Paperclip, Loader2, X, Download } from 'lucide-react';
import { useConfirm } from '../../components';
import { UPLOADS_BASE } from '../../lib/uploadsBase';
import { useUploadTaskAttachmentsMutation, useDeleteTaskAttachmentMutation } from './hook';
import { AttachFilesToolbar } from './AttachFilesToolbar';
import { attachmentIconFor, attachmentTypeLabel, formatFileSize, isImageAttachment } from './taskAttachmentDisplay';
import type { TaskAttachment } from '../../api/task';

interface TaskAttachmentsProps {
  taskId: string;
  attachments: TaskAttachment[];
  /** Adds the "Add file" button and a remove button on each file. */
  canEdit: boolean;
  /** Narrows the remove buttons only (an approved delegation keeps its files unless an Admin removes
   *  them). Defaults to canEdit. */
  canRemove?: boolean;
  onPreview: (url: string) => void;
}

const REMOVE_BUTTON =
  'flex items-center justify-center size-8 rounded-full bg-surface text-text-muted hover:text-danger border border-border/50 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-danger disabled:opacity-50 after:absolute after:-inset-1.5';

/**
 * The files that belong to the delegation itself: photos as thumbnails that open full size,
 * everything else (PDF, CSV, video) as a row you can open. Hidden when there is nothing to show and
 * nothing the viewer could add.
 */
export const TaskAttachments = ({ taskId, attachments, canEdit, canRemove = canEdit, onPreview }: TaskAttachmentsProps) => {
  const upload = useUploadTaskAttachmentsMutation(taskId);
  const remove = useDeleteTaskAttachmentMutation();
  const confirm = useConfirm();

  if (attachments.length === 0 && !canEdit) return null;

  const images = attachments.filter((a) => isImageAttachment(a.mimeType));
  const files = attachments.filter((a) => !isImageAttachment(a.mimeType));

  const handleRemove = async (attachment: TaskAttachment) => {
    const ok = await confirm({
      title: 'Remove this file?',
      description: 'It will be taken off the delegation for everyone.',
      confirmLabel: 'Remove file',
      cancelLabel: 'Keep it',
      variant: 'danger',
    });
    if (ok) remove.mutate(attachment.id);
  };

  return (
    <section className="flex flex-col gap-2" aria-label="Files">
      <h3 className="flex items-center gap-2.5 t-card font-display font-bold text-text">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white bg-linear-to-br from-primary-500 to-primary-600" aria-hidden="true"><Paperclip size={16} strokeWidth={2.25} /></span>
        Files
        {attachments.length > 0 && <span className="tabular-nums font-semibold text-text-light">({attachments.length})</span>}
      </h3>

      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {images.map((a) => {
            const url = `${UPLOADS_BASE}${a.url}`;
            return (
              <div key={a.id} className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-surface-hover">
                <button
                  type="button"
                  onClick={() => onPreview(url)}
                  className="size-full cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                  aria-label={`Open photo ${a.originalFilename ?? ''}`.trim()}
                >
                  <img src={url} alt={a.originalFilename ?? 'Delegation photo'} loading="lazy" className="size-full object-cover" />
                </button>
                {canRemove && (
                  <button
                    type="button"
                    onClick={() => handleRemove(a)}
                    disabled={remove.isPending}
                    aria-label="Remove photo"
                    className={`${REMOVE_BUTTON} absolute top-1 right-1 opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 focus-visible:opacity-100 transition-opacity duration-150`}
                  >
                    <X size={14} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {files.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {files.map((a) => {
            const Icon = attachmentIconFor(a.mimeType);
            return (
              <li key={a.id} className="relative flex items-center gap-2.5 rounded-lg border border-border/70 bg-surface-hover/40 px-3 py-2">
                <Icon size={18} className="shrink-0 text-text-light" aria-hidden />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-display font-semibold text-text truncate" title={a.originalFilename ?? undefined}>
                    {a.originalFilename ?? 'Untitled file'}
                  </p>
                  <p className="text-xs text-text-muted tabular-nums">{attachmentTypeLabel(a.mimeType)}, {formatFileSize(a.sizeBytes)}</p>
                </div>
                <a
                  href={`${UPLOADS_BASE}${a.url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${a.originalFilename ?? 'file'}`}
                  className="relative flex items-center justify-center size-8 shrink-0 rounded-full text-text-muted hover:text-primary-700 dark:hover:text-primary-300 hover:bg-surface-hover outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 after:absolute after:-inset-1.5"
                >
                  <Download size={15} />
                </a>
                {canRemove && (
                  <button
                    type="button"
                    onClick={() => handleRemove(a)}
                    disabled={remove.isPending}
                    aria-label={`Remove ${a.originalFilename ?? 'file'}`}
                    className={`${REMOVE_BUTTON} relative shrink-0`}
                  >
                    <X size={14} strokeWidth={2.5} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Same File and Photo buttons as the New delegation form (Photo opens the camera on a phone). */}
      {canEdit && (
        <div className="flex items-center gap-2">
          <AttachFilesToolbar bordered onFiles={(list) => upload.mutate(Array.from(list))} disabled={upload.isPending} />
          {upload.isPending && (
            <span className="inline-flex items-center gap-1.5 t-meta font-display text-text-muted" role="status">
              <Loader2 size={14} className="animate-spin" aria-hidden />
              Adding…
            </span>
          )}
        </div>
      )}
    </section>
  );
};
