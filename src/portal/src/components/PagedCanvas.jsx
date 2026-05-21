import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Tooltip, Typography, Upload, message as antMessage } from 'antd';
import { CameraOutlined, PlusOutlined } from '@ant-design/icons';
import AnnotationCanvas from './AnnotationCanvas.jsx';

// Wraps AnnotationCanvas with multi-page support: a horizontal page strip
// at the top, per-page stroke state, and per-page routing for AI
// annotations. The active page is what the canvas below shows.
//
// Props:
//   doc:                  { id, pages: [{ id, pageNumber, width, height }] }
//   sessionId:            for /api/tutor/:sessionId/image/:imageId URLs
//   currentPage:          1-based page number to show
//   onCurrentPageChange:  (page) => void
//   aiAnnotationsByPage:  Map<imageId, Array<{id, args}>>
//   onClearPageAi:        (imageId) => void
//   onAppendPage:         (File) => Promise (parent uploads, returns when done)
export default function PagedCanvas({
  doc,
  sessionId,
  currentPage,
  onCurrentPageChange,
  aiAnnotationsByPage,
  onClearPageAi,
  onAppendPage
}) {
  // Per-page strokes live here so switching pages doesn't lose work. The
  // map is keyed by sessionImage.id which is stable across the session.
  const [linesByImage, setLinesByImage] = useState(new Map());
  const [appending, setAppending] = useState(false);

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

  const handleAppend = useCallback(
    async (file) => {
      if (!file || !onAppendPage) return false;
      setAppending(true);
      try {
        const newPageNumber = await onAppendPage(file);
        if (Number.isInteger(newPageNumber)) onCurrentPageChange?.(newPageNumber);
      } catch (err) {
        antMessage.error(err.message || 'Could not add page');
      } finally {
        setAppending(false);
      }
      return false; // prevent antd Upload's default xhr
    },
    [onAppendPage, onCurrentPageChange]
  );

  if (!activePage) {
    return (
      <div style={{ ...emptyHint, padding: 32 }}>
        <Typography.Text type="secondary">This doc has no pages.</Typography.Text>
      </div>
    );
  }

  const imageUrl = `/api/tutor/${sessionId}/image/${activePage.id}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {pages.length > 1 && (
        <PageStrip
          pages={pages}
          activePageNumber={activePage.pageNumber}
          sessionId={sessionId}
          aiAnnotationsByPage={aiAnnotationsByPage}
          onSelect={(n) => onCurrentPageChange?.(n)}
          onAppendPage={onAppendPage ? handleAppend : null}
          appending={appending}
        />
      )}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <AnnotationCanvas
          imageUrl={imageUrl}
          lines={activeLines}
          onLinesChange={setActiveLines}
          aiAnnotations={activeAi}
          onClearAiAnnotations={activeAi.length > 0 ? clearActiveAi : null}
          toolbarExtras={
            pages.length === 1 && onAppendPage ? (
              <SinglePageAppendButton onAppend={handleAppend} appending={appending} />
            ) : null
          }
        />
      </div>
    </div>
  );
}

function PageStrip({
  pages,
  activePageNumber,
  sessionId,
  aiAnnotationsByPage,
  onSelect,
  onAppendPage,
  appending
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        padding: '4px 4px 8px',
        overflowX: 'auto',
        borderBottom: '1px solid #ececf3',
        marginBottom: 6,
        alignItems: 'center'
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
              border: active ? '2px solid #5b8def' : '2px solid #ececf3',
              borderRadius: 8,
              background: '#fff',
              cursor: 'pointer',
              boxShadow: active ? '0 2px 8px rgba(91, 141, 239, 0.25)' : 'none'
            }}
            aria-label={`Page ${page.pageNumber}${active ? ' (current)' : ''}`}
          >
            <img
              src={`/api/tutor/${sessionId}/image/${page.id}`}
              alt={`page ${page.pageNumber}`}
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4, display: 'block' }}
            />
            <span
              style={{
                position: 'absolute',
                left: 4,
                bottom: 4,
                background: 'rgba(15, 19, 32, 0.78)',
                color: '#fff',
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
                  background: '#fa8c16',
                  boxShadow: '0 0 0 2px #fff'
                }}
              />
            )}
          </button>
        );
      })}
      {onAppendPage && (
        <Tooltip title="Add another page to this worksheet">
          <Upload
            beforeUpload={onAppendPage}
            accept="image/*"
            maxCount={1}
            showUploadList={false}
            disabled={appending}
          >
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              style={{ width: 72, height: 88, display: 'flex', flexDirection: 'column' }}
              loading={appending}
            >
              <span style={{ fontSize: 11 }}>Add page</span>
            </Button>
          </Upload>
        </Tooltip>
      )}
    </div>
  );
}

function SinglePageAppendButton({ onAppend, appending }) {
  return (
    <Tooltip title="Add another page (this worksheet has more than one page)">
      <Upload
        beforeUpload={onAppend}
        accept="image/*"
        maxCount={1}
        showUploadList={false}
        disabled={appending}
      >
        <Button icon={<CameraOutlined />} loading={appending}>
          Add page
        </Button>
      </Upload>
    </Tooltip>
  );
}

const emptyHint = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#5d6478'
};
