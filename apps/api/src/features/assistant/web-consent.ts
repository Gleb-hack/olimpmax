import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const Task = z.object({ question: z.string().min(1).max(2000), olympiadIds: z.array(z.number().int().positive()).min(1).max(3) }).strict();
const Consent = z.object({ task: Task, userId: z.uuid(), expiresAt: z.number().int() }).strict();
export type WebResearchTask = z.infer<typeof Task>;
export class WebConsentError extends Error {}

// Separate HMAC purpose; never accept an auth JWT or a client-supplied URL as approval.
export function webConsent(secret: string, now: () => number = Date.now) {
  const sign = (value: string) => createHmac('sha256', secret).update('olimp-web-consent-serper-v2:' + value).digest();
  return {
    issue(userId: string, task: WebResearchTask) {
      const payload = Buffer.from(JSON.stringify(Consent.parse({ task, userId, expiresAt: now() + 15 * 60_000 }))).toString('base64url');
      return `${payload}.${sign(payload).toString('base64url')}`;
    },
    verify(userId: string, token: string): WebResearchTask {
      try {
        const parts = token.split('.');
        if (parts.length !== 2 || token.length > 12000) throw Error();
        const signature = Buffer.from(parts[1]!, 'base64url');
        const expected = sign(parts[0]!);
        if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) throw Error();
        const payload = Consent.parse(JSON.parse(Buffer.from(parts[0]!, 'base64url').toString()));
        if (payload.userId !== userId || payload.expiresAt <= now()) throw Error();
        return payload.task;
      } catch { throw new WebConsentError('Предложение поиска устарело или недействительно. Задай вопрос Олимпу ещё раз.'); }
    },
  };
}
