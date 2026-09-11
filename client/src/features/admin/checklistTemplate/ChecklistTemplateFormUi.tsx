import { useState, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  Plus,
  ListChecks,
  Building2,
  Layers,
  AlertCircle,
  Info,
  User,
  Image as ImageIcon,
  Camera,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Input, Modal, ChecklistItemDraftRow, emptyChecklistItemDraft, moveDraftItem, type ChecklistItemDraft } from '../../../components';
import { useAssignableUsersQuery } from '../../tickets/hook';
import type { ChecklistTemplateTarget, CreateChecklistTemplateItemPayload } from '../../../api/checklistTemplates';
import { Stepper } from './Stepper';

const NO_DEPARTMENT = '__none__';
const STEP_LABELS = ['Basics', 'Procedure', 'Review'];

export interface ChecklistTemplateFormPayload {
  name: string;
  appliesTo: ChecklistTemplateTarget;
  departmentId: string;
  items: CreateChecklistTemplateItemPayload[];
}

interface FormUIProps {
  departments: { id: string; name: string }[];
  isSaving: boolean;
  saveError?: string;
  onSubmit: (data: ChecklistTemplateFormPayload) => void;
  onClose: () => void;
}

export const ChecklistTemplateFormUI = ({ departments, isSaving, saveError, onSubmit, onClose }: FormUIProps) => {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [appliesTo, setAppliesTo] = useState<ChecklistTemplateTarget>('TASK');
  const [departmentId, setDepartmentId] = useState('');
  const [itemDrafts, setItemDrafts] = useState<ChecklistItemDraft[]>([emptyChecklistItemDraft()]);
  const [validationError, setValidationError] = useState<string | null>(null);

  const { data: assignableUsers } = useAssignableUsersQuery(departmentId || undefined);
  const departmentName = departments.find(d => d.id === departmentId)?.name ?? 'Global (no department)';
  const definedSteps = itemDrafts.filter(d => d.label.trim());

  const updateDraft = useCallback((i: number, patch: Partial<ChecklistItemDraft>) => {
    setItemDrafts(drafts => drafts.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }, []);

  const handleDepartmentChange = (id: string) => {
    setDepartmentId(id === NO_DEPARTMENT ? '' : id);
    setItemDrafts(drafts => drafts.map(d => ({ ...d, assigneeId: '' })));
  };

  const goNext = () => {
    if (step === 0) {
      if (!name.trim()) {
        setValidationError('Please provide a name for this template.');
        return;
      }
      setValidationError(null);
    }
    setStep(s => Math.min(s + 1, STEP_LABELS.length - 1));
  };

  const goBack = () => setStep(s => Math.max(s - 1, 0));

  const handleSave = () => {
    if (!name.trim()) {
      setValidationError('Please provide a name for this template.');
      setStep(0);
      return;
    }

    const cleanedItems = definedSteps.map((d, index) => ({
      label: d.label.trim(),
      order: index,
      requiredImageCount: Number(d.requiredImageCount) || 0,
      maxImageCount: d.maxImageCount ? Number(d.maxImageCount) : undefined,
      requiresLivePhoto: d.requiresLivePhoto,
      defaultAssigneeId: d.assigneeId || undefined,
    }));

    onSubmit({ name, appliesTo, departmentId, items: cleanedItems });
  };

  // One derived pair instead of two independently-reasoned-about ternaries both branching on
  // `step` — the wizard footer is really one 3-way state (first/middle/last step), not two
  // separate ad-hoc conditions that happen to share a variable and have to be kept in sync by hand.
  const isFirstStep = step === 0;
  const isLastStep = step === STEP_LABELS.length - 1;

  const footer = (
    <>
      {isFirstStep ? (
        <button
          type="button"
          onClick={onClose}
          disabled={isSaving}
          className="flex-1 sm:flex-none px-5 py-2.5 text-sm font-display font-medium text-text-secondary bg-surface border border-border rounded-xl hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
      ) : (
        <button
          type="button"
          onClick={goBack}
          disabled={isSaving}
          className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-5 py-2.5 text-sm font-display font-medium text-text-secondary bg-surface border border-border rounded-xl hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>
      )}

      {isLastStep ? (
        <button
          type="button"
          disabled={isSaving}
          onClick={handleSave}
          className="flex-1 sm:flex-none inline-flex items-center justify-center px-5 py-2.5 text-sm font-display font-medium text-white rounded-xl shadow-sm bg-primary-700 hover:bg-primary-800 transition-all duration-300 ease-in-out hover:scale-[1.02] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:opacity-70 disabled:pointer-events-none disabled:transform-none"
        >
          {isSaving ? 'Creating...' : 'Create Template'}
        </button>
      ) : (
        <button
          type="button"
          onClick={goNext}
          className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-5 py-2.5 text-sm font-display font-medium text-white rounded-xl shadow-sm bg-primary-700 hover:bg-primary-800 transition-all duration-300 ease-in-out hover:scale-[1.02] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
        >
          Next
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
    </>
  );

  return (
    <Modal
      open
      onClose={() => !isSaving && onClose()}
      icon={<ListChecks className="w-5 h-5" />}
      title="Create Standard Procedure"
      description="A reusable set of steps you attach to one task or ticket at a time. For automated scheduling, use Recurring Checklists instead."
      footer={footer}
      size="2xl"
    >
      <Stepper steps={STEP_LABELS} current={step} onStepClick={setStep} />

      {step === 0 && (
        <>
          <Input
            id="name"
            label="Template Name"
            value={name}
            onChange={e => { setName(e.target.value); setValidationError(null); }}
            placeholder="e.g., Daily Store Opening, Restroom Cleaning..."
            error={validationError ?? undefined}
            autoFocus
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                <Layers className="w-3.5 h-3.5 text-text-light" strokeWidth={2.5} />
                Applies To
              </label>
              <Select value={appliesTo} onValueChange={v => setAppliesTo(v as ChecklistTemplateTarget)}>
                <SelectTrigger className="w-full h-11 px-3 bg-surface border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TASK">Delegations</SelectItem>
                  <SelectItem value="TICKET">Tickets</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                <Building2 className="w-3.5 h-3.5 text-text-light" strokeWidth={2.5} />
                Owning Department
              </label>
              <Select value={departmentId || NO_DEPARTMENT} onValueChange={handleDepartmentChange}>
                <SelectTrigger className="w-full h-11 px-3 bg-surface border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all">
                  <SelectValue placeholder="Global (No Department)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_DEPARTMENT}>Global (No Department)</SelectItem>
                  {departments.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <h3 className="text-sm font-display font-bold text-text">Procedure Steps</h3>
              <p className="text-xs font-display text-text-muted mt-1">Define the individual steps required to complete this procedure.</p>
            </div>
            <span className="text-xs font-display font-medium text-text-secondary bg-surface-hover px-2.5 py-1 rounded-md border border-border">
              {itemDrafts.length} {itemDrafts.length === 1 ? 'Step' : 'Steps'}
            </span>
          </div>

          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {itemDrafts.map((draft, i) => (
                <ChecklistItemDraftRow
                  key={draft.id}
                  draft={draft}
                  index={i}
                  showDueDate={false}
                  assigneeDisabledReason={!departmentId ? 'Select department first' : undefined}
                  assignableUsers={assignableUsers}
                  canRemove={itemDrafts.length > 1}
                  onChange={patch => updateDraft(i, patch)}
                  onRemove={() => setItemDrafts(d => d.filter((_, idx) => idx !== i))}
                  onMoveUp={() => setItemDrafts(d => moveDraftItem(d, i, 'up'))}
                  onMoveDown={() => setItemDrafts(d => moveDraftItem(d, i, 'down'))}
                  canMoveUp={i > 0}
                  canMoveDown={i < itemDrafts.length - 1}
                />
              ))}
            </AnimatePresence>
          </div>

          <button
            type="button"
            onClick={() => setItemDrafts(d => [...d, emptyChecklistItemDraft()])}
            className="w-full py-4 mt-2 border-2 border-dashed border-border rounded-xl text-text-muted font-display font-medium text-sm transition-all duration-300 ease-in-out hover:border-primary-500/40 hover:bg-primary-500/5 hover:text-primary-600 dark:hover:text-primary-400 flex items-center justify-center gap-2 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
          >
            <Plus className="w-4 h-4 transition-transform duration-300 group-hover:rotate-90 group-hover:scale-110" />
            Add another step
          </button>

          <div className="flex items-center gap-2 text-xs text-text-muted font-display">
            <Info className="w-4 h-4 text-primary-500/70" />
            <span>Empty steps are automatically skipped.</span>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface-hover/40 divide-y divide-border/60">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs font-display font-medium text-text-muted tracking-wider">Name</span>
              <span className="text-sm font-display font-bold text-text truncate max-w-[60%]">{name || '—'}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs font-display font-medium text-text-muted tracking-wider">Applies To</span>
              <span className="text-sm font-display font-medium text-text">{appliesTo === 'TASK' ? 'Delegations' : 'Tickets'}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs font-display font-medium text-text-muted tracking-wider">Department</span>
              <span className="text-sm font-display font-medium text-text truncate max-w-[60%]">{departmentName}</span>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-display font-bold text-text">
              Procedure Steps <span className="text-text-muted font-medium">({definedSteps.length})</span>
            </h3>

            {definedSteps.length === 0 ? (
              <p className="text-sm text-text-muted italic px-1">No steps defined — this template will just be a name you can attach later.</p>
            ) : (
              <ul className="space-y-2">
                {definedSteps.map((d, i) => (
                  <li key={d.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-surface">
                    <span className="flex shrink-0 items-center justify-center w-6 h-6 mt-0.5 rounded-md bg-primary-50 text-primary-700 text-[11px] font-bold">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text truncate">{d.label}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-hover text-text-secondary text-[11px] font-medium">
                          <User size={11} /> {assignableUsers?.find(u => u.id === d.assigneeId)?.firstName ?? 'Unassigned'}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-hover text-text-secondary text-[11px] font-medium">
                          <ImageIcon size={11} /> {Number(d.requiredImageCount) || 0}{d.maxImageCount ? `–${d.maxImageCount}` : '+'} photos
                        </span>
                        {d.requiresLivePhoto && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary-500/10 text-primary-700 dark:text-primary-400 text-[11px] font-medium">
                            <Camera size={11} /> Live capture
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {saveError && (
            <div className="flex items-center gap-3 p-4 bg-danger/10 border border-danger/20 rounded-xl text-danger text-sm font-display font-medium">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
