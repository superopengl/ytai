import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  ConfigProvider,
  Space,
  Spin,
  Tabs,
  Tooltip,
  theme as antdTheme,
  Typography
} from 'antd';
import {
  FileAddOutlined,
  LoadingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined
} from '@ant-design/icons';
import apiFetch from '../lib/apiFetch.js';
import { palette } from '../theme.js';

export default function TutorSessionsSider({
  currentSessionId,
  subject,
  onSelect,
  onNewSession,
  creatingSession,
  collapsed = false,
  onToggleCollapsed,
  // Bumped by the parent (e.g. after a rename) to force a refetch even
  // when `currentSessionId` hasn't changed.
  refreshKey = 0
}) {
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState(null);

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
  }, [load, currentSessionId, refreshKey]);

  const visible = useMemo(() => {
    if (!sessions) return null;
    return subject ? sessions.filter((s) => s.subject === subject) : sessions;
  }, [sessions, subject]);

  const items = useMemo(() => {
    const tabs = [
      {
        key: 'new',
        label: (
          <Space
            size={8}
            align="center"
            className="ytai-new-report-label"
            style={{ '--ytai-new-report-color': palette.state.correct }}
          >
            {creatingSession ? <LoadingOutlined /> : <FileAddOutlined />}
            <Typography.Text strong>New Session</Typography.Text>
          </Space>
        )
      }
    ];
    if (visible) {
      for (const s of visible) {
        tabs.push({
          key: s.id,
          label: <SessionTabLabel session={s} />
        });
      }
    }
    return tabs;
  }, [visible, creatingSession]);

  const activeKey = currentSessionId ?? 'new';

  // Dark theme scoped to the sider only — same pattern as ReportsList so the
  // two dark surfaces in the app feel of a piece. darkAlgorithm recolors Tabs
  // internals automatically; the explicit `palette.sider.bg` sets the surface
  // behind the tab strip, and `cardBg: 'transparent'` lets the dark surface
  // show through inactive tab cards.
  return (
    <ConfigProvider
      theme={{
        algorithm: antdTheme.darkAlgorithm,
        token: {
          colorTextBase: '#FFFFFF',
          colorBgBase: palette.sider.bg,
          colorPrimary: palette.sider.accent,
          colorBgContainer: palette.sider.bg,
          colorBgElevated: palette.sider.activeBg,
          colorBorderSecondary: palette.sider.border,
          colorText: palette.sider.textPrimary,
          colorTextSecondary: palette.sider.textMuted,
          colorTextTertiary: palette.sider.textMuted
        },
        components: {
          Tabs: {
            itemColor: palette.sider.textMuted,
            itemHoverColor: palette.sider.textPrimary,
            itemSelectedColor: palette.sider.textPrimary,
            inkBarColor: palette.sider.accent,
            cardBg: 'transparent'
          }
        }
      }}
    >
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          background: palette.sider.bg,
          color: palette.sider.textPrimary
        }}
      >
        {collapsed ? (
          // Thin rail: just the expand button. Click to restore the full sider.
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              paddingTop: 8,
              gap: 8
            }}
          >
            <Tooltip title="Show sessions" placement="right">
              <Button
                type="text"
                size="small"
                icon={<MenuUnfoldOutlined />}
                onClick={onToggleCollapsed}
                aria-label="Show sessions"
                style={{ color: palette.sider.textPrimary }}
              />
            </Tooltip>
          </div>
        ) : (
          <>
            {/* Header row sits above the tab strip so the collapse control is
                always reachable regardless of how long the session list is. */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 8px 4px 12px'
              }}
            >
              <Typography.Text strong style={{ color: palette.sider.textPrimary, fontSize: 12, letterSpacing: 0.4 }}>
                SESSIONS
              </Typography.Text>
              <Tooltip title="Hide sessions" placement="right">
                <Button
                  type="text"
                  size="small"
                  icon={<MenuFoldOutlined />}
                  onClick={onToggleCollapsed}
                  aria-label="Hide sessions"
                  style={{ color: palette.sider.textMuted }}
                />
              </Tooltip>
            </div>
            {sessions === null ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                <Spin indicator={<LoadingOutlined spin />} size="small" />
              </div>
            ) : error ? (
              <Alert type="warning" showIcon message={error} style={{ margin: 12 }} />
            ) : (
              <Tabs
                className="ytai-vert-nav-tabs"
                tabPosition="left"
                type="card"
                activeKey={activeKey}
                onChange={(key) => (key === 'new' ? onNewSession?.() : onSelect?.(key))}
                items={items}
              />
            )}
          </>
        )}
      </div>
    </ConfigProvider>
  );
}

function SessionTabLabel({ session }) {
  const title = previewLabel(session);
  const when = session.lastActivityAt;
  return (
    <div>
      <Typography.Text
        strong
        ellipsis
        style={{ display: 'block', fontSize: 13, lineHeight: 1.35 }}
      >
        {title}
      </Typography.Text>
      {when ? (
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          {formatDate(when)} ({formatRelative(when)})
        </Typography.Text>
      ) : null}
    </div>
  );
}

function previewLabel(session) {
  // Student-set title wins over the auto-generated first-message preview.
  // Null/empty title falls through to the preview path.
  const title = typeof session.title === 'string' ? session.title.trim() : '';
  if (title) {
    return title.length > 60 ? `${title.slice(0, 57)}…` : title;
  }
  const raw = typeof session.preview === 'string' ? session.preview.trim() : '';
  if (!raw) return 'New Session';
  const flat = raw.replace(/\s+/g, ' ');
  return flat.length > 60 ? `${flat.slice(0, 57)}…` : flat;
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return '';
  }
}

function formatRelative(iso) {
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
