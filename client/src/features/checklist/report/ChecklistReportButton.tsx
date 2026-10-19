import { useState } from 'react';
import { FileDown } from 'lucide-react';
import { Button } from '../../../components';
import { ChecklistReportDialog } from './ChecklistReportDialog';

export const ChecklistReportButton = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="lg" className="px-4 text-sm" onClick={() => setOpen(true)}>
        <FileDown size={16} aria-hidden />
        Download report
      </Button>
      {open && <ChecklistReportDialog onClose={() => setOpen(false)} />}
    </>
  );
};
