import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  ConfigProvider,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Splitter,
  Tabs,
  Tooltip,
  Typography,
  message,
  theme as antdTheme
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckOutlined,
  CopyOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined,
  PlusOutlined
} from '@ant-design/icons';
import SUBJECTS from '../lib/subjects.js';
import apiFetch from '../lib/apiFetch.js';
import currentSubject from '../lib/currentSubject.js';
import { palette } from '../theme.js';
import MarkdownMessage from '../components/MarkdownMessage.jsx';

const POLL_INTERVAL_MS = 2500;

// Prompt templates — UI-only sugar. The Select on the Generate panel
// uses these to prefill the textarea; the backend never sees the key,
// only the resulting prompt string.
const PROMPT_TEMPLATES = [
  {
    key: 'wrong_questions',
    label: 'Wrong Answer Journal',
    blurb: 'Every question the student got wrong or struggled with, with the correct answer and mistake type.',
    prompt:
      'List every question the student got wrong or struggled with across their recent sessions. For each one, include the question, the student\'s answer, the correct answer, and what kind of mistake it was.'
  },
  {
    key: 'strengths_weaknesses',
    label: 'Strengths & Weaknesses',
    blurb: 'Where the student is solid and where they need practice, with concrete evidence from sessions.',
    prompt:
      'Tell me where the student is solid and where they need more practice. Back each strength and weakness with concrete examples from their sessions.'
  },
  {
    key: 'curriculum_map',
    label: 'Curriculum Map',
    blurb: 'Coverage by focus area and mastery state, against the NSW K-10 syllabus.',
    prompt:
      'Map the student\'s recent tutoring work against the NSW K-10 syllabus. For each focus area they have touched, give a mastery state (e.g. emerging / developing / proficient) and the evidence behind it.'
  }
];

// Reports carry a model-generated title in their content payload — the
// pre-title call lands it within seconds of a row being created. Falls
// back to a placeholder for the brief window before the title write,
// for rows where it never landed, or for legacy rows.
function reportDisplayTitle(report) {
  const t = typeof report.content?.title === 'string' ? report.content.title.trim() : '';
  if (t) return t;
  return 'Generating Report ...';
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return '';
  }
}

function formatTimeAgo(iso) {
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

function PromptCard({ prompt, style }) {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(copyTimerRef.current), []);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard write can fail on insecure contexts; silently no-op.
    }
  };
  return (
    <Card
      size="small"
      style={{ background: palette.bgPanel, position: 'relative', ...style }}
      styles={{ body: { padding: 12 } }}
    >
      <Tooltip title={copied ? 'Copied' : 'Copy prompt'}>
        <Button
          type="text"
          size="small"
          icon={copied ? <CheckOutlined /> : <CopyOutlined />}
          onClick={handleCopy}
          aria-label={copied ? 'Prompt copied' : 'Copy prompt to clipboard'}
          style={{
            position: 'absolute',
            top: 8,
            right: 10,
            width: 22,
            height: 22,
            minWidth: 22,
            padding: 0,
            fontSize: 12,
            color: palette.textMuted
          }}
        />
      </Tooltip>
      <Typography.Text type="secondary" style={{ fontSize: 11 }}>Your prompt</Typography.Text>
      <Typography.Paragraph style={{ marginBottom: 0, fontSize: 13, paddingRight: 24 }}>
        {prompt}
      </Typography.Paragraph>
    </Card>
  );
}

function SubjectBadge({ subject, size = 'sm' }) {
  const meta = SUBJECTS.find((s) => s.key === subject);
  if (!meta) return null;
  const Icon = meta.icon;
  const isLg = size === 'lg';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isLg ? 8 : 6,
        padding: isLg ? '4px 12px 4px 6px' : '2px 10px 2px 4px',
        background: meta.tint,
        border: `1.5px solid ${meta.color}`,
        borderRadius: 999,
        color: palette.text,
        fontWeight: 700,
        fontSize: isLg ? 14 : 12,
        lineHeight: 1.2,
        whiteSpace: 'nowrap'
      }}
    >
      <span
        style={{
          width: isLg ? 22 : 18,
          height: isLg ? 22 : 18,
          borderRadius: '50%',
          background: meta.color,
          color: '#fff',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: isLg ? 12 : 10,
          flexShrink: 0
        }}
      >
        <Icon />
      </span>
      {meta.label}
    </span>
  );
}

function StepHeader({ n, title, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: palette.cta,
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 13,
            flexShrink: 0
          }}
        >
          {n}
        </span>
        <Typography.Text strong style={{ fontSize: 15 }}>
          {title}
        </Typography.Text>
      </div>
      {children ? (
        <Typography.Paragraph
          type="secondary"
          style={{ fontSize: 13, marginLeft: 36, marginTop: 4, marginBottom: 0 }}
        >
          {children}
        </Typography.Paragraph>
      ) : null}
    </div>
  );
}

