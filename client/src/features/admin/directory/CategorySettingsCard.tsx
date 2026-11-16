import { useMemo, useState } from 'react';
import { Tag } from 'lucide-react';
import { Input, SelectDropdown, Switch } from '../../../components';
import { SettingsCard } from '../../settings/SettingsCard';
import { readCategorySettings, writeCategorySettings, type CategorySettings } from '../../settings/categorySettings';
import { useDepartmentsQuery } from '../hook';

const NONE = '';

export const CategorySettingsCard = () => {
  const { data: departments = [] } = useDepartmentsQuery();
  const [settings, setSettings] = useState<CategorySettings>(readCategorySettings);

  const options = useMemo(
    () => [{ value: NONE, label: 'As written in the file' }, ...departments.filter((d) => d.isActive).map((d) => ({ value: d.id, label: d.name }))],
    [departments],
  );

  const change = (patch: Partial<CategorySettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    writeCategorySettings(next);
  };

  return (
    <SettingsCard icon={Tag} title="Ticket category import" hint="Defaults for Import from file in Ticket categories. They are saved on this device and you can still change them for each import.">
      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="t-card font-display font-semibold text-text">Blank person goes to the team head</span>
          <span className="t-meta font-display text-text-muted">When a row has no Assigned To, the head of its team is used.</span>
        </span>
        <Switch checked={settings.fillHead} onChange={(next) => change({ fillHead: next })} />
      </label>
      <div className="flex flex-col gap-1.5">
        <span className="t-meta font-display font-semibold text-text-secondary">Team for every category</span>
        <SelectDropdown aria-label="Team for every category" value={settings.defaultDepartmentId} options={options} onChange={(value) => change({ defaultDepartmentId: value })} />
      </div>
      <Input
        id="defaultCategoryHours"
        label="Due hours when blank"
        type="number"
        inputMode="numeric"
        min={1}
        placeholder="Use the organisation default"
        value={settings.defaultHours}
        onChange={(event) => change({ defaultHours: event.target.value.replace(/[^0-9]/g, '') })}
      />
    </SettingsCard>
  );
};
