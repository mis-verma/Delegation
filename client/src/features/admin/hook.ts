import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { adminApi, type CreateUserPayload, type UpdateUserPayload } from "../../api/admin";
import { departmentApi, type CreateDepartmentPayload, type UpdateDepartmentPayload } from "../../api/departments";
import { storeApi, type CreateStorePayload, type UpdateStorePayload } from "../../api/stores";
import {
    checklistTemplateApi,
    type ChecklistTemplateTarget,
    type CreateChecklistTemplatePayload,
    type UpdateChecklistTemplatePayload,
    type CreateChecklistTemplateItemPayload,
    type UpdateChecklistTemplateItemPayload,
} from "../../api/checklistTemplates";
import { settingApi , type UpdateSettingsPayload } from "../../api/settings";
import { handleQueryRetry } from "../../lib/queryHelpers";
import { toast } from "sonner";

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

const USER_KEYS = {
    all: ["admin-users"] as const,
    detail: (id: string) => ["admin-users", id] as const,
};

const PRESENCE_KEY = {
    all: ["users-presence"] as const,
};

const SETTINGS_KEY = {
    all : ["settings"] as const,
};

export const useSettingsQuery = () => {
    const { token } = useAuth();
    return useQuery({
        queryKey : SETTINGS_KEY.all,
        queryFn : () => settingApi.get().then(r => r.data),
        enabled : !!token,
    })
};

export const useUpdateSettingsMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn : (payload : UpdateSettingsPayload) => settingApi.update(payload).then(r => r.data),
        onSuccess : (updated ) => {
            queryClient.setQueryData(SETTINGS_KEY.all, updated)
            // orgName can change here too — keep Header/Footer/login-screen's public query in sync
            // instead of leaving them to catch up on their own 30s poll.
            queryClient.invalidateQueries({ queryKey: ["public-settings"] })
            toast.success("Settings updated")
        },

        onError: (err) => toast.error(errorMessage(err, "Failed to update settings")),
    })
}

export const useUploadLogoMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn : (file : File) => settingApi.uploadLogo(file).then(r => r.data),
        onSuccess : (updated) => {
            queryClient.setQueryData(SETTINGS_KEY.all, updated)
            queryClient.invalidateQueries({ queryKey: ["public-settings"] })
            toast.success("Logo updated")
        },
        onError: (err) => toast.error(errorMessage(err, "Failed to upload logo")),
    })
}

export const useRemoveLogoMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn : () => settingApi.removeLogo().then(r => r.data),
        onSuccess : (updated) => {
            queryClient.setQueryData(SETTINGS_KEY.all, updated)
            queryClient.invalidateQueries({ queryKey: ["public-settings"] })
            toast.success("Logo removed")
        },
        onError: (err) => toast.error(errorMessage(err, "Failed to remove logo")),
    })
}
export const useUsersQuery = (enabled: boolean = true) => {
    const { token } = useAuth();
    return useQuery({
        queryKey: USER_KEYS.all,
        queryFn: () => adminApi.getAll().then(r => r.data),
        enabled: !!token && enabled,
        retry: handleQueryRetry,
    });
};

// Polled rather than pushed over the socket — presence changing a few seconds late is fine for
// "who's around right now," and it's one query instead of a 5th always-on socket subscription
// (App.tsx already runs one each for tickets/tasks/checklists/notifications). Only used by
// admin/PC-visible screens, so it's never running for the vast majority of logged-in sessions.
export const usePresenceQuery = (enabled: boolean = true) => {
    const { token } = useAuth();
    return useQuery({
        queryKey: PRESENCE_KEY.all,
        queryFn: () => adminApi.getPresence().then(r => r.data),
        enabled: !!token && enabled,
        refetchInterval: 20_000,
        retry: handleQueryRetry,
    });
};

