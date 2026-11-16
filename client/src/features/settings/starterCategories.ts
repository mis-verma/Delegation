export interface StarterSubcategory {
  name: string;
  tatHours: number | null;
  labels: readonly string[];
}

export interface StarterCategory {
  name: string;
  tatHours: number | null;
  hints: readonly string[];
  labels: readonly string[];
  subcategories: readonly StarterSubcategory[];
}

const DAYS = 24;
const WEEK = 7 * DAYS;

const ERP = 'IT – ERP';
const SUPPORT = 'IT – Support';
const NETWORK = 'IT – Network';
const SECURITY = 'IT – Security';
const FACILITIES = 'Admin – Facilities';
const TRANSPORT = 'Admin – Transport';
const ACCOUNTS = 'Accounts';
const JEWEL_CLUB = 'Jewel Club';
const MERCHANDISING = 'Merchandising';
const HR = 'HR';
const MIS = 'MIS';
const OPERATIONS = 'Operations';

const sub = (name: string, tatHours: number | null, ...labels: string[]): StarterSubcategory => ({ name, tatHours, labels });

export const STARTER_CATEGORIES: readonly StarterCategory[] = [
  {
    name: 'ERP & App Issue',
    tatHours: 24,
    hints: ['erp', 'it', 'tech', 'system'],
    labels: [ERP],
    subcategories: [
      sub('Acme billing / POS down – counter cannot bill', 4, ERP),
      sub('Acme error – module / report / document not working', 24, ERP),
      sub('Login, user ID, role & rights', 24, ERP),
      sub('Jewello app / payment gateway / WhatsApp-SMS-OTP / Power BI not working', 24, ERP),
    ],
  },
  {
    name: 'Transaction Correction',
    tatHours: 24,
    hints: ['account', 'finance'],
    labels: [ACCOUNTS],
    subcategories: [
      sub('Payment details – wrong bank / UPI / UTR / payment mode', 24, ACCOUNTS),
      sub('Wrong transaction / payment date', 24, ACCOUNTS),
      sub('Savings scheme – cancel enrollment / change plan / edit installment', 24, JEWEL_CLUB),
      sub('Cancel receipt / voucher / bill (duplicate, wrong customer)', 24, ACCOUNTS),
      sub('Edit bill – salesperson / customer name / mobile', 24, ACCOUNTS),
      sub('Edit bill – weight / rate / discount / making / value', 24, ACCOUNTS),
      sub('URD / old gold / purchase document edit or cancel', 24, ACCOUNTS),
      sub('Item / tag / weight / stock record correction', 2 * DAYS, MERCHANDISING),
    ],
  },
  {
    name: 'IT Hardware & Devices',
    tatHours: 24,
    hints: ['support', 'it', 'tech', 'system'],
    labels: [SUPPORT],
    subcategories: [
      sub('PC / laptop not working or slow', 24, SUPPORT),
      sub('Printer / tag printer not working', 24, SUPPORT),
      sub('Peripherals – monitor, mouse, keyboard, cable, UPS, headset', 3 * DAYS, SUPPORT),
      sub('Store devices – barcode scanner, weighing scale, karat meter', 4, SUPPORT),
      sub('Software install – MS Office / Windows / Excel / PDF', 3 * DAYS, SUPPORT),
      sub('New device / system shifting / allocation', WEEK, SUPPORT),
    ],
  },
  {
    name: 'Network & Telephony',
    tatHours: 24,
    hints: ['network', 'it', 'tech', 'system'],
    labels: [NETWORK],
    subcategories: [
      sub('Internet / Wi-Fi / LAN down or slow', 4, NETWORK),
      sub('Phone, intercom, IVR, dialer, SIM', 24, NETWORK),
    ],
  },
  {
    name: 'CCTV & Biometric',
    tatHours: 24,
    hints: ['cctv', 'security', 'it'],
    labels: [SECURITY],
    subcategories: [
      sub('CCTV offline / not recording / freeze', 4, SECURITY),
      sub('CCTV footage review request', 24, SECURITY),
      sub('New camera / view change / access', WEEK, SECURITY),
      sub('Biometric / attendance device offline', 3 * DAYS, SECURITY),
    ],
  },
  {
    name: 'Facilities & Maintenance',
    tatHours: 24,
    hints: ['facilit', 'maint', 'admin'],
    labels: [FACILITIES],
    subcategories: [
      sub('Strongroom / shutter / safe / display lock fault', 4, FACILITIES),
      sub('Electrical – lights, switchboard, socket, wiring', 24, FACILITIES),
      sub('Plumbing – leakage, drain, washroom, RO', 24, FACILITIES),
      sub('AC / heater', 3 * DAYS, FACILITIES),
      sub('Machines – melting, soldering, generator/servo, pantry', 24, FACILITIES),
      sub('Civil & furniture – doors, drawers, chairs, tiles, paint', 3 * DAYS, FACILITIES),
      sub('Housekeeping & deep cleaning', WEEK, FACILITIES),
    ],
  },
  {
    name: 'Vehicle & Logistics',
    tatHours: null,
    hints: ['transport', 'logistic', 'vehicle', 'admin'],
    labels: [TRANSPORT],
    subcategories: [
      sub('Stock movement – inter-store', null, TRANSPORT),
      sub('Stock movement – exhibition', null, TRANSPORT),
      sub('Refinery / lab / karigar / repair run', null, TRANSPORT),
      sub('Customer delivery', null, TRANSPORT),
      sub('Official travel', null, TRANSPORT),
    ],
  },
  {
    name: 'HR & Employee Services',
    tatHours: 3 * DAYS,
    hints: ['hr', 'human'],
    labels: [HR],
    subcategories: [
      sub('Payslip / salary / incentive query', 3 * DAYS, HR),
      sub('Leave / attendance correction (Keka)', 3 * DAYS, HR),
      sub('PF / ESI / UAN / bank details', 3 * DAYS, HR),
      sub('Uniform / ID card / visiting card / employee records', WEEK, HR),
    ],
  },
  {
    name: 'Change & Enhancement Request',
    tatHours: null,
    hints: ['erp', 'mis', 'it', 'tech'],
    labels: [ERP],
    subcategories: [
      sub('New / modified report or dashboard', null, ERP, MIS),
      sub('Print format change', null, ERP),
      sub('Master / configuration – category, tax, discount slab, scheme, bank', null, ERP),
      sub('Data extraction – customer lists, campaign data', null, MIS),
      sub('New feature / integration / automation', null, ERP),
    ],
  },
  {
    name: 'Security & Loss Incident',
    tatHours: 4,
    hints: ['operation', 'security'],
    labels: [OPERATIONS],
    subcategories: [
      sub('Cash shortage / excess at counter', 4, OPERATIONS),
      sub('Stock / piece missing or weight mismatch', 4, OPERATIONS),
      sub('Theft / suspicious activity / key or strongroom breach', 4, OPERATIONS),
    ],
  },
  {
    name: 'Not a ticket → Task tracker',
    tatHours: null,
    hints: ['operation', 'project', 'admin'],
    labels: [],
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
