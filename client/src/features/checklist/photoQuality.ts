export type PhotoQualityFlag = 'BLURRY' | 'DARK' | 'BRIGHT';

const FLAGS: readonly PhotoQualityFlag[] = ['BLURRY', 'DARK', 'BRIGHT'];

const LABEL: Record<PhotoQualityFlag, string> = {
  BLURRY: 'Blurry',
  DARK: 'Too dark',
  BRIGHT: 'Too bright',
};

const TITLE: Record<PhotoQualityFlag, string> = {
  BLURRY: 'This photo looks out of focus',
  DARK: 'This photo looks too dark to see clearly',
  BRIGHT: 'This photo looks washed out by light or glare',
};

const ADVICE: Record<PhotoQualityFlag, string> = {
  BLURRY: 'Hold the phone steady and tap the screen to focus.',
  DARK: 'Move to better light or switch the flash on.',
  BRIGHT: 'Step away from glare or direct light.',
};

type WithQuality = { qualityFlags?: string | null };

export const qualityFlagsOf = (image: WithQuality): PhotoQualityFlag[] =>
  (image.qualityFlags ?? '')
    .split(',')
    .filter((flag): flag is PhotoQualityFlag => (FLAGS as readonly string[]).includes(flag));

export const qualityLabel = (flag: PhotoQualityFlag): string => LABEL[flag];

export const qualityTitle = (flag: PhotoQualityFlag): string => TITLE[flag];

export const hasWeakPhoto = (images: readonly WithQuality[] | undefined): boolean => (images ?? []).some((img) => qualityFlagsOf(img).length > 0);

export const weakPhotoMessage = (images: readonly WithQuality[] | undefined): string | null => {
  const weak = (images ?? []).filter((img) => qualityFlagsOf(img).length > 0);
  if (weak.length === 0) return null;
  const first = qualityFlagsOf(weak[0])[0];
  const subject = weak.length === 1 ? `The photo looks ${LABEL[first].toLowerCase()}` : `${weak.length} photos look weak`;
  return `${subject}. ${ADVICE[first]} Delete it and retake for a clearer proof.`;
};
