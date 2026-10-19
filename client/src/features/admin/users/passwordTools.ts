import { toast } from 'sonner';

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const ALL = UPPER + LOWER + DIGITS;

const pick = (chars: string) => {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return chars[n[0] % chars.length];
};

export const generatePassword = (length = 12) => {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS)];
  while (chars.length < length) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i--) {
    const n = new Uint32Array(1);
    crypto.getRandomValues(n);
    const j = n[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

export const MIN_PASSWORD_LENGTH = 8;

export const copyText = async (text: string, what = 'Password') => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error('Could not copy. Select it and copy by hand.');
  }
};
