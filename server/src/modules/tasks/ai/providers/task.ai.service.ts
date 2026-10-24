import { db } from "../../../../config/db.js";
import { users, departments } from "../../../../db/schema/index.js";
import { and, eq, like, or } from "drizzle-orm";
import { extractWithClaude } from "./claude.provider.js";
import { extractWithGemini } from "./gemini.provider.js";
import { extractWithOpenAI } from "./openai.provider.js";
import type { RawExtraction } from "../schema.js";
import { extractWithRules } from "./ruleBased.provider.js";
import { WEEKDAYS, daysUntilWeekday, matchInDays } from "../dateParsing.js";

const PROVIDERS = [
    { name: "claude", run: extractWithClaude },
    { name: "openai", run: extractWithOpenAI },
    { name: "gemini", run: extractWithGemini }
] as const;

const TIEBREAK_RANK: Record<string, number> = Object.fromEntries(
    PROVIDERS.map((p, i) => [p.name, PROVIDERS.length - i]),
)

export interface EnsembleResult extends RawExtraction {
    wonBy: string;
    providerResults: Array<{ provider: string; ok: boolean; confidence?: number; error?: string }>;
}

type ProviderRun = { provider: (typeof PROVIDERS)[number]["name"]; result: RawExtraction };

export async function extractTaskFromText(rawInput: string, referenceDate: Date): Promise<EnsembleResult> {
    const settled = await Promise.allSettled(
        PROVIDERS.map((p) => p.run(rawInput, referenceDate).then((result) => ({ provider: p.name, result })))
    );

    const succeeded = settled
        .map((s) => (s.status === "fulfilled" ? s.value : null))
        .filter((v): v is ProviderRun => v !== null);

    if (succeeded.length === 0) {
        settled.forEach((s, i) => {
            if (s.status === "rejected") console.error(`[AI extraction] ${PROVIDERS[i]?.name ?? "provider"} failed:`, s.reason?.message ?? s.reason);
        });

        console.warn("[AI extraction] all AI providers unavailable - falling back to rule-based extraction");
        const fallback = await extractWithRules(rawInput, referenceDate);

        return {
            ...fallback,
            wonBy: "rules",
            providerResults: settled.map((s, i) => ({
                provider: PROVIDERS[i]?.name ?? "provider",
                ok: false,
                error: s.status === "rejected" ? (s.reason?.message ?? String(s.reason)) : undefined,
            })),

        }

    }

    const winner = succeeded.reduce((best, candidate) => {
        if (candidate.result.confidence !== best.result.confidence) {
            return candidate.result.confidence > best.result.confidence ? candidate : best;
        }
        return (TIEBREAK_RANK[candidate.provider] ?? 0) > (TIEBREAK_RANK[best.provider] ?? 0) ? candidate : best;
    });

    const providerResults = settled.map((s, i) => {
        const name = PROVIDERS[i]?.name ?? "provider";
        return s.status === "fulfilled" ? { provider: name, ok: true, confidence: s.value.result.confidence }
            : { provider: name, ok: false, error: (s.reason as Error).message }
    });

    return { ...winner.result, wonBy: winner.provider, providerResults }

}

const PRIORITY_BY_MAX_RANK: Array<{ maxRank: number; priority: "low" | "medium" | "high" }> = [
    { maxRank: 2, priority: "high" },
    { maxRank: 4, priority: "medium" },
    { maxRank: Infinity, priority: "low" }
]

export function priorityForCreatorRank(rank: number): "low" | "medium" | "high" {
    return PRIORITY_BY_MAX_RANK.find((tier) => rank <= tier.maxRank)!.priority
}

const RELATIVE_DATE_RESOLVERS: Record<string, (ref: Date) => Date> = {
    today: (ref) => new Date(ref),
    tomorrow: (ref) => new Date(ref.getTime() + 86_400_000),

};

function resolveWeekday(rawInput: string, referenceDate: Date): Date | null {
    const match = rawInput.toLowerCase().match(new RegExp(`\\b(${WEEKDAYS.join("|")})\\b`));
    if (!match) return null;
    const targetDay = WEEKDAYS.indexOf(match[1] ?? "");
    const result = new Date(referenceDate);
    result.setDate(result.getDate() + daysUntilWeekday(result.getDay(), targetDay));
    return result;
}

function resolveInDays(rawInput: string, referenceDate: Date): Date | null {
    const days = matchInDays(rawInput);
    return days == null ? null : new Date(referenceDate.getTime() + days * 86_400_000);
}

export function resolveDueDate(dueDateISO: string, rawInput: string, referenceDate: Date): Date {
    const parsed = new Date(dueDateISO);
    if (!Number.isNaN(parsed.getTime())) {
        const isDateOnly = parsed.getHours() === 0 && parsed.getMinutes() === 0 && parsed.getSeconds() === 0;
        if (isDateOnly) parsed.setHours(23, 59, 59, 999);
        return parsed;
    }

    const resolved = resolveInDays(rawInput, referenceDate) ??
        resolveWeekday(rawInput, referenceDate) ?? (() => {
            const keyword = Object.keys(RELATIVE_DATE_RESOLVERS).find((k) => rawInput.toLowerCase().includes(k));
            const resolver = keyword ? RELATIVE_DATE_RESOLVERS[keyword] : undefined;
            return resolver ? resolver(referenceDate) : new Date(referenceDate);
        })()

    resolved.setHours(23, 59, 59, 999);
    return resolved;
}

export async function resolveAssignee(name: string, departmentHint?: string) {
    if (!name) return null;

    let departmentId: string | undefined;
    if (departmentHint) {
        const [department] = await db.select({ id: departments.id }).from(departments)
            .where(like(departments.name, `%${departmentHint}%`))
            .limit(1);
        departmentId = department?.id;
    }

    const nameParts = name.trim().split(/\s+/);
    const conditions = [
        eq(users.isActive, true),
        or(...nameParts.map((part) => like(users.firstName, `${part}%`))),
    ];
    if (departmentId) conditions.push(eq(users.departmentId, departmentId));

    const [match] = await db.select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        departmentId: users.departmentId,
    }).from(users).where(and(...conditions)).limit(1);
    return match ?? null;
}

