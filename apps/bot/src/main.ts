import { connectDatabase } from '../../api/src/db/client.js';
import { runReminders } from '../../api/src/features/reminders/delivery.js';
import { readBotConfig } from './config.js';
import { BOT_COMMANDS, createBot } from './bot.js';
import { startReminderLoop } from './scheduler.js';

const log = (message: string, extra?: Record<string, unknown>) =>
  console.log(JSON.stringify({ time: new Date().toISOString(), message, ...extra }));

// Without a token the local Docker stack still starts: the Mini App and the API work, the bot simply stays off.
if (!process.env.MAX_BOT_TOKEN?.trim()) {
  log('MAX_BOT_TOKEN не задан: бот MAX не запущен. Задайте токен бота, чтобы включить команды и напоминания.');
  process.exit(0);
}
const config = readBotConfig();
const { db, pool } = connectDatabase(config.databaseUrl);
const { bot, messenger } = createBot({ db, token: config.token, includeEstimated: config.includeEstimated, reminderHour: config.reminderHour, log });

let me: Awaited<ReturnType<typeof bot.api.getMyInfo>>;
try { me = await bot.api.getMyInfo(); }
catch (error) {
  log('Не удалось подключиться к MAX: проверьте MAX_BOT_TOKEN и доступ к platform-api2.max.ru', { error: error instanceof Error ? error.message : String(error) });
  await pool.end();
  process.exit(1);
}
log('Бот MAX подключён', { username: me.username, userId: me.user_id });
await bot.api.setMyCommands(BOT_COMMANDS).catch(error => log('Не удалось обновить список команд', { error: String(error) }));

const hours = { from: config.reminderHour, until: config.untilHour };
const loop = startReminderLoop({
  hours, everyMinutes: config.checkMinutes, log,
  run: () => runReminders(db, messenger, { includeEstimated: config.includeEstimated, hours, log }),
});
log('Напоминания по расписанию', { from: `${config.reminderHour}:00`, until: `${config.untilHour}:00`, timezone: 'регион профиля, иначе Europe/Moscow', everyMinutes: config.checkMinutes });

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  bot.stopPolling();
  await loop.stop();
  await pool.end();
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void shutdown(); });

// Long polling: MAX delivers updates only while no webhook subscription exists for this bot.
try { await bot.start({ mode: 'polling', options: { allowedUpdates: ['bot_started', 'bot_stopped', 'message_created', 'message_callback'] } }); }
catch (error) { log('Получение обновлений MAX остановлено', { error: error instanceof Error ? error.message : String(error) }); process.exitCode = 1; }
finally { await shutdown(); }
