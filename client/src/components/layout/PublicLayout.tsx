import { Header } from './Header';
import { Footer } from './Footer';
import { Outlet } from 'react-router';
import type { MouseEvent } from 'react';

const skipToContent = (e: MouseEvent<HTMLAnchorElement>) => {
  e.preventDefault();
  document.getElementById('main-content')?.focus();
};

export const PublicLayout = () => {
  return (
    <div className="min-h-svh w-full flex flex-col justify-between bg-background text-text transition-colors duration-200 pt-[env(safe-area-inset-top)]">
      <a
        href="#main-content"
        onClick={skipToContent}
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-xl focus:border focus:border-border focus:bg-surface focus:px-4 t-card font-display font-semibold text-text outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
      >
        Skip to content
      </a>
      <Header />

      <main
        id="main-content"
        className="flex-1 w-full flex items-center justify-center p-3 sm:p-4 focus-visible:outline-none"
        tabIndex={-1}
      >
        <Outlet />
      </main>

      <Footer />
    </div>
  );
};