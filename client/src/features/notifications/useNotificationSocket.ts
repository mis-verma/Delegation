import { useEffect, useRef } from "react";
import { haptic } from "../../lib/haptics";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "../../context/AuthContext";
import { connectSocket, releaseSocket } from "../../lib/socket";
import { notificationApi, type Notification } from "../../api/notifications";
import { notificationPath } from "./notificationDisplay";
import { CHECKLIST_ALARMS_KEY } from "../checklist/alarmKeys";

type OrgEntity = "store" | "department" | "user" | "customRole";

const ORG_KEYS: Record<OrgEntity, readonly (readonly unknown[])[]> = {
    store: [["stores"], ["assignable-users"]],
    department: [["departments"], ["assignable-users"]],
    user: [["admin-users"], ["assignable-users"]],
    customRole: [["custom-roles"]],
};

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
        const pendingOrgEntities = new Set<OrgEntity>();
        let orgFlushTimer: ReturnType<typeof setTimeout> | undefined;
        const handleOrgChanged = (payload?: { entity?: OrgEntity }) => {
            if (!payload?.entity || !ORG_KEYS[payload.entity]) return;
            pendingOrgEntities.add(payload.entity);
            clearTimeout(orgFlushTimer);
            orgFlushTimer = setTimeout(() => {
                for (const entity of pendingOrgEntities) {
                    for (const key of ORG_KEYS[entity]) queryClient.invalidateQueries({ queryKey: key });
                }
                pendingOrgEntities.clear();
            }, 400);
        };
        const handleNew = (n?: Partial<Notification>) => {
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
            if (n?.type === "CHECKLIST_ALARM") queryClient.invalidateQueries({ queryKey: CHECKLIST_ALARMS_KEY });
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
        socket.on("org:changed", handleOrgChanged);

        return () => {
            clearTimeout(orgFlushTimer);
            socket.off("notification:new", handleNew);
            socket.off("org:changed", handleOrgChanged);
            releaseSocket();
        };
    }, [token, queryClient]);
};
