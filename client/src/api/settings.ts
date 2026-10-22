import { apiFetch } from "./http";

export type Settings = {
    defaultTatHours : number;
    maxUploadSizeMb : number;
    maxUploadFiles : number;
    allowedImageTypes : string[];
    maintenanceMode : boolean;
    maintenanceMessage : string | null;
    notifyTaskDeadlineReminders : boolean;
    notifyChecklistOverdueReminders : boolean;
    liveOnlyAttachments : boolean;
    requireAdminLoginCode : boolean;
    emailConfigured? : boolean;
    accessTokenExpiresMinutes : number;
    refreshTokenExpiresDays : number;
    orgName : string;
    logoUrl : string | null;
    androidAppUrl : string | null;
    iosAppUrl : string | null;
    auditRetentionDays : number;
    notificationRetentionDays : number;
    inboundMessageRetentionDays : number;
}

export type PublicSettings = Pick<Settings, 'maintenanceMode' | 'maintenanceMessage' | 'orgName' | 'logoUrl' | 'androidAppUrl' | 'iosAppUrl' | 'liveOnlyAttachments'>;

export type ApiResponse<T> = { success : boolean; data : T};
export type UpdateSettingsPayload = Partial<Settings>;

export const settingApi = {
    get : () => apiFetch<ApiResponse <Settings>>('/settings'),

    update : (payload : UpdateSettingsPayload) =>
        apiFetch<ApiResponse <Settings>>('/settings', {method : "PATCH", body: JSON.stringify(payload)}),

    status : () => apiFetch<ApiResponse <PublicSettings>>('/settings/status'),

    uploadLogo : (file : File) => {
        const formData = new FormData();
        formData.append('logo', file);
        return apiFetch<ApiResponse <Settings>>('/settings/logo', { method: 'POST', body: formData });
    },

    removeLogo : () => apiFetch<ApiResponse <Settings>>('/settings/logo', { method: 'DELETE' }),
}