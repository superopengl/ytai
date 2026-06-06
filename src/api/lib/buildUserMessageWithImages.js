import loadImageDataUrl from './loadImageDataUrl.js';

// Build a multimodal OpenAI-compatible user `content` array for unified-vision
// mode. Brain (a multimodal model like Gemma 4) sees every page of the active
// doc directly in its user message — no separate Eyes/OCR call — so the
// content interleaves `Page N:` text labels with `image_url` blocks, then
// appends the student's own message last.
//
// When `annotatedByImageId` carries a per-turn freehand-canvas snapshot for a
// page, those bytes substitute for the original photo so Brain sees what the
// student circled/highlighted (same trick the legacy Eyes path used). Pages
// the student didn't draw on are loaded from storage as-is.
//
// Returns the content array on success, or null when no page bytes could be
// resolved (caller should fall back to a text-only message).
export default async function buildUserMessageWithImages({
  activeDoc,
  annotatedByImageId,
  text,
  log
}) {
  if (!activeDoc?.pages?.length) return null;

  const pageBlocks = await Promise.all(
    activeDoc.pages.map(async (page) => {
      const annotated = annotatedByImageId?.get?.(page.id) ?? null;
      let dataUrl;
      if (annotated) {
        const mime = annotated.mimeType || 'image/png';
        dataUrl = `data:${mime};base64,${annotated.bytes.toString('base64')}`;
      } else {
        dataUrl = await loadImageDataUrl(page.storageUrl);
      }
      if (!dataUrl) {
        log?.warn({ imageId: page.id, pageNumber: page.pageNumber }, 'unified-vision: page bytes unavailable');
        return null;
      }
      return {
        pageNumber: page.pageNumber,
        annotated: !!annotated,
        dataUrl
      };
    })
  );

  const resolved = pageBlocks.filter(Boolean);
  if (resolved.length === 0) return null;

  const totalPages = activeDoc.pages.length;
  const content = [];
  for (const block of resolved) {
    const label =
      totalPages === 1
        ? 'Worksheet:'
        : `Worksheet (page ${block.pageNumber} of ${totalPages}):`;
    const suffix = block.annotated ? ' — includes the student\'s freehand marks for this turn.' : '';
    content.push({ type: 'text', text: `${label}${suffix}` });
    content.push({ type: 'image_url', image_url: { url: block.dataUrl } });
  }
  content.push({ type: 'text', text });
  return content;
}
