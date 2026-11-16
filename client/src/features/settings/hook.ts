import { useMutation , useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { categoryApi , type CreateCategoryPayload, type UpdateCategoryPayload, type TatWindowDays, type SubcategoryPayload, type CategoryFileFormat, type CategoryPriority } from "@/api/categories";
import { tagApi } from "@/api/tags";
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

export const useDownloadCategoriesMutation = () =>
    useMutation({
        mutationFn : (format : CategoryFileFormat) => categoryApi.downloadFile(format),
        onSuccess : () => toast.success("Categories downloaded"),
        onError : (err) => toast.error(errorMessage(err, "Couldn't download the categories")),
    })

export type CategoryJob = CreateCategoryPayload & {
    existingCategoryId?: string;
    labels?: readonly string[];
    subcategories?: JobSubcategory[];
};

type JobSubcategory = {
    name: string;
    tatHours?: number | null;
    labels?: readonly string[];
    priority?: CategoryPriority | null;
    assigneeId?: string | null;
    departmentId?: string | null;
};

const labelKey = (name : string) => name.trim().toLowerCase();

const resolveLabelIds = async (jobs : CategoryJob[]) => {
    const wanted = new Map<string, string>();
    for (const job of jobs) {
        for (const name of [...(job.labels ?? []), ...(job.subcategories ?? []).flatMap((sub) => sub.labels ?? [])]) wanted.set(labelKey(name), name.trim());
    }
    const ids = new Map<string, string>();
    if (wanted.size === 0) return ids;
    const existing = await tagApi.getAll().then((r) => r.data).catch(() => []);
    for (const tag of existing) ids.set(labelKey(tag.name), tag.id);
    for (const [key, name] of wanted) {
        if (ids.has(key)) continue;
        await tagApi.create({ name }).then((r) => ids.set(key, r.data.id), () => undefined);
    }
    return ids;
};

const idsFor = (names : readonly string[] | undefined, ids : Map<string, string>) => (names ?? []).flatMap((name) => ids.get(labelKey(name)) ?? []);

export const useCreateManyCategoriesMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn : async (jobs : CategoryJob[]) => {
            const failed : string[] = [];
            let created = 0;
            const labelIds = await resolveLabelIds(jobs);
            for (const { existingCategoryId, subcategories, labels, ...payload } of jobs) {
                let categoryId = existingCategoryId;
                if (!categoryId) {
                    try {
                        const made = await categoryApi.create({ ...payload, tagIds : idsFor(labels, labelIds) });
                        categoryId = made.data.id;
                        created += 1;
                    } catch {
                        failed.push(payload.name);
                        continue;
                    }
                }
                for (const subcategory of subcategories ?? []) {
                    try {
                        await categoryApi.createSubcategory(categoryId, {
                            name: subcategory.name,
                            tatHours: subcategory.tatHours ?? null,
                            priority: subcategory.priority ?? null,
                            assigneeId: subcategory.assigneeId ?? null,
                            departmentId: subcategory.departmentId ?? null,
                            tagIds : idsFor(subcategory.labels, labelIds),
                        });
                    } catch {
                        failed.push(`${payload.name} / ${subcategory.name}`);
                    }
                }
            }
            return { created, failed };
        },
        onSuccess : ({ created, failed }) => {
            queryClient.invalidateQueries({queryKey : CATEGORY_KEY.all});
            if (created > 0) toast.success(`${created} ${created === 1 ? "category" : "categories"} added`);
            else if (failed.length === 0) toast.success("Subcategories added");
            if (failed.length > 0) toast.error(`Couldn't add: ${failed.join(", ")}`);
        },
    })
}

export type ClearTarget = { id : string; name : string; isActive : boolean };

export const useClearCategoriesMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn : async ({ targets, detachTickets } : { targets : ClearTarget[]; detachTickets? : boolean }) => {
            let deleted = 0;
            let turnedOff = 0;
            const failed : string[] = [];
            const kept : ClearTarget[] = [];
            for (const target of targets) {
                const removed = await categoryApi.delete(target.id, { detachTickets }).then(() => true, () => false);
                if (removed) {
                    deleted += 1;
                    continue;
                }
                if (!target.isActive) {
                    turnedOff += 1;
                    kept.push(target);
                    continue;
                }
                const off = await categoryApi.update(target.id, { isActive : false }).then(() => true, () => false);
                if (off) {
                    turnedOff += 1;
                    kept.push(target);
                } else failed.push(target.name);
            }
            return { deleted, turnedOff, failed, kept };
        },
        onSuccess : ({ deleted, turnedOff, failed }) => {
            queryClient.invalidateQueries({queryKey : CATEGORY_KEY.all});
            toast.success(turnedOff > 0 ? `${deleted} deleted, ${turnedOff} kept because tickets use them` : `${deleted} deleted`);
            if (failed.length > 0) toast.error(`Couldn't remove: ${failed.join(", ")}`);
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
        mutationFn : ({ id, detachTickets } : { id : string; detachTickets? : boolean; quiet? : boolean }) => categoryApi.delete(id, { detachTickets }),
        onSuccess : () => {
            queryClient.invalidateQueries({queryKey : CATEGORY_KEY.all});
            toast.success("Category deleted");
        },
        onError : (err, variables) => {
            if (!variables.quiet) toast.error(errorMessage(err, "Failed to delete category"));
        },

    })
}

export const useSaveSubcategoryMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn : ({ categoryId, id, payload }: { categoryId: string; id?: string; payload: SubcategoryPayload & { name?: string } }) =>
            id
                ? categoryApi.updateSubcategory(categoryId, id, payload)
                : categoryApi.createSubcategory(categoryId, { ...payload, name: payload.name ?? "" }),
        onSuccess : (_data, vars) => {
            queryClient.invalidateQueries({queryKey : CATEGORY_KEY.all});
            toast.success(vars.id ? "Subcategory updated" : "Subcategory added");
        },
        onError : (err) => toast.error(errorMessage(err, "Couldn't save the subcategory")),
    })
}

export const useDeleteSubcategoryMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn : ({ categoryId, id }: { categoryId: string; id: string }) => categoryApi.deleteSubcategory(categoryId, id),
        onSuccess : () => {
            queryClient.invalidateQueries({queryKey : CATEGORY_KEY.all});
            toast.success("Subcategory deleted");
        },
        onError : (err) => toast.error(errorMessage(err, "Couldn't delete the subcategory")),
    })
}

export { useDepartmentsQuery} from "../tickets/hook"