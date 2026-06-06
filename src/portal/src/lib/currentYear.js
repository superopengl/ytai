const STORAGE_KEY = 'ytai.currentYear';
const DEFAULT_YEAR = 'Y3';
export const YEARS = ['Y3', 'Y4', 'Y5', 'Y6'];
const VALID = new Set(YEARS);

// Cross-page memory for the student's current year level (Y3..Y6). Mirrors
// currentSubject so navigating between pages keeps the selector sticky.
export default function currentYear() {
  const store = typeof window === 'undefined' ? null : window.localStorage;
  return {
    get value() {
      if (!store) return DEFAULT_YEAR;
      const raw = store.getItem(STORAGE_KEY);
      return VALID.has(raw) ? raw : DEFAULT_YEAR;
    },
    save(next) {
      if (!store || !VALID.has(next)) return;
      store.setItem(STORAGE_KEY, next);
    },
    clear() {
      if (!store) return;
      store.removeItem(STORAGE_KEY);
    }
  };
}
