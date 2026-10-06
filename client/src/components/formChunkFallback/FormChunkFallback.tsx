import { Loader } from '../loaders';

// The one Suspense fallback for a lazy-loaded form modal (User, Department, Store): a dimmed
// backdrop with a spinner, shown for the moment the form's chunk downloads. Each list used to
// paste its own copy of this markup.
export const FormChunkFallback = () => (
  <div
    role="status"
    aria-label="Loading form"
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in"
  >
    <Loader size="xl" variant="primary" />
  </div>
);