export const useUserQuery = (id: string) => {
    const { token } = useAuth();
    return useQuery({
        queryKey: USER_KEYS.detail(id),
        queryFn: () => adminApi.getOne(id).then(r => r.data),
        enabled: !!token && !!id,
    });
};

export const useCreateUserMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: CreateUserPayload) => adminApi.create(payload).then(r => r.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: USER_KEYS.all });
            // Also covers the "/users/assignable" lookups (tasks & tickets hooks) so a newly
            // created user shows up immediately in assignee pickers, not just admin's user list.
            queryClient.invalidateQueries({ queryKey: ['assignable-users'] });
            toast.success('User created');
        },
        onError: (err) => toast.error(errorMessage(err, 'Failed to create user')),
    });
};

export const useUpdateUserMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: UpdateUserPayload }) =>
            adminApi.update(id, payload).then(r => r.data),
        onSuccess: (updated) => {
            queryClient.setQueryData(USER_KEYS.detail(updated.id), updated);
            queryClient.invalidateQueries({ queryKey: USER_KEYS.all });
            toast.success('User updated');
        },
        onError: (err) => toast.error(errorMessage(err, 'Failed to update user')),
    });
};

export const useDeleteUserMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => adminApi.delete(id),
        onSuccess: (_data, id) => {
            queryClient.removeQueries({ queryKey: USER_KEYS.detail(id) });
            queryClient.invalidateQueries({ queryKey: USER_KEYS.all });
            toast.success('User deleted');
        },
        onError: (err) => toast.error(errorMessage(err, 'Failed to delete user')),
    });
};

export const useResetUserPasswordMutation = () => {
    return useMutation({
        mutationFn: ({ id, password }: { id: string; password: string }) =>
            adminApi.resetPassword(id, password),
        onSuccess: () => toast.success('Password reset'),
        onError: (err) => toast.error(errorMessage(err, 'Failed to reset password')),
    });
};

export const useUploadUserAvatarMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, file }: { id: string; file: File }) =>
            adminApi.uploadAvatar(id, file).then(r => r.data),
        onSuccess: (updated) => {
            queryClient.setQueryData(USER_KEYS.detail(updated.id), updated);
            queryClient.invalidateQueries({ queryKey: USER_KEYS.all });
            toast.success('Profile picture updated');
        },
        onError: (err) => toast.error(errorMessage(err, 'Failed to upload profile picture')),
    });
};

export const useRemoveUserAvatarMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => adminApi.removeAvatar(id).then(r => r.data),
        onSuccess: (updated) => {
            queryClient.setQueryData(USER_KEYS.detail(updated.id), updated);
            queryClient.invalidateQueries({ queryKey: USER_KEYS.all });
            toast.success('Profile picture removed');
        },
        onError: (err) => toast.error(errorMessage(err, 'Failed to remove profile picture')),
    });
};


const DEPARTMENT_KEY = {
    all: ["departments"] as const,
};

// The real definition lives in tickets/hook.ts (used by far more callers, and the one with
// `retry: handleQueryRetry` wired up) — this used to be its own independent copy of the exact
// same query, which meant retry behavior and any future change could quietly drift between the
// two. Re-exported instead so every existing `from '../hook'` import site keeps working unchanged.
export { useDepartmentsQuery } from '../tickets/hook';

export const useCreateDepartmentMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: CreateDepartmentPayload) => departmentApi.create(payload).then(r => r.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: DEPARTMENT_KEY.all });
            toast.success('Department created');
        },
        onError: (err) => toast.error(errorMessage(err, 'Failed to create department')),
    })
}

export const useUpdateDepartmentMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: UpdateDepartmentPayload }) =>
            departmentApi.update(id, payload).then(r => r.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: DEPARTMENT_KEY.all });
            toast.success('Department updated');
        },
        onError: (err) => toast.error(errorMessage(err, 'Failed to update department')),
    })
}

