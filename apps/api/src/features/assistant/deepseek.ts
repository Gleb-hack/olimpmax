import { z } from 'zod';

export class AssistantError extends Error {
  constructor(public code: string, message: string, public status: 429 | 502 | 503 | 504 = 503) { super(message); }
}
export type CompleteJson = (system: string, input: unknown, signal: AbortSignal) => Promise<unknown>;

// Keep the credential destination fixed; model output cannot choose an endpoint.
export function deepseekCompletion(apiKey?: string, model = 'deepseek-flash', fetcher: typeof fetch = fetch): CompleteJson {
  return async (system, input, signal) => {
    if (!apiKey) throw new AssistantError('ASSISTANT_NOT_CONFIGURED', 'Олимп пока не подключён. Попробуйте позже.');
    let response: Response;
    try {
      response = await fetcher('https://api.deepseek.com/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]),
        body: JSON.stringify({ model, thinking: { type: 'disabled' }, temperature: 0.2,
          max_tokens: 1600, stream: false, response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(input) }] }),
      });
    } catch {
      throw new AssistantError('ASSISTANT_TIMEOUT', 'Олимп не успел ответить. Попробуйте отправить сообщение ещё раз.', 504);
    }
    // Never return or log the upstream body: it may contain credentials or conversation data.
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 429) throw new AssistantError('ASSISTANT_BUSY', 'Олимп сейчас занят. Попробуйте через минуту.', 429);
      throw new AssistantError('ASSISTANT_UNAVAILABLE', 'Сервис ответов Олимпа временно недоступен. Попробуйте позже.');
    }
    try {
      const body = z.object({ choices: z.array(z.object({ finish_reason: z.literal('stop'),
        message: z.object({ content: z.string().min(1).max(16000) }) })).min(1) }).parse(await response.json());
      return JSON.parse(body.choices[0]!.message.content);
    } catch {
      throw new AssistantError('ASSISTANT_INVALID_RESPONSE', 'Не удалось получить полный ответ Олимпа. Попробуйте ещё раз.', 502);
    }
  };
}
