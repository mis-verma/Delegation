export interface TagLike {
    id: string
    name: string
    tickets: number
    tasks: number
}

export interface DuplicateGroup {
    key: string
    keep: TagLike
    merge: TagLike[]
}

export const labelKey = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, "")

const uses = (tag: TagLike) => tag.tickets + tag.tasks

const betterKeeper = (a: TagLike, b: TagLike): TagLike => {
    if (uses(a) !== uses(b)) return uses(a) > uses(b) ? a : b
    if (a.name.length !== b.name.length) return a.name.length > b.name.length ? a : b
    return a.name.localeCompare(b.name) <= 0 ? a : b
}

export const duplicateGroups = (tags: readonly TagLike[]): DuplicateGroup[] => {
    const byKey = new Map<string, TagLike[]>()
    for (const tag of tags) {
        const key = labelKey(tag.name)
        if (!key) continue
        byKey.set(key, [...(byKey.get(key) ?? []), tag])
    }
    const groups: DuplicateGroup[] = []
    for (const [key, members] of byKey) {
        if (members.length < 2) continue
        const keep = members.reduce(betterKeeper)
        groups.push({ key, keep, merge: members.filter((tag) => tag.id !== keep.id) })
    }
    return groups.sort((a, b) => b.merge.length - a.merge.length || a.keep.name.localeCompare(b.keep.name))
}

export const unusedTags = (tags: readonly TagLike[]): TagLike[] => tags.filter((tag) => uses(tag) === 0)
