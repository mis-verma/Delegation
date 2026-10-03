import { toast } from 'sonner';

// Left out on purpose: 0/O, 1/l/I, so a password read aloud or typed from a message is not misread.
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** A random 12 character password that is easy to read out and type. */
export const generatePassword = (length = 12) => {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CHARS[b % CHARS.length]).join('');
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
