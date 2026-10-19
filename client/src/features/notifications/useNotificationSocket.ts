import { useEffect, useRef } from "react";
import { haptic } from "../../lib/haptics";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "../../context/AuthContext";
import { connectSocket, releaseSocket } from "../../lib/socket";
import { notificationApi, type Notification } from "../../api/notifications";
import { notificationPath } from "./notificationDisplay";

interface Options {
    onArrive?: () => void;
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
            haptic("warning");

            const doNavigate = navigateRef.current;
            if (!doNavigate || !n?.id || !n.title) return;
            const path = notificationPath({ ticketId: n.ticketId ?? null, taskId: n.taskId ?? null, checklistInstanceId: n.checklistInstanceId ?? null });
            const id = n.id;
            toast.info(n.title, {
                id,
                description: n.message,
                duration: 8000,
                dismissible: true,
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
