import { z } from 'zod';

const flag = z.enum(['true', 'false']).transform(v => v === 'true');
const Environment = z.object({
  DATABASE_URL: z.url().refine(v => /^postgres(?:ql)?:\/\//.test(v)),
  MAX_BOT_TOKEN: z.string().trim().min(1, 'Для бота нужен MAX_BOT_TOKEN — токен того же бота, к которому привязан Mini App'),
  /** Moscow hours during which reminders go out: from BOT_REMINDER_HOUR (inclusive) to BOT_REMINDER_UNTIL_HOUR. */
  BOT_REMINDER_HOUR: z.coerce.number().int().min(0).max(23).default(10),
  BOT_REMINDER_UNTIL_HOUR: z.coerce.number().int().min(1).max(24).default(21),
  BOT_CHECK_MINUTES: z.coerce.number().int().min(1).max(120).default(15),
  /** Remind about catalog dates whose year comes from the season (`estimated`), not only verified ones. */
  BOT_REMIND_ESTIMATED: flag.default(true),
});
export function readBotConfig(env: NodeJS.ProcessEnv = process.env) {
  const e = Environment.parse(env);
  if (e.BOT_REMINDER_UNTIL_HOUR <= e.BOT_REMINDER_HOUR) throw new Error('BOT_REMINDER_UNTIL_HOUR должен быть позже BOT_REMINDER_HOUR');
  return { databaseUrl: e.DATABASE_URL, token: e.MAX_BOT_TOKEN, reminderHour: e.BOT_REMINDER_HOUR, untilHour: e.BOT_REMINDER_UNTIL_HOUR,
    checkMinutes: e.BOT_CHECK_MINUTES, includeEstimated: e.BOT_REMIND_ESTIMATED };
}
export type BotConfig = ReturnType<typeof readBotConfig>;
