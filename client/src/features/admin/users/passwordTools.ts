import { toast } from 'sonner';

// Left out on purpose: 0/O, 1/l/I, so a password read aloud or typed from a message is not misread.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const ALL = UPPER + LOWER + DIGITS;

const pick = (chars: string) => {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return chars[n[0] % chars.length];
};

/**
 * A random 12 character password that is easy to read out and type. Always has a capital letter, a
 * small letter and a number, because the server refuses anything without them.
 */
export const generatePassword = (length = 12) => {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS)];
  while (chars.length < length) chars.push(pick(ALL));
  // Fisher-Yates with crypto randomness, so the three required characters do not always come first.
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
