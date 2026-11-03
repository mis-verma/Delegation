import { NavLink } from "react-router";
import { BrandLogo } from "../brandLogo";
import { usePublicSettingsQuery } from "../../lib/maintenance";
import { resolveLogoUrl } from "../../lib/uploadsBase";

const COPYRIGHT_HOLDER = 'Verma Jewellers';

export const Footer = () => {
  const currentYear = new Date().getFullYear();
  const { data: publicSettings } = usePublicSettingsQuery();
  const orgName = publicSettings?.orgName ?? 'Karya';
  const customLogoSrc = resolveLogoUrl(publicSettings?.logoUrl);

  return (
    <footer
      className="mt-auto w-full border-t border-border bg-surface transition-colors"
    >
      <div className="max-w-(--container-width) mx-auto px-4 sm:px-6 py-2.5 sm:py-3 flex flex-col md:flex-row items-center justify-between gap-x-6 gap-y-2">
        
        <NavLink
          to="/"
          className="flex items-center shrink-0 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 rounded-lg p-0.5"
        >
          {customLogoSrc ? (
            <img src={customLogoSrc} alt={orgName} className="h-6 w-auto object-contain group-hover:scale-105 transition-transform" />
          ) : (
            <span className="inline-flex group-hover:scale-105 transition-transform">
              <BrandLogo className="size-7" textClassName="text-base" tagline />
            </span>
          )}
        </NavLink>

        <p className="t-meta font-display font-medium text-text-muted shrink-0 text-center">
          &copy; {currentYear} {COPYRIGHT_HOLDER}. All rights reserved.
        </p>
      </div>
    </footer>
  );
};