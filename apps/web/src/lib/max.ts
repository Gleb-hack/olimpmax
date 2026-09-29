type MaxWebApp = {
  initData?: string;
  initDataUnsafe?: { user?: { id?: number; first_name?: string; last_name?: string; photo_url?: string | null }; start_param?: string };
  // Not in the current MAX bridge; read if a future version reports the interface theme.
  colorScheme?: string;
  ready?: () => void;
  openLink?: (url: string) => void;
  // Mobile clients only: saves a file from an https link under the given name.
  downloadFile?: (url: string, fileName: string) => unknown;
  BackButton?: { show: () => void; hide: () => void; onClick: (callback: () => void) => void; offClick: (callback: () => void) => void };
};
declare global { interface Window { WebApp?: MaxWebApp } }

export const max = {
  get initData() { return window.WebApp?.initData ?? ''; },
  get isEmbedded() { return Boolean(this.initData); },
  // Display-only data. Identity and authorization always come from the API's signature check.
  get displayName() { return window.WebApp?.initDataUnsafe?.user?.first_name || 'Ученик'; },
  get photoUrl() {
    if (!this.isEmbedded) return null;
    const value = window.WebApp?.initDataUnsafe?.user?.photo_url;
    if (!value) return null;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.href : null;
    } catch { return null; }
  },
  /** Launch parameter from a bot button or a max.ru/<bot>?startapp= link: where to open the app (see start-param.ts). */
  get startParam() { return this.isEmbedded ? window.WebApp?.initDataUnsafe?.start_param ?? null : null; },
  get preferenceScope() { return this.isEmbedded ? String(window.WebApp?.initDataUnsafe?.user?.id ?? 'max') : 'browser'; },
  ready() { if (this.isEmbedded) window.WebApp?.ready?.(); },
  // One way to leave the mini-app: web pages, mail and phone links. MAX documents openLink for web links only,
  // so mail and phone callers also show the address as text for manual use.
  openExternal(url: string) {
    const parsed = new URL(url);
    if (!['https:', 'http:', 'mailto:', 'tel:'].includes(parsed.protocol)) throw new Error('Недопустимая ссылка');
    if (this.isEmbedded && window.WebApp?.openLink) window.WebApp.openLink(parsed.href);
    else if (parsed.protocol.startsWith('http')) window.open(parsed.href, '_blank', 'noopener,noreferrer');
    else window.location.href = parsed.href;
  },
  /** Saves a file from an https link through MAX (mobile clients); false when MAX cannot do it here. */
  downloadFile(url: string, fileName: string) {
    const app = window.WebApp;
    if (!this.isEmbedded || !app?.downloadFile || new URL(url).protocol !== 'https:') return false;
    try {
      // The bridge may answer with a promise; its errors (desktop client, timeout) must not surface as unhandled.
      Promise.resolve(app.downloadFile(url, fileName)).catch(() => {});
      return true;
    } catch { return false; }
  },
  backButton(callback: (() => void) | null) {
    if (!this.isEmbedded) return () => {};
    const button = window.WebApp?.BackButton;
    if (!button) return () => {};
    if (!callback) { button.hide(); return () => {}; }
    button.show(); button.onClick(callback);
    return () => { button.offClick(callback); button.hide(); };
  },
};
