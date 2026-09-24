import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { loadBuffer } from 'cheerio';

export type PublicPage = { url: string; title: string; text: string; links: { url: string; title: string }[] };
export type ReadPublicPage = (url: string, signal: AbortSignal) => Promise<PublicPage>;

export function isPublicAddress(address: string) {
  try { return ipaddr.process(address).range() === 'unicast'; } catch { return false; }
}
export function publicUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || value.length > 2000
    || isIP(url.hostname.replace(/^\[|\]$/g, '')) || !url.hostname.includes('.')
    || /(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(url.hostname)) throw Error('Blocked URL');
  url.hash = '';
  return url;
}

type Download = { bytes: Buffer; url: string; encoding?: string };
async function download(value: string, parent: AbortSignal, redirects = 0): Promise<Download> {
  if (redirects > 3) throw Error('Too many redirects');
  const url = publicUrl(value);
  const signal = AbortSignal.any([parent, AbortSignal.timeout(8000)]);
  signal.throwIfAborted();
  // Resolve before connecting, and pin the connection to the checked address.
  let stopDns!: () => void;
  const cancelled = new Promise<never>((_resolve, reject) => {
    stopDns = () => reject(Error('Aborted'));
    signal.addEventListener('abort', stopDns, { once: true });
  });
  const addresses = await Promise.race([lookup(url.hostname, { all: true }), cancelled])
    .finally(() => signal.removeEventListener('abort', stopDns));
  if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) throw Error('Blocked address');
  const address = addresses.find(a => a.family === 4) ?? addresses[0]!;
  signal.throwIfAborted();
  const result = await new Promise<{ bytes?: Buffer; location?: string; encoding?: string }>((resolve, reject) => {
    const req = (url.protocol === 'https:' ? httpsRequest : httpRequest)({
      protocol: url.protocol, hostname: address.address, family: address.family,
      servername: url.hostname, port: url.protocol === 'https:' ? 443 : 80,
      path: url.pathname + url.search, method: 'GET', agent: false, signal,
      headers: { Host: url.host, 'User-Agent': 'Olimp/0.1 (olympiad information assistant)', Accept: 'text/html,application/xhtml+xml', 'Accept-Encoding': 'identity' },
    }, response => {
      response.on('error', reject);
      if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0) && response.headers.location) {
        const location = new URL(response.headers.location, url).href;
        resolve({ location }); response.destroy(); return;
      }
      if ((response.statusCode ?? 500) >= 400 || !/text\/html|application\/xhtml\+xml/i.test(response.headers['content-type'] ?? '')
        || (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity')) {
        response.destroy(); reject(Error('Page unavailable')); return;
      }
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 800_000) { response.destroy(); reject(Error('Page too large')); return; }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({ bytes: Buffer.concat(chunks), encoding: response.headers['content-type']?.match(/charset=["']?([^;"'\s]+)/i)?.[1] }));
    });
    req.on('error', reject); req.end();
  });
  if (result.location) return download(result.location, signal, redirects + 1);
  return { bytes: result.bytes!, url: url.href, encoding: result.encoding };
}

export function extractPage(bytes: Buffer, url: string, encoding?: string): PublicPage {
  const $ = loadBuffer(bytes, { encoding: { defaultEncoding: 'utf-8', transportLayerEncodingLabel: encoding } });
  const title = $('h1').first().text().trim() || $('title').text().trim() || new URL(url).hostname;
  $('script, style, noscript, iframe, svg, form, nav, footer, header, [hidden], [aria-hidden="true"]').remove();
  const links = new Map<string, string>();
  $('a[href]').each((_index, element) => {
    const node = $(element);
    try {
      const target = publicUrl(new URL(node.attr('href')!, url).href);
      const label = node.text().replace(/\s+/g, ' ').trim();
      const source = new URL(url);
      if (source.hostname === 'olimpiada.ru' && /^\/activity\/\d+/.test(source.pathname)
        && !node.closest('.contacts, #new_for_activity, .full_event_info').length
        && !(target.hostname === source.hostname && target.pathname.startsWith(source.pathname.replace(/\/$/, '') + '/'))) return;
      if (!label || /\.(pdf|zip|rar|docx?|xlsx?|jpe?g|png|mp4)$/i.test(target.pathname)) return;
      if (/(?:^|\.)(?:vk\.com|t\.me|youtube\.com|rutube\.ru|facebook\.com|instagram\.com|max\.ru)$/.test(target.hostname)) return;
      // Do not follow action, account, or search links.
      if (/login|logout|sign.?in|register|auth|delete|unsubscribe|\bsearch\b/i.test(target.pathname)) return;
      if (links.size < 100) links.set(target.href, label.slice(0, 180));
    } catch { /* Unsupported or unsafe link. */ }
  });
  $('br').replaceWith('\n');
  $('p,div,li,h1,h2,h3,section,article,tr').append('\n');
  const main = $('main, article, [role="main"]').first();
  const text = (main.length ? main : $('body')).text().replace(/[\t\r ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 35000);
  if (text.length < 80 || /captcha|verify you are human|проверка.{0,15}робот/i.test(title)) throw Error('No readable content');
  return { url, title: title.slice(0, 250), text, links: [...links].map(([url, title]) => ({ url, title })) };
}
export const readPublicPage: ReadPublicPage = async (url, signal) => {
  const downloaded = await download(url, signal);
  return extractPage(downloaded.bytes, downloaded.url, downloaded.encoding);
};
