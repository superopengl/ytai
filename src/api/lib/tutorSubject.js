export const SUBJECTS = Object.freeze(['math', 'thinking', 'reading', 'writing']);
export const DEFAULT_SUBJECT = 'math';

export default function isSubject(value) {
  return typeof value === 'string' && SUBJECTS.includes(value);
}
