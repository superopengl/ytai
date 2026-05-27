import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, ConfigProvider, Empty, message, Popconfirm, Spin, theme, Typography, Space } from 'antd';
import { DeleteOutlined, FileAddOutlined, LoadingOutlined, PlusOutlined } from '@ant-design/icons';
import apiFetch from '../lib/apiFetch.js';
import { palette } from '../theme.js';

const SIDER_BG = palette.sider.bg;
const SIDER_BORDER = palette.sider.border;
const TEXT_PRIMARY = palette.sider.textPrimary;
const TEXT_MUTED = palette.sider.textMuted;
const ACTIVE_BG = palette.sider.activeBg;
const ACCENT = palette.sider.accent;

export default function TutorSessionsSider({
  currentSessionId,
  subject,
  onSelect,
  onNewSession,
  onSessionDeleted,
  creatingSession
}) {
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/tutor/sessions');
      if (!res.ok) throw new Error("Couldn't load your sessions");
      const body = await res.json();
      setSessions(Array.isArray(body.sessions) ? body.sessions : []);
      setError(null);
    } catch (err) {
      setError(err.message || "Couldn't load your sessions.");
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, currentSessionId]);

  const handleDelete = useCallback(
    async (sessionId) => {
      setDeletingId(sessionId);
      try {
        const res = await apiFetch(`/api/tutor/${sessionId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error("Couldn't delete that session");
        setSessions((prev) => (prev ? prev.filter((s) => s.id !== sessionId) : prev));
        onSessionDeleted?.(sessionId);
      } catch (err) {
        message.error(err.message || "Couldn't delete that session");
      } finally {
        setDeletingId(null);
      }
    },
    [onSessionDeleted]
  );

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      <div style={containerStyle}>
        <style>{ROW_CSS}</style>
        {onNewSession ? (
          <div style={actionStyle}>
            <Button
              // ghost
              // type="primary"
              color="green"
              variant="solid"
              block
              icon={<FileAddOutlined />}
              onClick={onNewSession}
              loading={creatingSession}
            >
              New Session
            </Button>
          </div>
        ) : null}
        <div style={scrollStyle}>
          {sessions === null ? (
            <div style={centeredHint}>
              <Spin indicator={<LoadingOutlined spin />} size="small" />
            </div>
          ) : error ? (
            <Alert type="warning" showIcon message={error} style={{ margin: 12 }} />
          ) : (() => {
            const visible = subject ? sessions.filter((s) => s.subject === subject) : sessions;
            if (visible.length === 0) {
              return null;
            }
            return visible.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                active={s.id === currentSessionId}
                deleting={deletingId === s.id}
                onSelect={onSelect}
                onDelete={handleDelete}
              />
            ));
          })()}
        </div>
      </div>
    </ConfigProvider>
  );
}

function SessionRow({ session, active, deleting, onSelect, onDelete }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const title = previewLabel(session);
  const when = formatRelative(session.lastActivityAt);
  const alwaysShow = confirmOpen || deleting;
  return (
    <div
      className={`ytai-session-row ${alwaysShow ? 'show-delete' : ''}`}
      style={{
        ...rowStyle,
        position: 'relative',
        background: active ? ACTIVE_BG : 'transparent',
        borderLeft: active ? `3px solid ${ACCENT}` : '3px solid transparent'
      }}
      onClick={() => onSelect?.(session.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect?.(session.id);
        }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={rowTitleStyle}>{title}</div>
          <div style={rowMetaStyle}>{when}</div>
        </div>
        <span className="ytai-session-row-delete" onClick={(e) => e.stopPropagation()}>
          <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm }}>
            <Popconfirm
              title="Delete this session?"
              description="This permanently removes the chat, images, and any reports. You can't undo it."
              okText="Delete"
              okButtonProps={{ danger: true, loading: deleting }}
              cancelText="Cancel"
              open={confirmOpen}
              onOpenChange={(o) => setConfirmOpen(o)}
              onConfirm={(e) => {
                e?.stopPropagation?.();
                onDelete?.(session.id);
              }}
              onCancel={(e) => e?.stopPropagation?.()}
            >
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined style={{ color: TEXT_MUTED }} />}
                loading={deleting}
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmOpen(true);
                }}
                aria-label="Delete session"
              />
            </Popconfirm>
          </ConfigProvider>
        </span>
      </div>
    </div>
  );
}

function previewLabel(session) {
  const raw = typeof session.preview === 'string' ? session.preview.trim() : '';
  if (!raw) return 'New Session';
  // Single-line preview — strip newlines so they don't break the row.
  const flat = raw.replace(/\s+/g, ' ');
  return flat.length > 60 ? `${flat.slice(0, 57)}…` : flat;
}

function formatRelative(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString();
}

const containerStyle = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  background: SIDER_BG,
  color: TEXT_PRIMARY
};
const headerStyle = {
  padding: '8px 12px',
  borderBottom: `1px solid ${SIDER_BORDER}`,
  display: 'flex',
  alignItems: 'center',
  gap: 8
};
const actionStyle = {
  padding: '12px',
  // borderBottom: `1px solid ${SIDER_BORDER}`
};
const scrollStyle = {
  flex: 1,
  overflowY: 'auto',
  minHeight: 0,
  padding: '0 0 4px'
};
const centeredHint = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24
};
const rowStyle = {
  display: 'block',
  textAlign: 'left',
  padding: '10px 13px',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  color: 'inherit'
};
const rowTitleStyle = {
  fontSize: 13,
  fontWeight: 500,
  color: 'rgba(255, 255, 255, 0.95)',
  lineHeight: 1.35,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
};
const rowMetaStyle = {
  fontSize: 11,
  color: 'rgba(255, 255, 255, 0.65)',
  marginTop: 2
};

const ROW_CSS = `
.ytai-session-row {
  outline: none;
}
.ytai-session-row-delete {
  flex: 0 0 auto;
  opacity: 0;
  transition: opacity 120ms ease;
}
.ytai-session-row:hover .ytai-session-row-delete,
.ytai-session-row:focus-within .ytai-session-row-delete,
.ytai-session-row.show-delete .ytai-session-row-delete {
  opacity: 1;
}
.ytai-session-row-delete:hover .anticon-delete {
  color: ${palette.sider.danger} !important;
}
`;
