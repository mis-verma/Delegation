const JPEG_START = 0xffd8;
const APP1 = 0xffe1;
const TAG_EXIF_POINTER = 0x8769;
const TAG_DATE_ORIGINAL = 0x9003;
const TAG_DATE_DIGITIZED = 0x9004;
const TAG_DATE_MODIFIED = 0x0132;
const TYPE_ASCII = 2;
const HEAD_BYTES = 131_072;
const STAMP = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/;

const readText = (view: DataView, start: number, length: number): string => {
  let text = '';
  for (let i = 0; i < length && start + i < view.byteLength; i++) {
    const code = view.getUint8(start + i);
    if (code === 0) break;
    text += String.fromCharCode(code);
  }
  return text;
};

const toDate = (stamp: string): Date | null => {
  const m = STAMP.exec(stamp);
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  return Number.isNaN(date.getTime()) || Number(m[1]) < 1990 ? null : date;
};

const readIfd = (view: DataView, tiff: number, offset: number, little: boolean): Map<number, { type: number; count: number; valueAt: number }> => {
  const tags = new Map<number, { type: number; count: number; valueAt: number }>();
  const start = tiff + offset;
  if (start + 2 > view.byteLength) return tags;
  const entries = view.getUint16(start, little);
  for (let i = 0; i < entries; i++) {
    const at = start + 2 + i * 12;
    if (at + 12 > view.byteLength) break;
    tags.set(view.getUint16(at, little), {
      type: view.getUint16(at + 2, little),
      count: view.getUint32(at + 4, little),
      valueAt: at + 8,
    });
  }
  return tags;
};

const stampOf = (view: DataView, tiff: number, little: boolean, tags: ReturnType<typeof readIfd>, tag: number): Date | null => {
  const entry = tags.get(tag);
  if (!entry || entry.type !== TYPE_ASCII || entry.count < 19) return null;
  const at = entry.count > 4 ? tiff + view.getUint32(entry.valueAt, little) : entry.valueAt;
  return toDate(readText(view, at, entry.count));
};

const exifTime = (view: DataView): Date | null => {
  if (view.byteLength < 4 || view.getUint16(0) !== JPEG_START) return null;
  let offset = 2;
  while (offset + 4 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return null;
    const marker = view.getUint16(offset);
    const size = view.getUint16(offset + 2);
    if (marker === APP1 && readText(view, offset + 4, 4) === 'Exif') {
      const tiff = offset + 10;
      const little = view.getUint16(tiff) === 0x4949;
      const first = readIfd(view, tiff, view.getUint32(tiff + 4, little), little);
      const pointer = first.get(TAG_EXIF_POINTER);
      const sub = pointer ? readIfd(view, tiff, view.getUint32(pointer.valueAt, little), little) : new Map();
      return stampOf(view, tiff, little, sub, TAG_DATE_ORIGINAL)
        ?? stampOf(view, tiff, little, sub, TAG_DATE_DIGITIZED)
        ?? stampOf(view, tiff, little, first, TAG_DATE_MODIFIED);
    }
    if (marker === 0xffda) return null;
    offset += 2 + size;
  }
  return null;
};

export const captureTimeOf = async (file: File): Promise<Date> => {
  const fallback = new Date(file.lastModified);
  if (file.type !== 'image/jpeg') return fallback;
  try {
    const found = exifTime(new DataView(await file.slice(0, HEAD_BYTES).arrayBuffer()));
    return found && found.getTime() <= Date.now() + 5 * 60_000 ? found : fallback;
  } catch {
    return fallback;
  }
};
