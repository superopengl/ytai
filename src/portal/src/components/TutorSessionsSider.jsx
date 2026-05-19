import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, ConfigProvider, Empty, Spin, theme, Typography } from 'antd';
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
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      <div style={containerStyle}>
        <div style={headerStyle}>
          <Typography.Text strong style={{ color: TEXT_PRIMARY }}>
            All Sessions
          </Typography.Text>
        </div>
        {onNewSession ? (
          <div style={actionStyle}>
            <Button
              ghost
              type="primary"
              block
              icon={<PlusOutlined />}
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
          ) : sessions.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={<span style={{ color: TEXT_MUTED }}>No sessions yet</span>}
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
    </ConfigProvider>
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
        background: active ? ACTIVE_BG : 'transparent',
        borderLeft: active ? `3px solid ${ACCENT}` : '3px solid transparent'
      }}
    >
      <div style={rowTitleStyle}>{title}</div>
      <div style={rowMetaStyle}>{when}</div>
    </button>
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

const SIDER_BG = '#1f2330';
const SIDER_BORDER = '#2d3344';
const TEXT_PRIMARY = '#e5e8f0';
const TEXT_MUTED = '#8b93a8';
const ACTIVE_BG = '#2a3148';
const ACCENT = '#5b8def';

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
  padding: '8px 12px',
  // borderBottom: `1px solid ${SIDER_BORDER}`
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
  fontFamily: 'inherit',
  color: 'inherit'
};
const rowTitleStyle = {
  fontSize: 13,
  color: TEXT_PRIMARY,
  lineHeight: 1.35,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
};
const rowMetaStyle = {
  fontSize: 11,
  color: TEXT_MUTED,
  marginTop: 2
};
