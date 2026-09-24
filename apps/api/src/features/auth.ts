import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
const MaxUser = z.object({
  id: z.union([z.number().int().positive().max(Number.MAX_SAFE_INTEGER), z.string().regex(/^[1-9]\d{0,19}$/)]),
  first_name: z.string().min(1).max(200), last_name: z.string().max(200).nullable().optional(), is_bot: z.boolean().optional(),
});
export function validateMaxInitData(initData: string, botToken: string, now = Date.now()) {
  if (!botToken || initData.length > 16384) throw new Error('Invalid MAX initData');
  const params = new URLSearchParams(initData);
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate MAX parameters');
  const supplied = params.get('hash');
  if (!supplied || !/^[0-9a-f]{64}$/i.test(supplied)) throw new Error('Invalid MAX signature');
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(check).digest();
  if (!timingSafeEqual(expected, Buffer.from(supplied, 'hex'))) throw new Error('Invalid MAX signature');
  const rawAuthDate = params.get('auth_date');
  if (!rawAuthDate || !/^\d+$/.test(rawAuthDate)) throw new Error('Invalid auth_date');
  const age = now / 1000 - Number(rawAuthDate);
  if (!Number.isFinite(age) || age > 3600 || age < -30) throw new Error('Expired MAX initData');
  const user = MaxUser.parse(JSON.parse(params.get('user') ?? 'null'));
  if (user.is_bot) throw new Error('Bot users cannot sign in');
  return { maxUserId: String(user.id), displayName: [user.first_name, user.last_name].filter(Boolean).join(' ') };
}
