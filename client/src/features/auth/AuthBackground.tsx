import { ModernHeroTitle } from "../../components";
import { usePublicSettingsQuery } from "../../lib/maintenance";

interface AuthBackgroundProps {
    tagline?: string;
}

export const AuthBackground = ({
    tagline = 'Built for teams that move fast and never miss what matters.',
}: AuthBackgroundProps) => {
    const { data: publicSettings } = usePublicSettingsQuery();
    const orgName = publicSettings?.orgName ?? 'Karya';

    return (
        <div className="flex flex-col justify-between h-full w-full relative z-10 py-1">
            {/* Ambient background decoration shapes */}
            <span className="absolute -left-20 top-1/2 -translate-y-1/2 size-72 rounded-full border border-coral-400/20 pointer-events-none" />
            <span className="absolute -right-10 top-4 size-48 rounded-full border border-primary-400/20 pointer-events-none" />
            <span className="absolute -right-6 top-1/2 -translate-y-1/2 size-20 rounded-full bg-coral-500/10 pointer-events-none" />

            <div className="flex flex-col relative z-10">
                <ModernHeroTitle />
            </div>

            <div className="mt-4 pt-3 border-t border-white/10 flex flex-col gap-1 relative z-10">
                <p className="text-white/60 text-xs font-display">
                    {tagline}
                </p>
                <p className="text-white/25 text-[10px] font-mono tracking-widest uppercase">
                    &copy; {new Date().getFullYear()} {orgName}
                </p>
            </div>
        </div>
    );
};