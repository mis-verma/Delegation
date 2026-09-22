// Split out of ChecklistCompletionPreview.tsx — a file that exports a component AND a plain
// function trips react-refresh/only-export-components, and this rollup is shared with
// VerificationQueue.tsx for the collapsed-row badge anyway.
export interface PreviewImage {
  id: string;
  url: string;
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

/** done/total/missing-photo rollup — shared by the expanded preview's header strip AND the
 *  collapsed row's compact badge (VerificationQueue.tsx), so the two numbers can never drift
 *  apart by being computed two different ways. */
export const summarizeChecklists = (checklists: PreviewChecklist[] | undefined) => {
  const items = checklists?.flatMap((c) => c.items) ?? [];
  const done = items.filter((i) => i.isDone).length;
  const missingPhotos = items.filter((i) => i.requiredImageCount > 0 && i.images.length < i.requiredImageCount).length;
  return { total: items.length, done, missingPhotos };
};
