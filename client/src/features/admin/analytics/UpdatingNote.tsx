export const UpdatingNote = ({ show }: { show: boolean }) =>
  show ? (
    <span role="status" className="t-meta font-display font-semibold text-text-secondary">
      Updating
    </span>
  ) : null;
