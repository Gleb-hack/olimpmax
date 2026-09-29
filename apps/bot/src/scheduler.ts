import { ALL_TIMEZONES, localHour, withinHours, type SendingHours } from '../../api/src/features/reminders/timezones.js';

/** Current hour in Moscow, 0–23. */
export const moscowHour = (now: Date) => localHour(now, 'Europe/Moscow');
/** Whether some region of Russia is within the sending hours right now: otherwise a check has nothing to do. */
export const anyoneWithinHours = (now: Date, hours: SendingHours) => ALL_TIMEZONES.some(zone => withinHours(now, zone, hours));

/**
 * Checks every `everyMinutes` and, while it is sending time somewhere, runs one pass. The pass itself picks the users
 * whose local time is within the hours and sends only what was not sent yet (the reminders table), so frequent
 * checks cost a few queries and retry failed messages the same day.
 */
export function startReminderLoop(options: {
  run: () => Promise<{ users: number }>; hours: SendingHours; everyMinutes: number;
  now?: () => Date; log: (message: string, extra?: Record<string, unknown>) => void;
}) {
  let running: Promise<void> | null = null;
  const tick = () => {
    if (running || !anyoneWithinHours(options.now?.() ?? new Date(), options.hours)) return running ?? Promise.resolve();
    running = options.run()
      .then(stats => { if (stats.users) options.log('Напоминания отправлены', stats); })
      .catch(error => options.log('Рассылка напоминаний прервана', { error: error instanceof Error ? error.message : String(error) }))
      .finally(() => { running = null; });
    return running;
  };
  const first = setTimeout(tick, 5_000);
  const timer = setInterval(tick, options.everyMinutes * 60_000);
  return {
    tick,
    async stop() { clearTimeout(first); clearInterval(timer); await running; },
  };
}
