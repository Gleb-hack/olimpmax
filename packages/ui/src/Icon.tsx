import { Award, ArrowUpLeft, ClipboardList, Copy, ExternalLink, Globe, History, MessageSquare, Pause, Phone, Plus, RotateCcw, type LucideIcon } from 'lucide-react';
import barChart from './icons/bar-chart.svg?raw';
import bell from './icons/bell.svg?raw';
import book from './icons/book.svg?raw';
import calendar from './icons/calendar.svg?raw';
import check from './icons/check.svg?raw';
import chevronDown from './icons/chevron-down.svg?raw';
import chevronLeft from './icons/chevron-left.svg?raw';
import chevronRight from './icons/chevron-right.svg?raw';
import compare from './icons/compare.svg?raw';
import edit from './icons/edit.svg?raw';
import graduationCap from './icons/graduation-cap.svg?raw';
import grid from './icons/grid.svg?raw';
import helpCircle from './icons/help-circle.svg?raw';
import list from './icons/list.svg?raw';
import mail from './icons/mail.svg?raw';
import refresh from './icons/refresh.svg?raw';
import search from './icons/search.svg?raw';
import send from './icons/send.svg?raw';
import shield from './icons/shield.svg?raw';
import sort from './icons/sort.svg?raw';
import sparkle from './icons/sparkle.svg?raw';
import trash from './icons/trash.svg?raw';
import user from './icons/user.svg?raw';
import x from './icons/x.svg?raw';

// Icons exported from the Figma "🧩 Icons" section; colors are currentColor.
const figmaIcons = {
  'bar-chart': barChart, bell, book, calendar, check, 'chevron-down': chevronDown, 'chevron-left': chevronLeft, 'chevron-right': chevronRight,
  compare, edit, 'graduation-cap': graduationCap, grid, 'help-circle': helpCircle, list, mail, refresh, search, send,
  shield, sort, sparkle, trash, user, x,
};
// Not in the Figma set yet: Lucide with the set's 1.8 px line.
const lucideIcons = {
  award: Award, 'arrow-up-left': ArrowUpLeft, 'clipboard-list': ClipboardList, copy: Copy, 'external-link': ExternalLink, globe: Globe,
  history: History, 'message-square': MessageSquare, pause: Pause, phone: Phone, plus: Plus, 'rotate-ccw': RotateCcw,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof figmaIcons | keyof typeof lucideIcons;

const svgParts = new Map<string, { viewBox: string; width: number; body: string }>();
function parse(name: keyof typeof figmaIcons) {
  let parts = svgParts.get(name);
  if (!parts) {
    const source = figmaIcons[name];
    const viewBox = /viewBox="([^"]+)"/.exec(source)?.[1] ?? '0 0 24 24';
    parts = { viewBox, width: Number(viewBox.split(' ')[2]), body: source.replace(/^[\s\S]*?<svg[^>]*>|<\/svg>\s*$/g, '') };
    svgParts.set(name, parts);
  }
  return parts;
}

// Decorative icon; color comes from the parent's `color`. As in Figma, the line width stays the same at any size.
export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  const classes = className ? `icon ${className}` : 'icon';
  if (name in lucideIcons) {
    const Lucide = lucideIcons[name as keyof typeof lucideIcons];
    return <Lucide className={classes} size={size} strokeWidth={1.8} absoluteStrokeWidth aria-hidden="true" />;
  }
  const { viewBox, width, body } = parse(name as keyof typeof figmaIcons);
  const scale = width / size;
  const html = body.replace(/stroke-width="([\d.]+)"/g, (_, value: string) => `stroke-width="${+(Number(value) * scale).toFixed(3)}"`);
  return <svg className={classes} width={size} height={size} viewBox={viewBox} fill="none" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: html }} />;
}
