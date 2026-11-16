import type { LucideIcon } from 'lucide-react';
import type { RowTone } from './work/statsRegistry';

export type BoardTone = 'primary' | 'danger' | 'coral' | 'success';

export interface BoardPart {
  key: string;
  label: string;
  value: number;
  icon: LucideIcon;
  href: string;
  missing?: boolean;
  loading?: boolean;
}

export interface BoardApprovalPart {
  key: string;
  label: string;
  value: number;
  href?: string;
}

export interface BoardApprovals {
  label: string;
  value: number;
  parts: readonly BoardApprovalPart[];
  href?: string;
  loading?: boolean;
  failed?: boolean;
}

export interface BoardRow {
  key: string;
  label: string;
  value: number;
  href: string;
  tone: RowTone;
  loading?: boolean;
  missing?: boolean;
}

export interface BoardColumn {
  key: string;
  label: string;
  icon: LucideIcon;
  tone: BoardTone;
  total: number;
  totalLabel: string;
  href: string;
  rows: readonly BoardRow[];
  pills?: readonly BoardApprovalPart[];
  loading?: boolean;
  failed?: boolean;
}

export interface BoardSummary {
  label: string;
  caption: string;
  icon: LucideIcon;
  total: number;
  href: string;
  parts: readonly BoardPart[];
  approvals?: BoardApprovals;
  loading?: boolean;
  failed?: boolean;
}
