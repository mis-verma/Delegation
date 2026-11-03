export type PhotoQualityFlag = 'BLURRY' | 'DARK' | 'BRIGHT' | 'TEXT_UNREADABLE' | 'CROPPED';

const FLAGS: readonly PhotoQualityFlag[] = ['BLURRY', 'DARK', 'BRIGHT', 'TEXT_UNREADABLE', 'CROPPED'];
const FAILING: readonly PhotoQualityFlag[] = ['BLURRY', 'TEXT_UNREADABLE', 'CROPPED'];

const LABEL: Record<PhotoQualityFlag, string> = {
  BLURRY: 'Blurry',
  DARK: 'Too dark',
  BRIGHT: 'Too bright',
  TEXT_UNREADABLE: 'Text unreadable',
  CROPPED: 'Cropped',
};

const TITLE: Record<PhotoQualityFlag, string> = {
  BLURRY: 'This photo looks out of focus',
  DARK: 'This photo looks too dark to see clearly',
  BRIGHT: 'This photo looks washed out by light or glare',
  TEXT_UNREADABLE: 'The writing in this photo looks too soft to read',
  CROPPED: 'The writing in this photo runs off the edge of the picture',
};

const ADVICE: Record<PhotoQualityFlag, string> = {
  BLURRY: 'Hold the phone steady and tap the screen to focus.',
  DARK: 'Move to better light or switch the flash on.',
  BRIGHT: 'Step away from glare or direct light.',
  TEXT_UNREADABLE: 'Move closer, hold steady and tap the writing to focus.',
  CROPPED: 'Step back so the whole page or label fits inside the picture.',
};

const REVIEW_LABEL: Record<string, string> = {
  BLURRY: 'Blurry',
  TEXT_UNREADABLE: 'Text unreadable',
  CROPPED: 'Cropped',
  OTHER: 'Not clear',
};

export const REVIEW_REASONS: readonly { value: 'BLURRY' | 'TEXT_UNREADABLE' | 'CROPPED' | 'OTHER'; label: string }[] = [
  { value: 'BLURRY', label: 'Blurry' },
  { value: 'TEXT_UNREADABLE', label: 'Text unreadable' },
  { value: 'CROPPED', label: 'Cropped' },
  { value: 'OTHER', label: 'Other' },
];

type WithQuality = { qualityFlags?: string | null; reviewStatus?: string | null; reviewReason?: string | null };

export const qualityFlagsOf = (image: WithQuality): PhotoQualityFlag[] =>
  (image.qualityFlags ?? '')
    .split(',')
    .filter((flag): flag is PhotoQualityFlag => (FLAGS as readonly string[]).includes(flag));

export const qualityLabel = (flag: PhotoQualityFlag): string => LABEL[flag];

export const qualityTitle = (flag: PhotoQualityFlag): string => TITLE[flag];

export const isFailedPhoto = (image: WithQuality): boolean => {
  if (image.reviewStatus === 'REJECTED') return true;
  if (image.reviewStatus === 'ACCEPTED') return false;
  return qualityFlagsOf(image).some((flag) => (FAILING as readonly string[]).includes(flag));
};

export const passingPhotos = <T extends WithQuality>(images: readonly T[] | undefined): T[] => (images ?? []).filter((img) => !isFailedPhoto(img));

export const failedPhotos = <T extends WithQuality>(images: readonly T[] | undefined): T[] => (images ?? []).filter(isFailedPhoto);

export const failureLabel = (image: WithQuality): string => {
  if (image.reviewStatus === 'REJECTED') return `Rejected: ${REVIEW_LABEL[image.reviewReason ?? 'OTHER'] ?? 'Not clear'}`;
  const flag = qualityFlagsOf(image).find((f) => (FAILING as readonly string[]).includes(f));
  return flag ? LABEL[flag] : 'Not clear';
};

export const failureTitle = (image: WithQuality): string => {
  if (image.reviewStatus === 'REJECTED') return 'Your approver rejected this photo. Take a new, clear one. This one stays on record.';
  const flag = qualityFlagsOf(image).find((f) => (FAILING as readonly string[]).includes(f));
  return flag ? `${TITLE[flag]}. Take a new, clear photo. This one stays on record.` : 'This photo did not pass.';
};

export const hasWeakPhoto = (images: readonly WithQuality[] | undefined): boolean =>
  (images ?? []).some((img) => qualityFlagsOf(img).length > 0 || img.reviewStatus === 'REJECTED');

export const weakPhotoMessage = (images: readonly WithQuality[] | undefined): string | null => {
  const weak = (images ?? []).filter((img) => qualityFlagsOf(img).length > 0);
  if (weak.length === 0) return null;
  const failed = weak.filter(isFailedPhoto);
  const first = qualityFlagsOf(failed[0] ?? weak[0])[0];
  const subject = weak.length === 1 ? `The photo looks ${LABEL[first].toLowerCase()}` : `${weak.length} photos look weak`;
  const next = failed.length > 0
    ? 'Take a new, clear photo. The weak one stays on record.'
    : 'A clearer photo will help your approver.';
  return `${subject}. ${ADVICE[first]} ${next}`;
};
