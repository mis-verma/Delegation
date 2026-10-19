import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext"
import { connectSocket, releaseSocket } from "../../lib/socket";
import { createCoalescedInvalidator, createScoreCacheInvalidator } from "../../lib/coalescedInvalidate";

export const useTaskSocket = () => {
    const { token } = useAuth()
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!token) return;

        const socket = connectSocket(token);
        const tasks = createCoalescedInvalidator(queryClient, ["tasks"]);
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
            releaseSocket()
        };

    }, [token, queryClient])

}
