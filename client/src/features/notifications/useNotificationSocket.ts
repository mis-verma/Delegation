import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useAuth } from "../../context/AuthContext";
import { connectSocket, releaseSocket } from "../../lib/socket";
import { notificationApi, type Notification } from "../../api/notifications";
import { notificationPath } from "./notificationDisplay";

// `onArrive` lets the bell play its own "new" animation. Every arrival also pops a toast (top
// right, from main.tsx's Toaster) so a new notification is seen even when the panel is closed;
// the toast id is the notification id, so a double delivery never stacks two.
export const useNotificationSocket = (onArrive?: () => void) => {
    const { token } = useAuth();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const onArriveRef = useRef(onArrive);
    useEffect(() => { onArriveRef.current = onArrive; }, [onArrive]);

    useEffect(() => {
        if (!token) return;
        const socket = connectSocket(token);
        const handleNew = (n?: Partial<Notification>) => {
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
            onArriveRef.current?.();
            if (!n?.id || !n.title) return;
            const path = notificationPath({ ticketId: n.ticketId ?? null, taskId: n.taskId ?? null, checklistInstanceId: n.checklistInstanceId ?? null });
            const id = n.id;
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
                            navigate(path);
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
    }, [token, queryClient, navigate]);
};
