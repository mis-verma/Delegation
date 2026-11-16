export interface StarterSubcategory {
  name: string;
  tatHours: number | null;
}

export interface StarterCategory {
  name: string;
  tatHours: number | null;
  hints: readonly string[];
  subcategories: readonly StarterSubcategory[];
}

const DAYS = 24;
const WEEK = 7 * DAYS;

const sub = (name: string, tatHours: number | null): StarterSubcategory => ({ name, tatHours });

export const STARTER_CATEGORIES: readonly StarterCategory[] = [
  {
    name: 'ERP & App Issue',
    tatHours: 24,
    hints: ['erp', 'it', 'tech', 'system'],
    subcategories: [
      sub('Acme billing / POS down – counter cannot bill', 4),
      sub('Acme error – module / report / document not working', 24),
      sub('Login, user ID, role & rights', 24),
      sub('Jewello app / payment gateway / WhatsApp-SMS-OTP / Power BI not working', 24),
    ],
  },
  {
    name: 'Transaction Correction',
    tatHours: 24,
    hints: ['account', 'finance'],
    subcategories: [
      sub('Payment details – wrong bank / UPI / UTR / payment mode', 24),
      sub('Wrong transaction / payment date', 24),
      sub('Savings scheme – cancel enrollment / change plan / edit installment', 24),
      sub('Cancel receipt / voucher / bill (duplicate, wrong customer)', 24),
      sub('Edit bill – salesperson / customer name / mobile', 24),
      sub('Edit bill – weight / rate / discount / making / value', 24),
      sub('URD / old gold / purchase document edit or cancel', 24),
      sub('Item / tag / weight / stock record correction', 2 * DAYS),
    ],
  },
  {
    name: 'IT Hardware & Devices',
    tatHours: 24,
    hints: ['support', 'it', 'tech', 'system'],
    subcategories: [
      sub('PC / laptop not working or slow', 24),
      sub('Printer / tag printer not working', 24),
      sub('Peripherals – monitor, mouse, keyboard, cable, UPS, headset', 3 * DAYS),
      sub('Store devices – barcode scanner, weighing scale, karat meter', 4),
      sub('Software install – MS Office / Windows / Excel / PDF', 3 * DAYS),
      sub('New device / system shifting / allocation', WEEK),
    ],
  },
  {
    name: 'Network & Telephony',
    tatHours: 24,
    hints: ['network', 'it', 'tech', 'system'],
    subcategories: [
      sub('Internet / Wi-Fi / LAN down or slow', 4),
      sub('Phone, intercom, IVR, dialer, SIM', 24),
    ],
  },
  {
    name: 'CCTV & Biometric',
    tatHours: 24,
    hints: ['cctv', 'security', 'it'],
    subcategories: [
      sub('CCTV offline / not recording / freeze', 4),
      sub('CCTV footage review request', 24),
      sub('New camera / view change / access', WEEK),
      sub('Biometric / attendance device offline', 3 * DAYS),
    ],
  },
  {
    name: 'Facilities & Maintenance',
    tatHours: 24,
    hints: ['facilit', 'maint', 'admin'],
    subcategories: [
      sub('Strongroom / shutter / safe / display lock fault', 4),
      sub('Electrical – lights, switchboard, socket, wiring', 24),
      sub('Plumbing – leakage, drain, washroom, RO', 24),
      sub('AC / heater', 3 * DAYS),
      sub('Machines – melting, soldering, generator/servo, pantry', 24),
      sub('Civil & furniture – doors, drawers, chairs, tiles, paint', 3 * DAYS),
      sub('Housekeeping & deep cleaning', WEEK),
    ],
  },
  {
    name: 'Vehicle & Logistics',
    tatHours: null,
    hints: ['transport', 'logistic', 'vehicle', 'admin'],
    subcategories: [
      sub('Stock movement – inter-store', null),
      sub('Stock movement – exhibition', null),
      sub('Refinery / lab / karigar / repair run', null),
      sub('Customer delivery', null),
      sub('Official travel', null),
    ],
  },
  {
    name: 'HR & Employee Services',
    tatHours: 3 * DAYS,
    hints: ['hr', 'human'],
    subcategories: [
      sub('Payslip / salary / incentive query', 3 * DAYS),
      sub('Leave / attendance correction (Keka)', 3 * DAYS),
      sub('PF / ESI / UAN / bank details', 3 * DAYS),
      sub('Uniform / ID card / visiting card / employee records', WEEK),
    ],
  },
  {
    name: 'Change & Enhancement Request',
    tatHours: null,
    hints: ['erp', 'mis', 'it', 'tech'],
    subcategories: [
      sub('New / modified report or dashboard', null),
      sub('Print format change', null),
      sub('Master / configuration – category, tax, discount slab, scheme, bank', null),
      sub('Data extraction – customer lists, campaign data', null),
      sub('New feature / integration / automation', null),
    ],
  },
  {
    name: 'Security & Loss Incident',
    tatHours: 4,
    hints: ['operation', 'security'],
    subcategories: [
      sub('Cash shortage / excess at counter', 4),
      sub('Stock / piece missing or weight mismatch', 4),
      sub('Theft / suspicious activity / key or strongroom breach', 4),
    ],
  },
  {
    name: 'Not a ticket → Task tracker',
    tatHours: null,
    hints: ['operation', 'project', 'admin'],
    subcategories: [
      sub('L10 / delegation / scorecard / strategy / hiring tasks', null),
    ],
  },
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
