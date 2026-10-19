import { Keyboard } from 'lucide-react';
import { Modal } from '../../components';

const SHORTCUTS: { keys: string; does: string }[] = [
  { keys: 'J or Down', does: 'Next checklist' },
  { keys: 'K or Up', does: 'Previous checklist' },
  { keys: 'Enter', does: 'Open the selected checklist' },
  { keys: 'A', does: 'Approve it' },
  { keys: 'S', does: 'Start a send-back' },
  { keys: 'Esc', does: 'Close the review' },
  { keys: '?', does: 'Show this list' },
];

export const ShortcutsHelp = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <Modal open={open} onClose={onClose} size="sm" title="Keyboard shortcuts" icon={<Keyboard size={18} aria-hidden />}>
    <dl className="flex flex-col divide-y divide-border/40">
      {SHORTCUTS.map(({ keys, does }) => (
        <div key={keys} className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
          <dt className="text-sm font-display text-text-secondary">{does}</dt>
          <dd>
            <kbd className="inline-flex items-center px-2 py-0.5 rounded-md border border-border bg-surface-hover t-meta font-display font-semibold text-text">{keys}</kbd>
          </dd>
        </div>
      ))}
    </dl>
    <p className="t-meta font-display text-text-muted">Shortcuts pause while you type in a box.</p>
  </Modal>
);
