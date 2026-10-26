import { ApiError, apiUpload, type UploadProgress } from '../api/http';
import { enqueueUpload } from './uploadQueue';
import { listPending, putPending, removePending, type PendingUpload } from './uploadStore';

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const idsByKey = new WeakMap<object, string>();
const inFlight = new Set<string>();

const toFormData = (upload: PendingUpload): FormData => {
  const form = new FormData();
  for (const file of upload.files) {
    form.append(file.field, new File([file.blob], file.name, { type: file.type, lastModified: file.lastModified }));
  }
  for (const [name, value] of upload.fields) form.append(name, value);
  return form;
};

const neverReachedServer = (err: unknown) => err instanceof ApiError && err.status === 0;

export const uploadKeepingCopy = async <T>(key: object, upload: Omit<PendingUpload, 'id' | 'createdAt'>, onProgress?: UploadProgress): Promise<T> => {
  let id = idsByKey.get(key);
  if (!id) {
    id = crypto.randomUUID();
    idsByKey.set(key, id);
  }
  const record: PendingUpload = { ...upload, id, createdAt: Date.now() };
  await putPending(record);
  inFlight.add(id);
  try {
    const result = await enqueueUpload(() => apiUpload<T>(record.path, toFormData(record), onProgress));
    await removePending(id);
    return result;
  } catch (err) {
    if (!neverReachedServer(err)) await removePending(id);
    throw err;
  } finally {
    inFlight.delete(id);
  }
};

export const resumePendingUploads = async (): Promise<number> => {
  const saved = await listPending();
  const now = Date.now();
  let finished = 0;
  for (const upload of saved) {
    if (inFlight.has(upload.id)) continue;
    if (now - upload.createdAt > MAX_AGE_MS) {
      await removePending(upload.id);
      continue;
    }
    inFlight.add(upload.id);
    try {
      await enqueueUpload(() => apiUpload(upload.path, toFormData(upload)));
      await removePending(upload.id);
      finished += 1;
    } catch (err) {
      if (!neverReachedServer(err)) await removePending(upload.id);
    } finally {
      inFlight.delete(upload.id);
    }
  }
  return finished;
};
