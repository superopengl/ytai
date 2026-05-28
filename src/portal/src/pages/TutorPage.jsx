import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Avatar, Button, Drawer, Menu, message, Modal, Select, Splitter, Typography } from 'antd';
import { MenuOutlined, UserOutlined } from '@ant-design/icons';
import PagedCanvas from '../components/PagedCanvas.jsx';
import ChatPanel from '../components/ChatPanel.jsx';
import TutorSessionsSider from '../components/TutorSessionsSider.jsx';
import Logo from '../components/Logo.jsx';
import apiFetch from '../lib/apiFetch.js';
import authSession from '../lib/authSession.js';
import currentSubject from '../lib/currentSubject.js';
import SUBJECTS from '../lib/subjects.js';
import { palette } from '../theme.js';

export default function TutorPage() {
  const { sessionId: routeSessionId } = useParams();
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState(routeSessionId ?? null);
  const [docs, setDocs] = useState([]);
  const [currentDocId, setCurrentDocId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  // Map<imageId, Array<{id, args}>>
  const [aiAnnotationsByPage, setAiAnnotationsByPage] = useState(() => new Map());
  const [creatingSession, setCreatingSession] = useState(false);
  const [subject, setSubject] = useState(() => currentSubject().value);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const currentUser = authSession().user;
  const [modal, modalContextHolder] = Modal.useModal();
  // Imperative handle on the canvas so ChatPanel can pull a flattened PNG
  // of (photo + freehand strokes) at send time. Routed via a stable
  // callback so re-renders don't tear down the listener inside ChatPanel.
  const canvasRef = useRef(null);
  const getAnnotatedImage = useCallback(() => canvasRef.current?.flatten?.() ?? null, []);

  // Reset doc/canvas state when switching sessions; ChatPanel re-hydrates
  // via onDocsLoaded after its history fetch completes.
  useEffect(() => {
    setDocs([]);
    setCurrentDocId(null);
    setCurrentPage(1);
    setAiAnnotationsByPage(new Map());
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
      const res = await apiFetch('/api/tutor/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject })
      });
      if (!res.ok) throw new Error("Couldn't start a new session");
      const body = await res.json();
      navigate(`/tutor/${body.sessionId}`);
    } catch (err) {
      message.error(err.message || "Couldn't start a new session");
    } finally {
      setCreatingSession(false);
    }
  }, [creatingSession, navigate, subject]);

  const onSubjectChange = useCallback(
    (next) => {
      if (next === subject) return;
      setSubject(next);
      currentSubject().save(next);
      // Drop the current session from the URL so the effect below picks
      // (or creates) the top session for the newly-selected subject.
      navigate('/tutor', { replace: true });
    },
    [navigate, subject]
  );

  useEffect(() => {
    if (routeSessionId) {
      setSessionId(routeSessionId);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const listRes = await apiFetch('/api/tutor/sessions');
        if (!listRes.ok) throw new Error("Couldn't load your sessions");
        const list = await listRes.json();
        if (cancelled) return;
        const all = Array.isArray(list.sessions) ? list.sessions : [];
        const top = all.find((s) => s.subject === subject);
        if (top?.id) {
          navigate(`/tutor/${top.id}`, { replace: true });
          return;
        }
        const createRes = await apiFetch('/api/tutor/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject })
        });
        if (!createRes.ok) throw new Error("Couldn't start a new session");
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
  }, [routeSessionId, navigate, subject]);

  const handleDocsLoaded = useCallback(({ docs: loadedDocs, currentDocId: loadedCurrent, subject: loadedSubject, aiAnnotationsByPage: loadedAi }) => {
    setDocs(loadedDocs);
    setCurrentDocId(loadedCurrent);
    setCurrentPage(1);
    setAiAnnotationsByPage(loadedAi ?? new Map());
    // Keep the subject dropdown synced with whatever this session actually
    // is — opening a /tutor/:id URL for a non-math session should swap the
    // selector to match instead of misrepresenting the session. Persist
    // so the user lands back on the same subject elsewhere in the app.
    if (loadedSubject) {
      setSubject(loadedSubject);
      currentSubject().save(loadedSubject);
    }
  }, []);

  const handleDocCreated = useCallback((doc) => {
    setDocs((prev) => [...prev, doc]);
    setCurrentDocId(doc.id);
    setCurrentPage(1);
  }, []);

  const handleAiAnnotation = useCallback((annotation) => {
    const imageId = annotation.args?.imageId;
    if (!imageId) return;
    setAiAnnotationsByPage((prev) => {
      const map = new Map(prev);
      map.set(imageId, [...(map.get(imageId) ?? []), annotation]);
      return map;
    });
  }, []);

  const handleClearPageAi = useCallback((imageId) => {
    setAiAnnotationsByPage((prev) => {
      const map = new Map(prev);
      map.delete(imageId);
      return map;
    });
  }, []);

  const handleSelectDoc = useCallback(
    async (docId, pageNumber = 1) => {
      if (!sessionId || !docId || docId === currentDocId) {
        setCurrentPage(pageNumber);
        return;
      }
      // Optimistic: set local state immediately, then PATCH the session so
      // the server knows which doc the next Brain turn is scoped to.
      setCurrentDocId(docId);
      setCurrentPage(pageNumber);
      try {
        const res = await apiFetch(`/api/tutor/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentDocId: docId })
        });
        if (!res.ok) throw new Error("Couldn't switch worksheets");
      } catch (err) {
        message.error(err.message || "Couldn't switch worksheets");
      }
    },
    [sessionId, currentDocId]
  );

  const currentDoc = docs.find((d) => d.id === currentDocId) ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: palette.bgPanel }}>
      {modalContextHolder}
      <header
        style={{
          padding: '12px 24px 12px 12px',
          background: palette.surface,
          borderBottom: `1px solid ${palette.borderSoft}`,
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}
      >
        <Button
          type="default"
          icon={<MenuOutlined />}
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
        />
        <Logo height={24} />

        <div style={{ marginLeft: 'auto' }}>
          <Select
            value={subject}
            onChange={onSubjectChange}
            style={{ minWidth: 180 }}
            options={SUBJECTS.map((s) => {
              const Icon = s.icon;
              return {
                value: s.key,
                label: (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Icon style={{ color: s.color }} />
                    {s.label}
                  </span>
                )
              };
            })}
          />
        </div>
      </header>
      <Drawer
        placement="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        size={280}
        title="YouTutorAI"
        styles={{
          body: { padding: 0, display: 'flex', flexDirection: 'column' },
          footer: { padding: 16 }
        }}
        footer={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar
              src={
                currentUser?.picture
                  ? <img src={currentUser.picture} alt="" referrerPolicy="no-referrer" />
                  : undefined
              }
              icon={<UserOutlined />}
              style={{ backgroundColor: palette.subjects.math.color }}
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
            if (key === '/') return; // handled by the anchor below
            if (key === 'logout') {
              modal.confirm({
                title: 'Sign out?',
                content: "You'll be signed out of YouTutorAI.",
                okText: 'Sign out',
                okButtonProps: { danger: true },
                cancelText: 'Cancel',
                onOk: () => {
                  setDrawerOpen(false);
                  authSession().clear();
                  navigate('/');
                }
              });
              return;
            }
            setDrawerOpen(false);
            navigate(key);
          }}
          items={[
            {
              key: '/',
              label: (
                <a
                  href="/"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setDrawerOpen(false)}
                  style={{ display: 'block', color: 'inherit' }}
                >
                  Home
                </a>
              )
            },
            { key: '/tutor', label: 'Tutor Sessions' },
            { key: '/reports', label: 'Analysis Reports' },
            { type: 'divider' },
            {
              key: 'logout',
              label: <span style={{ color: palette.error }}>Sign out</span>
            }
          ]}
        />
      </Drawer>
      <Splitter
        className="ytai-sider-splitter"
        style={{ flex: 1, minHeight: 0, background: palette.surface }}
      >
        <Splitter.Panel
          defaultSize={260}
          min={180}
          max="40%"
          collapsible={{ start: true, end: true, showCollapsibleIcon: true }}
        >
          <TutorSessionsSider
            currentSessionId={sessionId}
            subject={subject}
            onSelect={onSelectSession}
            onNewSession={onNewSession}
            creatingSession={creatingSession}
          />
        </Splitter.Panel>
        <Splitter.Panel>
          <Splitter style={{ height: '100%', minHeight: 0 }}>
            {currentDoc && (
              <Splitter.Panel key="canvas" defaultSize="58%" min="30%" max="80%">
                <div
                  style={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: 4,
                    boxSizing: 'border-box'
                  }}
                >
                  <PagedCanvas
                    ref={canvasRef}
                    doc={currentDoc}
                    sessionId={sessionId}
                    currentPage={currentPage}
                    onCurrentPageChange={setCurrentPage}
                    aiAnnotationsByPage={aiAnnotationsByPage}
                    onClearPageAi={handleClearPageAi}
                  />
                </div>
              </Splitter.Panel>
            )}
            <Splitter.Panel key="chat">
              <ChatPanel
                sessionId={sessionId}
                currentDocId={currentDocId}
                currentPage={currentPage}
                docs={docs}
                onDocsLoaded={handleDocsLoaded}
                onDocCreated={handleDocCreated}
                onAiAnnotation={handleAiAnnotation}
                onSelectDoc={handleSelectDoc}
                onSessionDeleted={onSessionDeleted}
                getAnnotatedImage={getAnnotatedImage}
              />
            </Splitter.Panel>
          </Splitter>
        </Splitter.Panel>
      </Splitter>
    </div>
  );
}

