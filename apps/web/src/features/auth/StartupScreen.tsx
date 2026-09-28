/** Matches the HTML shell so loading the bundle and restoring a session share one screen: a progress bar only. */
export function StartupScreen() {
  return <main className="startup-screen" aria-busy="true">
    <div className="startup-screen__progress" role="progressbar" aria-label="Загрузка приложения" /><p role="status">Загружаем…</p>
  </main>;
}