export const useDeleteDepartmentMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => departmentApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: DEPARTMENT_KEY.all });
            toast.success('Department deleted');
        },
        onError: (err) => toast.error(errorMessage(err, 'Failed to delete department')),
    })
}


const STORE_KEY = {
    all: ["stores"] as const, // matches useStoresQuery's queryKey in features/tickets/hook.ts
};

export const useCreateStoreMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: CreateStorePayload) => storeApi.create(payload).then(r => r.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: STORE_KEY.all });
            toast.success('Store created');
        },
        onError: (err) => toast.error(errorMessage(err, 'Failed to create store')),
    })
}

export const useUpdateStoreMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: UpdateStorePayload }) =>
            storeApi.update(id, payload).then(r => r.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: STORE_KEY.all });
            toast.success('Store updated');
        },
        onError: (err) => toast.error(errorMessage(err, 'Failed to update store')),
    })
}

export const useDeleteStoreMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => storeApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: STORE_KEY.all });
            toast.success('Store deleted');
        },
        onError: (err) => toast.error(errorMessage(err, 'Failed to delete store')),
    })
}


const CHECKLIST_TEMPLATE_KEY = {
    all: (appliesTo?: ChecklistTemplateTarget) => ["checklist-templates", appliesTo ?? "all"] as const,
};

export const useChecklistTemplatesQuery = (appliesTo?: ChecklistTemplateTarget) => {
    const { token } = useAuth();
    return useQuery({
        queryKey: CHECKLIST_TEMPLATE_KEY.all(appliesTo),
        queryFn: () => checklistTemplateApi.getAll(appliesTo).then(r => r.data),
        enabled: !!token,
        retry: handleQueryRetry,
    })
};

const invalidateAllTemplateLists = (queryClient: ReturnType<typeof useQueryClient>) =>
    queryClient.invalidateQueries({ queryKey: ["checklist-templates"] });

export const useCreateChecklistTemplateMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: CreateChecklistTemplatePayload) => checklistTemplateApi.create(payload).then(r => r.data),
        onSuccess: () => {
            invalidateAllTemplateLists(queryClient);
            toast.success('Template created');
        },
        onError: (err) => toast.error(errorMessage(err, 'Failed to create template')),
    })
};

export const useUpdateChecklistTemplateMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: UpdateChecklistTemplatePayload }) =>
            checklistTemplateApi.update(id, payload).then(r => r.data),
        onSuccess: () => {
            invalidateAllTemplateLists(queryClient);
            toast.success('Template updated');
        },
        onError: (err) => toast.error(errorMessage(err, 'Failed to update template')),
    })
};

export const useDeleteChecklistTemplateMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => checklistTemplateApi.delete(id),
        onSuccess: () => {
            invalidateAllTemplateLists(queryClient);
            toast.success('Template deleted');
        },
        onError: (err) => toast.error(errorMessage(err, 'Failed to delete template')),
    })
};

export const useAddChecklistTemplateItemMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ templateId, payload }: { templateId: string; payload: CreateChecklistTemplateItemPayload }) =>
            checklistTemplateApi.addItem(templateId, payload).then(r => r.data),
        onSuccess: () => {
            invalidateAllTemplateLists(queryClient);
            toast.success('Item added');
        },
        onError: (err) => toast.error(errorMessage(err, 'Failed to add item')),
    })
};

export const useUpdateChecklistTemplateItemMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: UpdateChecklistTemplateItemPayload }) =>
            checklistTemplateApi.updateItem(id, payload).then(r => r.data),
        onSuccess: () => invalidateAllTemplateLists(queryClient),
        onError: (err) => toast.error(errorMessage(err, 'Failed to update item')),
    })
};

export const useDeleteChecklistTemplateItemMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => checklistTemplateApi.deleteItem(id),
        onSuccess: () => {
            invalidateAllTemplateLists(queryClient);
            toast.success('Item deleted');
        },
        onError: (err) => toast.error(errorMessage(err, 'Failed to delete item')),
    })
};

