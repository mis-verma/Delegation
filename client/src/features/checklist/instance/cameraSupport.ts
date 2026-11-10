export const needsDesktopCamera = (live: boolean, accept: string) =>
  live
  && accept.startsWith('image')
  && typeof navigator !== 'undefined'
  && !!navigator.mediaDevices?.getUserMedia
  && !window.matchMedia('(pointer: coarse)').matches;

export const MAX_LIVE_PHOTOS = 25;

export const canUseInAppCamera = (accept: string) =>
  accept.startsWith('image')
  && typeof navigator !== 'undefined'
  && !!navigator.mediaDevices?.getUserMedia;

export const toFileList = (files: File | readonly File[]): FileList => {
  const transfer = new DataTransfer();
  for (const file of Array.isArray(files) ? files : [files as File]) transfer.items.add(file);
  return transfer.files;
};
