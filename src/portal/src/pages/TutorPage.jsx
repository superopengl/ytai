import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Avatar, Button, Drawer, Grid, Menu, message, Modal, Select, Splitter, Typography } from 'antd';
import { MenuOutlined, UserOutlined } from '@ant-design/icons';
import PagedCanvas from '../components/PagedCanvas.jsx';
import ChatPanel from '../components/ChatPanel.jsx';
import TutorSessionsSider from '../components/TutorSessionsSider.jsx';
import Logo from '../components/Logo.jsx';
import apiFetch from '../lib/apiFetch.js';
import authSession from '../lib/authSession.js';
import currentSubject from '../lib/currentSubject.js';
import currentYear, { YEARS } from '../lib/currentYear.js';
import SUBJECTS from '../lib/subjects.js';
import { palette } from '../theme.js';

// Width of the collapsed session sider — wide enough for the expand button +
// breathing room, narrow enough to disappear from peripheral vision.
const SIDER_COLLAPSED_WIDTH = 40;
const SIDER_DEFAULT_WIDTH = 260;
const SIDER_COLLAPSED_STORAGE_KEY = 'ytai.sider.collapsed';

function readSiderCollapsed() {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(SIDER_COLLAPSED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSiderCollapsed(value) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SIDER_COLLAPSED_STORAGE_KEY, value ? '1' : '0');
  } catch {
    // private mode etc. — silently ignore
  }
}

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
  const [year, setYear] = useState(() => currentYear().value);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [siderCollapsed, setSiderCollapsed] = useState(readSiderCollapsed);
  // Bumped on any change that the session sider's GET /api/tutor/sessions
  // wouldn't otherwise re-trigger (e.g. renaming the current session). The
  // sider re-runs its fetch whenever this counter changes.
  const [sidebarRefresh, setSidebarRefresh] = useState(0);
  // AntD breakpoint: !md => below 768px = phone/narrow tablet. On narrow
  // we replace the 3-pane Splitter (sider | canvas | chat) with a single
  // full-width ChatPanel + a thumbnail button that pops the canvas in a
  // Drawer, since three side-by-side panes can't share a phone viewport.
  const screens = Grid.useBreakpoint();
  const isNarrow = !screens.md;
  const [canvasDrawerOpen, setCanvasDrawerOpen] = useState(false);

  // Close the canvas drawer if the user resizes back to a wide viewport,
  // otherwise the open state strands across breakpoints and would re-open
  // unexpectedly next time the viewport narrows.
  useEffect(() => {
    if (!isNarrow) setCanvasDrawerOpen(false);
  }, [isNarrow]);

  const toggleSider = useCallback(() => {
    setSiderCollapsed((prev) => {
      const next = !prev;
      writeSiderCollapsed(next);
      return next;
    });
  }, []);
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

  const onSessionRenamed = useCallback(() => {
    setSidebarRefresh((n) => n + 1);
  }, []);

  const onNewSession = useCallback(async () => {
    if (creatingSession) return;
    setCreatingSession(true);
    try {
      const res = await apiFetch('/api/tutor/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, year })
      });
      if (!res.ok) throw new Error("Couldn't start a new session");
      const body = await res.json();
      navigate(`/tutor/${body.sessionId}`);
    } catch (err) {
      message.error(err.message || "Couldn't start a new session");
    } finally {
      setCreatingSession(false);
    }
  }, [creatingSession, navigate, subject, year]);

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

  const onYearChange = useCallback(
    (next) => {
      if (next === year) return;
      setYear(next);
      currentYear().save(next);
      // Persist to the server profile so the choice follows the user across
      // browsers, and patch the current session so its year reflects the
      // student's correction. Best-effort: the localStorage cache +
      // optimistic state update mean a network blip doesn't strand the UI.
      apiFetch('/api/me/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: next })
      }).catch((err) => {
        console.error('Failed to save year preference', err);
      });
      if (sessionId) {
        apiFetch(`/api/tutor/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year: next })
        }).catch((err) => {
          console.error('Failed to update session year', err);
        });
      }
    },
    [sessionId, year]
  );

  // Hydrate the year from the server profile on mount. localStorage primes
  // the initial render so the dropdown isn't blank during the fetch; if the
  // server has a different value, replace what we cached.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/me/profile');
        if (!res.ok) return;
        const body = await res.json();
        if (cancelled) return;
        if (body?.year) {
          setYear(body.year);
          currentYear().save(body.year);
        }
      } catch (err) {
        console.error('Failed to load profile', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
          body: JSON.stringify({ subject, year })
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
    // `year` is read as a snapshot when the effect runs — re-running on
    // every year flip would auto-create a new session each time, which
    // isn't what the user wants. onYearChange PATCHes the current session
    // instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSessionId, navigate, subject]);

  const handleDocsLoaded = useCallback(({ docs: loadedDocs, currentDocId: loadedCurrent, subject: loadedSubject, year: loadedYear, aiAnnotationsByPage: loadedAi }) => {
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
    // Year is per-session too — the kid may have done Y4 work back when
    // they were in Y4, even though they're now in Y5. Mirror the session's
    // year onto the selector so the header reads the session's truth.
    if (loadedYear) {
      setYear(loadedYear);
      currentYear().save(loadedYear);
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
      // On narrow screens the chat-bubble image IS the canvas affordance:
      // tapping it should pop the canvas drawer. Open it unconditionally
      // (even when the doc is already current) so re-tapping the same
      // worksheet brings the image back up after the drawer was dismissed.
      if (isNarrow) setCanvasDrawerOpen(true);
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
    [sessionId, currentDocId, isNarrow]
  );

  const currentDoc = docs.find((d) => d.id === currentDocId) ?? null;

  const chatPanel = (
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
      onSessionRenamed={onSessionRenamed}
      getAnnotatedImage={getAnnotatedImage}
    />
  );

  const pagedCanvas = currentDoc ? (
    <PagedCanvas
      ref={canvasRef}
      doc={currentDoc}
      sessionId={sessionId}
      currentPage={currentPage}
      onCurrentPageChange={setCurrentPage}
      aiAnnotationsByPage={aiAnnotationsByPage}
      onClearPageAi={handleClearPageAi}
    />
  ) : null;

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

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Select
            value={year}
            onChange={onYearChange}
            style={{ width: 84 }}
            aria-label="Year level"
            options={YEARS.map((y) => ({ value: y, label: y }))}
          />
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
          defaultSize={SIDER_DEFAULT_WIDTH}
          // On narrow viewports force the sider to the 40px-wide collapsed
          // rail so the chat gets the rest of the row. The user's saved
          // wide-screen preference is preserved for when they rotate back.
          size={isNarrow || siderCollapsed ? SIDER_COLLAPSED_WIDTH : undefined}
          min={isNarrow || siderCollapsed ? SIDER_COLLAPSED_WIDTH : 180}
          max="40%"
          resizable={!isNarrow && !siderCollapsed}
        >
          <TutorSessionsSider
            currentSessionId={sessionId}
            subject={subject}
            onSelect={onSelectSession}
            onNewSession={onNewSession}
            creatingSession={creatingSession}
            collapsed={isNarrow || siderCollapsed}
            onToggleCollapsed={isNarrow ? undefined : toggleSider}
            refreshKey={sidebarRefresh}
          />
        </Splitter.Panel>
        <Splitter.Panel>
          {isNarrow ? (
            <>
              {chatPanel}
              <Drawer
                placement="right"
                open={canvasDrawerOpen}
                onClose={() => setCanvasDrawerOpen(false)}
                width="100%"
                title="Worksheet"
                destroyOnClose={false}
                // Mount the canvas eagerly so canvasRef is wired before the
                // student opens the drawer — ChatPanel pulls a flattened PNG
                // via getAnnotatedImage on send, and that has to work even
                // when the drawer has never been opened this turn.
                forceRender
                styles={{
                  body: { padding: 8, display: 'flex', flexDirection: 'column' }
                }}
              >
                {pagedCanvas}
              </Drawer>
            </>
          ) : (
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
                    {pagedCanvas}
                  </div>
                </Splitter.Panel>
              )}
              <Splitter.Panel key="chat">{chatPanel}</Splitter.Panel>
            </Splitter>
          )}
        </Splitter.Panel>
      </Splitter>
    </div>
  );
}

