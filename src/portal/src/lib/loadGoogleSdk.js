const SRC = 'https://accounts.google.com/gsi/client';
let promise = null;

// Single-flight loader for the Google Identity Services script. Kept out
// of index.html so the ~95 KB script doesn't ride the critical path —
// callers fire this on user intent (hover/focus/click on a sign-in
// button), so visitors who never aim at sign-in never pay the bytes.
export default function loadGoogleSdk() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  if (promise) return promise;

  promise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SRC}"]`);
    const tag = existing || Object.assign(document.createElement('script'), {
      src: SRC,
      async: true,
      defer: true
    });
    tag.addEventListener('load', () => {
      const start = Date.now();
      const tick = () => {
        if (window.google?.accounts?.oauth2) return resolve(window.google);
        if (Date.now() - start > 4000) return reject(new Error('Google SDK ready timeout'));
        setTimeout(tick, 60);
      };
      tick();
    });
    tag.addEventListener('error', () => reject(new Error('Google SDK failed to load')));
    if (!existing) document.head.appendChild(tag);
  });

  return promise;
}
