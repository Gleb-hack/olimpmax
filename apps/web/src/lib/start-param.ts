/**
 * Where a start parameter opens the app. Bot buttons and links pass it as `start_param`
 * (max.ru/<bot>?startapp=…); the values are built in apps/api/src/features/reminders/format.ts (`startParam`).
 */
export function startRoute(param: string | null | undefined) {
  if (!param) return null;
  const olympiad = /^olympiad_([1-9]\d{0,8})$/.exec(param);
  if (olympiad) return `/olympiads/${olympiad[1]}`;
  if (param === 'plan') return '/plan';
  // «Спросить Олимпа» in the bot opens the chat sheet over the Olimp overview (features/assistant/chat-route.ts).
  if (param === 'olimp') return '/olimp?chat=1';
  return null;
}
