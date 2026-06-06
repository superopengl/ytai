export const YEARS = Object.freeze(['Y3', 'Y4', 'Y5', 'Y6']);

export default function isYear(value) {
  return typeof value === 'string' && YEARS.includes(value);
}
