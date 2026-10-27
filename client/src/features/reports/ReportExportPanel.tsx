import { ChecklistExportPanel } from './ChecklistExportPanel';
import { DepartmentExportPanel } from './DepartmentExportPanel';
import type { ReportExportParams, ReportModule } from '../../api/reports';

interface ReportExportPanelProps {
  reportModule: ReportModule;
  description: string;
  filters?: Pick<ReportExportParams, 'category' | 'status' | 'priority' | 'departmentId' | 'assigneeIds'>;
}

export const ReportExportPanel = ({ reportModule, description, filters }: ReportExportPanelProps) =>
  reportModule === 'checklists' ? (
    <ChecklistExportPanel description={description} />
  ) : (
    <DepartmentExportPanel reportModule={reportModule} description={description} filters={filters} />
  );
