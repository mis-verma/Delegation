const SEND_BACK_GRACE_MS = 2 * 60 * 60 * 1000;

export const isSendBackLocking = (sentBackAt: string | null | undefined, now: number) =>
  !!sentBackAt && now - new Date(sentBackAt).getTime() >= SEND_BACK_GRACE_MS;
