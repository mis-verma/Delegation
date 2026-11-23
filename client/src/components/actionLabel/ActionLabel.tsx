interface ActionLabelProps {
  children: string;
}

/**
 * The words on a small inline action, kept for pointer and screen width but dropped on a phone,
 * where the icon carries it and the row has no space for three labelled buttons. Every button
 * using this needs its own aria-label, so the accessible name survives the text being hidden.
 */
export const ActionLabel = ({ children }: ActionLabelProps) => <span className="hidden sm:inline">{children}</span>;
