import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { IdCard } from 'lucide-react';
import { Button, InlineError, Input, Skeleton } from '../../../components';
import { SettingsCard } from '../../settings/SettingsCard';
import { useSettingsQuery, useUpdateSettingsMutation } from '../hook';

const schema = z.object({
  employeeIdPrefix: z.string().trim().regex(/^[A-Za-z0-9]{1,12}$/, 'Use 1 to 12 letters or numbers'),
});

type Fields = z.infer<typeof schema>;

export const PeopleSettings = () => {
  const { data: settings, isPending, isError, refetch } = useSettingsQuery();
  const mutation = useUpdateSettingsMutation();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<Fields>({ resolver: zodResolver(schema), defaultValues: { employeeIdPrefix: '' } });

  useEffect(() => {
    if (settings) reset({ employeeIdPrefix: settings.employeeIdPrefix }, { keepDirtyValues: true });
  }, [settings, reset]);

  if (isError && !settings) return <InlineError message="Could not load the people settings. Check your connection and try again." onRetry={() => void refetch()} />;
  if (isPending) return <Skeleton className="h-48 w-full max-w-xl rounded-2xl" />;

  const onSubmit = (data: Fields) => mutation.mutate({ employeeIdPrefix: data.employeeIdPrefix.toUpperCase() }, { onSuccess: (updated) => reset({ employeeIdPrefix: updated.employeeIdPrefix }) });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex w-full max-w-xl flex-col gap-4">
      <SettingsCard icon={IdCard} title="Employee IDs" hint="Every person gets an ID like EMP-0001 when they are added. Changing the prefix only applies to people added after the change. Existing IDs stay as they are.">
        <Input id="employeeIdPrefix" label="ID prefix" placeholder="EMP" autoComplete="off" error={errors.employeeIdPrefix?.message} {...register('employeeIdPrefix')} />
        <div className="flex justify-end">
          <Button type="submit" variant="primary" size="sm" isLoading={mutation.isPending} disabled={!isDirty}>Save changes</Button>
        </div>
      </SettingsCard>
    </form>
  );
};
