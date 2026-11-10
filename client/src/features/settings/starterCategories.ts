export interface StarterSubcategory {
  name: string;
  tatHours?: number;
}

export interface StarterCategory {
  name: string;
  tatHours: number;
  hints: readonly string[];
  subcategories?: readonly StarterSubcategory[];
}

export const STARTER_CATEGORIES: readonly StarterCategory[] = [
  { name: 'Network / Internet', tatHours: 24, hints: ['it', 'tech', 'system'] },
  { name: 'ERP / Billing / ACME Software', tatHours: 32, hints: ['it', 'tech', 'system'] },
  { name: 'Printer / Hardware / Peripherals', tatHours: 25, hints: ['it', 'tech', 'system'] },
  { name: 'CCTV / Camera', tatHours: 25, hints: ['security', 'cctv', 'it', 'admin'] },
  { name: 'Bill / Bank / Date Correction', tatHours: 19, hints: ['account', 'finance'] },
  { name: 'Delegation / Project Task', tatHours: 42, hints: ['admin', 'operation', 'project'] },
  { name: 'Electrical / Lighting / R&M', tatHours: 48, hints: ['electric', 'maint', 'civil', 'admin'] },
  {
    name: 'AC (Air Conditioner)',
    tatHours: 24,
    hints: ['maint', 'electric', 'civil', 'admin'],
    subcategories: [
      { name: 'Not cooling / not working', tatHours: 12 },
      { name: 'Water leakage / noise', tatHours: 24 },
      { name: 'Service / gas refill / cleaning', tatHours: 72 },
      { name: 'Remote / thermostat / timer', tatHours: 24 },
    ],
  },
  {
    name: 'Fan System',
    tatHours: 24,
    hints: ['maint', 'electric', 'civil', 'admin'],
    subcategories: [
      { name: 'Ceiling / wall fan not working', tatHours: 24 },
      { name: 'Exhaust / ventilation fan', tatHours: 36 },
      { name: 'Regulator / switch / wiring', tatHours: 24 },
    ],
  },
  { name: 'Vehicle Request', tatHours: 18, hints: ['transport', 'vehicle', 'admin'] },
  { name: 'Uncategorised / Other', tatHours: 13, hints: ['admin'] },
];

const SHORT_HINT = 4;

const matches = (departmentName: string, hint: string) => {
  const lower = departmentName.toLowerCase();
  return hint.length >= SHORT_HINT ? lower.includes(hint) : lower.split(/[^a-z]+/).includes(hint);
};

export const suggestDepartmentId = (hints: readonly string[], departments: readonly { id: string; name: string }[]): string => {
  for (const hint of hints) {
    const found = departments.find((department) => matches(department.name, hint));
    if (found) return found.id;
  }
  return '';
};

export const normalizeCategoryName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');
