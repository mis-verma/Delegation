import { useRef } from 'react';
import { Camera } from 'lucide-react';
import { Avatar } from './Avatar';
import { Loader } from '../loaders';

interface AvatarUploadProps {
  name: string;
  src?: string | null;
  onUpload: (file: File) => void;
  onRemove?: () => void;
  isUploading?: boolean;
  isRemoving?: boolean;
}

export const AvatarUpload = ({ name, src, onUpload, onRemove, isUploading, isRemoving }: AvatarUploadProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = Boolean(isUploading || isRemoving);

  const pickFile = () => inputRef.current?.click();

  return (
    <div className="flex items-center gap-4">
      <div className="relative group/avatar shrink-0">
        <Avatar name={name} src={src} size="xl" />
        <button
          type="button"
          onClick={pickFile}
          disabled={busy}
          className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 group-hover/avatar:opacity-100 focus-visible:opacity-100 transition-opacity duration-200 cursor-pointer disabled:cursor-not-allowed outline-none"
          aria-label="Change profile picture"
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
        <p className="text-xs font-medium text-text-secondary">Profile picture</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={pickFile}
            disabled={busy}
            className="text-xs font-display font-medium text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline cursor-pointer"
          >
            {src ? 'Change photo' : 'Upload photo'}
          </button>
          {src && onRemove && (
            <>
              <span className="text-text-light">·</span>
              <button
                type="button"
                onClick={onRemove}
                disabled={busy}
                className="text-xs font-display font-medium text-danger hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline cursor-pointer"
              >
                {isRemoving ? 'Removing…' : 'Remove'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
