interface ActionLabelProps {
  children: string;
}

/**
 * The words on a small inline action. Below md the icon carries the button on its own, because
 * a phone row has no space for three labelled controls. Every button using this needs its own
 * aria-label and title, so the name survives for a screen reader and appears on hover.
 */
export const ActionLabel = ({ children }: ActionLabelProps) => <span className="hidden md:inline">{children}</span>;
