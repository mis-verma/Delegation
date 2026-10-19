import type { ComponentType, SVGProps } from 'react';

export interface ViewIconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export type ViewIcon = ComponentType<ViewIconProps>;

const Solid = ({ size = 16, className, children, ...rest }: ViewIconProps & { children: React.ReactNode } & Omit<SVGProps<SVGSVGElement>, 'children'>) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className} {...rest}>
    {children}
  </svg>
);

export const BoardViewIcon: ViewIcon = (p) => (
  <Solid {...p}>
    <rect x="3" y="3" width="5.5" height="18" rx="1.8" />
    <rect x="9.25" y="3" width="5.5" height="12" rx="1.8" />
    <rect x="15.5" y="3" width="5.5" height="15" rx="1.8" />
  </Solid>
);

export const ListViewIcon: ViewIcon = (p) => (
  <Solid {...p}>
    <rect x="3" y="4" width="4" height="4" rx="1.2" />
    <rect x="9" y="4.5" width="12" height="3" rx="1.5" />
    <rect x="3" y="10" width="4" height="4" rx="1.2" />
    <rect x="9" y="10.5" width="12" height="3" rx="1.5" />
    <rect x="3" y="16" width="4" height="4" rx="1.2" />
    <rect x="9" y="16.5" width="12" height="3" rx="1.5" />
  </Solid>
);

export const TableViewIcon: ViewIcon = (p) => (
  <Solid {...p}>
    <rect x="3" y="3.5" width="18" height="5" rx="1.8" />
    <rect x="3" y="10.25" width="8.25" height="4.25" rx="1.2" />
    <rect x="12.75" y="10.25" width="8.25" height="4.25" rx="1.2" />
    <rect x="3" y="16" width="8.25" height="4.5" rx="1.2" />
    <rect x="12.75" y="16" width="8.25" height="4.5" rx="1.2" />
  </Solid>
);

export const TimelineViewIcon: ViewIcon = (p) => (
  <Solid {...p}>
    <rect x="3" y="4" width="10" height="4" rx="2" />
    <rect x="8" y="10" width="13" height="4" rx="2" />
    <rect x="5" y="16" width="9" height="4" rx="2" />
  </Solid>
);

export const CardsViewIcon: ViewIcon = (p) => (
  <Solid {...p}>
    <rect x="3" y="3" width="8" height="8" rx="2.4" />
    <rect x="13" y="3" width="8" height="8" rx="2.4" />
    <rect x="3" y="13" width="8" height="8" rx="2.4" />
    <rect x="13" y="13" width="8" height="8" rx="2.4" />
  </Solid>
);
