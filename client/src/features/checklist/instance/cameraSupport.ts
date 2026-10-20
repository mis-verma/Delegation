export const needsDesktopCamera = (live: boolean, accept: string) =>
  live
  && accept.startsWith('image')
  && typeof navigator !== 'undefined'
  && !!navigator.mediaDevices?.getUserMedia
  && !window.matchMedia('(pointer: coarse)').matches;

export const toFileList = (file: File): FileList => {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  return transfer.files;
};
