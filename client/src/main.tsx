import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from './components/ui/tooltip.tsx';
import { Toaster } from './components/ui/sonner.tsx';
import { ConfirmDialogProvider } from "./components/confirmDialog"


const queryClient = new QueryClient({
  defaultOptions: {
    // Default staleTime is 0, so every mount (e.g. reopening a panel you just closed, or
    // navigating back to a list) treats cached data as instantly stale and refetches before
    // showing anything — a real network round-trip on every open even when data is seconds old.
    // 30s keeps navigation feeling instant without materially risking staleness; sockets still
    // push live notification updates separately, and refetchOnWindowFocus (left at its default)
    // still catches up other data when the tab regains focus.
    queries: { staleTime: 30_000 },
  },
});

if (import.meta.env.DEV) {
  document.body.classList.add('debug-screens');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <ConfirmDialogProvider>
              <App />
            </ConfirmDialogProvider>

            <Toaster position="top-right" richColors closeButton />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);