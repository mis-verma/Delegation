/** Shared by DepartmentCard and PersonCard — the gauge is a completion rate measured against an
 *  implicit "should be closing most of what's raised" target, so it earns the red→amber→green
 *  read every other performance-vs-target gauge in the app uses, instead of staying one flat
 *  navy tone regardless of whether the number is 12% or 96%. Neutral (border-toned) with no data,
 *  since a department/person that hasn't raised anything yet isn't a performance problem.
 *
 *  Lives in its own file, not alongside DepartmentCard/OverdueBadge — a plain function exported
 *  next to components breaks Vite's Fast Refresh boundary for that file. */
export const completionGaugeColor = (rate: number | null) => {
  if (rate == null) return 'var(--color-border)';
  if (rate >= 80) return 'var(--color-success)';
  if (rate >= 50) return 'var(--color-warning)';
  return 'var(--color-danger)';
};
