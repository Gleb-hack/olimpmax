type MaxWebApp = {
  initData?: string;
  initDataUnsafe?: { user?: { id?: number; first_name?: string; last_name?: string } };
  ready?: () => void;
  openLink?: (url: string) => void;
  downloadFile?: (url: string, fileName: string) => Promise<unknown> | void;
  BackButton?: { show: () => void; hide: () => void; onClick: (callback: () => void) => void; offClick: (callback: () => void) => void };
};
declare global { interface Window { WebApp?: MaxWebApp } }

export const max = {
  get initData() { return window.WebApp?.initData ?? ''; },
  get isEmbedded() { return Boolean(this.initData); },
  // Display-only data. Identity and authorization always come from the API's signature check.
  get displayName() { return window.WebApp?.initDataUnsafe?.user?.first_name || 'Ученик'; },
  get preferenceScope() { return this.isEmbedded ? String(window.WebApp?.initDataUnsafe?.user?.id ?? 'max') : 'browser'; },
  ready() { if (this.isEmbedded) window.WebApp?.ready?.(); },
  openLink(url: string) {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Недопустимая ссылка');
    if (this.isEmbedded && window.WebApp?.openLink) window.WebApp.openLink(parsed.href);
    else window.open(parsed.href, '_blank', 'noopener,noreferrer');
  },
  // MAX documents openLink for web links only, so callers must also show the address for manual use.
  openMail(address: string, subject = '') {
    const url = `mailto:${address}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;
    if (this.isEmbedded && window.WebApp?.openLink) window.WebApp.openLink(url);
    else window.location.href = url;
  },
  get canDownloadFile() { return this.isEmbedded && typeof window.WebApp?.downloadFile === 'function'; },
  // Must be called directly from a tap: MAX only downloads HTTPS files after a user click.
  async downloadFile(url: string, fileName: string) {
    const parsed = new URL(url, window.location.href);
    if (parsed.protocol !== 'https:') throw new Error('Файл можно скачать только по защищённой ссылке');
    await window.WebApp!.downloadFile!(parsed.href, fileName);
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
