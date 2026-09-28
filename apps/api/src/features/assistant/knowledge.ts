// Olimp's own reference texts besides the catalog: the olympiad FAQ and the list of links it may open on the web.
// Both are plain CSV files in data/, read once per process; edit the files and restart the API to update them.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDelimited, parseFaq, type FaqEntry } from '../../../../../packages/contracts/src/index.js';

export const knowledgeFiles = { faq: 'faq/olympiad_faq_2026-27.csv', links: 'assistant/university_links_descriptions.csv' } as const;

/** data/ next to the sources in development and next to apps/api/dist in the Docker image; OLIMP_DATA_DIR overrides. */
export function dataDir() {
  if (process.env.OLIMP_DATA_DIR) return process.env.OLIMP_DATA_DIR;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'data', knowledgeFiles.faq))) return join(dir, 'data');
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(process.cwd(), 'data');
}

export type LinkEntry = { index: number; url: string; description: string; host: string };
export type Knowledge = { faq: FaqEntry[]; links: LinkEntry[] };
const cache = new Map<string, Knowledge>();
export function loadKnowledge(dir = dataDir()): Knowledge {
  const hit = cache.get(dir);
  if (hit) return hit;
  const read = (file: string) => existsSync(join(dir, file)) ? readFileSync(join(dir, file), 'utf8') : '';
  const links = parseDelimited(read(knowledgeFiles.links)).flatMap(row => {
    const url = (row['Ссылка'] ?? row.url ?? '').trim(), description = (row['Описание'] ?? row.description ?? '').trim();
    try {
      const parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol) || !description) return [];
      // Tracking parameters from the source spreadsheet are not part of the address.
      for (const key of [...parsed.searchParams.keys()]) if (/^utm_/i.test(key)) parsed.searchParams.delete(key);
      return [{ url: parsed.href, description, host: parsed.hostname.replace(/^www\./, '') }];
    } catch { return []; }
  }).map((link, index) => ({ ...link, index }));
  const value = { faq: parseFaq(read(knowledgeFiles.faq)), links };
  cache.set(dir, value);
  return value;
}

const stop = new Set(['что', 'как', 'где', 'кто', 'такое', 'это', 'эта', 'делать', 'или', 'для', 'при', 'про', 'все', 'всё', 'меня', 'мне', 'какие', 'какой', 'какая', 'какое', 'каких', 'когда', 'можно', 'нужно', 'нужен', 'нужна', 'если', 'есть', 'чтобы', 'этот', 'этой',
  'олимпиада', 'олимпиады', 'олимпиаду', 'олимпиад', 'олимпиадам', 'олимпиадах', 'школьник', 'школьников', 'пожалуйста', 'расскажи', 'подскажи', 'скажи']);
const stems = (text: string) => new Set((text.toLocaleLowerCase('ru').replaceAll('ё', 'е').match(/[\p{L}\p{N}]{3,}/gu) ?? [])
  .filter(word => !stop.has(word)).map(word => word.slice(0, 5)));
const abbreviations = /(?<![\p{L}])(бви|вош|всош|егэ|рсош|дви|огэ|вуз|вузы|вуза|вузе)(?![\p{L}])/giu;

/** The FAQ entries that share the most word stems with the question (abbreviations like БВИ weigh more). */
export function searchFaq(question: string, faq: FaqEntry[], limit = 6) {
  const query = stems(question);
  const shortForms = new Set([...question.toLocaleLowerCase('ru').matchAll(abbreviations)].map(m => m[1]!.slice(0, 3)));
  if (!query.size && !shortForms.size) return [];
  return faq.map((entry, index) => {
    // A match in the question counts double: questions are short and name the topic.
    const title = stems(entry.question), body = stems(`${entry.answer} ${entry.category}`);
    let score = 0;
    for (const stem of query) score += title.has(stem) ? 2 : body.has(stem) ? 1 : 0;
    const text = `${entry.question} ${entry.answer}`.toLocaleLowerCase('ru');
    for (const short of shortForms) if (text.includes(short)) score += 2;
    return { entry, index, score };
  }).filter(item => item.score >= 2).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, limit);
}
