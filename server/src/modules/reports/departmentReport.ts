import type { CsvColumn } from "../../utils/csv.js";

export type DepartmentReportModule = "tickets" | "tasks";
export type ReportGranularity = "week" | "month" | "year";
export type StatusKey = "open" | "in_progress" | "pending_approval" | "on_hold" | "done";

export const STATUS_KEYS: StatusKey[] = ["open", "in_progress", "pending_approval", "on_hold", "done"];

export type ReportItem = {
    departmentId: string | null;
    status: StatusKey;
    createdAt: Date;
    dueAt: Date | null;
    handedInAt: Date | null;
    completedAt: Date | null;
    overdue: boolean;
};

export type DepartmentRef = { id: string; name: string; isActive: boolean };

type Row = Record<string, string | number>;

const DAY_MS = 86_400_000;
const NO_DEPARTMENT = "__none__";
const NO_DEPARTMENT_LABEL = "No department";
const TOTAL_LABEL = "All departments";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const STATUS_LABELS: Record<DepartmentReportModule, Record<StatusKey, string>> = {
    tickets: { open: "Open", in_progress: "In progress", pending_approval: "Pending approval", on_hold: "On hold", done: "Closed" },
    tasks: { open: "To do", in_progress: "In progress", pending_approval: "Pending approval", on_hold: "On hold", done: "Done" },
};

export const summaryColumns = (module: DepartmentReportModule): CsvColumn[] => [
    { key: "department", label: "Department", width: 28 },
    { key: "raised", label: "Raised", width: 12, align: "right" },
    ...STATUS_KEYS.map((key) => ({ key, label: STATUS_LABELS[module][key], width: 16, align: "right" as const })),
    { key: "overdue", label: "Overdue", width: 12, align: "right" },
    { key: "completedPct", label: module === "tickets" ? "Closed %" : "Done %", width: 12, align: "right" },
    { key: "onTimePct", label: "On-time %", width: 12, align: "right" },
    { key: "avgDays", label: "Avg days to finish", width: 18, align: "right" },
];

export const periodColumns: CsvColumn[] = [
    { key: "department", label: "Department", width: 28 },
    { key: "period", label: "Period", width: 22 },
    { key: "raised", label: "Raised", width: 12, align: "right" },
    { key: "completed", label: "Finished", width: 12, align: "right" },
    { key: "stillOpen", label: "Still open", width: 12, align: "right" },
    { key: "overdue", label: "Overdue", width: 12, align: "right" },
    { key: "completedPct", label: "Finished %", width: 12, align: "right" },
];

const pad = (value: number) => String(value).padStart(2, "0");

const round1 = (value: number) => Math.round(value * 10) / 10;

const pct = (part: number, whole: number): number | "" => (whole > 0 ? round1((part / whole) * 100) : "");

export const resolveGranularity = (requested: ReportGranularity | "auto", spanDays: number): ReportGranularity => {
    if (requested !== "auto") return requested;
    if (spanDays <= 70) return "week";
    if (spanDays <= 800) return "month";
    return "year";
};

export const bucketOf = (date: Date, granularity: ReportGranularity, offsetMinutes: number): { sortKey: string; label: string } => {
    const local = new Date(date.getTime() + offsetMinutes * 60_000);
    const year = local.getUTCFullYear();
    const month = local.getUTCMonth();
    if (granularity === "year") return { sortKey: String(year), label: String(year) };
    if (granularity === "month") return { sortKey: `${year}-${pad(month + 1)}`, label: `${MONTHS[month]} ${year}` };
    const dayStart = Date.UTC(year, month, local.getUTCDate());
    const monday = new Date(dayStart - ((local.getUTCDay() + 6) % 7) * DAY_MS);
    const mondayMonth = monday.getUTCMonth();
    return {
        sortKey: `${monday.getUTCFullYear()}-${pad(mondayMonth + 1)}-${pad(monday.getUTCDate())}`,
        label: `Week of ${pad(monday.getUTCDate())} ${MONTHS[mondayMonth]} ${monday.getUTCFullYear()}`,
    };
};

type Counters = {
    raised: number;
    byStatus: Record<StatusKey, number>;
    overdue: number;
    done: number;
    doneDays: number;
    doneDaysCount: number;
    dueDone: number;
    onTime: number;
};

const emptyCounters = (): Counters => ({
    raised: 0,
    byStatus: { open: 0, in_progress: 0, pending_approval: 0, on_hold: 0, done: 0 },
    overdue: 0,
    done: 0,
    doneDays: 0,
    doneDaysCount: 0,
    dueDone: 0,
    onTime: 0,
});

