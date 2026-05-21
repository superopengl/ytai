// Client-side PDF → image rasterization. Reads a File (a PDF), renders
// each page to an offscreen canvas, returns an array of decoded pages
// matching the same shape uploadDoc expects:
//
//   [{ dataUrl, width, height }, ...]
//
// Rasterization happens on the user's device — no backend changes, no
// poppler/ghostscript dependency. Output is PNG at a fixed render scale
// chosen to balance OCR readability with payload size.
//
// pdfjs + its worker are lazy-loaded via dynamic import so a session
// that never uploads a PDF doesn't pay the ~1.2MB worker download.

// 2.0 ≈ 200dpi at default 96dpi PDF sizing. Tight enough for OCR to read
// 9-pt text reliably; larger values blow up dataURL size without helping.
const RENDER_SCALE = 2.0;

let pdfjsPromise = null;
async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist');
      const { default: workerSrc } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

export default async function pdfToPages(file) {
  const pdfjs = await loadPdfjs();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      // White background — many PDFs have transparent page bg, which
      // would land as a black PNG after toDataURL.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport, canvas }).promise;
      const dataUrl = canvas.toDataURL('image/png');
      pages.push({ dataUrl, width: canvas.width, height: canvas.height });
      page.cleanup();
    }
  } finally {
    pdf.destroy();
  }
  return pages;
}
