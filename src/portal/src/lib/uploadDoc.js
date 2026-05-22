import apiFetch from './apiFetch.js';
import fileToDataUrl from './fileToDataUrl.js';
import pdfToPages from './pdfToPages.js';

// Expand a list of selected Files into the page-level shape the server
// expects: [{ dataUrl, width, height }, ...]. Images map 1:1 to pages;
// PDFs rasterize on-device into N pages each. Returns { pages, hadPdf }
// so callers can flag the doc as kind='pdf' when at least one source
// was a PDF.
export async function filesToPages(files) {
  const pages = [];
  let hadPdf = false;
  for (const file of files) {
    const isPdf =
      (file.type && file.type === 'application/pdf') ||
      (file.name && file.name.toLowerCase().endsWith('.pdf'));
    if (isPdf) {
      const rasterized = await pdfToPages(file);
      pages.push(...rasterized);
      hadPdf = true;
    } else {
      pages.push(await fileToDataUrl(file));
    }
  }
  return { pages, hadPdf };
}

// POST /api/tutor/:sessionId/doc with a list of File objects (images,
// PDFs, or a mix). PDFs are rasterized on the client into individual
// pages, so the server sees them as ordinary image-page rows.
export default async function uploadDoc(sessionId, files) {
  const { pages, hadPdf } = await filesToPages(files);
  if (pages.length === 0) {
    throw new Error('No images decoded from upload.');
  }
  const res = await apiFetch(`/api/tutor/${sessionId}/doc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images: pages, kind: hadPdf ? 'pdf' : 'images' })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Upload failed (${res.status})`);
  }
  return res.json();
}

