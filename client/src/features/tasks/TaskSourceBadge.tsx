import { Mic, Bot } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import type { Task } from '../../api/task';

interface TaskSourceBadgeProps {
  aiMeta: Task['aiMeta'];
}

export const TaskSourceBadge = ({ aiMeta }: TaskSourceBadgeProps) => {
  if (!aiMeta) return null;

  if (aiMeta.channel === 'whatsapp') {
    const isVoice = aiMeta.inputMode === 'voice';
    const label = `Created via WhatsApp${isVoice ? ' (voice note)' : ''}`;
    return (
      <span
        role="img"
        aria-label={label}
        title={label}
        className="relative flex items-center justify-center text-success shrink-0"
      >
        <FaWhatsapp size={15} />
        {isVoice && (
          <Mic size={9} strokeWidth={3} className="absolute -bottom-0.5 -right-0.5 bg-surface rounded-full p-px" />
        )}
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label="Created via Smart Add on the web app"
      title="Created via Smart Add on the web app"
      className="flex items-center justify-center text-primary-700 shrink-0"
    >
      <Bot size={14} strokeWidth={2.5} />
    </span>
  );
};
