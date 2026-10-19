import { Loader } from '../loaders';

export const FormChunkFallback = () => (
  <div
    role="status"
    aria-label="Loading form"
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in"
  >
    <Loader size="xl" variant="primary" />
  </div>
);
