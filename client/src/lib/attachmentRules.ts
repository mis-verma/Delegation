import { toast } from 'sonner';

export interface FileRule {
  maxFiles: number;
  maxMb: number;
  accepts: (file: File) => boolean;
  summary: string;
}

const MB = 1024 * 1024;

const isStillImage = (file: File) =>
  (file.type.startsWith('image/') && file.type !== 'image/gif' && file.type !== 'image/svg+xml') || /\.(heic|heif)$/i.test(file.name);

const TASK_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

const isTaskFile = (file: File) =>
  file.type.startsWith('image/')
  || /\.(heic|heif)$/i.test(file.name)
  || TASK_VIDEO_TYPES.includes(file.type)
  || file.type === 'application/pdf'
  || file.type === 'text/csv'
  || file.type === 'application/vnd.ms-excel'
  || /\.(pdf|csv)$/i.test(file.name);

export const TASK_FILE_RULE: FileRule = {
  maxFiles: 8,
  maxMb: 25,
  accepts: isTaskFile,
  summary: 'PDF, CSV, photos or videos. Up to 25 MB each, 8 at a time.',
};

export const ticketPhotoRule = (limits?: { maxUploadFiles?: number; maxUploadSizeMb?: number }): FileRule => {
  const maxFiles = limits?.maxUploadFiles ?? 10;
  const maxMb = limits?.maxUploadSizeMb ?? 5;
  return {
    maxFiles,
    maxMb,
    accepts: (file) => file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name),
    summary: `Photos only. Up to ${maxFiles} at a time.`,
  };
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const screenFiles = (files: File[], rule: FileRule): File[] => {
  const wrongType: string[] = [];
  const tooBig: string[] = [];
  const kept: File[] = [];
  for (const file of files) {
    if (!rule.accepts(file)) wrongType.push(file.name);
    else if (!isStillImage(file) && file.size > rule.maxMb * MB) tooBig.push(file.name);
    else kept.push(file);
  }
  const accepted = kept.slice(0, rule.maxFiles);
  const overLimit = kept.length - accepted.length;

  const problems: string[] = [];
  if (wrongType.length) problems.push(`${plural(wrongType.length, 'file is', 'files are')} a type we can't take (${wrongType.join(', ')})`);
  if (tooBig.length) problems.push(`${plural(tooBig.length, 'file is', 'files are')} over ${rule.maxMb} MB (${tooBig.join(', ')})`);
  if (overLimit > 0) problems.push(`only ${rule.maxFiles} can go up at once, so ${plural(overLimit, 'file was', 'files were')} left out`);
  if (problems.length) {
    toast.warning(accepted.length ? 'Some files were not added' : 'No files were added', {
      description: `${problems.join('; ')}. ${rule.summary}`,
    });
  }
  return accepted;
};

export const reportDropped = (sent: number, received: number, rule: FileRule) => {
  const missing = sent - received;
  if (missing <= 0) return;
  toast.warning(`${plural(missing, 'file was', 'files were')} not added`, {
    description: `The server turned ${missing === 1 ? 'it' : 'them'} down. ${rule.summary}`,
  });
};
