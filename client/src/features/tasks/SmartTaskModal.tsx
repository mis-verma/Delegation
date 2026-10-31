import { useState, useRef, useEffect, useCallback, } from "react";
import {
    useAssignableUsersQuery,
    useCreateSmartTaskMutation,
    useParseSmartTaskMutation,
    useCreateSmartTaskConversationMutation,
    useUpdateSmartTaskConversationMutation,
    useSmartTaskConversationsQuery,
    useSmartTaskConversationQuery,
    useDeleteAllSmartTaskConversationsMutation,
} from "./hook";
import { useDepartmentsQuery } from "../tickets/hook";
import { toast } from "sonner";
import { Calendar, Sparkles, Send, Bot, UserPlus, User as UserIcon, History as HistoryIcon, ArrowLeft, Inbox, Trash2 } from "lucide-react";
import { formatShortDateTime } from "./cardFields";
import { Button, Input, Modal, Textarea } from "@/components";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/confirmDialog";
import { useAuth } from "../../context/AuthContext";
import { UserForm } from "../admin/users/UserForm";
import { FIELD_LABEL_CLASS, FIELD_LABEL_ICON_CLASS } from "./taskFormFieldStyles";
import { TaskFormPrioritySelector } from "./TaskFormPrioritySelector";
import { TaskFormDepartmentField } from "./TaskFormDepartmentField";
import { TaskFormAssigneeField } from "./TaskFormAssigneeField";
import { VoiceNoteRecorder } from "./VoiceNoteRecorder";
import type { SmartTaskParseResult } from "@/api/task";
import type { Department } from "@/api/departments";
import type { AssignableUser } from "@/api/users";
import type { AdminUser } from "@/api/admin";
import type { SmartTaskConversationMessage, SmartTaskConversationStatus } from "@/api/smartTaskConversation";

interface SmartTaskModalProps {
    onClose: () => void;
}

type ChatMessage = { id: string; from: "bot" | "user"; text: string; timestamp: number };
type Slot = "assignee" | "department" | "dueDate" | "priority";

const SLOT_ORDER: readonly Slot[] = ["assignee", "department", "dueDate", "priority"] as const;

const SLOT_QUESTIONS: Record<Slot, string> = {
    assignee: "Who should I assign this delegation to?",
    department: "Which department does this belong to?",
    dueDate: "When is this delegation due?",
    priority: "Should this be low, medium, or high priority?",
};

type Draft = {
    title: string;
    context: string;
    category: "issue" | "delegated_task";
    priority: "low" | "medium" | "high";
    dueDate: Date | null;
    assigneeId: string;
    assigneeName: string;
    departmentId: string;
    departmentName: string;
};

type ReviewState = {
    title: string;
    context: string;
    category: "issue" | "delegated_task";
    priority: "low" | "medium" | "high";
    dueDate: string;
    assigneeId: string;
    departmentId: string;
};

