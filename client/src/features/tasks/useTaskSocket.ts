import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext"
import { connectSocket, releaseSocket } from "../../lib/socket";
import { createCoalescedInvalidator, createScoreCacheInvalidator } from "../../lib/coalescedInvalidate";

/**
 * Keeps the delegation board/list live.
 *
 * This used to listen for 'task:created' only, so the board updated when a colleague *added* a
 * delegation but not when one was moved between columns, edited, verified or deleted — the exact
 * changes a shared kanban board exists to show. The server now emits 'task:updated' and
 * 'task:deleted' too; all three invalidate the same ['tasks'] tree.
 *
 * Invalidate rather than patch the cache by hand: the payload is the raw task row, while the list
 * and detail queries carry assembled shapes (checklists, attachments, assignees), so writing the
 * row straight in would replace richer cached objects with thinner ones. React Query dedupes
 * concurrent refetches, but not ones spaced further apart than a single request's flight — hence
 * the coalescing wrapper, which bounds a drag-several-cards burst to one refetch per window.
 */
export const useTaskSocket = () => {
    const { token } = useAuth()
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!token) return;

        const socket = connectSocket(token);
        const tasks = createCoalescedInvalidator(queryClient, ["tasks"]);
        // Admin analytics (OrgOverview) reads its delegation stats/leaderboard from real task
        // aggregates — without this, completing a delegation while that page is open left those
        // numbers stale until remount or refocus.
        const analytics = createCoalescedInvalidator(queryClient, ["analytics"]);
        const scores = createScoreCacheInvalidator(queryClient);
        const invalidateTasks = () => { tasks.schedule(); analytics.schedule(); scores.schedule(); };
        const events = ["task:created", "task:updated", "task:deleted"] as const;

        events.forEach((event) => socket.on(event, invalidateTasks));

        return () => {
            events.forEach((event) => socket.off(event, invalidateTasks));
            tasks.cancel();
            analytics.cancel();
            scores.cancel();
            // releaseSocket() only, no disconnectSocket(). The socket is shared with the ticket and
            // notification hooks and is refcounted for exactly that reason (see socket.ts); calling
            // disconnect unconditionally here tore it down for those consumers too and made the
            // refcount pointless.
            releaseSocket()
        };

    }, [token, queryClient])

}
