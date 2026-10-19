import { useMutation , useQuery , useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "../../context/AuthContext";
import { notificationApi, type Notification } from "../../api/notifications";

const KEY = ["notifications"] as const;

export const useNotificationsQuery = () => {
    const { token } = useAuth()
    return useQuery({
        queryKey : KEY,
        queryFn : () => notificationApi.getAll().then(r => r.data),
        enabled : !!token
    })
}

export const useMarkNotificationReadMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn : ( id : string) => notificationApi.markRead(id),
        onMutate : async (id: string) => {
            await queryClient.cancelQueries({ queryKey : KEY });
            const previous = queryClient.getQueryData<Notification[]>(KEY);
            queryClient.setQueryData<Notification[]>(KEY, (old) => old?.map((n) => (n.id === id ? { ...n, isRead : true } : n)));
            return { previous };
        },
        onError : (_err, _id, context) => {
            if (context?.previous) queryClient.setQueryData(KEY, context.previous);
            toast.error("Couldn't mark that as read. Try again.");
        },
        onSettled : () => queryClient.invalidateQueries({ queryKey : KEY })
    })
};

export const useMarkAllNotificationsReadMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn : () => notificationApi.markAllRead(),
        onMutate : async () => {
            await queryClient.cancelQueries({ queryKey : KEY });
            const previous = queryClient.getQueryData<Notification[]>(KEY);
            queryClient.setQueryData<Notification[]>(KEY, (old) => old?.map((n) => ({ ...n, isRead : true })));
            return { previous };
        },
        onSuccess : () => toast.success("All caught up"),
        onError : (_err, _vars, context) => {
            if (context?.previous) queryClient.setQueryData(KEY, context.previous);
            toast.error("Couldn't mark everything as read. Try again.");
        },
        onSettled : () => queryClient.invalidateQueries({ queryKey : KEY })
    })
}