const DATE_HINT_PATTERN = /\b(today|tomorrow|(?:in|within)?\s*(?:the\s+)?(?:next\s+)?(?:\d+|[a-z]+)\s+(?:upcoming\s+|working\s+|business\s+|calendar\s+)*days?|(?:in|within)?\s*(?:the\s+)?(?:next\s+)?(?:\d+|[a-z]+)\s+months?|monday|tuesday|wednesday|thursday|friday|saturday|sunday|aaj|kal|\d{1,2}(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/i;
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

const PRIORITY_HINT_PATTERN = /\b(urgent|asap|immediately|critical|very important|high priority|top priority|low priority|not urgent|no rush|medium priority)\b/i;
const HIGH_PRIORITY_HINT_PATTERN = /\b(urgent|asap|immediately|critical|very important|high priority|top priority)\b/i;

const derivePriorityHint = (text: string): Draft["priority"] | null => {
    if (!PRIORITY_HINT_PATTERN.test(text)) return null;
    const lower = text.toLowerCase();
    if (HIGH_PRIORITY_HINT_PATTERN.test(lower)) return "high";
    if (/\b(low priority|not urgent|no rush)\b/.test(lower)) return "low";
    return "medium";
};

const SKIP_CONFIRMATION_PATTERN =
    /\b(please|just|go ahead(?:\s+and)?)\s+create\s+(it|this|now)\b|\bcreate\s+it\s+(now|directly|right away)\b|\bskip\s+(the\s+)?confirmation\b|\bwithout\s+confirmation\b|\bdon'?t\s+ask,?\s+(just\s+)?create\b/i;

const createId = () => `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

const formatMessageTime = (timestamp: number | string) =>
    new Date(timestamp).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

const CONVERSATION_STATUS_LABEL: Record<SmartTaskConversationStatus, string> = {
    in_progress: "In progress",
    completed: "Completed",
    abandoned: "Abandoned",
};

const CONVERSATION_STATUS_VARIANT: Record<SmartTaskConversationStatus, "warning" | "success" | "neutral"> = {
    in_progress: "warning",
    completed: "success",
    abandoned: "neutral",
};

const CONVERSATION_STATUS_TINT: Record<SmartTaskConversationStatus, string> = {
    in_progress: "bg-warning/10",
    completed: "bg-success/10",
    abandoned: "bg-surface-hover",
};

const levenshteinDistance = (a: string, b: string): number => {
    const rows: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) rows[i][0] = i;
    for (let j = 0; j <= b.length; j++) rows[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            rows[i][j] = a[i - 1] === b[j - 1]
                ? rows[i - 1][j - 1]
                : 1 + Math.min(rows[i - 1][j - 1], rows[i - 1][j], rows[i][j - 1]);
        }
    }
    return rows[a.length][b.length];
};

const containsFuzzyWord = (text: string, keyword: string, maxDistance = 2): boolean =>
    text.split(/\s+/).some(
        (word) => Math.abs(word.length - keyword.length) <= 1 && levenshteinDistance(word, keyword) <= maxDistance
    );

const namesAreCloseMatch = (a: string, b: string): boolean => {
    if (a === b) return true;
    const maxDistance = b.length <= 4 ? 0 : b.length <= 7 ? 1 : 2;
    return levenshteinDistance(a, b) <= maxDistance;
};

const findUserByName = (query: string, users?: AssignableUser[]): AssignableUser | undefined => {
    const cleanQuery = query.replace(/\b(assign|to|for)\b/gi, "").trim().toLowerCase();
    if (!cleanQuery || !users?.length) return undefined;

    const exact = users.find((u) => {
        const fullName = `${u.firstName} ${u.lastName ?? ""}`.trim().toLowerCase();
        return fullName.includes(cleanQuery) || u.firstName.toLowerCase().startsWith(cleanQuery);
    });
    if (exact) return exact;

    const queryWords = cleanQuery.split(/\s+/);
    return users.find((u) => queryWords.some((w) => namesAreCloseMatch(w, u.firstName.toLowerCase())));
};

const findMentionedUser = (rawText: string, users?: AssignableUser[]): AssignableUser | undefined => {
    if (!users?.length) return undefined;
    const words = rawText.toLowerCase().match(/[a-z]+/g) ?? [];
    return users.find((u) => {
        const firstName = u.firstName.toLowerCase();
        return words.some((w) => namesAreCloseMatch(w, firstName));
    });
};

const NAME_GUESS_STOPWORDS = new Set([
    "create", "make", "need", "needed", "want", "wanted", "please", "kindly", "assign", "assigned",
    "banner", "poster", "dashboard", "report", "reports", "design", "task", "prepare", "send", "share",
    "update", "complete", "finish", "review", "check", "do", "kar", "karo", "karna", "banana", "banwana",
    "chahiye", "hai", "hain", "ke", "liye", "ka", "ki", "ko", "se", "wale", "urgent", "asap", "immediately",
    "today", "tomorrow", "kal", "aaj", "next", "days", "day", "week", "weeks", "month", "months",
    "upcoming", "working", "business", "calendar", "deadline", "due", "by", "on", "in", "for", "from",
    "via", "to", "and", "or", "the", "a", "an", "this", "that", "department", "dept", "team", "event",
    "latest", "low", "medium", "high", "priority", "top", "mujhe", "yeh", "ye", "iska", "uska", "abhi",
    "jaldi", "turant",
]);

const guessUnmatchedName = (rawText: string, departments?: Department[]): string | null => {
    const deptWords = new Set((departments ?? []).flatMap((d) => d.name.toLowerCase().split(/\s+/)));
    const candidates = (rawText.toLowerCase().match(/[a-z]+/g) ?? []).filter(
        (w) => w.length >= 3 && !NAME_GUESS_STOPWORDS.has(w) && !deptWords.has(w)
    );
    if (!candidates.length) return null;
    const guess = candidates[candidates.length - 1];
    return guess.charAt(0).toUpperCase() + guess.slice(1);
};

const findDepartmentByName = (query: string, departments?: Department[]): Department | undefined => {
    const cleanQuery = query.replace(/\b(department|dept|team)\b/gi, "").trim().toLowerCase();
    if (!cleanQuery || !departments?.length) return undefined;

    return departments.find((d) => d.name.toLowerCase().includes(cleanQuery));
};

const NUMBER_WORDS: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, twenty: 20, thirty: 30,
};

const resolveDueDateLocally = (answer: string, reference: Date = new Date()): Date | null => {
    const lower = answer.toLowerCase().trim();
    const base = new Date(reference);

    const inDaysMatch = lower.match(
        /\b(?:in|within)?\s*(?:the\s+)?(?:next\s+)?(\d+|[a-z]+)\s+(?:upcoming\s+|working\s+|business\s+|calendar\s+)*days?\b/
    );
    if (inDaysMatch) {
        const rawAmount = inDaysMatch[1];
        const amount = /^\d+$/.test(rawAmount) ? Number(rawAmount) : NUMBER_WORDS[rawAmount];
        if (amount) {
            base.setDate(base.getDate() + amount);
            return base;
        }
    }

    if (/\bnext\s+day\b/.test(lower)) {
        base.setDate(base.getDate() + 1);
        return base;
    }

    const inMonthsMatch = lower.match(
        /\b(?:in|within)?\s*(?:the\s+)?(?:next\s+)?(\d+|[a-z]+)\s+months?\b/
    );
    if (inMonthsMatch) {
        const rawAmount = inMonthsMatch[1];
        const amount = /^\d+$/.test(rawAmount) ? Number(rawAmount) : NUMBER_WORDS[rawAmount];
        if (amount) {
            base.setMonth(base.getMonth() + amount);
            return base;
        }
    }

    if (/\bnext\s+month\b/.test(lower)) {
        base.setMonth(base.getMonth() + 1);
        return base;
    }

    const resolveWeekday = (weekdayIndex: number): Date => {
        const currentDay = base.getDay();
        const diff = (weekdayIndex + 7 - currentDay) % 7 || 7;
        base.setDate(base.getDate() + diff);
        return base;
    };

    if (/\btomorrow\b/.test(lower) || lower.includes("kal")) {
        base.setDate(base.getDate() + 1);
        return base;
    }
    if (/\btoday\b/.test(lower) || lower.includes("aaj")) {
        return base;
    }
    const exactWeekdayIndex = WEEKDAYS.findIndex((w) => new RegExp(`\\b${w}\\b`).test(lower));
    if (exactWeekdayIndex !== -1) {
        return resolveWeekday(exactWeekdayIndex);
    }

    if (containsFuzzyWord(lower, "tomorrow")) {
        base.setDate(base.getDate() + 1);
        return base;
    }
    if (containsFuzzyWord(lower, "today")) {
        return base;
    }
    const fuzzyWeekdayIndex = WEEKDAYS.findIndex((w) => containsFuzzyWord(lower, w));
    if (fuzzyWeekdayIndex !== -1) {
        return resolveWeekday(fuzzyWeekdayIndex);
    }

    const parsedTimestamp = Date.parse(answer);
    return Number.isNaN(parsedTimestamp) ? null : new Date(parsedTimestamp);
};

const resolvePriorityAnswer = (answer: string): Draft["priority"] => {
    const lower = answer.toLowerCase();
    if (/\b(high|urgent|asap|critical)\b/.test(lower)) return "high";
    if (/\b(low|whenever|no rush)\b/.test(lower)) return "low";
    return "medium";
};

const SLOT_RESOLVERS: Record<
    Slot,
    (
        answer: string,
        draft: Draft,
        ctx: { users?: AssignableUser[]; departments?: Department[] }
    ) => { draft: Draft; ack: string }
> = {
    assignee: (answer, draft, { users, departments }) => {
        const match = findUserByName(answer, users);
        const resolvedName = match ? `${match.firstName} ${match.lastName ?? ""}`.trim() : answer.trim();

        const autoDept = !draft.departmentId && match?.departmentId
            ? departments?.find((d) => d.id === match.departmentId)
            : undefined;

        return {
            draft: {
                ...draft,
                assigneeId: match?.id ?? "",
                assigneeName: resolvedName,
                ...(autoDept ? { departmentId: autoDept.id, departmentName: autoDept.name } : {}),
            },
            ack: match
                ? autoDept
                    ? `Assigned to ${match.firstName} (${autoDept.name} department).`
                    : `Assigned to ${match.firstName}.`
                : `Couldn't match "${answer}" to an active user. You can pick them manually in review.`,
        };
    },
    department: (answer, draft, { departments }) => {
        const match = findDepartmentByName(answer, departments);
        return {
            draft: { ...draft, departmentId: match?.id ?? "", departmentName: match?.name ?? answer.trim() },
            ack: match
                ? `Department set to ${match.name}.`
                : `Couldn't match "${answer}" to a department. Select one manually below if needed.`,
        };
    },
    dueDate: (answer, draft) => {
        const resolved = resolveDueDateLocally(answer);
        return {
            draft: { ...draft, dueDate: resolved ?? draft.dueDate },
            ack: resolved
                ? `Due date set for ${resolved.toLocaleDateString(undefined, { month: "short", day: "numeric" })}.`
                : `Couldn't understand "${answer}" as a date. Set one manually below.`,
        };
    },
    priority: (answer, draft) => {
        const resolved = resolvePriorityAnswer(answer);
        return {
            draft: { ...draft, priority: resolved },
            ack: `Priority set to ${resolved}.`,
        };
    },
};

