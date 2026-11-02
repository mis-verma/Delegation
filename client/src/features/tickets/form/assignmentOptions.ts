import { Building2, User, Route } from 'lucide-react';

export const ASSIGNMENT_OPTIONS = [
  { value: 'AUTO', label: 'Auto', icon: Route, help: 'The category picks the team, the person and the due time.' },
  { value: 'MANUAL', label: 'Manual', icon: User, help: 'You pick the team, the person and the due time.' },
] as const;

export const FRONT_LINE_OPTIONS = [
  { value: 'AUTO', label: 'Auto', icon: Route, help: 'Pick what it is about. It decides the team and the due time.' },
  { value: 'MANUAL', label: 'Manual', icon: Building2, help: 'You pick the team and the due time. Their head picks who works on it.' },
] as const;
