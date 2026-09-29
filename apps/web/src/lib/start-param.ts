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
  // Text the pupil wrote to the bot: MAX passes only [A-Za-z0-9_-], so it comes as UTF-8 in base64url.
  const text = /^(ask|search)_([A-Za-z0-9_-]{2,500})$/.exec(param);
  const value = text ? decodeText(text[2]!) : null;
  if (!text || !value) return null;
  // The question is only typed into the chat: the pupil reads it and sends it.
  return text[1] === 'ask' ? `/olimp?chat=1&ask=${encodeURIComponent(value.slice(0, 2000))}` : `/search?q=${encodeURIComponent(value.slice(0, 200))}`;
}

function decodeText(value: string) {
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    const text = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
    const clean = text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    return clean || null;
  } catch { return null; }
}
