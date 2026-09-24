import { createHmac } from 'node:crypto';
export const testBotToken = 'test-only-max-bot-token';
export function signedInitData(id: number, now = new Date(), extra: Record<string, string> = {}) {
  const params = new URLSearchParams({ auth_date: String(Math.floor(now.getTime() / 1000)),
    user: JSON.stringify({ id, first_name: 'Тест + &=ё', last_name: 'Пользователь' }), ...extra });
  const check = [...params].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${k}=${v}`).join('\n');
  const key = createHmac('sha256', 'WebAppData').update(testBotToken).digest();
  params.set('hash', createHmac('sha256', key).update(check).digest('hex'));
  return params.toString();
}