const addTo = (counters: Counters, item: ReportItem) => {
    counters.raised += 1;
    counters.byStatus[item.status] += 1;
    if (item.status !== "done") {
        if (item.overdue) counters.overdue += 1;
        return;
    }
    counters.done += 1;
    if (item.completedAt) {
        counters.doneDays += Math.max(0, item.completedAt.getTime() - item.createdAt.getTime()) / DAY_MS;
        counters.doneDaysCount += 1;
    }
    const handedIn = item.handedInAt ?? item.completedAt;
    if (item.dueAt && handedIn) {
        counters.dueDone += 1;
        if (handedIn.getTime() <= item.dueAt.getTime()) counters.onTime += 1;
    }
};

const mergeInto = (target: Counters, source: Counters) => {
    target.raised += source.raised;
    for (const key of STATUS_KEYS) target.byStatus[key] += source.byStatus[key];
    target.overdue += source.overdue;
    target.done += source.done;
    target.doneDays += source.doneDays;
    target.doneDaysCount += source.doneDaysCount;
    target.dueDone += source.dueDone;
    target.onTime += source.onTime;
};

const summaryRow = (department: string, c: Counters): Row => ({
    department,
    raised: c.raised,
    ...c.byStatus,
    overdue: c.overdue,
    completedPct: pct(c.done, c.raised),
    onTimePct: pct(c.onTime, c.dueDone),
    avgDays: c.doneDaysCount > 0 ? round1(c.doneDays / c.doneDaysCount) : "",
});

export type DepartmentReport = { summary: Row[]; periods: Row[]; granularity: ReportGranularity };

export const createAggregator = (granularity: ReportGranularity, offsetMinutes: number) => {
    const byDepartment = new Map<string, Counters>();
    const byPeriod = new Map<string, { departmentKey: string; sortKey: string; label: string; counters: Counters }>();

    const add = (item: ReportItem) => {
        const departmentKey = item.departmentId ?? NO_DEPARTMENT;
        let total = byDepartment.get(departmentKey);
        if (!total) {
            total = emptyCounters();
            byDepartment.set(departmentKey, total);
        }
        addTo(total, item);

        const bucket = bucketOf(item.createdAt, granularity, offsetMinutes);
        const periodKey = `${departmentKey}|${bucket.sortKey}`;
        let period = byPeriod.get(periodKey);
        if (!period) {
            period = { departmentKey, sortKey: bucket.sortKey, label: bucket.label, counters: emptyCounters() };
            byPeriod.set(periodKey, period);
        }
        addTo(period.counters, item);
    };

    const finish = (departments: DepartmentRef[], onlyDepartmentId?: string): DepartmentReport => {
        const names = new Map<string, string>(departments.map((d) => [d.id, d.name]));
        names.set(NO_DEPARTMENT, NO_DEPARTMENT_LABEL);

        const visible = departments
            .filter((d) => (onlyDepartmentId ? d.id === onlyDepartmentId : d.isActive || byDepartment.has(d.id)))
            .map((d) => d.id)
            .sort((a, b) => (names.get(a) ?? "").localeCompare(names.get(b) ?? ""));
        if (!onlyDepartmentId && byDepartment.has(NO_DEPARTMENT)) visible.push(NO_DEPARTMENT);

        const grand = emptyCounters();
        const summary: Row[] = visible.map((key) => {
            const counters = byDepartment.get(key) ?? emptyCounters();
            mergeInto(grand, counters);
            return summaryRow(names.get(key) ?? "", counters);
        });
        summary.push(summaryRow(TOTAL_LABEL, grand));

        const order = new Map(visible.map((key, index) => [key, index]));
        const periods: Row[] = [...byPeriod.values()]
            .filter((p) => order.has(p.departmentKey))
            .sort((a, b) => (order.get(a.departmentKey)! - order.get(b.departmentKey)!) || a.sortKey.localeCompare(b.sortKey))
            .map((p) => ({
                department: names.get(p.departmentKey) ?? "",
                period: p.label,
                raised: p.counters.raised,
                completed: p.counters.done,
                stillOpen: p.counters.raised - p.counters.done,
                overdue: p.counters.overdue,
                completedPct: pct(p.counters.done, p.counters.raised),
            }));

        return { summary, periods, granularity };
    };

    return { add, finish };
};
