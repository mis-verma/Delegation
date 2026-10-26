import { useRef, useState } from 'react';
import { ImagePlus, Loader2, RefreshCw, X } from 'lucide-react';
import { Button, InlineError, ThumbImage } from '../../../../components';
import { UPLOADS_BASE } from '../../../../lib/uploadsBase';
import { checklistDefinitionApi } from '../../../../api/checklistDefinitions';
import { errorMessage } from '../../../../lib/queryHelpers';

interface ReferencePhotoFieldProps {
  url: string;
  onChange: (url: string) => void;
}

export const ReferencePhotoField = ({ url, onChange }: ReferencePhotoFieldProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await checklistDefinitionApi.uploadReferenceImage(file));
    } catch (err) {
      setError(errorMessage(err, "Couldn't upload that photo. Try again."));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
      <span className="t-meta font-display font-semibold text-text-secondary">Example photo</span>
      <input ref={inputRef} type="file" accept="image/*" className="sr-only" aria-label="Choose an example photo" onChange={(e) => void pick(e.target.files?.[0])} />
      {url ? (
        <div className="flex items-center gap-3">
          <ThumbImage src={`${UPLOADS_BASE}${url}`} alt="Example photo" width={320} className="size-20 rounded-lg border border-border object-cover" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}
              Change
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onChange('')}>
              <X size={14} aria-hidden="true" />
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" className="self-start" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <ImagePlus size={14} aria-hidden="true" />}
          Add an example photo
        </Button>
      )}
      <p className="t-meta font-display text-text-muted">Staff and reviewers see it next to the question, so everyone knows what a good photo looks like.</p>
      {error && <InlineError message={error} />}
    </div>
  );
};
