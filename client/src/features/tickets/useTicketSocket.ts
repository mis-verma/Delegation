import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext"
import { connectSocket, releaseSocket } from "../../lib/socket";
import { createCoalescedInvalidator, createScoreCacheInvalidator } from "../../lib/coalescedInvalidate";

export const useTicketSocket = () => {
    const { token } = useAuth()
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!token) return;

        const socket = connectSocket(token);
        const tickets = createCoalescedInvalidator(queryClient, ["tickets"]);
        const analytics = createCoalescedInvalidator(queryClient, ["analytics"]);
        const scores = createScoreCacheInvalidator(queryClient);
        const invalidateTickets = () => { tickets.schedule(); analytics.schedule(); scores.schedule(); };
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
            scores.cancel();
            releaseSocket()
        };

    }, [token, queryClient])

}
