import { Bot, type Context, type ClientOptions } from '@maxhub/max-bot-api';
import type { User } from '@maxhub/max-bot-api/types';
import type { Database } from '../../api/src/db/client.js';
import { moscowToday } from '../../api/src/features/calendar.js';
import { maxMessenger, type Messenger } from '../../api/src/features/reminders/max.js';
import { upcomingEvents } from '../../api/src/features/reminders/schedule.js';
import {
  recordBotStarted, recordBotStopped, reminderItems, setNotificationsEnabled, setTracking, trackedOlympiads, userByMaxId,
} from '../../api/src/features/reminders/delivery.js';
import { actions } from '../../api/src/features/reminders/format.js';
import { fallbackMessage, mutedMessage, planMessage, settingsMessage, unknownUserMessage, welcomeMessage, type Reply } from './messages.js';

export type BotOptions = {
  db: Database; token: string; includeEstimated: boolean; reminderHour: number;
  clientOptions?: ClientOptions; now?: () => Date; log?: (message: string, extra?: Record<string, unknown>) => void;
};
const PLAN_HORIZON = 60;
const displayName = (user: User) => [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || 'Ученик';
const body = (reply: Reply) => ({ text: reply.text, format: 'html' as const, ...(reply.keyboard ? { attachments: [reply.keyboard] } : {}) });
const send = (ctx: Context, reply: Reply) => ctx.reply(reply.text, { ...body(reply), disable_link_preview: true });
// The client types list only `message`; MAX also accepts a one-time `notification` for the pressed button.
const answer = (ctx: Context, extra: { notification?: string; message?: ReturnType<typeof body> }) => ctx.answerOnCallback(extra as Parameters<Context['answerOnCallback']>[0]);

/**
 * The MAX bot: greets on «Начать», answers /plan and /settings, handles reminder buttons.
 * Reminders themselves go out from the scheduler (see scheduler.ts), through the same client.
 */
export function createBot(options: BotOptions) {
  const { db } = options;
  const bot = new Bot(options.token, options.clientOptions ? { clientOptions: options.clientOptions } : undefined);
  const messenger: Messenger = maxMessenger(bot.api);
  const now = () => options.now?.() ?? new Date();
  const identity = () => messenger.identity();

  async function start(ctx: Context, user: User) {
    const record = await recordBotStarted(db, { maxUserId: String(user.user_id), displayName: displayName(user) }, now());
    await send(ctx, welcomeMessage(await identity(), { firstName: user.first_name, registered: record.registeredAt !== null,
      enabled: record.notificationsEnabled, hour: options.reminderHour }));
  }
  async function plan(user: User): Promise<Reply> {
    const account = await userByMaxId(db, String(user.user_id));
    if (!account) return unknownUserMessage(await identity());
    const today = moscowToday(now());
    const items = await reminderItems(db, account.id, today);
    return planMessage(await identity(), { tracked: items.filter(i => i.tracking).length, horizon: PLAN_HORIZON, enabled: account.notificationsEnabled,
      upcoming: upcomingEvents(items, today, PLAN_HORIZON, { includeEstimated: options.includeEstimated }) });
  }
  async function settings(user: User): Promise<Reply> {
    const account = await userByMaxId(db, String(user.user_id));
    if (!account) return unknownUserMessage(await identity());
    return settingsMessage(await identity(), { enabled: account.notificationsEnabled, tracked: await trackedOlympiads(db, account.id), hour: options.reminderHour });
  }

  bot.on('bot_started', ctx => start(ctx, ctx.user));
  bot.on('bot_stopped', ctx => recordBotStopped(db, String(ctx.user.user_id), now()));
  bot.command('start', async ctx => { if (ctx.message.sender) await start(ctx, ctx.message.sender); });
  bot.command('plan', async ctx => { if (ctx.message.sender) await send(ctx, await plan(ctx.message.sender)); });
  bot.command(['settings', 'notify'], async ctx => { if (ctx.message.sender) await send(ctx, await settings(ctx.message.sender)); });
  bot.command('help', async ctx => { if (ctx.message.sender) await send(ctx, fallbackMessage(await identity())); });

  bot.action(actions.plan, async ctx => { await answer(ctx, {}); await send(ctx, await plan(ctx.callback.user)); });
  bot.action(actions.settings, async ctx => { await answer(ctx, {}); await send(ctx, await settings(ctx.callback.user)); });
  bot.action([actions.notifyOn, actions.notifyOff], async ctx => {
    const account = await userByMaxId(db, String(ctx.callback.user.user_id));
    if (!account) { await answer(ctx, { notification: 'Сначала откройте Olimp и войдите через MAX' }); return; }
    const enabled = ctx.callback.payload === actions.notifyOn;
    await setNotificationsEnabled(db, account.id, enabled, now());
    await answer(ctx, { notification: enabled ? 'Напоминания включены' : 'Напоминания выключены', message: body(await settings(ctx.callback.user)) });
  });
  bot.action(/^mute:(\d{1,9})(:s)?$/, async ctx => {
    const account = await userByMaxId(db, String(ctx.callback.user.user_id));
    const olympiadId = Number(ctx.match?.[1]);
    const title = account ? await setTracking(db, account.id, olympiadId, false) : null;
    if (!title) { await answer(ctx, { notification: 'Этой олимпиады уже нет в вашем плане' }); return; }
    if (ctx.match?.[2]) { await answer(ctx, { notification: 'Больше не напомню', message: body(await settings(ctx.callback.user)) }); return; }
    await answer(ctx, { notification: 'Больше не напомню об этой олимпиаде' });
    await send(ctx, mutedMessage(title, olympiadId));
  });
  bot.action(/^unmute:(\d{1,9})$/, async ctx => {
    const account = await userByMaxId(db, String(ctx.callback.user.user_id));
    const title = account ? await setTracking(db, account.id, Number(ctx.match?.[1]), true) : null;
    await answer(ctx, { notification: title ? 'Снова слежу за сроками этой олимпиады' : 'Этой олимпиады уже нет в вашем плане' });
  });
  // Anything else: a short hint instead of silence. Questions about olympiads belong to the assistant in the app.
  bot.on('message_created', async ctx => {
    if (ctx.message.recipient.chat_type !== 'dialog') return;
    await send(ctx, fallbackMessage(await identity()));
  });
  bot.catch((error, ctx) => {
    options.log?.('Ошибка обработки обновления MAX', { updateType: ctx.updateType, error: error instanceof Error ? error.message : String(error) });
  });
  return { bot, messenger };
}

export const BOT_COMMANDS = [
  { name: 'plan', description: 'Ближайшие сроки из плана' },
  { name: 'settings', description: 'Настройки напоминаний' },
  { name: 'help', description: 'Что умеет бот' },
];
