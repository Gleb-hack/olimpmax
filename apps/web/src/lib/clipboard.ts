// Mobile WebViews may block the async Clipboard API; fall back to a temporary selection.
export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* Try the legacy path below. */ }
  const field = document.createElement('textarea');
  field.value = text; field.readOnly = true;
  field.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
  document.body.append(field);
  field.select(); field.setSelectionRange(0, text.length);
  try { return document.execCommand('copy'); } catch { return false; } finally { field.remove(); }
}
