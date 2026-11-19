import { AlarmClock } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button, NoticeBanner } from '../../../components';
import { useNow } from '../../../lib/useNow';
import { useMyChecklistAlarmsQuery, useSnoozeAlarmMutation } from '../hook';
import type { AlarmSnoozeMinutes } from '../../../api/checklistInstances';

const SNOOZE_OPTIONS: AlarmSnoozeMinutes[] = [10, 30];

const clockOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export const ChecklistAlarmBanner = () => {
  const navigate = useNavigate();
  const now = useNow(30_000);
  const { data: alarms } = useMyChecklistAlarmsQuery();
  const snooze = useSnoozeAlarmMutation();

  const ringing = (alarms ?? []).filter((a) => !a.snoozedUntil && new Date(a.deadlineAt).getTime() > now);
  if (!ringing.length) return null;

  return (
    <div role="alert" className="flex flex-col gap-2">
      {ringing.map((alarm) => (
        <NoticeBanner key={alarm.instanceId} tone="danger" icon={AlarmClock}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p>
              <span className="font-semibold">{alarm.title}</span> closes at {clockOf(alarm.deadlineAt)}.{' '}
              {alarm.openItems} {alarm.openItems === 1 ? 'question is' : 'questions are'} still open.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => navigate(`/checklists/${alarm.instanceId}`)} className="pointer-coarse:min-h-11">
                Open
              </Button>
              {SNOOZE_OPTIONS.map((minutes) => (
                <Button
                  key={minutes}
                  size="sm"
                  variant="outline"
                  disabled={snooze.isPending}
                  onClick={() => snooze.mutate({ id: alarm.instanceId, minutes })}
                  className="pointer-coarse:min-h-11"
                >
                  Snooze {minutes} min
                </Button>
              ))}
            </div>
          </div>
        </NoticeBanner>
      ))}
    </div>
  );
};