const buildDraftFromParse = (
    result: SmartTaskParseResult,
    rawText: string,
    users?: AssignableUser[],
    departments?: Department[]
): { draft: Draft; assigneeGuessed: boolean } => {
    const rawName = result.assignee?.name || result.assigneeRaw || "";
    const matchedUser = result.assignee?.id
        ? users?.find((u) => u.id === result.assignee?.id)
        : findUserByName(rawName, users) ?? findMentionedUser(rawText, users);

    const matchedDept =
        findDepartmentByName(result.departmentRaw ?? "", departments) ??
        (matchedUser?.departmentId ? departments?.find((d) => d.id === matchedUser.departmentId) : undefined);

    const guessedName =
        !matchedUser && !rawName && matchedDept && result.category === "delegated_task"
            ? guessUnmatchedName(rawText, departments)
            : null;

    return {
        draft: {
            title: result.title,
            context: result.context,
            category: result.category,
            priority: derivePriorityHint(rawText) ?? result.priority,
            dueDate: DATE_HINT_PATTERN.test(rawText) && result.dueDate ? new Date(result.dueDate) : null,
            assigneeId: matchedUser?.id ?? result.assignee?.id ?? "",
            assigneeName: matchedUser
                ? `${matchedUser.firstName} ${matchedUser.lastName ?? ""}`.trim()
                : rawName || guessedName || "",
            departmentId: matchedDept?.id ?? "",
            departmentName: matchedDept?.name ?? result.departmentRaw ?? "",
        },
        assigneeGuessed: Boolean(guessedName),
    };
};

const localDayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const endOfLocalDay = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d, 23, 59, 59, 999);
};

const mapDraftToReview = (draft: Draft): ReviewState => ({
    title: draft.title,
    context: draft.context,
    category: draft.category,
    priority: draft.priority,
    dueDate: localDayKey(draft.dueDate ?? new Date()),
    assigneeId: draft.assigneeId,
    departmentId: draft.departmentId,
});

const MessageBubbles = ({ messages }: { messages: { from: "bot" | "user"; text: string; timestamp: number | string }[] }) => (
    <>
        {messages.map((m, i) => {
            const isBot = m.from === "bot";
            return (
                <div
                    key={i}
                    className={`flex items-end gap-2 animate-in fade-in slide-in-from-bottom-1 duration-200 ${isBot ? "" : "flex-row-reverse"}`}
                >
                    <div className={`flex items-center justify-center size-8 rounded-full shrink-0 ${isBot ? "bg-gradient-to-br from-primary-500 to-primary-700 text-white" : "bg-surface border border-border text-text-secondary"}`}>
                        {isBot ? <Bot size={16} /> : <UserIcon size={14} />}
                    </div>
                    <div className={`flex flex-col gap-1 max-w-[75%] ${isBot ? "items-start" : "items-end"}`}>
                        <div
                            className={`text-sm leading-relaxed px-3.5 py-2.5 ${
                                isBot
                                    ? "bg-primary-500/10 dark:bg-primary-500/15 text-primary-900 dark:text-primary-200 rounded-2xl rounded-bl-sm"
                                    : "bg-gradient-to-br from-primary-600 to-primary-800 text-white rounded-2xl rounded-br-sm"
                            }`}
                        >
                            {m.text}
                        </div>
                        <span className="t-meta text-text-light px-1">
                            {formatMessageTime(m.timestamp)}
                        </span>
                    </div>
                </div>
            );
        })}
    </>
);

