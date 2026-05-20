import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Avatar, Button, Drawer, Menu, message, Splitter, Tabs, Tag, Typography } from 'antd';
import {
  BulbOutlined,
  CalculatorOutlined,
  EditOutlined,
  MenuOutlined,
  ReadOutlined,
  UserOutlined
} from '@ant-design/icons';
import PhotoCapture from '../components/PhotoCapture.jsx';
import AnnotationCanvas from '../components/AnnotationCanvas.jsx';
import ChatPanel from '../components/ChatPanel.jsx';
import SessionReportPanel from '../components/SessionReportPanel.jsx';
import TutorSessionsSider from '../components/TutorSessionsSider.jsx';
import authSession from '../lib/authSession.js';

export default function TutorPage() {
  const { sessionId: routeSessionId } = useParams();
  const navigate = useNavigate();
  const [imageUrl, setImageUrl] = useState(null);
  const [sessionId, setSessionId] = useState(routeSessionId ?? null);
  const [aiAnnotations, setAiAnnotations] = useState([]);
  const [creatingSession, setCreatingSession] = useState(false);
  const [rightTab, setRightTab] = useState('chat');
  const [subject, setSubject] = useState('math');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const currentUser = authSession().user;
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

  const onSessionDeleted = useCallback(
    (deletedId) => {
      if (deletedId === sessionId) navigate('/tutor', { replace: true });
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
    // Land on the most recent session if any exist. Only POST a brand-new
    // session when the user has none yet — otherwise hitting /tutor would
    // pile up empty sessions on every visit.
    (async () => {
      try {
        const listRes = await fetch('/api/tutor/sessions');
        if (!listRes.ok) throw new Error(`Sessions fetch failed (${listRes.status})`);
        const list = await listRes.json();
        if (cancelled) return;
        const top = Array.isArray(list.sessions) ? list.sessions[0] : null;
        if (top?.id) {
          navigate(`/tutor/${top.id}`, { replace: true });
          return;
        }
        const createRes = await fetch('/api/tutor/session', { method: 'POST' });
        if (!createRes.ok) throw new Error(`Could not start session (${createRes.status})`);
        const body = await createRes.json();
        if (cancelled) return;
        setSessionId(body.sessionId);
        navigate(`/tutor/${body.sessionId}`, { replace: true });
      } catch (err) {
        if (!cancelled) console.error(err);
      }
    })();
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
          alignItems: 'center',
          gap: 12
        }}
      >
        <Button
          type="text"
          size="large"
          icon={<MenuOutlined />}
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
        />
        <Typography.Title level={4} style={{ margin: 0 }}>
          YouTutorAI
        </Typography.Title>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {SUBJECTS.map((s) => {
            const active = subject === s.key;
            return (
              <Tag.CheckableTag
                key={s.key}
                checked={active}
                onChange={() => setSubject(s.key)}
                style={{
                  padding: '4px 14px',
                  fontSize: 14,
                  borderRadius: 16,
                  border: `1px solid ${active ? s.color : 'transparent'}`,
                  background: active ? s.color : s.tint,
                  color: active ? '#fff' : s.color
                }}
              >
                {active && <s.icon style={{ marginRight: 6 }} />}
                {s.label}
              </Tag.CheckableTag>
            );
          })}
        </div>
      </header>
      <Drawer
        placement="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={280}
        title="YouTutorAI"
        styles={{
          body: { padding: 0, display: 'flex', flexDirection: 'column' },
          footer: { padding: 16 }
        }}
        footer={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar
              src={currentUser?.picture || undefined}
              icon={<UserOutlined />}
              style={{ backgroundColor: '#5b8def' }}
            />
            <Typography.Text strong>{currentUser?.name || 'Guest'}</Typography.Text>
          </div>
        }
      >
        <Menu
          mode="inline"
          selectable={false}
          style={{ border: 'none', flex: 1 }}
          onClick={({ key }) => {
            setDrawerOpen(false);
            navigate(key);
          }}
          items={[
            { key: '/', label: 'Home' },
            { key: '/tutor', label: 'Tutor' },
            { key: '/progress', label: 'My Progress' },
            { key: '/admin', label: 'Admin' },
            { type: 'divider' },
            { key: '/privacy_policy', label: 'Privacy Policy' },
            { key: '/terms_of_use', label: 'Terms of Use' }
          ]}
        />
      </Drawer>
      {subject !== 'math' ? (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#fff',
            color: '#8c8c9a'
          }}
        >
          Coming soon
        </div>
      ) : (
      <Splitter
        className="ytai-sider-splitter"
        style={{ flex: 1, minHeight: 0, background: '#fff' }}
      >
        <Splitter.Panel
          defaultSize={260}
          min={180}
          max="40%"
          collapsible={{ start: true, end: true, showCollapsibleIcon: true }}
        >
          <TutorSessionsSider
            currentSessionId={sessionId}
            onSelect={onSelectSession}
            onNewSession={onNewSession}
            onSessionDeleted={onSessionDeleted}
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
                  padding: 4,
                  // paddingTop: 12,
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
                    label: 'Analysis Report',
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
      )}
    </div>
  );
}

const SUBJECTS = [
  { key: 'math', label: 'Math', color: '#5b8def', tint: '#eef3ff', icon: CalculatorOutlined },
  { key: 'thinking', label: 'Thinking Skill', color: '#9254de', tint: '#f4ecff', icon: BulbOutlined },
  { key: 'reading', label: 'Reading', color: '#22a06b', tint: '#e6f7ee', icon: ReadOutlined },
  { key: 'writing', label: 'Writing', color: '#fa8c16', tint: '#fff3e6', icon: EditOutlined }
];
