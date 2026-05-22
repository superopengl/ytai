import { useCallback, useEffect, useMemo, useState } from 'react';
import { Typography } from 'antd';
import AnnotationCanvas from './AnnotationCanvas.jsx';
import AuthedImage from './AuthedImage.jsx';
import useAuthedImageUrl from '../hooks/useAuthedImageUrl.js';
import { palette } from '../theme.js';

const ACCENT_BLUE = palette.subjects.math.color;
// Bright orange dot used to flag pages that already have AI annotations.
// Reuses the writing-subject color since it reads as "attention" without
// being alarming.
const ATTENTION_DOT = palette.subjects.writing.color;

// Wraps AnnotationCanvas with multi-page support: a horizontal page strip
// at the bottom, per-page stroke state, and per-page routing for AI
// annotations. The active page is what the canvas above shows.
//
// Props:
//   doc:                  { id, pages: [{ id, pageNumber, width, height }] }
//   sessionId:            for /api/tutor/:sessionId/image/:imageId URLs
//   currentPage:          1-based page number to show
//   onCurrentPageChange:  (page) => void
//   aiAnnotationsByPage:  Map<imageId, Array<{id, args}>>
//   onClearPageAi:        (imageId) => void
export default function PagedCanvas({
  doc,
  sessionId,
  currentPage,
  onCurrentPageChange,
  aiAnnotationsByPage,
  onClearPageAi
}) {
  // Per-page strokes live here so switching pages doesn't lose work. The
  // map is keyed by sessionImage.id which is stable across the session.
  const [linesByImage, setLinesByImage] = useState(new Map());

  // When the doc changes (user switched to a different doc), clear the
  // stroke map — those strokes belong to the previous doc.
  useEffect(() => {
    setLinesByImage(new Map());
  }, [doc?.id]);

  const pages = doc?.pages ?? [];
  const activePage = useMemo(
    () => pages.find((p) => p.pageNumber === currentPage) ?? pages[0] ?? null,
    [pages, currentPage]
  );

  const activeImageId = activePage?.id ?? null;
  const activeLines = activeImageId ? linesByImage.get(activeImageId) ?? [] : [];
  const activeAi = activeImageId ? aiAnnotationsByPage?.get(activeImageId) ?? [] : [];

  const setActiveLines = useCallback(
    (next) => {
      if (!activeImageId) return;
      setLinesByImage((prev) => {
        const map = new Map(prev);
        map.set(activeImageId, typeof next === 'function' ? next(map.get(activeImageId) ?? []) : next);
        return map;
      });
    },
    [activeImageId]
  );

  const clearActiveAi = useCallback(() => {
    if (activeImageId && onClearPageAi) onClearPageAi(activeImageId);
  }, [activeImageId, onClearPageAi]);

  if (!activePage) {
    return (
      <div style={{ ...emptyHint, padding: 32 }}>
        <Typography.Text type="secondary">This doc has no pages.</Typography.Text>
      </div>
    );
  }

  const imageUrl = `/api/tutor/${sessionId}/image/${activePage.id}`;
  // Konva calls `new Image().src = imageUrl` — that bypasses fetch and
  // can't send the Authorization header — so resolve the protected URL
  // to a blob: URL the browser can load directly.
  const canvasImageUrl = useAuthedImageUrl(imageUrl);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <AnnotationCanvas
          imageUrl={canvasImageUrl}
          lines={activeLines}
          onLinesChange={setActiveLines}
          aiAnnotations={activeAi}
          onClearAiAnnotations={activeAi.length > 0 ? clearActiveAi : null}
        />
      </div>
      {pages.length > 1 && (
        <PageStrip
          pages={pages}
          activePageNumber={activePage.pageNumber}
          sessionId={sessionId}
          aiAnnotationsByPage={aiAnnotationsByPage}
          onSelect={(n) => onCurrentPageChange?.(n)}
        />
      )}
    </div>
  );
}

function PageStrip({ pages, activePageNumber, sessionId, aiAnnotationsByPage, onSelect }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        padding: '8px 4px 4px',
        overflowX: 'auto',
        borderTop: `1px solid ${palette.borderSoft}`,
        marginTop: 6,
        alignItems: 'center',
        flexShrink: 0
      }}
    >
      {pages.map((page) => {
        const active = page.pageNumber === activePageNumber;
        const hasAi = (aiAnnotationsByPage?.get(page.id)?.length ?? 0) > 0;
        return (
          <button
            key={page.id}
            type="button"
            onClick={() => onSelect(page.pageNumber)}
            style={{
              position: 'relative',
              flex: '0 0 auto',
              width: 72,
              height: 88,
              padding: 0,
              border: `2px solid ${active ? ACCENT_BLUE : palette.borderSoft}`,
              borderRadius: 8,
              background: palette.surface,
              cursor: 'pointer',
              boxShadow: active ? `0 2px 8px ${ACCENT_BLUE}40` : 'none'
            }}
            aria-label={`Page ${page.pageNumber}${active ? ' (current)' : ''}`}
          >
            <AuthedImage
              src={`/api/tutor/${sessionId}/image/${page.id}`}
              alt={`page ${page.pageNumber}`}
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4, display: 'block' }}
            />
            <span
              style={{
                position: 'absolute',
                left: 4,
                bottom: 4,
                background: palette.overlay.scrim,
                color: palette.surface,
                padding: '1px 5px',
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 600
              }}
            >
              {page.pageNumber}
            </span>
            {hasAi && !active && (
              <span
                title="Tutor marked something on this page"
                style={{
                  position: 'absolute',
                  right: 4,
                  top: 4,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: ATTENTION_DOT,
                  boxShadow: `0 0 0 2px ${palette.surface}`
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

const emptyHint = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: palette.textHint
};
