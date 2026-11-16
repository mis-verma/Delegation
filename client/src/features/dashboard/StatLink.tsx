import { Link, type LinkProps } from 'react-router';
import { rememberDashboardOrigin } from '../../lib/dashboardOrigin';
import { usePrefetchRoute } from '../../lib/routePrefetch';
import { pathOf } from './boardLook';

type StatLinkProps = Omit<LinkProps, 'to' | 'viewTransition' | 'onPointerEnter' | 'onFocus' | 'onTouchStart'> & { to: string };

export const StatLink = ({ to, onClick, ...rest }: StatLinkProps) => {
  const warm = usePrefetchRoute();
  const prefetch = () => warm(pathOf(to));
  return (
    <Link
      {...rest}
      to={to}
      viewTransition
      onPointerEnter={prefetch}
      onFocus={prefetch}
      onTouchStart={prefetch}
      onClick={(event) => {
        rememberDashboardOrigin(to);
        onClick?.(event);
      }}
    />
  );
};
