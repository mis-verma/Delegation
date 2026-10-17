import { Link } from 'react-router';
import { BrandLogo } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { GetAppOptions } from './GetAppOptions';

export const GetAppPage = () => {
  const { token } = useAuth();
  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-background p-4">
      <div className="flex w-full max-w-md flex-col gap-5 rounded-2xl border border-border/60 bg-surface p-5 sm:p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandLogo className="size-9" textClassName="text-lg" />
          <div className="flex flex-col gap-1">
            <h1 className="t-section font-display font-bold text-text">Get the KaryaOS app</h1>
            <p className="t-meta text-text-muted">Your tickets, delegations and checklists on your phone, with alerts.</p>
          </div>
        </div>
        <GetAppOptions />
        <Link
          to={token ? '/' : '/login'}
          className="self-center min-h-11 inline-flex items-center px-2 font-display t-meta font-semibold text-primary-600 hover:text-primary-500 transition-colors"
        >
          {token ? 'Back to the app' : 'Sign in on the web instead'}
        </Link>
      </div>
    </div>
  );
};
