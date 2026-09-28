/** Current hour in Moscow, 0–23. Reminder dates are Moscow days, so the sending window is Moscow time too. */
export function moscowHour(now: Date) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', hourCycle: 'h23' }).format(now));
}

/**
 * Checks every `everyMinutes` whether it is sending time and, if so, runs one pass. Each pass sends only what was not
 * sent yet (the reminders table), so frequent checks cost a few queries and retry failed messages the same day.
 */
export function startReminderLoop(options: {
  run: () => Promise<{ users: number; messages: number; failed: number }>; hour: number; untilHour: number; everyMinutes: number;
  now?: () => Date; log: (message: string, extra?: Record<string, unknown>) => void;
}) {
  let running: Promise<void> | null = null;
  const tick = () => {
    const hour = moscowHour(options.now?.() ?? new Date());
    if (running || hour < options.hour || hour >= options.untilHour) return running ?? Promise.resolve();
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
