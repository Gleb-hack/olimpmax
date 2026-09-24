// iOS ignores user-scalable=no, so pinch zoom is also blocked here.
// Double-tap zoom is disabled by `touch-action: pan-x pan-y` in the shared styles.
export function preventZoom() {
  const block = (event: Event) => { if (event.cancelable) event.preventDefault(); };
  // Safari-only gesture events fire for pinch; cancelling them stops the zoom.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, block, { passive: false });
  document.addEventListener('touchmove', event => { if (event.touches.length > 1) block(event); }, { passive: false });
}
