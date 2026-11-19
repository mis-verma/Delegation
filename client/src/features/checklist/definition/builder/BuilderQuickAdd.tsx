import { lazy, Suspense, useState } from 'react';
import { toast } from 'sonner';
import { Building2, Plus, Store as StoreIcon, UserPlus, type LucideIcon } from 'lucide-react';
import { Button } from '../../../../components';
import { useAuth } from '../../../../context/AuthContext';
import type { Store } from '../../../../api/stores';
import type { Department } from '../../../../api/departments';
import type { AdminUser } from '../../../../api/admin';

const StoreForm = lazy(() => import('../../../admin/store/StoreForm').then((m) => ({ default: m.StoreForm })));
const DepartmentForm = lazy(() => import('../../../admin/department/DepartmentForm').then((m) => ({ default: m.DepartmentForm })));
const UserForm = lazy(() => import('../../../admin/users/UserForm').then((m) => ({ default: m.UserForm })));

export type QuickAddKind = 'store' | 'department' | 'person';

const KIND_META: Record<QuickAddKind, { label: string; icon: LucideIcon; roles: readonly string[] }> = {
  store: { label: 'New store', icon: StoreIcon, roles: ['ADMIN', 'PC'] },
  department: { label: 'New department', icon: Building2, roles: ['ADMIN', 'PC'] },
  person: { label: 'New person', icon: UserPlus, roles: ['ADMIN'] },
};

interface BuilderQuickAddProps {
  kinds: QuickAddKind[];
  storeIds?: string[];
  onStoreCreated?: (store: Store) => void;
  onPersonCreated?: (person: AdminUser) => void;
}

export const BuilderQuickAdd = ({ kinds, storeIds = [], onStoreCreated, onPersonCreated }: BuilderQuickAddProps) => {
  const { user } = useAuth();
  const [open, setOpen] = useState<QuickAddKind | null>(null);
  const allowed = kinds.filter((kind) => !!user && KIND_META[kind].roles.includes(user.role));
  if (!allowed.length) return null;

  const close = () => setOpen(null);
  const handleStore = (store: Store) => onStoreCreated?.(store);
  const handleDepartment = (department: Department) => {
    toast.info(`${department.name} is ready. Add people to it with New person.`);
  };
  const handlePerson = (person: AdminUser) => {
    if (person.storeId && storeIds.includes(person.storeId)) {
      onPersonCreated?.(person);
      return;
    }
    toast.info(`${person.firstName} was added, but works at another store. Add that store on the Schedule step to assign them.`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 t-meta font-display font-medium text-text-muted">
        <Plus size={13} aria-hidden />
        Missing one?
      </span>
      {allowed.map((kind) => {
        const { label, icon: Icon } = KIND_META[kind];
        return (
          <Button key={kind} type="button" variant="outline" size="sm" onClick={() => setOpen(kind)} className="pointer-coarse:min-h-11">
            <Icon size={14} aria-hidden />
            {label}
          </Button>
        );
      })}
      <Suspense fallback={null}>
        {open === 'store' && <StoreForm onClose={close} onCreated={handleStore} />}
        {open === 'department' && <DepartmentForm onClose={close} onCreated={handleDepartment} />}
        {open === 'person' && <UserForm onClose={close} onCreated={handlePerson} />}
      </Suspense>
    </div>
  );
};
