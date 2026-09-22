import { useState } from 'react';
import { Link } from 'react-router';
import {
  Plus,
  AlertCircle,
  ListChecks,
  Inbox,
} from 'lucide-react';
import { useChecklistTemplatesQuery, useDepartmentsQuery } from '../hook';
import { ChecklistTemplateForm } from './ChecklistTemplateForm';
import { TemplateBlock } from './TemplateBlock';
import { Button, Skeleton } from '../../../components';

export const ChecklistTemplateList = () => {
  const [showForm, setShowForm] = useState(false);
  const { data: templates = [], isPending, isError, refetch } = useChecklistTemplatesQuery();
  const { data: departments = [] } = useDepartmentsQuery();
  const departmentNames = new Map(departments.map(d => [d.id, d.name]));

  // Single-function state renderer — matches UserList/DepartmentList/StoreList's pattern instead
  // of four independent top-level conditionals, where a future edit to one guard without updating
  // the others could render two panels at once.
  const renderContent = () => {
    if (isPending) return (
      <section aria-label="Loading templates" className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4 p-5 rounded-xl border border-border/80 bg-surface">
            <div className="flex items-center gap-4 flex-1">
              <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
              <div className="space-y-2 flex-1 max-w-sm">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
            <Skeleton className="h-8 w-8 rounded-lg shrink-0 hidden sm:block" />
          </div>
        ))}
      </section>
    );

    if (isError) return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm font-display font-medium">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <p className="flex-1">Failed to load task templates. Please check your connection and try again.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="shrink-0 px-3 py-1.5 rounded-md text-xs font-display font-semibold border border-danger/30 hover:bg-danger/10 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
        >
          Retry
        </button>
      </div>
    );

    if (templates.length === 0) return (
      <section className="flex flex-col items-center justify-center py-20 px-4 rounded-3xl border-2 border-dashed border-border bg-surface-hover/40 text-center">
        <div className="mb-5 text-text-muted">
          <Inbox className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-display font-bold text-text mb-2">No templates configured</h3>
        <p className="text-sm text-text-muted max-w-sm mb-8">
          You haven't created any task templates yet. Standardize your team's procedures by adding your first one.
        </p>
        <button
          onClick={() => setShowForm(true)}
          className="press-feedback inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-display font-bold rounded-xl shadow-sm bg-surface text-text-secondary border border-border transition-all duration-300 hover:bg-surface-hover hover:text-primary-600 hover:border-primary-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        >
          <Plus className="w-3.5 h-3.5" />
          Create Task Template
        </button>
      </section>
    );

    return (
      <section aria-label="Template List" className="flex flex-col gap-3">
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
    <div className="flex flex-col gap-5 w-full">
      <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-border">
        <div className="flex items-start gap-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500/10 to-primary-700/10 dark:from-primary-500/20 dark:to-primary-700/20 text-primary-600 dark:text-primary-400 ring-1 ring-primary-500/20 shadow-sm shrink-0">
            <ListChecks className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-display font-bold tracking-tight text-text">Task Templates</h1>
              <span className="flex items-center justify-center px-2.5 py-0.5 text-xs font-display font-bold bg-surface-hover text-text-secondary rounded-full border border-border">
                {templates.length}
              </span>
            </div>
            <p className="text-xs sm:text-sm font-display text-text-muted max-w-lg leading-relaxed">
              Reusable steps you apply to one task or ticket at a time. Need something that repeats
              automatically on a schedule? Use{' '}
              <Link to="/admin/scheduled-checklists" className="text-primary-600 dark:text-primary-400 hover:underline underline-offset-2">
                Recurring Checklists
              </Link>{' '}
              instead.
            </p>
          </div>
        </div>

        <Button variant="primary" size="sm" onClick={() => setShowForm(true)} className="group shrink-0">
          <Plus className="w-3.5 h-3.5 transition-transform duration-300 group-hover:rotate-90" />
          New Task Template
        </Button>
      </header>

      {renderContent()}

      {showForm && <ChecklistTemplateForm onClose={() => setShowForm(false)} />}
    </div>
  );
};
