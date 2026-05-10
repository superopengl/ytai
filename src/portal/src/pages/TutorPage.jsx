import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Splitter, Typography } from 'antd';
import PhotoCapture from '../components/PhotoCapture.jsx';
import AnnotationCanvas from '../components/AnnotationCanvas.jsx';
import ChatPanel from '../components/ChatPanel.jsx';

export default function TutorPage() {
  const { sessionId: routeSessionId } = useParams();
  const navigate = useNavigate();
  const [imageUrl, setImageUrl] = useState(null);
  const [sessionId, setSessionId] = useState(routeSessionId ?? null);
  const canvasRef = useRef(null);

  const getCanvasImage = useCallback(() => canvasRef.current?.exportImage() ?? null, []);

  useEffect(() => {
    if (routeSessionId) {
      setSessionId(routeSessionId);
      return undefined;
    }
    let cancelled = false;
    fetch('/api/tutor/session', { method: 'POST' })
      .then((res) => {
        if (!res.ok) throw new Error(`Could not start session (${res.status})`);
        return res.json();
      })
      .then((body) => {
        if (cancelled) return;
        setSessionId(body.sessionId);
        navigate(`/tutor/${body.sessionId}`, { replace: true });
      })
      .catch((err) => {
        if (!cancelled) console.error(err);
      });
    return () => {
      cancelled = true;
    };
  }, [routeSessionId, navigate]);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  function onSelectFile(file) {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(URL.createObjectURL(file));
  }

  function onReplace() {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f7f8fc' }}>
      <header
        style={{
          padding: '12px 24px',
          background: '#fff',
          borderBottom: '1px solid #ececf3',
          display: 'flex',
          alignItems: 'center'
        }}
      >
        <Typography.Title level={4} style={{ margin: 0 }}>
          YouTutorAI
        </Typography.Title>
      </header>
      <Splitter style={{ flex: 1, minHeight: 0, background: '#fff' }}>
        <Splitter.Panel defaultSize="58%" min="30%" max="80%">
          <div
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              padding: 16,
              boxSizing: 'border-box'
            }}
          >
            {imageUrl ? (
              <AnnotationCanvas ref={canvasRef} imageUrl={imageUrl} onReplace={onReplace} />
            ) : (
              <PhotoCapture onSelectFile={onSelectFile} />
            )}
          </div>
        </Splitter.Panel>
        <Splitter.Panel>
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <ChatPanel sessionId={sessionId} getImage={getCanvasImage} />
          </div>
        </Splitter.Panel>
      </Splitter>
    </div>
  );
}
