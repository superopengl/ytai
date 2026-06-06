import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Avatar, Button, Drawer, Grid, Menu, message, Modal, Radio, Select, Splitter, Typography } from 'antd';
import { MenuOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons';
import PagedCanvas from '../components/PagedCanvas.jsx';
import ChatPanel from '../components/ChatPanel.jsx';
import Logo from '../components/Logo.jsx';
import apiFetch from '../lib/apiFetch.js';
import authSession from '../lib/authSession.js';
import currentSubject from '../lib/currentSubject.js';
import currentYear, { YEARS } from '../lib/currentYear.js';
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
  const [year, setYear] = useState(() => currentYear().value);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // List of every session owned by the user, fed into the header Select
  // so the user can jump between sessions. Bumped via `sessionsRefresh`
  // when something the GET wouldn't otherwise re-trigger changes (rename,
  // delete). Null while the first fetch is in flight.
  const [sessions, setSessions] = useState(null);
  const [sessionsRefresh, setSessionsRefresh] = useState(0);
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

  // Fetch the session list once per (sessionId, sessionsRefresh) tick.
  // Re-fetching when sessionId changes catches new sessions created via
  // the New Session button; the refresh counter catches rename/delete.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/tutor/sessions');
        if (!res.ok) throw new Error("Couldn't load your sessions");
        const body = await res.json();
        if (cancelled) return;
        setSessions(Array.isArray(body.sessions) ? body.sessions : []);
      } catch (err) {
        if (!cancelled) console.error('Failed to load sessions', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, sessionsRefresh]);

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
      setSessionsRefresh((n) => n + 1);
      if (deletedId === sessionId) navigate('/tutor', { replace: true });
    },
    [navigate, sessionId]
  );

  const onSessionRenamed = useCallback(() => {
    // The session list's GET response carries the title, so a refresh is
    // enough to flow the new name into the header Select.
    setSessionsRefresh((n) => n + 1);
  }, []);

  // The "+ New Session" tab opens this modal; year + subject are chosen
  // inside it and only get committed when the user clicks Create. Defaults
  // come from the page-level state — which is hydrated from the user
  // profile + the most recently opened session — so the modal opens on
  // what the kid most likely wants without making them re-pick every time.
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [draftSubject, setDraftSubject] = useState(subject);
  const [draftYear, setDraftYear] = useState(year);

  const onNewSession = useCallback(() => {
    setDraftSubject(subject);
    setDraftYear(year);
    setNewSessionOpen(true);
  }, [subject, year]);

  const confirmNewSession = useCallback(async () => {
    if (creatingSession) return;
    setCreatingSession(true);
    try {
      const res = await apiFetch('/api/tutor/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: draftSubject, year: draftYear })
      });
      if (!res.ok) throw new Error("Couldn't start a new session");
      const body = await res.json();
      // Persist the picks as the new defaults for the next session. The
      // year also propagates back to the user profile so the choice
      // follows the kid across browsers.
      setSubject(draftSubject);
      currentSubject().save(draftSubject);
      setYear(draftYear);
      currentYear().save(draftYear);
      if (draftYear !== year) {
        apiFetch('/api/me/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year: draftYear })
        }).catch((err) => {
          console.error('Failed to save year preference', err);
        });
      }
      setNewSessionOpen(false);
      navigate(`/tutor/${body.sessionId}`);
    } catch (err) {
      message.error(err.message || "Couldn't start a new session");
    } finally {
      setCreatingSession(false);
    }
  }, [creatingSession, draftSubject, draftYear, navigate, year]);

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
    // `year` is read as a snapshot when the effect runs — it only
    // matters when this branch falls through to creating a fresh session
    // because the user has none yet, and re-running on every year change
    // would auto-create a new session each time. The "+ New Session"
    // modal is the explicit path for changing year/subject.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSessionId, navigate, subject]);

  const handleDocsLoaded = useCallback(({ docs: loadedDocs, currentDocId: loadedCurrent, subject: loadedSubject, year: loadedYear, aiAnnotationsByPage: loadedAi }) => {
    setDocs(loadedDocs);
    setCurrentDocId(loadedCurrent);
    setCurrentPage(1);
    setAiAnnotationsByPage(loadedAi ?? new Map());
    // Mirror the active session's subject + year back into the page-level
    // defaults so the New Session modal opens on what the kid most likely
    // wants. Persisted so it survives reloads.
    if (loadedSubject) {
      setSubject(loadedSubject);
      currentSubject().save(loadedSubject);
    }
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
      <NewSessionModal
        open={newSessionOpen}
        creating={creatingSession}
        year={draftYear}
        subject={draftSubject}
        onYearChange={setDraftYear}
        onSubjectChange={setDraftSubject}
        onConfirm={confirmNewSession}
        onCancel={() => setNewSessionOpen(false)}
      />
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
          type="text"
          icon={<MenuOutlined />}
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
        />
        <Logo height={24} />
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', minWidth: 0, padding: '0 12px' }}>
          <SessionSelect
            value={sessionId}
            sessions={sessions}
            onChange={onSelectSession}
          />
        </div>
        <Button
          type="text"
          icon={<PlusOutlined />}
          loading={creatingSession}
          onClick={onNewSession}
        />
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
      <div style={{ flex: 1, minHeight: 0, background: palette.surface }}>
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
        ) : currentDoc ? (
          <Splitter style={{ height: '100%', minHeight: 0 }}>
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
            <Splitter.Panel key="chat">{chatPanel}</Splitter.Panel>
          </Splitter>
        ) : (
          // No worksheet yet: skip the Splitter so the chat doesn't stretch
          // across an empty desktop. Cap at 500px and center, so the kid is
          // looking at a focused column instead of a wall of whitespace.
          <div style={{ height: '100%', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: '100%', maxWidth: 700, height: '100%' }}>
              {chatPanel}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NewSessionModal({
  open,
  creating,
  year,
  subject,
  onYearChange,
  onSubjectChange,
  onConfirm,
  onCancel
}) {
  return (
    <Modal
      open={open}
      title="Start a new tutoring session"
      okText="Create"
      cancelText="Cancel"
      confirmLoading={creating}
      onOk={onConfirm}
      onCancel={onCancel}
      destroyOnClose
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 8 }}>
        <div>
          <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
            Year level
          </Typography.Text>
          <Radio.Group
            value={year}
            onChange={(e) => onYearChange(e.target.value)}
            optionType="button"
            buttonStyle="solid"
          >
            {YEARS.map((y) => (
              <Radio.Button key={y} value={y}>
                {y}
              </Radio.Button>
            ))}
          </Radio.Group>
        </div>
        <div>
          <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
            Subject
          </Typography.Text>
          <Radio.Group
            value={subject}
            onChange={(e) => onSubjectChange(e.target.value)}
            optionType="button"
            buttonStyle="solid"
          >
            {SUBJECTS.map((s) => {
              const Icon = s.icon;
              const selected = subject === s.key;
              return (
                <Radio.Button key={s.key} value={s.key}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Icon style={{ color: selected ? '#fff' : s.color }} />
                    {s.label}
                  </span>
                </Radio.Button>
              );
            })}
          </Radio.Group>
        </div>
      </div>
    </Modal>
  );
}

