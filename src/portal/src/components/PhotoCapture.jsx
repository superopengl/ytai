import { useRef, useState } from 'react';
import { Alert, Button, Space, Typography } from 'antd';
import {
  CameraOutlined,
  CloseOutlined,
  PlusOutlined,
  UploadOutlined
} from '@ant-design/icons';

// Initial-upload screen shown when a session has no doc yet. The student
// can:
//   - Take photos one-by-one with the camera (mobile capture)
//   - Pick one or many image files from disk
//   - Stack multiple pages in a queue before hitting "Send to tutor"
//
// Onstart() is called with a list of File objects in page order. The
// parent owns the upload (POST /api/tutor/:sessionId/doc) and the
// resulting state changes.
export default function PhotoCapture({ onStart, busy = false }) {
  const cameraRef = useRef(null);
  const uploadRef = useRef(null);
  const [pages, setPages] = useState([]); // [{ file, previewUrl }]
  const [error, setError] = useState(null);

  function addFiles(fileList) {
    const incoming = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (incoming.length === 0) return;
    setPages((prev) => [
      ...prev,
      ...incoming.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))
    ]);
  }

  function handleCamera(event) {
    addFiles(event.target.files);
    event.target.value = '';
  }
  function handleUpload(event) {
    addFiles(event.target.files);
    event.target.value = '';
  }
  function removePage(idx) {
    setPages((prev) => {
      const next = prev.slice();
      const [removed] = next.splice(idx, 1);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  }
  async function start() {
    if (pages.length === 0) return;
    setError(null);
    try {
      await onStart?.(pages.map((p) => p.file));
      for (const p of pages) URL.revokeObjectURL(p.previewUrl);
      setPages([]);
    } catch (err) {
      setError(err.message || 'Upload failed');
    }
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        padding: 32,
        textAlign: 'center'
      }}
    >
      <Typography.Title level={2} style={{ margin: 0 }}>
        Snap or upload your worksheet
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ maxWidth: 460, fontSize: 16, margin: 0 }}>
        I'll take a look at the page, find the questions, and we can work through anything
        you're stuck on together. Got more than one page? Add them all.
      </Typography.Paragraph>

      {pages.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            justifyContent: 'center',
            maxWidth: 720
          }}
        >
          {pages.map((p, idx) => (
            <PageThumb key={p.previewUrl} index={idx + 1} src={p.previewUrl} onRemove={() => removePage(idx)} />
          ))}
        </div>
      )}

      <Space size="large" wrap>
        <Button
          type={pages.length === 0 ? 'primary' : 'default'}
          size="large"
          icon={<CameraOutlined />}
          onClick={() => cameraRef.current?.click()}
          disabled={busy}
        >
          {pages.length === 0 ? 'Take Photo' : 'Take Another'}
        </Button>
        <Button
          size="large"
          icon={<UploadOutlined />}
          onClick={() => uploadRef.current?.click()}
          disabled={busy}
        >
          {pages.length === 0 ? 'Upload Image(s)' : 'Add More'}
        </Button>
        {pages.length > 0 && (
          <Button
            type="primary"
            size="large"
            icon={<PlusOutlined />}
            onClick={start}
            loading={busy}
          >
            Send {pages.length} page{pages.length === 1 ? '' : 's'} to tutor
          </Button>
        )}
      </Space>

      {error && (
        <Alert type="warning" showIcon message={error} style={{ maxWidth: 500 }} />
      )}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={handleCamera}
      />
      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={handleUpload}
      />
    </div>
  );
}

function PageThumb({ index, src, onRemove }) {
  return (
    <div
      style={{
        position: 'relative',
        width: 120,
        height: 150,
        borderRadius: 8,
        overflow: 'hidden',
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.12)',
        background: '#fff'
      }}
    >
      <img
        src={src}
        alt={`page ${index}`}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <div
        style={{
          position: 'absolute',
          left: 6,
          top: 6,
          background: 'rgba(15, 19, 32, 0.78)',
          color: '#fff',
          padding: '2px 6px',
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 600
        }}
      >
        {index}
      </div>
      <Button
        size="small"
        type="primary"
        danger
        shape="circle"
        icon={<CloseOutlined />}
        onClick={onRemove}
        style={{ position: 'absolute', right: 4, top: 4, width: 22, height: 22, minWidth: 22 }}
        aria-label={`Remove page ${index}`}
      />
    </div>
  );
}
