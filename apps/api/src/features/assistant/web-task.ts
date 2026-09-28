import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

// What Olimp looks up on the web after the database had no answer: a self-contained question plus the catalog
// olympiads and universities it is about. Issued by /assistant/chat, redeemed by /assistant/web-search.
const Task = z.object({
  question: z.string().min(1).max(2000),
  olympiadIds: z.array(z.number().int().positive()).max(3).default([]),
  universitySlugs: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80)).max(3).default([]),
}).strict();
const Ticket = z.object({ task: Task, userId: z.uuid(), expiresAt: z.number().int() }).strict();
export type WebResearchTask = z.infer<typeof Task>;
export class WebTaskError extends Error {}

/**
 * Signed ticket: the research endpoint accepts only questions the chat itself decided to look up for this user,
 * never a client-supplied question or URL. Separate HMAC purpose; an auth JWT is never accepted as a ticket.
 */
export function webResearchTickets(secret: string, now: () => number = Date.now) {
  const sign = (value: string) => createHmac('sha256', secret).update('olimp-web-research-v3:' + value).digest();
  return {
    issue(userId: string, task: z.input<typeof Task>) {
      const payload = Buffer.from(JSON.stringify(Ticket.parse({ task, userId, expiresAt: now() + 15 * 60_000 }))).toString('base64url');
      return `${payload}.${sign(payload).toString('base64url')}`;
    },
    verify(userId: string, token: string): WebResearchTask {
      try {
        const parts = token.split('.');
        if (parts.length !== 2 || token.length > 12000) throw Error();
        const signature = Buffer.from(parts[1]!, 'base64url');
        const expected = sign(parts[0]!);
        if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) throw Error();
        const payload = Ticket.parse(JSON.parse(Buffer.from(parts[0]!, 'base64url').toString()));
        if (payload.userId !== userId || payload.expiresAt <= now()) throw Error();
        return payload.task;
      } catch { throw new WebTaskError('Поиск устарел. Задай вопрос Олимпу ещё раз.'); }
    },
  };
}
