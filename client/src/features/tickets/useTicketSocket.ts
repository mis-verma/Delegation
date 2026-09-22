import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext"
import { connectSocket, releaseSocket } from "../../lib/socket";
import { createCoalescedInvalidator } from "../../lib/coalescedInvalidate";

/**
 * Keeps the ticket board/list live. Same posture as useTaskSocket: invalidate rather than write
 * the raw event payload into caches that hold assembled tickets, but coalesce the invalidations so
 * a burst — a drag across columns, a bulk verify, a run of checklistItem:updated events from one
 * person working through a checklist — costs one refetch per window instead of one per event.
 */
export const useTicketSocket = () => {
    const { token } = useAuth()
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!token) return;

        const socket = connectSocket(token);
        const tickets = createCoalescedInvalidator(queryClient, ["tickets"]);
        // Admin analytics (OrgOverview) reads its stat cards/gauges/rankings from real ticket
        // aggregates — without this, closing/reassigning a ticket while that page is open left
        // every number on it stale until remount or refocus.
        const analytics = createCoalescedInvalidator(queryClient, ["analytics"]);
        const invalidateTickets = () => { tickets.schedule(); analytics.schedule(); };
        const events = [
            "ticket:created",
            "ticket:updated",
            "ticket:assigned",
            "ticket:overdue",
            "ticket:deleted",
            "checklistItem:updated",
        ] as const;

        events.forEach((event) => socket.on(event, invalidateTickets));

        return () => {
            events.forEach((event) => socket.off(event, invalidateTickets));
            tickets.cancel();
            analytics.cancel();
            // releaseSocket() only — the socket is shared and refcounted (see socket.ts). The
            // unconditional disconnectSocket() that used to sit here killed it for the task and
            // notification hooks as well.
            releaseSocket()
        };

    }, [token, queryClient])

}
