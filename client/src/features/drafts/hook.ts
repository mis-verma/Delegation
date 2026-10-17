import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { draftApi, type Draft, type DraftKind } from "@/api/drafts";
import { notifyError } from "@/lib/queryHelpers";

const draftsKey = (kind: DraftKind) => ["drafts", kind] as const;

export const useDraftsQuery = (kind: DraftKind, enabled = true) => {
    const { token } = useAuth();
    return useQuery({
        queryKey: draftsKey(kind),
        queryFn: () => draftApi.list(kind),
        enabled: !!token && enabled,
        staleTime: 30_000,
    });
};

export const useSaveDraftMutation = (kind: DraftKind) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, title, payload }: { id?: string; title: string; payload: Record<string, unknown> }) =>
            id ? draftApi.update(id, { title, payload }) : draftApi.create({ kind, title, payload }),
        onSuccess: (saved) => {
            queryClient.setQueryData<Draft[]>(draftsKey(kind), (old) => (old ? [saved, ...old.filter((d) => d.id !== saved.id)] : old));
            void queryClient.invalidateQueries({ queryKey: draftsKey(kind) });
        },
        onError: (err) => notifyError(err, "Couldn't save the draft. Try again."),
    });
};

export const useDeleteDraftMutation = (kind: DraftKind) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => draftApi.remove(id),
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: draftsKey(kind) });
            const previous = queryClient.getQueryData<Draft[]>(draftsKey(kind));
            queryClient.setQueryData<Draft[]>(draftsKey(kind), (old) => old?.filter((d) => d.id !== id));
            return { previous };
        },
        onError: (err, _id, ctx) => {
            if (ctx?.previous) queryClient.setQueryData(draftsKey(kind), ctx.previous);
            notifyError(err, "Couldn't delete the draft.");
        },
        onSettled: () => void queryClient.invalidateQueries({ queryKey: draftsKey(kind) }),
    });
};
