import type { LucideIcon } from 'lucide-react';

export type BoardTone = 'primary' | 'danger' | 'coral' | 'success';

export interface BoardPart {
  key: string;
  label: string;
  value: number;
  icon: LucideIcon;
  href: string;
  missing?: boolean;
}

export interface BoardApprovalPart {
  key: string;
  label: string;
  value: number;
}

export interface BoardApprovals {
  label: string;
  value: number;
  parts: readonly BoardApprovalPart[];
  href?: string;
  loading?: boolean;
  failed?: boolean;
}

export interface BoardTile {
  key: string;
  label: string;
  value: number;
  caption: string;
  icon: LucideIcon;
  tone: BoardTone;
  breakdown?: readonly BoardPart[];
  approvals?: BoardApprovals;
  href?: string;
  onSelect?: () => void;
  selected?: boolean;
  loading?: boolean;
  failed?: boolean;
  hideOnPhone?: boolean;
}