// Centered session picker in the top nav. Trigger and dropdown items
// share the same three-row layout (year/subject chips → title →
// created time + "X ago") so a glance at the closed Select tells the
// user the same thing as picking from the list.
function SessionSelect({ value, sessions, onChange }) {
  const loading = sessions === null;
  const options = (sessions ?? []).map((s) => ({
    value: s.id,
    label: sessionDisplayTitle(s),
    session: s
  }));
  return (
    <Select
      className="ytai-session-select"
      value={value ?? undefined}
      onChange={(id) => onChange?.(id)}
      loading={loading}
      placeholder={loading ? 'Loading sessions…' : 'Pick a session'}
      style={{ width: '100%', maxWidth: 480 }}
      optionLabelProp="label"
      options={options}
      labelRender={({ value: id }) => {
        const s = (sessions ?? []).find((row) => row.id === id);
        if (!s) return null;
        return <SessionTriggerLabel session={s} />;
      }}
      optionRender={(option) => <SessionOptionContent session={option.data.session} />}
    />
  );
}

// Closed-trigger label: single row of [year chip] [subject chip] [title],
// so the Select sits at AntD's default 32px height and matches the
// "+ New Session" button beside it. The dropdown rows still use the
// richer two-line SessionOptionContent layout.
function SessionTriggerLabel({ session }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      {session.year ? <HeaderYearChip year={session.year} /> : null}
      {session.subject ? <HeaderSubjectChip subject={session.subject} /> : null}
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: palette.text,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0
        }}
      >
        {sessionDisplayTitle(session)}
      </span>
    </div>
  );
}

function SessionOptionContent({ session }) {
  const absolute = formatSessionDate(session.startedAt);
  const relative = formatSessionRelative(session.startedAt);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '4px 0', minWidth: 0 }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: palette.text,
          lineHeight: 1.3,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}
      >
        {sessionDisplayTitle(session)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
          {session.year ? <HeaderYearChip year={session.year} /> : null}
          {session.subject ? <HeaderSubjectChip subject={session.subject} /> : null}
        </div>
        {absolute ? (
          <div
            style={{
              marginLeft: 'auto',
              fontSize: 11,
              color: palette.textMuted,
              lineHeight: 1.3,
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            {absolute}
            {relative ? ` (${relative})` : ''}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function sessionDisplayTitle(session) {
  const title = typeof session?.title === 'string' ? session.title.trim() : '';
  if (title) return title.length > 80 ? `${title.slice(0, 77)}…` : title;
  const raw = typeof session?.preview === 'string' ? session.preview.trim() : '';
  if (!raw) return 'New Session';
  const flat = raw.replace(/\s+/g, ' ');
  return flat.length > 80 ? `${flat.slice(0, 77)}…` : flat;
}

function HeaderYearChip({ year }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0 5px',
        border: `1px solid ${palette.border}`,
        borderRadius: 999,
        background: palette.bgPanel,
        color: palette.text,
        fontSize: 9,
        fontWeight: 600,
        lineHeight: 1.4,
        whiteSpace: 'nowrap'
      }}
    >
      {year}
    </span>
  );
}

function HeaderSubjectChip({ subject }) {
  const meta = SUBJECTS.find((s) => s.key === subject);
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: '0 5px 0 4px',
        border: `1px solid ${meta.color}`,
        background: meta.tint,
        borderRadius: 999,
        color: palette.text,
        fontSize: 9,
        fontWeight: 600,
        lineHeight: 1.4,
        whiteSpace: 'nowrap'
      }}
    >
      <Icon style={{ color: meta.color, fontSize: 9 }} />
      {meta.label}
    </span>
  );
}

function formatSessionDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return '';
  }
}

function formatSessionRelative(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 45) return 'just now';
  if (secs < 90) return '1 minute ago';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  if (months === 1) return '1 month ago';
  if (months < 12) return `${months} months ago`;
  const years = Math.round(days / 365);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}
