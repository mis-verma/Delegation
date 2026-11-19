import { useRef } from 'react';
import { Camera } from 'lucide-react';
import { BrandLogo } from '../../../components';
import { Loader } from '../../../components/loaders';

interface LogoUploadProps {
  src: string | null;
  onUpload: (file: File) => void;
  onRemove: () => void;
  isUploading?: boolean;
  isRemoving?: boolean;
}

export const LogoUpload = ({ src, onUpload, onRemove, isUploading, isRemoving }: LogoUploadProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = Boolean(isUploading || isRemoving);
  const pickFile = () => inputRef.current?.click();

  return (
    <div className="flex items-center gap-4">
      <div className="relative group/logo shrink-0 flex items-center justify-center size-16 rounded-xl border border-border bg-surface overflow-hidden">
        {src ? (
          <img src={src} alt="Organization logo" className="max-w-full max-h-full object-contain p-2" />
        ) : (
          <BrandLogo className="size-10" showWordmark={false} />
        )}
        <button
          type="button"
          onClick={pickFile}
          disabled={busy}
          className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 group-hover/logo:opacity-100 focus-visible:opacity-100 transition-opacity duration-200 cursor-pointer disabled:cursor-not-allowed outline-none"
          aria-label="Change organization logo"
        >
          {isUploading ? <Loader size="sm" variant="white" /> : <Camera className="w-5 h-5" />}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            e.target.value = '';
          }}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="t-meta font-medium text-text-secondary">Logo</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={pickFile}
            disabled={busy}
            className="t-meta font-display font-medium text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline cursor-pointer"
          >
            {src ? 'Change logo' : 'Upload logo'}
          </button>
          {src && (
            <>
              <span className="text-text-light">·</span>
              <button
                type="button"
                onClick={onRemove}
                disabled={busy}
                className="t-meta font-display font-medium text-danger hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline cursor-pointer"
              >
                {isRemoving ? 'Removing' : 'Remove'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
