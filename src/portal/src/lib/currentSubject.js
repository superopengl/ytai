import SUBJECTS from './subjects.js';

const STORAGE_KEY = 'ytai.currentSubject';
const DEFAULT_SUBJECT = 'math';
const VALID = new Set(SUBJECTS.map((s) => s.key));

// Cross-page memory for the user's currently-selected subject. TutorPage
// and ReportsPage both read it on mount so navigating between them keeps
// the user in the same subject context, and both write to it whenever
// the user changes the selector. Plain localStorage — no React context
// needed since each page re-mounts on navigation.
export default function currentSubject() {
  const store = typeof window === 'undefined' ? null : window.localStorage;
  return {
    get value() {
      if (!store) return DEFAULT_SUBJECT;
      const raw = store.getItem(STORAGE_KEY);
      return VALID.has(raw) ? raw : DEFAULT_SUBJECT;
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
