import authSession from './authSession.js';

// Thin fetch wrapper that attaches the YTAI JWT from authSession() as a
// Bearer token on every call. Use this for any /api/* request that the
// backend protects (which is everything except /api/auth/* and /healthcheck).
// On 401 it clears local auth state and bounces the user to the homepage,
// so a stale token doesn't leave the app stuck staring at an error toast.
export default async function apiFetch(input, init = {}) {
  const session = authSession();
  const headers = new Headers(init.headers || {});
  const token = session.token;
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) {
    session.clear();
    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      window.location.assign('/');
    }
  }
  return res;
}

// Same idea, but returns just the headers object so callers that need to
// build a Request manually (streamed POST bodies, EventSource-ish flows)
// can splice the Authorization header in without going through apiFetch.
export function authHeaders(extra = {}) {
  const token = authSession().token;
  return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
}
