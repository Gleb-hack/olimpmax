import { z } from 'zod';
import { AssistantError } from './deepseek.js';
import { publicUrl } from './public-page.js';

export type SearchResult = { title: string; url: string; snippet: string; date?: string };
export type SearchWeb = (query: string, signal: AbortSignal) => Promise<SearchResult[]>;
const Results = z.object({ organic: z.array(z.object({ title: z.string(), link: z.string(),
  snippet: z.string().optional(), date: z.string().optional() })).max(100).default([]) });

export function serperSearch(apiKey?: string, fetcher: typeof fetch = fetch): SearchWeb {
  return async (query, parent) => {
    if (!apiKey) throw new AssistantError('WEB_SEARCH_NOT_CONFIGURED', 'Поиск в интернете пока не подключён. Попробуй позже.');
    const signal = AbortSignal.any([parent, AbortSignal.timeout(12000)]);
    try {
      // Fixed destination, no redirects: never forward the key to a result website.
      const response = await fetcher('https://google.serper.dev/search', {
        method: 'POST', redirect: 'error', signal,
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query.slice(0, 2400), gl: 'ru', hl: 'ru', num: 5 }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new AssistantError('WEB_SEARCH_UNAVAILABLE', response.status === 429
          ? 'Поиск сейчас занят. Попробуй через минуту.' : 'Сервис поиска временно недоступен. Попробуй позже.', response.status === 429 ? 429 : 503);
      }
      const parsed = Results.safeParse(await response.json());
      if (!parsed.success) throw new AssistantError('WEB_SEARCH_INVALID_RESPONSE', 'Не удалось прочитать результаты поиска. Попробуй ещё раз.', 502);
      return parsed.data.organic.slice(0, 5).flatMap(item => {
        try { return [{ title: item.title.slice(0, 250), url: publicUrl(item.link).href,
          snippet: (item.snippet ?? '').slice(0, 3000), date: item.date?.slice(0, 100) }]; }
        catch { return []; }
      });
    } catch (error) {
      if (error instanceof AssistantError) throw error;
      if (signal.aborted) throw new AssistantError('WEB_SEARCH_TIMEOUT', 'Поиск не успел завершиться. Попробуй ещё раз.', 504);
      // Do not leak the key, query, upstream response, or network errors.
      throw new AssistantError('WEB_SEARCH_UNAVAILABLE', 'Сервис поиска временно недоступен. Попробуй позже.');
    }
  };
}
