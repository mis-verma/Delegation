// Phone cameras save 3 to 12 MB photos (and iPhones save HEIC, which the server does not accept), while the upload
// limit is a few MB. Every photo is redrawn here before it is sent: longest side at most 1600px, JPEG at 82%, which
// keeps a proof photo sharp and usually lands well under 1 MB. Anything that is not a still image (a video, a PDF,
// a GIF), or that this browser cannot decode, is sent as it is.
const MAX_EDGE = 1600;
const QUALITY = 0.82;
// Small, already-light JPEG/PNG/WebP files are left alone: redrawing them gains nothing.
const SKIP_BELOW_BYTES = 400 * 1024;

const isStillImage = (file: File) =>
  (file.type.startsWith('image/') && file.type !== 'image/gif' && file.type !== 'image/svg+xml') || /\.(heic|heif)$/i.test(file.name);

const isAlreadyLight = (file: File) => file.size < SKIP_BELOW_BYTES && /^image\/(jpeg|png|webp)$/.test(file.type);

const decode = async (file: File): Promise<{ source: CanvasImageSource; width: number; height: number; done: () => void }> => {
  // createImageBitmap honours the photo's EXIF rotation, so a portrait shot stays upright.
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, done: () => bitmap.close() };
    } catch {
      // Fall through to the <img> path (older Safari).
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

// Desktop Chrome, Firefox and most Android browsers cannot read an iPhone HEIC photo. Only then is the converter
// loaded (a separate, lazily fetched file, so nobody else downloads it) and the photo turned into a JPEG first.
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
    // Keep the original when redrawing did not help (rare: a tiny, already-compressed photo).
    if (!blob || (blob.size >= file.size && file.type === 'image/jpeg')) return file;
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    // Could not be read even by the HEIC converter (a damaged file): send it as it is and let the server say why.
    return file;
  }
};

/** Shrinks every still photo in the list before upload; other files pass through unchanged. */
export const shrinkImages = (files: File[]): Promise<File[]> => Promise.all(files.map(shrinkOne));
