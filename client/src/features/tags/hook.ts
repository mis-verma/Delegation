import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { tagApi } from "../../api/tags";
import type { CreateTagPayload } from "../../api/tags";
import { handleQueryRetry, useEntityMutation } from "../../lib/queryHelpers";

// Labels are a shared, org-wide vocabulary — not scoped to Delegation or Tickets specifically —
// so this lives here rather than under features/tasks, which is where it was originally written
// before Tickets grew its own Labels feature and needed the exact same picker/queries.
//
// Labels change a few times a month and every surface (Delegation's filter row/form/card, and
// now Tickets' equivalents) reads them, so this is one query shared by all of them.
export const useTagsQuery = () => {
    const { token } = useAuth();
    return useQuery({
        queryKey: ['tags'],
        queryFn: () => tagApi.getAll().then(r => r.data),
        enabled: !!token,
        retry: handleQueryRetry,
    });
};

export const useCreateTagMutation = () =>
    useEntityMutation({
        mutationFn: (payload: CreateTagPayload) => tagApi.create(payload).then(r => r.data),
        invalidateKeys: [['tags']],
        successMessage: 'Label created',
        errorFallback: 'Failed to create label',
    });

export const useDeleteTagMutation = () =>
    useEntityMutation({
        // Deleting a label cascades to its TaskTag/TicketTag rows server-side, so every
        // delegation or ticket carrying it loses it — hence invalidating both, not just the
        // label list itself.
        mutationFn: (id: string) => tagApi.delete(id),
        invalidateKeys: [['tags'], ['tasks'], ['tickets']],
        successMessage: 'Label deleted',
        errorFallback: 'Failed to delete label',
    });
