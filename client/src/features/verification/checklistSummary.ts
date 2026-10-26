export interface PreviewImage {
  id: string;
  url: string;
  mimeType?: string;
  captureMethod?: 'LIVE' | 'GALLERY';
}

export interface PreviewItem {
  id: string;
  label: string;
  isDone: boolean;
  requiredImageCount: number;
  images: PreviewImage[];
}

export interface PreviewChecklist {
  id: string;
  title: string;
  items: PreviewItem[];
}

export const summarizeChecklists = (checklists: PreviewChecklist[] | undefined) => {
  const items = checklists?.flatMap((c) => c.items) ?? [];
  const done = items.filter((i) => i.isDone).length;
  const missingPhotos = items.filter((i) => i.requiredImageCount > 0 && i.images.length < i.requiredImageCount).length;
  return { total: items.length, done, missingPhotos };
};
