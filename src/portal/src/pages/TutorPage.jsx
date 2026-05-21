import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Avatar, Button, Drawer, Menu, message, Splitter, Tabs, Tag, Typography } from 'antd';
import { MenuOutlined, UserOutlined } from '@ant-design/icons';
import PhotoCapture from '../components/PhotoCapture.jsx';
import PagedCanvas from '../components/PagedCanvas.jsx';
import ChatPanel from '../components/ChatPanel.jsx';
import SessionReportPanel from '../components/SessionReportPanel.jsx';
import TutorSessionsSider from '../components/TutorSessionsSider.jsx';
import authSession from '../lib/authSession.js';
import uploadDoc, { appendDocPage } from '../lib/uploadDoc.js';
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
  const [rightTab, setRightTab] = useState('chat');
  const [subject, setSubject] = useState('math');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const currentUser = authSession().user;

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

  const handleDocsLoaded = useCallback(({ docs: loadedDocs, currentDocId: loadedCurrent, aiAnnotationsByPage: loadedAi }) => {
    setDocs(loadedDocs);
    setCurrentDocId(loadedCurrent);
    setCurrentPage(1);
    setAiAnnotationsByPage(loadedAi ?? new Map());
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
        const res = await fetch(`/api/tutor/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentDocId: docId })
        });
        if (!res.ok) throw new Error(`Could not switch doc (${res.status})`);
      } catch (err) {
        message.error(err.message || 'Could not switch worksheet');
      }
    },
    [sessionId, currentDocId]
  );

  const handleAppendPage = useCallback(
    async (file) => {
      if (!sessionId || !currentDocId) return null;
      const { page } = await appendDocPage(sessionId, currentDocId, file);
      setDocs((prev) =>
        prev.map((d) =>
          d.id === currentDocId
            ? { ...d, pageCount: (d.pageCount ?? d.pages.length) + 1, pages: [...d.pages, page] }
            : d
        )
      );
      return page.pageNumber;
    },
    [sessionId, currentDocId]
  );

  const handlePhotoCaptureStart = useCallback(
    async (files) => {
      if (!sessionId || !files || files.length === 0) return;
      setUploading(true);
      try {
        const { doc } = await uploadDoc(sessionId, files);
        handleDocCreated(doc);
      } catch (err) {
        message.error(err.message || 'Upload failed');
      } finally {
        setUploading(false);
      }
    },
    [sessionId, handleDocCreated]
  );

  const currentDoc = docs.find((d) => d.id === currentDocId) ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: palette.bgPanel }}>
      <header
        style={{
          padding: '12px 24px',
          background: palette.surface,
          borderBottom: `1px solid ${palette.borderSoft}`,
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
                  color: active ? palette.surface : s.color
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
            background: palette.surface,
            color: palette.textDisabled
          }}
        >
          Coming soon
        </div>
      ) : (
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
                    boxSizing: 'border-box'
                  }}
                >
                  {currentDoc ? (
                    <PagedCanvas
                      doc={currentDoc}
                      sessionId={sessionId}
                      currentPage={currentPage}
                      onCurrentPageChange={setCurrentPage}
                      aiAnnotationsByPage={aiAnnotationsByPage}
                      onClearPageAi={handleClearPageAi}
                      onAppendPage={handleAppendPage}
                    />
                  ) : (
                    <PhotoCapture onStart={handlePhotoCaptureStart} busy={uploading} />
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
                          currentDocId={currentDocId}
                          currentPage={currentPage}
                          docs={docs}
                          onDocsLoaded={handleDocsLoaded}
                          onDocCreated={handleDocCreated}
                          onAiAnnotation={handleAiAnnotation}
                          onSelectDoc={handleSelectDoc}
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

