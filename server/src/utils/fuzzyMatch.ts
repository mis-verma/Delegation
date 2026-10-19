
export type MatchConfidence = "exact" | "fuzzy" | "none"

const normalize = (s: string) => s.trim().toLowerCase()

export const looksLikeEmail = (s: string) => /\S+@\S+\.\S+/.test(s)

export const matchExactOrFuzzy = <T,>(
    needle: string,
    candidates: T[],
    getLabel: (c: T) => string,
): { match: T | null; confidence: MatchConfidence } => {
    const n = normalize(needle)
    if (!n) return { match: null, confidence: "none" }
    const exact = candidates.find((c) => normalize(getLabel(c)) === n)
    if (exact) return { match: exact, confidence: "exact" }
    const fuzzy = candidates.find((c) => {
        const label = normalize(getLabel(c))
        return label.length > 0 && (label.includes(n) || n.includes(label))
    })
    if (fuzzy) return { match: fuzzy, confidence: "fuzzy" }
    return { match: null, confidence: "none" }
}
