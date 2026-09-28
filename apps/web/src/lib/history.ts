/** True when the app itself opened the current page, so «back» can return through history (React Router keeps `idx`). */
export function canGoBack() {
  return (window.history.state?.idx ?? 0) > 0;
}
