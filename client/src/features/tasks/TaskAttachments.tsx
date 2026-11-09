import { useState } from 'react';
import { Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useConfirm } from '../../components';
import { AttachmentGrid, type AttachmentGridItem } from '../../components/attachmentGrid';
import { UploadProgress } from '../../components/uploadProgress';
import { UPLOADS_BASE } from '../../lib/uploadsBase';
import { TASK_FILE_RULE, reportDropped, screenFiles } from '../../lib/attachmentRules';
import { useFileDrop } from '../../lib/useFileDrop';
import { useUploadTaskAttachmentsMutation, useDeleteTaskAttachmentMutation } from './hook';
import { AttachFilesToolbar } from './AttachFilesToolbar';
import type { TaskAttachment } from '../../api/task';
import { DETAIL_SECTION_HEADING, DETAIL_SECTION_TILE } from '../tickets/detail/detailConstants';

interface TaskAttachmentsProps {
  taskId: string;
  attachments: TaskAttachment[];
  canEdit: boolean;
  canRemove?: boolean;
  onPreview: (url: string) => void;
}

export const TaskAttachments = ({ taskId, attachments, canEdit, canRemove = canEdit, onPreview }: TaskAttachmentsProps) => {
  const [progress, setProgress] = useState<number | null>(null);
  const [sending, setSending] = useState(0);
  const upload = useUploadTaskAttachmentsMutation(taskId, setProgress);
  const remove = useDeleteTaskAttachmentMutation();
  const confirm = useConfirm();

  const send = (list: File[]) => {
    if (upload.isPending) return;
    const files = screenFiles(list, TASK_FILE_RULE);
    if (!files.length) return;
    setSending(files.length);
    setProgress(0);
    upload.mutate(files, {
      onSuccess: (res) => reportDropped(files.length, res.data.length, TASK_FILE_RULE),
      onSettled: () => setProgress(null),
    });
  };

  const drop = useFileDrop(send, canEdit && !upload.isPending);

  if (attachments.length === 0 && !canEdit) return null;

  const gridItems: AttachmentGridItem[] = attachments.map((a) => ({
    id: a.id,
    url: `${UPLOADS_BASE}${a.url}`,
    mimeType: a.mimeType,
    name: a.originalFilename,
    sizeBytes: a.sizeBytes,
  }));
  const byId = new Map(attachments.map((a) => [a.id, a]));

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
    <section
      className={cn(
        'relative flex flex-col gap-2 rounded-xl transition-colors duration-150 ease-out',
        drop.active && 'bg-primary-500/5 outline-2 outline-dashed outline-offset-4 outline-primary-400',
      )}
      aria-label="Files"
      {...drop.bind}
    >
      <h3 className={DETAIL_SECTION_HEADING}>
        <span className={DETAIL_SECTION_TILE} aria-hidden="true"><Paperclip size={14} strokeWidth={2.25} /></span>
        Files
        {attachments.length > 0 && <span className="tabular-nums font-semibold text-text-light">({attachments.length})</span>}
      </h3>

      {gridItems.length > 0 && (
        <AttachmentGrid
          items={gridItems}
          onOpen={(item) => onPreview(item.url)}
          onRemove={canRemove ? (item) => { const a = byId.get(item.id); if (a) void handleRemove(a); } : undefined}
          removing={remove.isPending}
        />
      )}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <AttachFilesToolbar bordered onFiles={(list) => send(Array.from(list))} disabled={upload.isPending} />
          {upload.isPending ? (
            <UploadProgress count={sending} fraction={progress} />
          ) : (
            <span className="t-meta text-text-muted max-sm:hidden">
              Drop files here. {TASK_FILE_RULE.summary}
            </span>
          )}
        </div>
      )}
    </section>
  );
};
