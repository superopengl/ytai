import fileToDataUrl from './fileToDataUrl.js';

// POST /api/tutor/:sessionId/doc with a list of File objects (in page
// order). Returns the server's { doc } payload — the new doc with all
// pages, ready to drop into local state.
export default async function uploadDoc(sessionId, files) {
  const images = [];
  for (const file of files) {
    const decoded = await fileToDataUrl(file);
    images.push(decoded);
  }
  const res = await fetch(`/api/tutor/${sessionId}/doc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Upload failed (${res.status})`);
  }
  return res.json();
}

// POST /api/tutor/:sessionId/doc/:docId/page with one File. Returns
// { page: { id, pageNumber, width, height } }.
export async function appendDocPage(sessionId, docId, file) {
  const image = await fileToDataUrl(file);
  const res = await fetch(`/api/tutor/${sessionId}/doc/${docId}/page`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Append page failed (${res.status})`);
  }
  return res.json();
}
