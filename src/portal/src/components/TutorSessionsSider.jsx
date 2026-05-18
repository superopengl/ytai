import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Empty, Spin, Typography } from 'antd';
import { LoadingOutlined, PlusOutlined } from '@ant-design/icons';

export default function TutorSessionsSider({
  currentSessionId,
  onSelect,
  onNewSession,
  creatingSession
}) {
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tutor/sessions');
      if (!res.ok) throw new Error(`Sessions fetch failed (${res.status})`);
      const body = await res.json();
      setSessions(Array.isArray(body.sessions) ? body.sessions : []);
      setError(null);
    } catch (err) {
      setError(err.message || 'Could not load sessions.');
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, currentSessionId]);

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <Typography.Text strong>Your sessions</Typography.Text>
      </div>
      {onNewSession ? (
        <div style={actionStyle}>
          <Button
            block
            icon={<PlusOutlined />}
            onClick={onNewSession}
            loading={creatingSession}
          >
            New session
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
        ) : sessions.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No sessions yet"
            style={{ marginTop: 24 }}
          />
        ) : (
          sessions.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              active={s.id === currentSessionId}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}

function SessionRow({ session, active, onSelect }) {
  const title = previewLabel(session);
  const when = formatRelative(session.lastActivityAt);
  return (
    <button
      type="button"
      onClick={() => onSelect?.(session.id)}
      style={{
        ...rowStyle,
        background: active ? '#eef2ff' : 'transparent',
        borderLeft: active ? '3px solid #5b8def' : '3px solid transparent'
      }}
    >
      <div style={rowTitleStyle}>{title}</div>
      <div style={rowMetaStyle}>{when}</div>
    </button>
  );
}

function previewLabel(session) {
  const raw = typeof session.preview === 'string' ? session.preview.trim() : '';
  if (!raw) return 'New session';
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
  minHeight: 0
};
const headerStyle = {
  padding: '8px 12px',
  borderBottom: '1px solid #ececf3',
  display: 'flex',
  alignItems: 'center',
  gap: 8
};
const actionStyle = {
  padding: '8px 12px',
  borderBottom: '1px solid #ececf3'
};
const scrollStyle = {
  flex: 1,
  overflowY: 'auto',
  minHeight: 0,
  padding: '4px 0'
};
const centeredHint = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24
};
const rowStyle = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '10px 13px',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit'
};
const rowTitleStyle = {
  fontSize: 13,
  color: '#1d2233',
  lineHeight: 1.35,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
};
const rowMetaStyle = {
  fontSize: 11,
  color: '#5d6478',
  marginTop: 2
};
