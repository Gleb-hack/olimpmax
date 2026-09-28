/** Matches the HTML shell so loading the bundle and restoring a session share one screen. */
export function StartupScreen() {
  return <main className="startup-screen" aria-busy="true">
    <img src="/main_logo_photo.jpg" width={1354} height={1798} alt="Олимп — твой проводник в мир олимпиад" />
    <div className="startup-screen__footer"><div className="startup-screen__progress" role="progressbar" aria-label="Загрузка приложения" /><p role="status">Загружаем…</p></div>
  </main>;
}
