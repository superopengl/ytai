export default async function hashDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const buf = new TextEncoder().encode(dataUrl);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(digest);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}
