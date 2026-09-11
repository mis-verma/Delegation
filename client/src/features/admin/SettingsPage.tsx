import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Settings as SettingsIcon, CheckSquare } from 'lucide-react';
import { Input, Button, Form, Skeleton, GradientIconTile } from '../../components';
import { useSettingsQuery, useUpdateSettingsMutation } from './hook';

const IMAGE_TYPE_OPTIONS = [
  { value: 'image/jpeg', label: 'JPEG' },
  { value: 'image/png', label: 'PNG' },
  { value: 'image/webp', label: 'WEBP' },
];

const settingsSchema = z.object({
  defaultTatHours: z.number().positive('Must be a positive number'),
  maxUploadSizeMb: z.number().positive('Must be a positive number'),
  maxUploadFiles: z.number().int().positive('Must be a positive whole number'),
  allowedImageTypes: z.array(z.string()).min(1, 'Select at least one file type'),
});

type SettingsFields = z.infer<typeof settingsSchema>;

export const SettingsPage = () => {
  const { data: settings, isPending } = useSettingsQuery();
  const mutation = useUpdateSettingsMutation();

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isDirty },
  } = useForm<SettingsFields>({
    resolver: zodResolver(settingsSchema),
  });

  useEffect(() => {
    if (settings) reset(settings);
  }, [settings, reset]);

  const onSubmit = (data: SettingsFields) => mutation.mutate(data);

  if (isPending) {
    return (
      <div className="flex flex-col gap-6 max-w-lg">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-xl shrink-0" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-lg">
      <div className="flex items-center gap-3">
        <GradientIconTile icon={SettingsIcon} />
        <div>
          <h1 className="text-xl font-display font-bold text-text">Settings</h1>
          <p className="text-sm text-text-muted mt-0.5">
            System-wide defaults for ticket SLA and file uploads.
          </p>
        </div>
      </div>

      <Form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
        <Input
          id="defaultTatHours"
          label="Default ticket TAT (hours)"
          type="number"
          step="1"
          suffix={<span className="text-xs text-text-light">hours</span>}
          error={errors.defaultTatHours?.message}
          {...register('defaultTatHours', { valueAsNumber: true })}
        />

        <Input
          id="maxUploadSizeMb"
          label="Max upload size per file"
          type="number"
          step="1"
          suffix={<span className="text-xs text-text-light">MB</span>}
          error={errors.maxUploadSizeMb?.message}
          {...register('maxUploadSizeMb', { valueAsNumber: true })}
        />

        <Input
          id="maxUploadFiles"
          label="Max files per upload"
          type="number"
          step="1"
          error={errors.maxUploadFiles?.message}
          {...register('maxUploadFiles', { valueAsNumber: true })}
        />

        <Controller
          control={control}
          name="allowedImageTypes"
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-display font-medium text-text-secondary">Allowed image types</span>
              <div className="flex gap-4">
                {IMAGE_TYPE_OPTIONS.map(opt => {
                  const checked = field.value?.includes(opt.value) ?? false;
                  return (
                  <label key={opt.value} className="flex items-center gap-1.5 text-sm text-text font-display cursor-pointer">
                    {/* sr-only, not hidden — `hidden` is display:none, which drops the checkbox out
                        of the tab order entirely, making this control unreachable by keyboard.
                        sr-only keeps it focusable/toggleable while the styled box below stands in
                        visually; `peer` + `peer-focus-visible:` puts the focus ring on that box. */}
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={checked}
                      onChange={e => {
                        const next = e.target.checked
                          ? [...(field.value ?? []), opt.value]
                          : (field.value ?? []).filter((v: string) => v !== opt.value);
                        field.onChange(next);
                      }}
                    />
                    <div className={`flex items-center justify-center size-4 rounded border transition-colors peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500/50 peer-focus-visible:ring-offset-1 ${checked ? 'bg-primary-500 border-primary-500' : 'bg-surface border-border'}`}>
                      {checked && <CheckSquare size={11} className="text-white" />}
                    </div>
                    {opt.label}
                  </label>
                  );
                })}
              </div>
              {errors.allowedImageTypes && (
                <span className="text-xs font-medium text-danger">{errors.allowedImageTypes.message}</span>
              )}
            </div>
          )}
        />

        {mutation.isError && (
          <p className="text-xs text-danger text-center">
            {mutation.error instanceof Error ? mutation.error.message : 'Failed to save settings.'}
          </p>
        )}

        <div className="flex justify-end pt-1">
          <Button type="submit" variant="primary" size="sm" isLoading={mutation.isPending} disabled={!isDirty}>
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Save changes
          </Button>
        </div>
      </Form>
    </div>
  );
};
