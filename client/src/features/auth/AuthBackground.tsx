import { CheckSquare, TicketCheck, ClipboardCheck, type LucideIcon } from "lucide-react";
import { ModernHeroTitle } from "../../components";
import { usePublicSettingsQuery } from "../../lib/maintenance";

interface AuthBackgroundProps {
    tagline?: string;
}

// What this column used to be missing — three lines of text and two faint circles floating in a
// tall, otherwise empty column read as unfinished, not minimal. These highlights are what fills
// that space with something concrete about the actual product, not filler copy.
const HIGHLIGHTS: { icon: LucideIcon; text: string }[] = [
    { icon: CheckSquare, text: 'Assign tasks and see who’s behind' },
    { icon: TicketCheck, text: 'Track every ticket from raised to closed' },
    { icon: ClipboardCheck, text: 'Recurring checklists that don’t get missed' },
];

export const AuthBackground = ({
    tagline = 'Built for teams that move fast and never miss what matters.',
}: AuthBackgroundProps) => {
    const { data: publicSettings } = usePublicSettingsQuery();
    const orgName = publicSettings?.orgName ?? 'Karya';

    return (
        <div className="flex flex-col justify-center gap-10 h-full w-full relative z-10 py-1">
            {/* Ambient background decoration shapes */}
            <span className="absolute -left-20 top-1/2 -translate-y-1/2 size-72 rounded-full border border-coral-400/20 pointer-events-none" />
            <span className="absolute -right-10 top-4 size-48 rounded-full border border-primary-400/20 pointer-events-none" />
            <span className="absolute -right-6 top-1/2 -translate-y-1/2 size-20 rounded-full bg-coral-500/10 pointer-events-none" />

            <div className="flex flex-col relative z-10">
                <ModernHeroTitle />
            </div>

            <ul className="flex flex-col gap-3.5 relative z-10">
                {HIGHLIGHTS.map(({ icon: Icon, text }) => (
                    <li key={text} className="flex items-center gap-3">
                        <span className="flex items-center justify-center size-9 rounded-xl shrink-0 bg-gradient-to-br from-primary-500 to-primary-700 border border-primary-800/20 text-white">
                            <Icon size={16} strokeWidth={2.25} />
                        </span>
                        <span className="text-sm font-display font-medium text-text-secondary">{text}</span>
                    </li>
                ))}
            </ul>

            <div className="pt-3 border-t border-border/60 flex flex-col gap-1 relative z-10">
                <p className="text-text-muted text-xs font-display">
                    {tagline}
                </p>
                <p className="text-text-light t-meta font-mono tracking-widest uppercase">
                    &copy; {new Date().getFullYear()} {orgName}
                </p>
            </div>
        </div>
    );
};