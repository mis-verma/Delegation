import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { todoApi, type Todo, type CreateTodoPayload, type UpdateTodoPayload } from "@/api/todos";
import { toast } from "sonner";
import type { DashboardQueryOptions } from "@/lib/dashboardQuery";

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

const TODO_KEY = {
    all: ["todos"] as const,
};

/**
 * Shared opening move for the two optimistic mutations below: stop any in-flight refetch from
 * landing on top of the patch we're about to make, snapshot the list so onError can put it back,
 * then apply `patch` to the cache immediately.
 */
const beginOptimistic = async (queryClient: QueryClient, patch: (todos: Todo[]) => Todo[]) => {
    await queryClient.cancelQueries({ queryKey: TODO_KEY.all });
    const previous = queryClient.getQueryData<Todo[]>(TODO_KEY.all);
    queryClient.setQueryData<Todo[]>(TODO_KEY.all, (old) => (old ? patch(old) : old));
    return { previous };
};

// `enabled` lets a caller (e.g. the header's quick search) defer the fetch until it's actually
// needed, instead of every mount pulling the full list regardless of whether it's used yet.
// Shared with the route prefetch so a hover on the sidebar link and the page itself use one cache entry.
export const todosQueryOptions = () => ({
    queryKey: TODO_KEY.all,
    queryFn: () => todoApi.getAll().then(r => r.data),
});

export const useTodosQuery = (enabled = true, options?: DashboardQueryOptions) => {
    const { token } = useAuth();
    return useQuery({
        ...todosQueryOptions(),
        enabled: !!token && enabled,
        ...options,
    });
};

// Server-side todo counts (todo.service.ts#summary) rather than a client-side reduce over
// useTodosQuery, so the sidebar and the dashboard don't need the whole list just to count it.
// Todos are always strictly per-user, so there is no scope to pick.
export const useTodoSummaryQuery = (enabled = true, options?: DashboardQueryOptions) => {
    const { token } = useAuth();
    return useQuery({
        queryKey: ["todos", "summary"] as const,
        queryFn: () => todoApi.getSummary(),
        enabled: !!token && enabled,
        ...options,
    });
};

export const useCreateTodoMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: CreateTodoPayload) => todoApi.create(payload).then(r => r.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: TODO_KEY.all });
            toast.success("Todo added");
        },
        onError: (err) => toast.error(errorMessage(err, "Failed to add todo")),
    });
};

/**
 * Optimistic: the cache is patched before the request leaves, so ticking a todo off flips the row
 * instantly instead of holding a spinner for a full round-trip. Checking things off is the whole
 * point of this page, and it was the one interaction that felt slow. A failure rolls the list back
 * to the pre-mutation snapshot and surfaces the error, so the UI can't silently disagree with the
 * server.
 */
export const useUpdateTodoMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: UpdateTodoPayload }) =>
            todoApi.update(id, payload).then(r => r.data),
        onMutate: ({ id, payload }) =>
            beginOptimistic(queryClient, (todos) =>
                todos.map((t) => (t.id === id ? { ...t, ...payload } : t)),
            ),
        onError: (err, _vars, context) => {
            if (context?.previous) queryClient.setQueryData(TODO_KEY.all, context.previous);
            toast.error(errorMessage(err, "Failed to update todo"));
        },
        // Reconcile against the server either way — on success to pick up anything it computed,
        // on failure to be sure the rollback matches reality.
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: TODO_KEY.all });
        },
    });
};

/**
 * Re-creates a deleted todo. The original row is gone, so this is a new record with a new id —
 * fine for an undo of an accidental tap, but it does mean the restored todo sorts as newly
 * created. `completed` isn't part of the create payload, so a deleted-while-completed todo takes
 * a follow-up patch to come back in the state it left in.
 */
const restoreTodo = async (queryClient: QueryClient, todo: Todo) => {
    try {
        const created = await todoApi.create({
            text: todo.text,
            priority: todo.priority,
            dueDate: todo.dueDate ?? undefined,
        }).then(r => r.data);

        if (todo.completed) {
            await todoApi.update(created.id, { completed: true });
        }
        toast.success("Todo restored");
    } catch (err) {
        toast.error(errorMessage(err, "Could not restore that todo"));
    } finally {
        queryClient.invalidateQueries({ queryKey: TODO_KEY.all });
    }
};

/**
 * Also optimistic, and offers an Undo. Delete here is a single unconfirmed tap on a row action —
 * without a way back, one mis-tap silently destroyed work. An undo toast is a better fit than a
 * confirm dialog for something this small and this frequent: it keeps the common case one tap.
 */
export const useDeleteTodoMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => todoApi.delete(id),
        onMutate: async (id) => {
            const { previous } = await beginOptimistic(queryClient, (todos) => todos.filter((t) => t.id !== id));
            // Read the removed row out of the post-cancel snapshot rather than the live cache, so
            // it can't be taken from a refetch that landed between the read and the cancel.
            return { previous, removed: previous?.find((t) => t.id === id) };
        },
        onSuccess: (_data, _id, context) => {
            const removed = context?.removed;
            toast.success("Todo removed", removed && {
                // Longer than the 4s default: an undo nobody has time to reach isn't an undo.
                duration: 8000,
                action: { label: "Undo", onClick: () => void restoreTodo(queryClient, removed) },
            });
        },
        onError: (err, _id, context) => {
            if (context?.previous) queryClient.setQueryData(TODO_KEY.all, context.previous);
            toast.error(errorMessage(err, "Failed to remove todo"));
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: TODO_KEY.all });
        },
    });
};
