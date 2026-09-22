import { useMutation , useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { categoryApi , type CreateCategoryPayload, type UpdateCategoryPayload } from "@/api/categories";
import { toast } from "sonner";

const errorMessage = (err : unknown , fallback : string) => (err instanceof Error ? err.message : fallback)

const CATEGORY_KEY = {
    all : ["categories"] as const,
};

export const useCategoriesQuery = (enabled: boolean = true) => {
    const { token } = useAuth();
    return useQuery({
        queryKey : CATEGORY_KEY.all,
        queryFn : () => categoryApi.getAll().then(r => r.data),
        enabled : !!token && enabled,
    })
};

export const useCreateCategoryMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn : (payload : CreateCategoryPayload) => categoryApi.create(payload).then(r => r.data),
        onSuccess: () => {
            queryClient.invalidateQueries({queryKey : CATEGORY_KEY.all});
            toast.success("Category created")
        },
        onError : (err) => toast.error(errorMessage(err, "Failed to create category")),
    })
}

export const useUpdateCategoryMutation = () => {
    const queryClient = useQueryClient();
     return useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: UpdateCategoryPayload }) =>
            categoryApi.update(id, payload).then(r => r.data),

        onSuccess : () => {
            queryClient.invalidateQueries({queryKey : CATEGORY_KEY.all});
            toast.success("Category updated")
        },

        onError:(err) => toast.error(errorMessage(err, "Failed to update category")),
     })
}

export const useDeleteCategoryMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn : (id : string) => categoryApi.delete(id),
        onSuccess : () => {
            queryClient.invalidateQueries({queryKey : CATEGORY_KEY.all});
            toast.success("Category deleted");

        },
        onError : (err) => toast.error(errorMessage(err, "Failed to delete category")),

    })
}

export { useDepartmentsQuery} from "../tickets/hook"