export default function ReportsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reports, setReports] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [generating, setGenerating] = useState(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [customSubject, setCustomSubject] = useState(() => currentSubject().value);

  const updateSubject = useCallback((next) => {
    setCustomSubject(next);
    currentSubject().save(next);
  }, []);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/analysis-reports');
      if (!res.ok) throw new Error("Couldn't load your reports");
      const body = await res.json();
      setReports(body.reports || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const selectedReport = useMemo(
    () => reports.find((r) => r.id === selectedId) || null,
    [reports, selectedId]
  );

  // While any row is still 'pending' on the server, poll the list so the
  // card flips to 'ready' (or 'failed') without the user clicking refresh.
  const hasPendingReport = useMemo(
    () => reports.some((r) => r.status === 'pending'),
    [reports]
  );
  useEffect(() => {
    if (!hasPendingReport) return undefined;
    const id = setInterval(loadReports, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [hasPendingReport, loadReports]);

  const handleSubmit = useCallback(async () => {
    const trimmed = customPrompt.trim();
    if (!trimmed) {
      message.warning('Write a prompt first.');
      return;
    }
    setGenerating(`${customSubject}::${trimmed}`);
    try {
      const res = await apiFetch('/api/analysis-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: customSubject, prompt: trimmed })
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error || "Couldn't generate the report");
      }
      if (body.status === 'empty') {
        message.info('No sessions for this subject yet — finish a session in the tutor first.');
        return;
      }
      // The row is now 'pending' in the database. Pull the new card into
      // the list and jump straight to its in-progress viewer so the user
      // can watch the generation finish.
      message.info('Generating report…');
      setCustomPrompt('');
      await loadReports();
      if (body.id) setSelectedId(body.id);
    } catch (err) {
      message.error(err.message);
    } finally {
      setGenerating(null);
    }
  }, [customPrompt, customSubject, loadReports]);

  const handleGenerateSimilar = useCallback(
    (report) => {
      updateSubject(report.subject);
      setCustomPrompt(report.customPrompt || '');
      setSelectedId(null);
    },
    [updateSubject]
  );

  const handleDelete = useCallback(
    async (id) => {
      try {
        const res = await apiFetch(`/api/analysis-report/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || "Couldn't delete that report");
        }
        message.success('Report deleted');
        setSelectedId(null);
        await loadReports();
      } catch (err) {
        message.error(err.message);
      }
    },
    [loadReports]
  );

  return (
    <div style={{ height: '100vh', background: palette.bgPanel, display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          padding: '12px 24px 12px 12px',
          background: palette.surface,
          borderBottom: `1px solid ${palette.borderSoft}`,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0
        }}
      >
        <Button
          type="text"
          size="large"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/tutor')}
          aria-label="Back to tutor"
        />
        <Typography.Title level={4} style={{ margin: 0 }}>
          Analysis Reports
        </Typography.Title>
      </header>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Splitter
          className="ytai-white-splitter"
          style={{ height: '100%', background: palette.surface }}
        >
          <Splitter.Panel defaultSize={340} min={240} max="60%">
            <ReportsList
              loading={loading}
              error={error}
              reports={reports}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onNew={() => setSelectedId(null)}
            />
          </Splitter.Panel>
          <Splitter.Panel>
            {selectedReport ? (
              <ReportPanel
                report={selectedReport}
                onDelete={handleDelete}
                onGenerateSimilar={handleGenerateSimilar}
              />
            ) : (
              <GeneratePanel
                generating={generating}
                customSubject={customSubject}
                setCustomSubject={updateSubject}
                customPrompt={customPrompt}
                setCustomPrompt={setCustomPrompt}
                onSubmit={handleSubmit}
              />
            )}
          </Splitter.Panel>
        </Splitter>
      </div>
    </div>
  );
}

function ReportsList({ loading, error, reports, selectedId, onSelect, onNew }) {
  // The "+ New report" entry is always the first tab; saved reports follow.
  // We keep the tab strip in this Splitter panel and let the right panel
  // render the actual content driven by the active key — see the
  // `ytai-vert-nav-tabs` CSS class which hides AntD's content holder.
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
            <PlusOutlined />
            <Typography.Text strong>New Report</Typography.Text>
          </Space>
        )
      }
    ];
    for (const r of reports) {
      tabs.push({ key: r.id, label: <ReportTabLabel report={r} /> });
    }
    return tabs;
  }, [reports]);

  const activeKey = selectedId ?? 'new';

  // Dark theme scoped to the left nav panel only — same pattern as
  // TutorSessionsSider so the two dark surfaces in the app feel of a
  // piece. AntD's darkAlgorithm recolors Tabs internals automatically;
  // the explicit `palette.sider.bg` sets the surface behind the tab strip.
  return (
    <ConfigProvider
      theme={{
        algorithm: antdTheme.darkAlgorithm,
        token: {
          // Seed tokens — darkAlgorithm derives the full text/bg scale
          // from these. Without an explicit light `colorTextBase` the
          // parent theme's dark slate would bleed through and the tab
          // labels would render the same color as the dark surface.
          colorTextBase: '#FFFFFF',
          colorBgBase: palette.sider.bg,
          colorPrimary: palette.sider.accent,
          // Derived overrides for the surfaces we set ourselves.
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
          background: palette.sider.bg,
          color: palette.sider.textPrimary
        }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <Spin />
          </div>
        ) : error ? (
          <div style={{ padding: 12 }}>
            <Alert type="error" showIcon message={error} />
          </div>
        ) : (
          <Tabs
            className="ytai-vert-nav-tabs"
            tabPosition="left"
            type="card"
            activeKey={activeKey}
            onChange={(key) => (key === 'new' ? onNew() : onSelect(key))}
            items={items}
          />
        )}
      </div>
    </ConfigProvider>
  );
}

function ReportTabLabel({ report }) {
  const subjectMeta = SUBJECTS.find((s) => s.key === report.subject);
  const isPending = report.status === 'pending';
  const isFailed = report.status === 'failed';
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <SubjectBadge subject={report.subject} />
        <Typography.Text strong style={{ fontSize: 13 }}>
          {reportDisplayTitle(report)}
        </Typography.Text>
      </div>
      {report.customPrompt ? (
        <Typography.Paragraph
          type="secondary"
          style={{ marginBottom: 0, fontSize: 12 }}
          ellipsis={{ rows: 2 }}
        >
          {report.customPrompt}
        </Typography.Paragraph>
      ) : null}
      {isPending ? (
        <Space size={6} align="center">
          <LoadingOutlined style={{ color: subjectMeta?.color || palette.primary }} />
          <Typography.Text style={{ fontSize: 11, color: subjectMeta?.color || palette.primary }}>
            Generating…
          </Typography.Text>
        </Space>
      ) : isFailed ? (
        <Space size={6} align="center">
          <ExclamationCircleOutlined style={{ color: palette.state.wrong }} />
          <Typography.Text style={{ fontSize: 11, color: palette.state.wrong }}>
            Failed — open to retry
          </Typography.Text>
        </Space>
      ) : (
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          {formatDate(report.generatedAt || report.createdAt)} ({formatTimeAgo(report.generatedAt || report.createdAt)})
        </Typography.Text>
      )}
    </div>
  );
}

function GeneratePanel({
  generating,
  customSubject,
  setCustomSubject,
  customPrompt,
  setCustomPrompt,
  onSubmit
}) {
  const isGenerating = generating?.startsWith(`${customSubject}::`);
  return (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        background: palette.surface
      }}
    >
      <div
        style={{
          minHeight: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 24px 64px',
          boxSizing: 'border-box'
        }}
      >
      <div style={{ maxWidth: 640, width: '100%' }}>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Generate a new report
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        Reports turn the student's tutoring sessions into a clear picture — what they got wrong, what they've got down, and what to work on next. Each report is saved as a snapshot you can come back to.
      </Typography.Paragraph>

      <section style={{ marginBottom: 20 }}>
        <StepHeader n={1} title="Choose a subject">
          Which subject's tutoring work should the AI analyze?
        </StepHeader>
        <div style={{ marginLeft: 36 }}>
          <Select
            value={customSubject}
            onChange={setCustomSubject}
            style={{ minWidth: 220 }}
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
      </section>

      <div style={{ borderTop: `1px dashed ${palette.borderSoft}`, margin: '24px 0' }} />

      <section style={{ marginBottom: 28 }}>
        <StepHeader n={2} title="Tell the AI what to analyze">
          Start from a template, then tweak the prompt before generating.
        </StepHeader>
        <div style={{ marginLeft: 36 }}>
          <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
            Report template (optional)
          </Typography.Text>
          <Select
            value={undefined}
            placeholder="Pick a template to prefill the prompt…"
            style={{ width: '100%' }}
            optionLabelProp="label"
            onChange={(_, option) => setCustomPrompt(option?.prompt ?? '')}
            options={PROMPT_TEMPLATES.map((t) => ({
              value: t.key,
              label: t.label,
              prompt: t.prompt,
              blurb: t.blurb
            }))}
            optionRender={(option) => (
              <div style={{ padding: '2px 0' }}>
                <Typography.Text strong>{option.data.label}</Typography.Text>
                <div style={{ fontSize: 12, color: palette.textMuted, marginTop: 2 }}>
                  {option.data.blurb}
                </div>
              </div>
            )}
          />
        </div>
        <div style={{ marginLeft: 36, marginTop: 16 }}>
          <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
            Your prompt
          </Typography.Text>
          <Input.TextArea
            rows={4}
            maxLength={2000}
            placeholder='Pick a template above to start, or write your own — e.g. "Which concepts has my child confused the most in the last week?"'
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
          />
          <div style={{ marginTop: 8, textAlign: 'right' }}>
            <Button
              type="primary"
              loading={isGenerating}
              disabled={!customPrompt.trim()}
              onClick={onSubmit}
            >
              Generate
            </Button>
          </div>
        </div>
      </section>
      </div>
      </div>
    </div>
  );
}

function ReportPanel({ report, onDelete, onGenerateSimilar }) {
  const subjectMeta = SUBJECTS.find((s) => s.key === report.subject);
  const subjectLabel = subjectMeta?.label || report.subject;
  const typeLabel = reportDisplayTitle(report);
  const isPending = report.status === 'pending';
  const isFailed = report.status === 'failed';
  const [modal, modalContextHolder] = Modal.useModal();
  const handleDeleteClick = () => {
    modal.confirm({
      title: 'Delete this report?',
      content: `"${typeLabel}" for ${subjectLabel} will be permanently removed. You can regenerate it later, but the current snapshot is gone.`,
      okText: 'Delete',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: () => onDelete(report.id)
    });
  };
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: palette.surface }}>
      {modalContextHolder}
      <div
        style={{
          padding: '16px 24px',
          borderBottom: `1px solid ${palette.borderSoft}`,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <Space size={10} align="center" style={{ marginBottom: 4 }}>
            <SubjectBadge subject={report.subject} size="lg" />
            <Typography.Title level={4} style={{ margin: 0 }}>{typeLabel}</Typography.Title>
          </Space>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {isPending
                ? `Started ${formatDate(report.createdAt)} (${formatTimeAgo(report.createdAt)})`
                : `Generated ${formatDate(report.generatedAt || report.createdAt)} (${formatTimeAgo(report.generatedAt || report.createdAt)})`}
            </Typography.Text>
          </div>
        </div>
        {!isPending && (
          <Space size={4}>
            {report.customPrompt ? (
              <Button
                type="link"
                size="small"
                // icon={<PlusOutlined />}
                onClick={() => onGenerateSimilar?.(report)}
              >
                Generate Similar
              </Button>
            ) : null}
            <Button
              type="text"
              shape="circle"
              icon={<DeleteOutlined />}
              onClick={handleDeleteClick}
              aria-label="Delete report"
              danger
            />
          </Space>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {isPending ? (
          <PendingReportBody report={report} />
        ) : isFailed ? (
          <FailedReportBody report={report} />
        ) : (
          <ReportBody report={report} />
        )}
      </div>
    </div>
  );
}

function PendingReportBody({ report }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 16px' }}>
      <Spin
        size="large"
        indicator={<LoadingOutlined style={{ fontSize: 32 }} spin />}
      />
      <Typography.Title level={5} style={{ marginTop: 16, marginBottom: 4 }}>
        Generating report…
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
        This usually takes a few seconds. The page refreshes automatically when it's ready.
      </Typography.Paragraph>
      {report.customPrompt ? (
        <PromptCard prompt={report.customPrompt} style={{ marginTop: 24, textAlign: 'left' }} />
      ) : null}
    </div>
  );
}

function FailedReportBody({ report }) {
  return (
    <div>
      <Alert
        type="error"
        showIcon
        message="Report generation failed"
        description={report.error || 'Something went wrong generating this report. Try again.'}
      />
      {report.customPrompt ? (
        <PromptCard prompt={report.customPrompt} style={{ marginTop: 16 }} />
      ) : null}
    </div>
  );
}

function ReportBody({ report }) {
  const content = report.content || {};
  return (
    <div>
      {report.customPrompt ? (
        <PromptCard prompt={report.customPrompt} style={{ marginBottom: 16 }} />
      ) : null}
      {content.narrative ? (
        <div
          style={{
            color: palette.textInkSoft,
            fontSize: 15,
            lineHeight: 1.65,
            marginBottom: content.sections?.length ? 16 : 0
          }}
        >
          <MarkdownMessage>{content.narrative}</MarkdownMessage>
        </div>
      ) : null}
      {Array.isArray(content.sections) && content.sections.length > 0
        ? content.sections.map((s, i) => (
            <Card
              key={i}
              size="small"
              style={{ marginBottom: 10, borderColor: palette.borderSoft }}
              styles={{ body: { padding: 16 } }}
            >
              <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 8 }}>
                {s.title}
              </Typography.Title>
              <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>
                {(s.bullets || []).map((b, j) => (
                  <li key={j} style={{ marginBottom: 4 }}>
                    <MarkdownMessage>{b}</MarkdownMessage>
                  </li>
                ))}
              </ul>
            </Card>
          ))
        : null}
    </div>
  );
}
