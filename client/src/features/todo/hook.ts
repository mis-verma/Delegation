import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { todoApi, type Todo, type CreateTodoPayload, type UpdateTodoPayload } from "@/api/todos";
import { toast } from "sonner";
import type { DashboardQueryOptions } from "@/lib/dashboardQuery";
import { notifyError } from "@/lib/queryHelpers";
import { haptic } from "@/lib/haptics";
import { pushUndo, undoEntry } from "@/lib/undoRedo";

const TODO_KEY = {
    all: ["todos"] as const,
};

const refreshTodos = (queryClient: QueryClient) => {
    void queryClient.invalidateQueries({ queryKey: TODO_KEY.all });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
};

const beginOptimistic = async (queryClient: QueryClient, patch: (todos: Todo[]) => Todo[]) => {
    await queryClient.cancelQueries({ queryKey: TODO_KEY.all });
    const previous = queryClient.getQueryData<Todo[]>(TODO_KEY.all);
    queryClient.setQueryData<Todo[]>(TODO_KEY.all, (old) => (old ? patch(old) : old));
    return { previous };
};

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
        onSuccess: (created, payload) => {
            refreshTodos(queryClient);
            toast.success("To-do added");
            haptic("success");
            let currentId = created.id;
            pushUndo({
                label: "added to-do",
                undo: () => todoApi.delete(currentId).then(() => refreshTodos(queryClient)),
                redo: () => todoApi.create(payload).then((r) => { currentId = r.data.id; refreshTodos(queryClient); }),
            });
        },
        onError: (err) => notifyError(err, "Couldn't add the to-do. Try again."),
    });
};

export const useUpdateTodoMutation = () => {
    const queryClient = useQueryClient();
    const mutation = useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: UpdateTodoPayload }) =>
            todoApi.update(id, payload).then(r => r.data),
        onMutate: ({ id, payload }) => {
            if ("completed" in payload) haptic("tap");
            return beginOptimistic(queryClient, (todos) =>
                todos.map((t) => (t.id === id ? { ...t, ...payload } : t)),
            );
        },
        onSuccess: (_data, { id, payload }, context) => {
            const prev = context?.previous?.find((t) => t.id === id);
            if (!prev || !Object.keys(payload).every((key) => key in prev)) return;
            const before = Object.fromEntries(Object.keys(payload).map((key) => [key, prev[key as keyof Todo]])) as UpdateTodoPayload;
            const send = (body: UpdateTodoPayload) => todoApi.update(id, body).then(() => refreshTodos(queryClient));
            pushUndo({
                label: "completed" in payload ? (payload.completed ? "completed to-do" : "reopened to-do") : "to-do edit",
                undo: () => send(before),
                redo: () => send(payload),
            });
        },
        onError: (err, vars, context) => {
            if (context?.previous) queryClient.setQueryData(TODO_KEY.all, context.previous);
            notifyError(err, "Couldn't update the to-do. Try again.", { retry: () => mutation.mutate(vars) });
        },
        onSettled: () => {
            refreshTodos(queryClient);
        },
    });
    return mutation;
};

const recreateTodo = async (queryClient: QueryClient, todo: Todo): Promise<string> => {
    const created = await todoApi.create({
        text: todo.text,
        priority: todo.priority,
        dueDate: todo.dueDate ?? undefined,
    }).then(r => r.data);
    if (todo.completed) await todoApi.update(created.id, { completed: true });
    refreshTodos(queryClient);
    return created.id;
};

const restoreTodos = async (queryClient: QueryClient, removed: Todo[]) => {
    try {
        await todoApi.restore(removed.map((t) => ({ text: t.text, completed: t.completed, dueDate: t.dueDate, priority: t.priority, createdAt: t.createdAt })));
        toast.success(removed.length === 1 ? "To-do restored" : `${removed.length} to-dos restored`);
    } catch (err) {
        notifyError(err, "Couldn't restore the to-dos. Try again.");
    } finally {
        refreshTodos(queryClient);
    }
};

export const useClearCompletedMutation = () => {
    const queryClient = useQueryClient();
    const mutation = useMutation({
        mutationFn: (ids: string[]) => todoApi.clearCompleted(ids).then((r) => r.data),
        onMutate: async (ids) => {
            const drop = new Set(ids);
            const { previous } = await beginOptimistic(queryClient, (todos) => todos.filter((t) => !drop.has(t.id)));
            return { previous, removed: (previous ?? []).filter((t) => drop.has(t.id)) };
        },
        onSuccess: (_data, _ids, context) => {
            const removed = context?.removed ?? [];
            toast.success(removed.length === 1 ? "1 completed to-do cleared" : `${removed.length} completed to-dos cleared`, removed.length ? {
                duration: 8000,
                action: { label: "Undo", onClick: () => void restoreTodos(queryClient, removed) },
            } : undefined);
        },
        onError: (err, ids, context) => {
            if (context?.previous) queryClient.setQueryData(TODO_KEY.all, context.previous);
            notifyError(err, "Couldn't clear the completed to-dos. Try again.", { retry: () => mutation.mutate(ids) });
        },
        onSettled: () => {
            refreshTodos(queryClient);
        },
    });
    return mutation;
};

export const useDeleteTodoMutation = () => {
    const queryClient = useQueryClient();
    const mutation = useMutation({
        mutationFn: (id: string) => todoApi.delete(id),
        onMutate: async (id) => {
            const { previous } = await beginOptimistic(queryClient, (todos) => todos.filter((t) => t.id !== id));
            return { previous, removed: previous?.find((t) => t.id === id) };
        },
        onSuccess: (_data, _id, context) => {
            const removed = context?.removed;
            if (!removed) {
                toast.success("To-do removed");
                return;
            }
            let currentId: string | null = null;
            const entry = pushUndo({
                label: "removed to-do",
                undo: async () => { currentId = await recreateTodo(queryClient, removed); },
                redo: async () => {
                    if (currentId) await todoApi.delete(currentId);
                    refreshTodos(queryClient);
                },
            });
            toast.success("To-do removed", {
                duration: 8000,
                action: { label: "Undo", onClick: () => void undoEntry(entry) },
            });
        },
        onError: (err, id, context) => {
            if (context?.previous) queryClient.setQueryData(TODO_KEY.all, context.previous);
            notifyError(err, "Couldn't remove the to-do. Try again.", { retry: () => mutation.mutate(id) });
        },
        onSettled: () => {
            refreshTodos(queryClient);
        },
    });
    return mutation;
};
