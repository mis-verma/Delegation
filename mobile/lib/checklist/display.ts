// Trimmed mirror of client/src/features/checklist/checklistDisplay.ts's deadline/progress math —
// kept numerically identical (same UTC-anchored cutoff/opens logic) so an instance never reads as
// "overdue" on one client and "on track" on the other.

export type InstanceProgressStatus = "TODO" | "IN_PROGRESS" | "COMPLETED";

export const instanceProgressStatus = (done: number, total: number): InstanceProgressStatus => {
  if (total > 0 && done === total) return "COMPLETED";
  if (done > 0) return "IN_PROGRESS";
  return "TODO";
};

type InstanceWindow = {
  periodStart: string;
  periodEnd: string;
  opensTime: string | null;
  cutoffTime: string | null;
};

export const instanceOpensAt = (instance: Pick<InstanceWindow, "periodStart" | "opensTime">): number | null => {
  if (!instance.opensTime) return null;
  const [hours, minutes] = instance.opensTime.split(":").map(Number);
  const start = new Date(instance.periodStart);
  return Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), hours, minutes, 0, 0);
};

export const instanceDeadline = (instance: InstanceWindow): number => {
  if (!instance.cutoffTime) return new Date(instance.periodEnd).getTime();
  const [hours, minutes] = instance.cutoffTime.split(":").map(Number);
  const start = new Date(instance.periodStart);
  const deadline = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), hours, minutes, 0, 0));
  if (instance.opensTime && instance.cutoffTime < instance.opensTime) {
    deadline.setUTCDate(deadline.getUTCDate() + 1);
  }
  return deadline.getTime();
};

export const isInstanceOverdue = (instance: InstanceWindow, isComplete: boolean) =>
  !isComplete && instanceDeadline(instance) < Date.now();

export const isInstanceNotYetOpen = (instance: Pick<InstanceWindow, "periodStart" | "opensTime">) => {
  const opensAt = instanceOpensAt(instance);
  return opensAt != null && Date.now() < opensAt;
};

export const formatDateShort = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

export const formatDeadlineTime = (instance: InstanceWindow): string | null => {
  if (!instance.cutoffTime) return null;
  return new Date(instanceDeadline(instance)).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC",
  });
};
