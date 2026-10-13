import { useEffect, useRef } from "react";
import { haptic } from "../../lib/haptics";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "../../context/AuthContext";
import { connectSocket, releaseSocket } from "../../lib/socket";
import { notificationApi, type Notification } from "../../api/notifications";
import { notificationPath } from "./notificationDisplay";

interface Options {
    /** Lets the bell play its own "new" animation. */
    onArrive?: () => void;
    // App.tsx also calls this hook, bare, at the very top of <App> — ABOVE where <RouterProvider>
    // is returned, same as its sibling useTicketSocket/useTaskSocket/useChecklistSocket calls
    // (kept there so the cache stays fresh app-wide, not just while a particular page is open) -
    // so this hook itself can never call useNavigate(). Only NotificationBell, which renders
    // inside Header/AdminHeader and is therefore always under <RouterProvider>, passes one - the
    // toast's "Open" action (and the toast itself) only appears for whichever caller opts in,
    // so a notification arriving isn't announced twice while both callers are mounted at once.
    navigate?: (path: string) => void;
}

export const useNotificationSocket = ({ onArrive, navigate }: Options = {}) => {
    const { token } = useAuth();
    const queryClient = useQueryClient();
    const onArriveRef = useRef(onArrive);
    useEffect(() => { onArriveRef.current = onArrive; }, [onArrive]);
    const navigateRef = useRef(navigate);
    useEffect(() => { navigateRef.current = navigate; }, [navigate]);

    useEffect(() => {
        if (!token) return;
        const socket = connectSocket(token);
        const handleNew = (n?: Partial<Notification>) => {
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
            onArriveRef.current?.();
            // Both callers of this hook hear the event; the 300ms throttle keeps it to one buzz.
            haptic("warning");

            const doNavigate = navigateRef.current;
            if (!doNavigate || !n?.id || !n.title) return;
            const path = notificationPath({ ticketId: n.ticketId ?? null, taskId: n.taskId ?? null, checklistInstanceId: n.checklistInstanceId ?? null });
            const id = n.id;
            // Top-right (main.tsx's Toaster) so a new notification is seen even with the panel
            // closed; the toast id is the notification id, so a double delivery never stacks two.
            toast.info(n.title, {
                id,
                description: n.message,
                duration: 8000,
                action: path
                    ? {
                        label: "Open",
                        onClick: () => {
                            notificationApi.markRead(id)
                                .then(() => queryClient.invalidateQueries({ queryKey: ["notifications"] }))
                                .catch(() => undefined);
                            doNavigate(path);
                        },
                    }
                    : undefined,
            });
        };

        socket.on("notification:new", handleNew);

        return () => {
            socket.off("notification:new", handleNew);
            releaseSocket();
        };
    }, [token, queryClient]);
};
