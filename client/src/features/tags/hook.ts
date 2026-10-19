import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { tagApi } from "../../api/tags";
import type { CreateTagPayload, UpdateTagPayload } from "../../api/tags";
import { handleQueryRetry, useEntityMutation } from "../../lib/queryHelpers";

export const tagsQueryOptions = () => ({
    queryKey: ['tags'] as const,
    queryFn: () => tagApi.getAll().then(r => r.data),
    staleTime: 5 * 60_000,
});

export const useTagsQuery = (enabled: boolean = true) => {
    const { token } = useAuth();
    return useQuery({
        ...tagsQueryOptions(),
        enabled: !!token && enabled,
        retry: handleQueryRetry,
    });
};

export const useCreateTagMutation = () =>
    useEntityMutation({
        mutationFn: (payload: CreateTagPayload) => tagApi.create(payload).then(r => r.data),
        invalidateKeys: [['tags']],
        successMessage: null,
        errorFallback: "Couldn't create that label. Try again.",
    });

export const useUpdateTagMutation = () =>
    useEntityMutation({
        mutationFn: ({ id, payload }: { id: string; payload: UpdateTagPayload }) => tagApi.update(id, payload).then(r => r.data),
        invalidateKeys: [['tags'], ['tasks'], ['tickets']],
        successMessage: null,
        errorFallback: "Couldn't change that label. Try again.",
    });

export const useDeleteTagMutation = () =>
    useEntityMutation({
        mutationFn: (id: string) => tagApi.delete(id),
        invalidateKeys: [['tags'], ['tasks'], ['tickets']],
        successMessage: null,
        errorFallback: "Couldn't delete that label. Try again.",
    });
