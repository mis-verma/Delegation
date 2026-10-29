import { useMutation , useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { categoryApi , type CreateCategoryPayload, type UpdateCategoryPayload, type TatWindowDays } from "@/api/categories";
import { meApi, type UpdateMyProfilePayload, type ChangeMyPasswordPayload } from "@/api/me";
import { toast } from "sonner";

const errorMessage = (err : unknown , fallback : string) => (err instanceof Error ? err.message : fallback)

const CATEGORY_KEY = {
    all : ["categories"] as const,
};

const ME_KEY = {
    profile : ["me", "profile"] as const,
};

export const useMyProfileQuery = () => {
    const { token } = useAuth();
    return useQuery({
        queryKey : ME_KEY.profile,
        queryFn : () => meApi.get().then(r => r.data),
        enabled : !!token,
    });
};

export const useUpdateMyProfileMutation = () => {
    const queryClient = useQueryClient();
    const { updateUser } = useAuth();
    return useMutation({
        mutationFn : (payload : UpdateMyProfilePayload) => meApi.update(payload).then(r => r.data),
        onSuccess : (updated) => {
            queryClient.setQueryData(ME_KEY.profile, updated);
            updateUser({ name: updated.firstName });
            toast.success("Profile updated");
        },
        onError : (err) => toast.error(errorMessage(err, "Failed to update profile")),
    });
};

export const useChangeMyPasswordMutation = () => {
    const { logout } = useAuth();
    return useMutation({
        mutationFn : (payload : ChangeMyPasswordPayload) => meApi.changePassword(payload),
        onSuccess : () => {
            toast.success("Password changed — please sign in again.");
            logout();
        },
        onError : (err) => toast.error(errorMessage(err, "Failed to change password")),
    });
};

export const useUploadMyAvatarMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn : (file : File) => meApi.uploadAvatar(file).then(r => r.data),
        onSuccess : (updated) => queryClient.setQueryData(ME_KEY.profile, updated),
        onError : (err) => toast.error(errorMessage(err, "Failed to upload photo")),
    });
};

export const useRemoveMyAvatarMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn : () => meApi.removeAvatar().then(r => r.data),
        onSuccess : (updated) => queryClient.setQueryData(ME_KEY.profile, updated),
        onError : (err) => toast.error(errorMessage(err, "Failed to remove photo")),
    });
};

export const categoriesQueryOptions = () => ({
    queryKey : CATEGORY_KEY.all,
    queryFn : () => categoryApi.getAll().then(r => r.data),
    staleTime : 5 * 60_000,
});

export const useCategoriesQuery = (enabled: boolean = true) => {
    const { token } = useAuth();
    return useQuery({
        ...categoriesQueryOptions(),
        enabled : !!token && enabled,
    })
};

export const useCategoryTatQuery = (days: TatWindowDays, enabled: boolean = true, tagId?: string) => {
    const { token } = useAuth();
    return useQuery({
        queryKey : [...CATEGORY_KEY.all, "tat", days, tagId ?? ""] as const,
        queryFn : () => categoryApi.tatReport(days, tagId).then(r => r.data),
        enabled : !!token && enabled,
        staleTime : 60_000,
    });
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

export const useCreateManyCategoriesMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn : async (payloads : CreateCategoryPayload[]) => {
            const failed : string[] = [];
            let created = 0;
            for (const payload of payloads) {
                try {
                    await categoryApi.create(payload);
                    created += 1;
                } catch {
                    failed.push(payload.name);
                }
            }
            return { created, failed };
        },
        onSuccess : ({ created, failed }) => {
            queryClient.invalidateQueries({queryKey : CATEGORY_KEY.all});
            if (created > 0) toast.success(`${created} ${created === 1 ? "category" : "categories"} added`);
            if (failed.length > 0) toast.error(`Couldn't add: ${failed.join(", ")}`);
        },
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