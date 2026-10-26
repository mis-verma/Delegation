const MAX_EDGE = 2400;
const QUALITY = 0.88;
const SKIP_BELOW_BYTES = 400 * 1024;

const isStillImage = (file: File) =>
  (file.type.startsWith('image/') && file.type !== 'image/gif' && file.type !== 'image/svg+xml') || /\.(heic|heif)$/i.test(file.name);

const isAlreadyLight = (file: File) => file.size < SKIP_BELOW_BYTES && /^image\/(jpeg|png|webp)$/.test(file.type);

const decode = async (file: File): Promise<{ source: CanvasImageSource; width: number; height: number; done: () => void }> => {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, done: () => bitmap.close() };
    } catch {
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
};

const isHeicFile = (file: File) => /^image\/hei[cf]/.test(file.type) || /\.(heic|heif)$/i.test(file.name);

const decodeWithHeicFallback = async (file: File) => {
  try {
    return await decode(file);
  } catch (err) {
    if (!isHeicFile(file)) throw err;
    const { heicTo } = await import('heic-to');
    const jpeg = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 });
    return decode(new File([jpeg], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: file.lastModified }));
  }
};

const shrinkOne = async (file: File): Promise<File> => {
  if (!isStillImage(file) || isAlreadyLight(file)) return file;
  try {
    const { source, width, height, done } = await decodeWithHeicFallback(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) { done(); return file; }
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    done();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob || (blob.size >= file.size && file.type === 'image/jpeg')) return file;
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  }
};

export const shrinkImages = async (files: File[]): Promise<File[]> => {
  const shrunk: File[] = [];
  for (const file of files) shrunk.push(await shrinkOne(file));
  return shrunk;
};
