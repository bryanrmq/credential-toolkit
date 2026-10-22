/** Whether shortcuts use ⌘ (macOS, iOS) rather than Ctrl (Windows, Linux). */
export function usesCommandKey(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
}
