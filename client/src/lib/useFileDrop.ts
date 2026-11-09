import { useRef, useState, type DragEvent } from 'react';

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

export const useFileDrop = (onFiles: (files: File[]) => void, enabled = true) => {
  const [active, setActive] = useState(false);
  const depth = useRef(0);

  const reset = () => {
    depth.current = 0;
    setActive(false);
  };

  const bind = enabled
    ? {
        onDragEnter: (e: DragEvent) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          depth.current += 1;
          setActive(true);
        },
        onDragOver: (e: DragEvent) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        },
        onDragLeave: (e: DragEvent) => {
          if (!hasFiles(e)) return;
          depth.current = Math.max(0, depth.current - 1);
          if (depth.current === 0) setActive(false);
        },
        onDrop: (e: DragEvent) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          reset();
          const files = Array.from(e.dataTransfer.files ?? []);
          if (files.length) onFiles(files);
        },
      }
    : {};

  return { active: enabled && active, bind };
};