export const SmartTaskModal = ({ onClose }: SmartTaskModalProps) => {
    const [messages, setMessages] = useState<ChatMessage[]>(() => [
        {
            id: createId(),
            from: "bot",
            text: 'Tell me what needs to happen, e.g. "Harsh ko MDO department ke liye dashboard banana hai, kal tak."',
            timestamp: Date.now(),
        },
    ]);
    const [input, setInput] = useState("");
    const [draft, setDraft] = useState<Draft | null>(null);
    const [pendingSlot, setPendingSlot] = useState<Slot | null>(null);
    const [pendingQueue, setPendingQueue] = useState<Slot[]>([]);
    const [parsed, setParsed] = useState<SmartTaskParseResult | null>(null);
    const [review, setReview] = useState<ReviewState | null>(null);
    const [initialInputMode, setInitialInputMode] = useState<"voice" | "text">("text");
    const [voiceRecorderBusy, setVoiceRecorderBusy] = useState(false);
    const [skipConfirmation, setSkipConfirmation] = useState(false);
    const [isBotThinking, setIsBotThinking] = useState(false);
    const [unmatchedAssigneeName, setUnmatchedAssigneeName] = useState<string | null>(null);
    const [showCreateAssignee, setShowCreateAssignee] = useState(false);
    const hasAutoPromptedRef = useRef(false);

    const [view, setView] = useState<"chat" | "history" | "transcript">("chat");
    const [viewingConversationId, setViewingConversationId] = useState<string | null>(null);
    const conversationIdRef = useRef<string | null>(null);
    const isFinalizedRef = useRef(false);

    const scrollRef = useRef<HTMLDivElement>(null);

    const parseMutation = useParseSmartTaskMutation();
    const confirm = useConfirm();
    const createMutation = useCreateSmartTaskMutation();
    const createConversationMutation = useCreateSmartTaskConversationMutation();
    const updateConversationMutation = useUpdateSmartTaskConversationMutation();
    const deleteAllConversationsMutation = useDeleteAllSmartTaskConversationsMutation();
    const { data: conversations, isLoading: isLoadingHistory } = useSmartTaskConversationsQuery(view === "history");
    const { data: viewingConversation, isLoading: isLoadingTranscript } = useSmartTaskConversationQuery(
        view === "transcript" ? viewingConversationId : null
    );
    const { data: assignableUsers, isLoading: isLoadingUsers } = useAssignableUsersQuery();
    const { data: departments, isLoading: isLoadingDepts } = useDepartmentsQuery();
    const { user: currentUser } = useAuth();
    const isAdmin = currentUser?.role === "ADMIN" || currentUser?.role === "PC";

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
        }
    }, [messages]);

    const addMessage = useCallback((from: ChatMessage["from"], text: string) => {
        setMessages((prev) => [...prev, { id: createId(), from, text, timestamp: Date.now() }]);
    }, []);

    useEffect(() => {
        const hasUserMessage = messages.some((m) => m.from === "user");
        if (!hasUserMessage) return;

        const payload: SmartTaskConversationMessage[] = messages.map((m) => ({
            from: m.from,
            text: m.text,
            timestamp: m.timestamp,
        }));

        if (!conversationIdRef.current) {
            if (createConversationMutation.isPending) return;
            createConversationMutation.mutate(payload, {
                onSuccess: (created) => { conversationIdRef.current = created.id; },
            });
            return;
        }

        updateConversationMutation.mutate({ id: conversationIdRef.current, payload: { messages: payload } });
    }, [messages, createConversationMutation, updateConversationMutation]);

    useEffect(() => {
        return () => {
            if (conversationIdRef.current && !isFinalizedRef.current) {
                isFinalizedRef.current = true;
                updateConversationMutation.mutate({ id: conversationIdRef.current, payload: { status: "abandoned" } });
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount-only cleanup, intentionally empty deps.
    }, []);

    const handleModalClose = useCallback(() => {
        if (conversationIdRef.current && !isFinalizedRef.current) {
            isFinalizedRef.current = true;
            updateConversationMutation.mutate({ id: conversationIdRef.current, payload: { status: "abandoned" } });
        }
        onClose();
    }, [onClose, updateConversationMutation]);

    const handleClearHistory = useCallback(async () => {
        const ok = await confirm({
            title: "Clear all chat history?",
            description: "This permanently deletes every past Smart Add conversation. This can't be undone.",
            confirmLabel: "Yes, clear all",
            cancelLabel: "Cancel",
        });
        if (!ok) return;
        deleteAllConversationsMutation.mutate();
    }, [confirm, deleteAllConversationsMutation]);

    const finishToReview = useCallback((finalDraft: Draft) => {
        const summary = [
            `"${finalDraft.title}"`,
            `assigned to ${finalDraft.assigneeName || "unassigned"}`,
            finalDraft.departmentName ? `${finalDraft.departmentName} dept` : null,
            `due ${(finalDraft.dueDate ?? new Date()).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
            `${finalDraft.priority} priority`,
        ]
            .filter(Boolean)
            .join(", ");

        const closing = skipConfirmation ? "Creating it now, nothing else to confirm." : "Review and tweak if necessary.";
        addMessage("bot", `Here is what I prepared: ${summary}. ${closing}`);
        setReview(mapDraftToReview(finalDraft));
        setPendingSlot(null);
        setPendingQueue([]);
    }, [addMessage, skipConfirmation]);

    const processNextSlotOrFinish = useCallback(
        (queue: Slot[], currentDraft: Draft) => {
            if (queue.length === 0) {
                finishToReview(currentDraft);
                return;
            }
            const [nextSlot, ...remainingQueue] = queue;
            setPendingSlot(nextSlot);
            setPendingQueue(remainingQueue);
            addMessage("bot", SLOT_QUESTIONS[nextSlot]);
        },
        [addMessage, finishToReview]
    );

    const handleInitialParse = useCallback(
        (text: string) => {
            parseMutation.mutate(text, {
                onSuccess: (result) => {
                    setParsed(result);
                    setSkipConfirmation(SKIP_CONFIRMATION_PATTERN.test(text) || HIGH_PRIORITY_HINT_PATTERN.test(text));
                    const { draft: initialDraft, assigneeGuessed } = buildDraftFromParse(result, text, assignableUsers, departments);
                    setDraft(initialDraft);
                    setUnmatchedAssigneeName(
                        initialDraft.assigneeName && !initialDraft.assigneeId ? initialDraft.assigneeName : null
                    );

                    if (assigneeGuessed) {
                        addMessage(
                            "bot",
                            `I couldn't pick out a clear assignee, but "${initialDraft.assigneeName}" looks like a name in your message, but no active user matches it.`
                        );
                    }

                    const missingSlots = SLOT_ORDER.filter((slot) => {
                        if (slot === "assignee") return !initialDraft.assigneeId && !initialDraft.assigneeName;
                        if (slot === "department") return !initialDraft.departmentId && !initialDraft.departmentName;
                        if (slot === "dueDate") return !initialDraft.dueDate;
                        if (slot === "priority") return derivePriorityHint(text) === null;
                        return false;
                    });

                    processNextSlotOrFinish(missingSlots, initialDraft);
                },
                onError: () => {
                    toast.error("Could not process request. Please try again.");
                    addMessage("bot", "Sorry, I couldn't process that text. Could you rephrase your task?");
                },
            });
        },
        [parseMutation, assignableUsers, departments, processNextSlotOrFinish, addMessage]
    );

    const handleSend = (overrideText?: string) => {
        const trimmedInput = (overrideText ?? input).trim();
        if (!trimmedInput || parseMutation.isPending || isBotThinking) return;

        addMessage("user", trimmedInput);
        setInput("");

        if (!pendingSlot || !draft) {
            handleInitialParse(trimmedInput);
            return;
        }

        const slot = pendingSlot;
        const queue = pendingQueue;
        const currentDraft = draft;

        setIsBotThinking(true);
        window.setTimeout(() => {
            const { draft: updatedDraft, ack } = SLOT_RESOLVERS[slot](trimmedInput, currentDraft, {
                users: assignableUsers,
                departments,
            });

            if (slot === "assignee") {
                setUnmatchedAssigneeName(updatedDraft.assigneeId ? null : trimmedInput);
            }

            const departmentAutoFilled = slot === "assignee" && !currentDraft.departmentId && !!updatedDraft.departmentId;
            const nextQueue = departmentAutoFilled ? queue.filter((s) => s !== "department") : queue;

            addMessage("bot", ack);
            setDraft(updatedDraft);
            processNextSlotOrFinish(nextQueue, updatedDraft);
            setIsBotThinking(false);
        }, 220);
    };

    const handleCreate = useCallback(() => {
        if (!review || !parsed) return;

        createMutation.mutate(
            {
                title: review.title.trim(),
                context: review.context.trim() || undefined,
                category: review.category,
                priority: review.priority,
                dueDate: review.dueDate ? endOfLocalDay(review.dueDate).toISOString() : parsed.dueDate,
                assigneeId: review.assigneeId || undefined,
                departmentId: review.departmentId || undefined,
                assigneeRaw: parsed.assigneeRaw || undefined,
                departmentRaw: parsed.departmentRaw || undefined,
                confidence: parsed.confidence,
                rawInput: parsed.rawInput,
                inputMode: initialInputMode,
                wonBy: parsed.wonBy,
                channel: "web",
            },
            {
                onSuccess: (createdTask) => {
                    if (conversationIdRef.current && !isFinalizedRef.current) {
                        isFinalizedRef.current = true;
                        updateConversationMutation.mutate({
                            id: conversationIdRef.current,
                            payload: { status: "completed", resultingTaskId: createdTask.id },
                        });
                    }
                    onClose();
                },
            }
        );
    }, [review, parsed, createMutation, updateConversationMutation, initialInputMode, onClose]);

    useEffect(() => {
        if (review && parsed && skipConfirmation && !hasAutoPromptedRef.current) {
            hasAutoPromptedRef.current = true;
            handleCreate();
        }
    }, [review, parsed, skipConfirmation, handleCreate]);

    const [prefillFirstName, ...prefillRestName] = (unmatchedAssigneeName ?? "").trim().split(/\s+/);
    const prefillLastName = prefillRestName.join(" ");

    return (
        <Modal
            open
            onClose={handleModalClose}
            size="xl"
            draggable
            contentClassName="accent-blue"
            icon={
                <span className="relative inline-flex">
                    <Sparkles className="w-5 h-5 text-primary-600" />
                    <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-success ring-2 ring-surface" />
                </span>
            }
            title="Smart Add"
            description={
                review
                    ? "Review extracted details below before creating."
                    : view === "history"
                        ? "Your past Smart Add conversations."
                        : view === "transcript"
                            ? "A past conversation. Read only."
                            : "Type in English or Hinglish. I'll fill in the details."
            }
            footer={
                review && !skipConfirmation && (
                    <Button variant="primary" onClick={() => handleCreate()} isLoading={createMutation.isPending}>
                        Create task
                    </Button>
                )
            }
        >
            <div className="flex flex-col gap-4">
                {!review && (
                    <div className="flex items-center justify-between">
                        {view === "chat" ? (
                            <span />
                        ) : (
                            <button
                                type="button"
                                onClick={() => setView(view === "transcript" ? "history" : "chat")}
                                className="flex items-center gap-1.5 h-7 pl-2 pr-2.5 rounded-full border border-border/60 bg-surface t-meta font-medium text-text-secondary hover:text-text hover:bg-surface-hover hover:border-border-hover transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                            >
                                <ArrowLeft size={13} />
                                {view === "transcript" ? "Back to history" : "Back to chat"}
                            </button>
                        )}
                        {view === "chat" && (
                            <button
                                type="button"
                                onClick={() => setView("history")}
                                className="flex items-center gap-1.5 h-7 pl-2 pr-2.5 rounded-full border border-border/60 bg-surface t-meta font-medium text-text-secondary hover:text-text hover:bg-surface-hover hover:border-border-hover transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                            >
                                <HistoryIcon size={13} />
                                History
                            </button>
                        )}
                        {view === "history" && isAdmin && !!conversations?.length && (
                            <button
                                type="button"
                                onClick={handleClearHistory}
                                disabled={deleteAllConversationsMutation.isPending}
                                className="flex items-center gap-1.5 h-7 pl-2 pr-2.5 rounded-full border border-danger/25 bg-danger/5 t-meta font-medium text-danger hover:bg-danger/10 transition-all duration-200 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
                            >
                                <Trash2 size={13} />
                                Clear all
                            </button>
                        )}
                    </div>
                )}

                {!review && view === "chat" && (
                    <>
                        <div className="rounded-xl border border-border/50 bg-surface-hover/30 p-3">
                            <div ref={scrollRef} className="flex flex-col gap-3 max-h-80 overflow-y-auto pr-1">
                                <MessageBubbles messages={messages} />

                                {(parseMutation.isPending || isBotThinking) && (
                                    <div className="flex items-end gap-2 animate-in fade-in duration-200">
                                        <div className="flex items-center justify-center size-8 rounded-full shrink-0 bg-gradient-to-br from-primary-500 to-primary-700 text-white">
                                            <Bot size={16} />
                                        </div>
                                        <div className="flex items-center gap-1 bg-primary-500/10 dark:bg-primary-500/15 rounded-2xl rounded-bl-sm px-4 py-3.5">
                                            <span className="size-1.5 rounded-full bg-primary-400 animate-bounce [animation-delay:-0.3s]" />
                                            <span className="size-1.5 rounded-full bg-primary-400 animate-bounce [animation-delay:-0.15s]" />
                                            <span className="size-1.5 rounded-full bg-primary-400 animate-bounce" />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {unmatchedAssigneeName && currentUser?.role === "ADMIN" && (
                            <div className="flex items-center justify-between gap-2 rounded-lg border border-primary-500/30 bg-primary-500/10 dark:bg-primary-500/15 px-3 py-2 animate-in fade-in duration-200">
                                <span className="t-meta text-primary-800 dark:text-primary-200">
                                    No user found for &quot;{unmatchedAssigneeName}&quot;.
                                </span>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="shrink-0 gap-1.5"
                                    onClick={() => setShowCreateAssignee(true)}
                                >
                                    <UserPlus size={12} /> Create user
                                </Button>
                            </div>
                        )}

                        {showCreateAssignee && (
                            <UserForm
                                onClose={() => setShowCreateAssignee(false)}
                                prefill={{ firstName: prefillFirstName, lastName: prefillLastName, departmentId: draft?.departmentId || undefined }}
                                onCreated={(created: AdminUser) => {
                                    setDraft((prev) =>
                                        prev
                                            ? { ...prev, assigneeId: created.id, assigneeName: `${created.firstName} ${created.lastName ?? ""}`.trim() }
                                            : prev
                                    );
                                    addMessage("bot", `Created ${created.firstName} and assigned this task to them.`);
                                    setUnmatchedAssigneeName(null);
                                }}
                            />
                        )}

                        <div className="flex items-center gap-2 pt-3 border-t border-border/60">
                            <input
                                type="text"
                                className="flex-1 h-11 px-3.5 text-sm rounded-xl border border-border bg-surface text-text transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:border-primary-400 disabled:bg-surface-hover disabled:cursor-not-allowed"
                                placeholder={pendingSlot ? `Provide ${pendingSlot}...` : "Type in English or Hinglish, or record a voice note..."}
                                value={input}
                                disabled={parseMutation.isPending || isBotThinking || voiceRecorderBusy}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                                autoFocus
                            />
                            {!pendingSlot && (
                                <VoiceNoteRecorder
                                    disabled={parseMutation.isPending || isBotThinking}
                                    onBusyChange={setVoiceRecorderBusy}
                                    onTranscribed={(transcript) => {
                                        setInitialInputMode("voice");
                                        handleSend(transcript);
                                    }}
                                />
                            )}
                            <Button
                                variant="primary"
                                onClick={() => handleSend()}
                                disabled={!input.trim() || parseMutation.isPending || isBotThinking || voiceRecorderBusy}
                                aria-label="Send"
                                className="shrink-0"
                            >
                                <Send size={14} />
                            </Button>
                        </div>
                    </>
                )}

                {!review && view === "history" && (
                    <div className="rounded-xl border border-border/50 bg-surface-hover/30 p-3">
                        <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
                            {isLoadingHistory ? (
                                <p className="t-meta text-text-muted text-center py-6">Loading…</p>
                            ) : !conversations?.length ? (
                                <div className="flex flex-col items-center gap-2 py-8 text-center">
                                    <Inbox size={22} className="text-text-light" />
                                    <p className="t-meta text-text-muted">No previous conversations yet.</p>
                                </div>
                            ) : (
                                conversations.map((c) => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => {
                                            setViewingConversationId(c.id);
                                            setView("transcript");
                                        }}
                                        className="flex flex-col gap-1 items-start text-left rounded-lg border border-border/50 bg-surface hover:border-primary-400 transition-colors cursor-pointer px-3 py-2.5"
                                    >
                                        <div className="flex items-center justify-between gap-2 w-full">
                                            <Badge
                                                variant={CONVERSATION_STATUS_VARIANT[c.status]}
                                                className={`t-meta ${CONVERSATION_STATUS_TINT[c.status]}`}
                                            >
                                                {CONVERSATION_STATUS_LABEL[c.status]}
                                            </Badge>
                                            <span className="t-meta text-text-light shrink-0">{formatShortDateTime(c.createdAt)}</span>
                                        </div>
                                        <p className="text-sm font-medium text-text truncate w-full">{c.title || "New conversation"}</p>
                                        <span className="t-meta text-text-light">{c.messageCount} message{c.messageCount === 1 ? "" : "s"}</span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {!review && view === "transcript" && (
                    <div className="rounded-xl border border-border/50 bg-surface-hover/30 p-3">
                        <div className="flex flex-col gap-3 max-h-80 overflow-y-auto pr-1">
                            {isLoadingTranscript || !viewingConversation ? (
                                <p className="t-meta text-text-muted text-center py-6">Loading…</p>
                            ) : (
                                <MessageBubbles messages={viewingConversation.messages} />
                            )}
                        </div>
                    </div>
                )}

                {review && (
                    <div className="flex flex-col gap-5 pt-2 border-t border-border/60">
                        <Input
                            id="smart-title"
                            label="Title"
                            value={review.title}
                            onChange={(e) => setReview({ ...review, title: e.target.value })}
                            labelClassName={FIELD_LABEL_CLASS}
                        />
                        <Textarea
                            id="smart-context"
                            label="Context"
                            rows={3}
                            value={review.context}

                            
                            onChange={(e) => setReview({ ...review, context: e.target.value })}
                        />
                        <TaskFormPrioritySelector
                            value={review.priority}
                            onChange={(v) => setReview({ ...review, priority: v })}
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            <Input
                                id="smart-due-date"
                                type="date"
                                label="Due Date"
                                icon={Calendar}
                                iconClassName={FIELD_LABEL_ICON_CLASS}
                                labelClassName={FIELD_LABEL_CLASS}
                                value={review.dueDate}
                                onChange={(e) => setReview({ ...review, dueDate: e.target.value })}
                            />
                            <TaskFormDepartmentField
                                value={review.departmentId}
                                onChange={(v) => setReview({ ...review, departmentId: v })}
                                departments={departments}
                                isLoading={isLoadingDepts}
                            />
                        </div>
                        <TaskFormAssigneeField
                            value={review.assigneeId}
                            onChange={(v) => setReview({ ...review, assigneeId: v })}
                            users={assignableUsers}
                            isLoading={isLoadingUsers}
                        />
                        {parsed && parsed.confidence < 0.6 && (
                            <p className="t-meta font-medium text-warning bg-warning/10 border border-warning/20 rounded px-3 py-2">
                                I'm not sure I got all of this right. Check each field before you create it.
                            </p>
                        )}
                    </div>
                )}
            </div>
        </Modal>
    );
};