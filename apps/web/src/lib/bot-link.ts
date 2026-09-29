/** `max.ru/<bot>?start=notify`: the bot greets with «Бот подключён» instead of the plain welcome (apps/bot/src/messages.ts). */
export function botStartUrl(botUrl: string) {
  const url = new URL(botUrl);
  url.searchParams.set('start', 'notify');
  return url.toString();
}
