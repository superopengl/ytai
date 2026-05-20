const TOKEN_KEY = 'ytai.auth.token';
const USER_KEY = 'ytai.auth.user';

// Small wrapper around localStorage so the rest of the app doesn't reach in
// directly. Returns null on the server / when storage is disabled.
export default function authSession() {
  const store = typeof window === 'undefined' ? null : window.localStorage;
  return {
    get token() {
      return store ? store.getItem(TOKEN_KEY) : null;
    },
    get user() {
      if (!store) return null;
      const raw = store.getItem(USER_KEY);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    save({ token, user }) {
      if (!store) return;
      store.setItem(TOKEN_KEY, token);
      store.setItem(USER_KEY, JSON.stringify(user));
    },
    clear() {
      if (!store) return;
      store.removeItem(TOKEN_KEY);
      store.removeItem(USER_KEY);
    }
  };
}
