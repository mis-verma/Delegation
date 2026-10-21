import { usePublicSettingsQuery } from './maintenance';

export const useLiveOnlyAttachments = (): boolean => !!usePublicSettingsQuery().data?.liveOnlyAttachments;
