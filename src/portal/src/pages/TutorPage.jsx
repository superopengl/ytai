import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { message, Splitter, Tabs, Typography } from 'antd';
import PhotoCapture from '../components/PhotoCapture.jsx';
import AnnotationCanvas from '../components/AnnotationCanvas.jsx';
import ChatPanel from '../components/ChatPanel.jsx';
import SessionReportPanel from '../components/SessionReportPanel.jsx';
import TutorSessionsSider from '../components/TutorSessionsSider.jsx';

export default function TutorPage() {
  const { sessionId: routeSessionId } = useParams();
  const navigate = useNavigate();
  const [imageUrl, setImageUrl] = useState(null);
  const [sessionId, setSessionId] = useState(routeSessionId ?? null);
  const [aiAnnotations, setAiAnnotations] = useState([]);
  const [creatingSession, setCreatingSession] = useState(false);
  const [rightTab, setRightTab] = useState('chat');
  const canvasRef = useRef(null);

  const getCanvasImage = useCallback(() => canvasRef.current?.exportImage() ?? null, []);
  const clearAiAnnotations = useCallback(() => setAiAnnotations([]), []);

  // Switching sessions wipes the canvas first; ChatPanel re-hydrates it
  // with the session's current_image once history loads (if there is one),
  // so resuming a session restores the photo the student was last working on.
  useEffect(() => {
    setImageUrl((prev) => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return null;
    });
    setAiAnnotations([]);
  }, [sessionId]);

  const onSelectSession = useCallback(
    (id) => {
      if (!id || id === sessionId) return;
      navigate(`/tutor/${id}`);
    },
    [navigate, sessionId]
  );

  const onNewSession = useCallback(async () => {
    if (creatingSession) return;
    setCreatingSession(true);
    try {
      const res = await fetch('/api/tutor/session', { method: 'POST' });
      if (!res.ok) throw new Error(`Could not start session (${res.status})`);
      const body = await res.json();
      navigate(`/tutor/${body.sessionId}`);
    } catch (err) {
      message.error(err.message || 'Could not start a new session');
    } finally {
      setCreatingSession(false);
    }
  }, [creatingSession, navigate]);

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
      if (imageUrl && imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  function onSelectFile(file) {
    if (imageUrl && imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
    setImageUrl(URL.createObjectURL(file));
    setAiAnnotations([]);
  }

  function onReplace() {
    if (imageUrl && imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
    setImageUrl(null);
    setAiAnnotations([]);
  }

  // Load the photo from a chat image bubble back into the canvas so the
  // student can keep working on (or annotating) an earlier upload.
  function onCastImage(src) {
    if (!src || src === imageUrl) return;
    if (imageUrl && imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
    setImageUrl(src);
    setAiAnnotations([]);
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
      <Splitter 
      className="ytai-sider-splitter" style={{ flex: 1, minHeight: 0, background: '#fff' }}
      >
        <Splitter.Panel
          defaultSize={260}
          min={180}
          max="40%"
          collapsible
          collapsible={{ start: true, end: true, showCollapsibleIcon: true }}
        >
          <TutorSessionsSider
            currentSessionId={sessionId}
            onSelect={onSelectSession}
            onNewSession={onNewSession}
            creatingSession={creatingSession}
          />
        </Splitter.Panel>
        <Splitter.Panel>
          <Splitter style={{ height: '100%', minHeight: 0 }}>
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
                  <AnnotationCanvas
                    ref={canvasRef}
                    imageUrl={imageUrl}
                    onReplace={onReplace}
                    aiAnnotations={aiAnnotations}
                    onClearAiAnnotations={clearAiAnnotations}
                  />
                ) : (
                  <PhotoCapture onSelectFile={onSelectFile} />
                )}
              </div>
            </Splitter.Panel>
            <Splitter.Panel>
              <Tabs
                className="ytai-fill-tabs"
                activeKey={rightTab}
                onChange={setRightTab}
                destroyInactiveTabPane={false}
                tabBarStyle={{ padding: '0 16px', marginBottom: 0 }}
                items={[
                  {
                    key: 'chat',
                    label: 'Tutor Chat',
                    children: (
                      <ChatPanel
                        sessionId={sessionId}
                        imageUrl={imageUrl}
                        getImage={getCanvasImage}
                        onAiAnnotations={setAiAnnotations}
                        onCastImage={onCastImage}
                      />
                    )
                  },
                  {
                    key: 'report',
                    label: 'Report',
                    children: (
                      <SessionReportPanel sessionId={sessionId} active={rightTab === 'report'} />
                    )
                  }
                ]}
              />
            </Splitter.Panel>
          </Splitter>
        </Splitter.Panel>
      </Splitter>
    </div>
  );
}
