import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { Button } from '../../components';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog';
import type { ExplorerRow, ExplorerView } from '../../api/scores';
import { MODULE_LABEL, SCORE_LABEL, type ScoreModule } from '../../lib/scoreLabels';
import type { DrillSubject } from '../dashboard/scoreDrill';
import { HowCalculated } from './HowCalculated';
import { ModuleFigures } from './ModuleFigures';
import { DRILL_LINK_CLASS } from './controlStyles';
import { CountsLine, ScorePct } from './ScorePct';
import { DepartmentLine } from './scoreTableParts';
import { drillTargets, isForeignDepartment, itemLinksFor, type DrillLink, type ItemLinkWindow, type ScoreScope } from './scoresDisplay';

const KIND_WORD: Record<ExplorerRow['kind'], string> = {
  department: 'Department', store: 'Store', person: 'Person', checklist: 'Checklist', module: 'Module', total: 'Total', unassigned: 'Unassigned work',
};

interface ScoreRowDialogProps {
  row: ExplorerRow | null;
  modules: readonly ScoreModule[];
  windowLabel: string;
  window: ItemLinkWindow;
  orgWide: boolean;
  parentSubject: DrillSubject;
  scope?: ScoreScope;
  onClose: () => void;
  onDrill: (row: ExplorerRow, view: ExplorerView) => void;
}

const subjectOf = (row: ExplorerRow, parentSubject: DrillSubject): DrillSubject =>
  row.kind === 'department' || row.kind === 'store' || row.kind === 'person' ? { kind: row.kind, id: row.id } : parentSubject;

export const ScoreRowDialog = ({ row, modules, windowLabel, window, orgWide, parentSubject, scope, onClose, onDrill }: ScoreRowDialogProps) => {
  const foreign = !!row && isForeignDepartment(row, scope);
  return (
  <Dialog open={!!row} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="gap-4 p-5 sm:max-w-lg sm:p-6">
      {row && (
        <>
          <div className="flex items-start justify-between gap-3 pr-10">
            <div className="flex min-w-0 flex-col gap-0.5">
              <DialogTitle className="t-section font-display font-bold text-text">{row.name}</DialogTitle>
              {row.kind === 'person' && <DepartmentLine name={row.departmentName} />}
              <DialogDescription className="t-meta text-text-muted">
                {KIND_WORD[row.kind]}{row.left ? ', has left' : row.inactive ? ', switched off' : ''}. {windowLabel}
              </DialogDescription>
            </div>
            {row.totalDue > 0 && (
              <div className="flex shrink-0 flex-col items-end">
                <span className="t-stat font-display"><ScorePct value={row.overall} strong /></span>
                <span className="flex items-center gap-0.5 t-meta text-text-muted">{SCORE_LABEL.overall}<HowCalculated figure="overall" /></span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            {modules.map((m) => {
              const b = row[m];
              const links: DrillLink[] = !foreign && b.due > 0 && row.kind !== 'unassigned' && row.kind !== 'total' ? itemLinksFor(orgWide, subjectOf(row, parentSubject), window, row, m) : [];
              return (
                <div key={m} className="flex flex-col gap-3 rounded-lg border border-border/60 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="t-card font-display font-bold text-text">{MODULE_LABEL[m]}</h3>
                    {b.due > 0 && <span className="flex items-center gap-1.5 t-meta text-text-muted">{SCORE_LABEL.overall} <ScorePct value={b.score} strong /></span>}
                  </div>
                  {b.due === 0 ? (
                    <p className="t-meta text-text-muted">Nothing due in this period</p>
                  ) : (
                    <>
                      <ModuleFigures module={m} completion={b.completion} compliance={b.compliance} onTime={b.onTimeOfFinishedPct} />
                      <CountsLine due={b.due} done={b.done} late={b.late} notDone={b.notDone} open={b.open} />
                      {links.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                          {links.map((l) => (
                            <Link key={l.label} viewTransition to={l.href} className={DRILL_LINK_CLASS}>
                              {l.label} <ChevronRight className="size-3.5" aria-hidden="true" />
                            </Link>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {row.kind === 'checklist' && orgWide && (
            <Link viewTransition to={`/admin/scheduled-checklists/${row.id}`} className={DRILL_LINK_CLASS}>
              Open this checklist <ChevronRight className="size-3.5" aria-hidden="true" />
            </Link>
          )}

          {foreign && <p className="t-meta text-text-muted">This is another department. You see its scores to compare. Its people and checklists open for its own head.</p>}

          {!foreign && drillTargets(row).length > 0 && (
            <div className="flex flex-col gap-2 sm:flex-row">
              {drillTargets(row).map((t, i) => (
                <Button key={t.view} type="button" variant={i === 0 ? 'primary' : 'outline'} className="pointer-coarse:min-h-11 sm:flex-1" onClick={() => onDrill(row, t.view)}>
                  {t.label}
                </Button>
              ))}
            </div>
          )}
        </>
      )}
    </DialogContent>
  </Dialog>
  );
};
