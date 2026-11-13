import { ImageOff } from 'lucide-react';

interface FailedPhotoNoteProps {
  count: number;
  needsMore?: boolean;
}

export const FailedPhotoNote = ({ count, needsMore = false }: FailedPhotoNoteProps) => {
  if (count <= 0) return null;
  return (
    <p role="status" className="flex items-start gap-1.5 t-meta font-display font-medium text-danger">
      <ImageOff className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>
        {count === 1 ? '1 photo did not pass' : `${count} photos did not pass`}. {count === 1 ? 'It stays' : 'They stay'} on record and cannot be deleted.
        {needsMore ? ' Add a new, clear photo next to it.' : ' You can still add a clear photo.'}
      </span>
    </p>
  );
};
