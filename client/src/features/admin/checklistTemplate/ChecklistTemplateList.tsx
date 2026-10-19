import { useState } from 'react';
import { Link } from 'react-router';
import { Plus, ListChecks, Inbox } from 'lucide-react';
import { useChecklistTemplatesQuery, useDepartmentsQuery } from '../hook';
import { ChecklistTemplateForm } from './ChecklistTemplateForm';
import { TemplateBlock } from './TemplateBlock';
import { Button, EmptyState, InlineError, PageHeader, Skeleton } from '../../../components';
import { plural } from '../../checklist/checklistDisplay';

const TemplateRowSkeleton = () => (
  <div className="flex items-center gap-3 px-4 py-2 min-h-15.5 rounded-xl border border-border/80 bg-surface">
    <Skeleton className="size-7 rounded-lg shrink-0" />
    <Skeleton className="h-4 w-1/3 max-w-48" />
    <Skeleton className="h-5 w-16 rounded-md hidden sm:block" />
    <Skeleton className="h-4 w-14 ml-auto shrink-0" />
    <Skeleton className="size-8 rounded-lg shrink-0" />
  </div>
);

export const ChecklistTemplateList = () => {
  const [showForm, setShowForm] = useState(false);
  const { data: templates = [], isPending, isError, refetch } = useChecklistTemplatesQuery();
  const { data: departments = [] } = useDepartmentsQuery();
  const departmentNames = new Map(departments.map(d => [d.id, d.name]));

  const renderContent = () => {
    if (isPending) return (
      <section aria-label="Loading templates" aria-busy="true" className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => <TemplateRowSkeleton key={i} />)}
      </section>
    );

    if (isError) return (
      <InlineError message="We couldn't load the task templates. Check your connection and try again." onRetry={() => refetch()} />
    );

    if (templates.length === 0) return (
      <EmptyState
        icon={Inbox}
        title="No templates yet"
        description="Reusable steps you apply to a task or ticket. Add your first template to standardize a procedure."
        action={{ label: 'New Task Template', icon: Plus, onClick: () => setShowForm(true) }}
      />
    );

    return (
      <section aria-label="Template list" className="flex flex-col gap-3">
        <p className="text-xs font-display font-medium text-text-muted tabular-nums">{plural(templates.length, 'template')}</p>
        {templates.map(t => (
          <TemplateBlock
            key={t.id}
            template={t}
            departmentName={t.departmentId ? (departmentNames.get(t.departmentId) ?? null) : null}
          />
        ))}
      </section>
    );
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      <PageHeader
        icon={ListChecks}
        title="Task Templates"
        subtitle={
          <>
            Reusable steps you apply to one task or ticket at a time. Need something that repeats
            automatically on a schedule? Use{' '}
            <Link to="/admin/scheduled-checklists" className="text-primary-600 dark:text-primary-400 hover:underline underline-offset-2">
              Recurring Checklists
            </Link>{' '}
            instead.
          </>
        }
        actions={
          <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
            <Plus size={14} />
            <span className="sm:hidden">New</span>
            <span className="hidden sm:inline">New Task Template</span>
          </Button>
        }
      />

      {renderContent()}

      {showForm && <ChecklistTemplateForm onClose={() => setShowForm(false)} />}
    </div>
  );
};
