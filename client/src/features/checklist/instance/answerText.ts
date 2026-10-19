import { formatDateTime } from '../checklistDisplay';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';

export const answerText = (item: ChecklistInstanceItem): string | null => {
  switch (item.itemType) {
    case 'YES_NO':
      return item.booleanAnswer === 'YES' ? 'Answered Yes' : item.booleanAnswer === 'NO' ? 'Answered No' : null;
    case 'PASS_FAIL':
      return item.booleanAnswer === 'YES' ? 'Pass' : item.booleanAnswer === 'NO' ? 'Fail' : null;
    case 'MULTIPLE_CHOICE':
    case 'DROPDOWN':
    case 'TEXT_BOX':
      return item.textValue ? `Answered: ${item.textValue}` : null;
    case 'NUMBER_ENTRY':
    case 'CASH_TALLY':
      return item.numericValue != null ? `Entered ${item.numericValue}${item.numberEntryUnit ? ` ${item.numberEntryUnit}` : ''}` : null;
    case 'RATING':
      return item.numericValue != null ? `Rated ${item.numericValue} of ${item.ratingScale ?? 5}` : null;
    case 'DATE_TIME':
      return item.dateValue ? `Picked ${formatDateTime(item.dateValue)}` : null;
    case 'GPS':
      return item.gpsLat != null ? 'Location recorded' : null;
    case 'SIGNATURE':
    case 'DUAL_SIGNATURE':
      return item.signatureValue ? 'Signed' : null;
    case 'QR_SCAN':
      return item.textValue ? 'Code scanned' : null;
    case 'AUDIT': {
      const checked = item.submissions.filter(s => s.isDone).length;
      return `${checked} of ${item.submissions.length} people checked`;
    }
    default:
      return null;
  }
};
