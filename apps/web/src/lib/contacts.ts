// Contacts come from the catalog as free text; each one becomes a link when its format is recognised.
export type Contact = { kind: 'email' | 'phone' | 'social' | 'site' | 'text'; label: string; href?: string };

const socials: [RegExp, string][] = [
  [/^(?:m\.)?vk\.(?:com|ru)$/, 'ВКонтакте'],
  [/^(?:t\.me|telegram\.me)$/, 'Telegram'],
  [/^(?:m\.)?ok\.ru$/, 'Одноклассники'],
  [/^(?:m\.)?youtube\.com$|^youtu\.be$/, 'YouTube'],
  [/^rutube\.ru$/, 'RuTube'],
  [/^dzen\.ru$/, 'Дзен'],
  [/^max\.ru$/, 'MAX'],
  [/^wa\.me$/, 'WhatsApp'],
];

export function mailtoUrl(address: string, subject = '') {
  return `mailto:${address}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;
}

export function parseContact(raw: string): Contact {
  const value = raw.trim();
  if (/^[^\s@/:]+@[^\s@/]+\.[^\s@/]+$/.test(value)) return { kind: 'email', label: value, href: mailtoUrl(value) };
  const digits = value.replace(/[\s()-]/g, '');
  if (/^[+\d\s()-]+$/.test(value) && /^\+?\d{7,15}$/.test(digits)) return { kind: 'phone', label: value, href: `tel:${digits}` };
  // The import often cuts a link's path to "/..."; such a link opens the site's home page.
  const link = value.replace(/\/(?:\.{3}|…)$/, '').replace(/\/$/, '');
  if (!/^(?:https?:\/\/)?[\p{L}\d-]+(?:\.[\p{L}\d-]+)+(?:[/?#]\S*)?$/iu.test(link)) return { kind: 'text', label: value };
  try {
    const url = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`);
    const host = url.hostname.replace(/^www\./, '');
    if (!/\.(?:\p{L}{2,}|xn--[a-z\d-]+)$/iu.test(host)) return { kind: 'text', label: value };
    const social = socials.find(([pattern]) => pattern.test(host));
    return social ? { kind: 'social', label: social[1], href: url.href } : { kind: 'site', label: link.replace(/^https?:\/\/(?:www\.)?/i, ''), href: url.href };
  } catch {
    return { kind: 'text', label: value };
  }
}
