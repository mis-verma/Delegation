import { useState } from 'react';
import { CalendarRange, Flame, Gauge, Users, type LucideIcon } from 'lucide-react';

export type HomeSectionId = 'stats' | 'streak' | 'myTeam' | 'teamWeek';

export interface HomeSectionMeta {
  id: HomeSectionId;
  label: string;
  hint: string;
  icon: LucideIcon;
}

export const HOME_SECTIONS: Record<HomeSectionId, HomeSectionMeta> = {
  stats: { id: 'stats', label: 'Numbers today', hint: 'Total, pending, delayed and due', icon: Gauge },
  streak: { id: 'streak', label: 'Streak', hint: 'Days in a row you hit your goal', icon: Flame },
  myTeam: { id: 'myTeam', label: 'My team', hint: 'Your department scores', icon: Users },
  teamWeek: { id: 'teamWeek', label: 'Team this week', hint: 'Score by day for each person', icon: CalendarRange },
};

const IDS = Object.keys(HOME_SECTIONS) as HomeSectionId[];
const storageKey = (userId: string | undefined) => `tm-home-hidden:${userId ?? 'anon'}`;

const readHidden = (key: string): HomeSectionId[] => {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? IDS.filter((id) => parsed.includes(id)) : [];
  } catch {
    return [];
  }
};

const writeHidden = (key: string, hidden: HomeSectionId[]) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(hidden));
  } catch {
    return;
  }
};

export const useHomeLayout = (userId: string | undefined) => {
  const key = storageKey(userId);
  const [state, setState] = useState(() => ({ key, hidden: readHidden(key) }));
  const hidden = state.key === key ? state.hidden : readHidden(key);

  const save = (next: HomeSectionId[]) => {
    writeHidden(key, next);
    setState({ key, hidden: next });
  };

  return {
    isHidden: (id: HomeSectionId) => hidden.includes(id),
    hiddenCount: (available: readonly HomeSectionId[]) => available.filter((id) => hidden.includes(id)).length,
    setVisible: (id: HomeSectionId, visible: boolean) =>
      save(visible ? hidden.filter((h) => h !== id) : [...hidden.filter((h) => h !== id), id]),
    showAll: () => save([]),
  };
};
