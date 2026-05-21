import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  Modal,
  Space,
  Spin,
  Tag,
  Typography,
  message
} from 'antd';
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons';
import SUBJECTS from '../lib/subjects.js';
import { palette } from '../theme.js';

// Builtin report types rendered in the grid. Each subject has all three
// columns; `custom` reports are listed separately at the bottom.
const BUILTIN_TYPES = [
  {
    key: 'wrong_questions',
    label: 'Wrong Question Collection',
    blurb: 'Every question the student got wrong or struggled with, with the correct answer and mistake type.'
  },
  {
    key: 'strengths_weaknesses',
    label: 'Strengths & Weaknesses',
    blurb: 'Where the student is solid and where they need practice, with concrete evidence from sessions.'
  },
  {
    key: 'curriculum_map',
    label: 'Curriculum Map',
    blurb: 'Coverage by focus area and mastery state, against the NSW K-10 syllabus.'
  }
];

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return '';
  }
}

export default function ReportsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reports, setReports] = useState([]);
  const [openReport, setOpenReport] = useState(null);
  const [generating, setGenerating] = useState(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [customSubject, setCustomSubject] = useState('math');

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/me/subject-reports');
      if (!res.ok) throw new Error(`Could not load reports (${res.status})`);
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

  const reportIndex = useMemo(() => {
    const map = new Map();
    for (const r of reports) {
      if (r.reportType === 'custom') continue;
      map.set(`${r.subject}::${r.reportType}`, r);
    }
    return map;
  }, [reports]);

  const customReports = useMemo(
    () => reports.filter((r) => r.reportType === 'custom'),
    [reports]
  );

  const handleGenerate = useCallback(
    async ({ subject, reportType, prompt = null, force = false }) => {
      const key = `${subject}::${reportType}::${prompt || ''}`;
      setGenerating(key);
      try {
        const res = await fetch('/api/me/subject-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject,
            reportType,
            customPrompt: prompt,
            force
          })
        });
        const body = await res.json();
        if (!res.ok) {
          throw new Error(body?.error || `Generation failed (${res.status})`);
        }
        if (body.status === 'empty') {
          message.info('No sessions for this subject yet — finish a session in the tutor first.');
        } else {
          message.success(body.fresh ? 'Report ready' : 'Loaded existing report');
        }
        await loadReports();
        if (body.status === 'ready') setOpenReport(body);
      } catch (err) {
        message.error(err.message);
      } finally {
        setGenerating(null);
      }
    },
    [loadReports]
  );

  const handleSubmitCustom = useCallback(async () => {
    const trimmed = customPrompt.trim();
    if (!trimmed) {
      message.warning('Write a prompt first.');
      return;
    }
    await handleGenerate({ subject: customSubject, reportType: 'custom', prompt: trimmed });
    setCustomPrompt('');
  }, [customPrompt, customSubject, handleGenerate]);

  return (
    <div style={{ minHeight: '100vh', background: palette.bgPanel }}>
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
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/tutor')}
          aria-label="Back to tutor"
        />
        <Typography.Title level={4} style={{ margin: 0 }}>
          Reports
        </Typography.Title>
        <Button
          type="text"
          icon={<ReloadOutlined />}
          onClick={loadReports}
          style={{ marginLeft: 'auto' }}
        >
          Refresh
        </Button>
      </header>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px 64px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin />
          </div>
        ) : error ? (
          <Alert type="error" showIcon message={error} />
        ) : (
          <>
            {SUBJECTS.map((s) => (
              <SubjectSection
                key={s.key}
                subject={s}
                reportIndex={reportIndex}
                generating={generating}
                onGenerate={handleGenerate}
                onOpen={setOpenReport}
              />
            ))}

            <CustomSection
              customReports={customReports}
              customPrompt={customPrompt}
              customSubject={customSubject}
              setCustomPrompt={setCustomPrompt}
              setCustomSubject={setCustomSubject}
              onSubmit={handleSubmitCustom}
              onOpen={setOpenReport}
              generating={generating}
            />
          </>
        )}
      </div>

      <ReportViewer report={openReport} onClose={() => setOpenReport(null)} />
    </div>
  );
}

function SubjectSection({ subject, reportIndex, generating, onGenerate, onOpen }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <Typography.Title level={5} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <subject.icon style={{ color: subject.color }} />
        {subject.label}
      </Typography.Title>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 12
        }}
      >
        {BUILTIN_TYPES.map((t) => {
          const r = reportIndex.get(`${subject.key}::${t.key}`);
          const key = `${subject.key}::${t.key}::`;
          const isGenerating = generating === key;
          return (
            <Card
              key={t.key}
              size="small"
              hoverable={!!r}
              onClick={() => r && onOpen(r)}
              styles={{ body: { padding: 16 } }}
              style={{ background: subject.tint }}
            >
              <Typography.Text strong>{t.label}</Typography.Text>
              <Typography.Paragraph
                type="secondary"
                style={{ fontSize: 12, marginTop: 4, marginBottom: 12 }}
              >
                {t.blurb}
              </Typography.Paragraph>
              {r ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    Generated {formatDate(r.generatedAt)}
                  </Typography.Text>
                  <Space>
                    <Button
                      size="small"
                      loading={isGenerating}
                      onClick={(e) => {
                        e.stopPropagation();
                        onGenerate({ subject: subject.key, reportType: t.key, force: true });
                      }}
                    >
                      Refresh
                    </Button>
                    <Button
                      size="small"
                      type="primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(r);
                      }}
                    >
                      View
                    </Button>
                  </Space>
                </div>
              ) : (
                <Button
                  size="small"
                  type="primary"
                  block
                  loading={isGenerating}
                  onClick={() => onGenerate({ subject: subject.key, reportType: t.key })}
                >
                  Generate
                </Button>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function CustomSection({
  customReports,
  customPrompt,
  customSubject,
  setCustomPrompt,
  setCustomSubject,
  onSubmit,
  onOpen,
  generating
}) {
  const isGenerating = generating?.startsWith(`${customSubject}::custom::`);
  return (
    <section style={{ marginTop: 36 }}>
      <Typography.Title level={5}>Custom Report</Typography.Title>
      <Card>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          Ask anything about the student's work — for example, "Which math
          concepts has my child confused the most in the last week?"
        </Typography.Paragraph>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            Subject:
          </Typography.Text>
          {SUBJECTS.map((s) => (
            <Tag.CheckableTag
              key={s.key}
              checked={customSubject === s.key}
              onChange={() => setCustomSubject(s.key)}
              style={{
                padding: '4px 12px',
                borderRadius: 14,
                background: customSubject === s.key ? s.color : s.tint,
                color: customSubject === s.key ? palette.surface : s.color,
                border: `1px solid ${customSubject === s.key ? s.color : 'transparent'}`
              }}
            >
              {s.label}
            </Tag.CheckableTag>
          ))}
        </div>
        <Input.TextArea
          rows={3}
          maxLength={1000}
          showCount
          placeholder="What do you want to know about the student's work?"
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
        />
        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <Button type="primary" loading={isGenerating} onClick={onSubmit}>
            Generate custom report
          </Button>
        </div>
      </Card>

      {customReports.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            Past custom reports
          </Typography.Text>
          <div
            style={{
              marginTop: 8,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 12
            }}
          >
            {customReports.map((r) => {
              const subjectMeta = SUBJECTS.find((s) => s.key === r.subject);
              return (
                <Card
                  key={r.id}
                  size="small"
                  hoverable
                  onClick={() => onOpen(r)}
                  styles={{ body: { padding: 16 } }}
                >
                  <Tag color={subjectMeta?.color}>{subjectMeta?.label || r.subject}</Tag>
                  <Typography.Paragraph
                    style={{ marginTop: 8, marginBottom: 8, fontSize: 13 }}
                    ellipsis={{ rows: 3 }}
                  >
                    {r.customPrompt}
                  </Typography.Paragraph>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    {formatDate(r.generatedAt)}
                  </Typography.Text>
                </Card>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ReportViewer({ report, onClose }) {
  const title = useMemo(() => {
    if (!report) return '';
    const subjectMeta = SUBJECTS.find((s) => s.key === report.subject);
    const subjectLabel = subjectMeta?.label || report.subject;
    if (report.reportType === 'wrong_questions') return `${subjectLabel} — Wrong Questions`;
    if (report.reportType === 'strengths_weaknesses') return `${subjectLabel} — Strengths & Weaknesses`;
    if (report.reportType === 'curriculum_map') return `${subjectLabel} — Curriculum Map`;
    return `${subjectLabel} — Custom Report`;
  }, [report]);

  return (
    <Modal
      open={!!report}
      onCancel={onClose}
      footer={null}
      width={720}
      title={title}
      destroyOnClose
    >
      {report ? <ReportBody report={report} /> : null}
    </Modal>
  );
}

function ReportBody({ report }) {
  if (report.reportType === 'wrong_questions') {
    return <WrongQuestionsBody content={report.content} />;
  }
  if (report.reportType === 'strengths_weaknesses') {
    return <StrengthsWeaknessesBody content={report.content} narrative={report.narrative} />;
  }
  if (report.reportType === 'curriculum_map') {
    return <CurriculumMapBody content={report.content} narrative={report.narrative} />;
  }
  return <CustomBody report={report} />;
}

function WrongQuestionsBody({ content }) {
  const items = content?.items || [];
  if (items.length === 0) return <Empty description="No wrong answers recorded yet" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 480, overflowY: 'auto' }}>
      {items.map((q, idx) => (
        <Card key={idx} size="small" styles={{ body: { padding: 12 } }}>
          <Typography.Paragraph style={{ marginBottom: 6 }}>{q.question}</Typography.Paragraph>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
            <span>
              <Typography.Text type="secondary">Your answer: </Typography.Text>
              <Typography.Text>{q.studentAnswer || '—'}</Typography.Text>
            </span>
            {q.correctAnswer ? (
              <span>
                <Typography.Text type="secondary">Correct: </Typography.Text>
                <Typography.Text strong>{q.correctAnswer}</Typography.Text>
              </span>
            ) : null}
            {q.mistakeType ? <Tag>{q.mistakeType}</Tag> : null}
          </div>
          {q.mistakeNotes ? (
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
              {q.mistakeNotes}
            </Typography.Paragraph>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

function StrengthsWeaknessesBody({ content, narrative }) {
  return (
    <div style={{ maxHeight: 520, overflowY: 'auto' }}>
      {narrative ? (
        <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{narrative}</Typography.Paragraph>
      ) : null}
      {Array.isArray(content?.strengths) && content.strengths.length > 0 ? (
        <>
          <Typography.Title level={5} style={{ marginTop: 16 }}>Strengths</Typography.Title>
          {content.strengths.map((s, i) => (
            <Card key={i} size="small" style={{ marginBottom: 8 }} styles={{ body: { padding: 12 } }}>
              <Typography.Text strong>{s.skill}</Typography.Text>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 13 }}>
                {s.evidence}
              </Typography.Paragraph>
            </Card>
          ))}
        </>
      ) : null}
      {Array.isArray(content?.weaknesses) && content.weaknesses.length > 0 ? (
        <>
          <Typography.Title level={5} style={{ marginTop: 16 }}>Weaknesses</Typography.Title>
          {content.weaknesses.map((w, i) => (
            <Card key={i} size="small" style={{ marginBottom: 8 }} styles={{ body: { padding: 12 } }}>
              <Typography.Text strong>{w.skill}</Typography.Text>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 4, fontSize: 13 }}>
                {w.evidence}
              </Typography.Paragraph>
              {w.suggestion ? (
                <Typography.Paragraph style={{ marginBottom: 0, fontSize: 13 }}>
                  <Typography.Text type="secondary">Try next: </Typography.Text>
                  {w.suggestion}
                </Typography.Paragraph>
              ) : null}
            </Card>
          ))}
        </>
      ) : null}
    </div>
  );
}

function CurriculumMapBody({ content, narrative }) {
  const areas = content?.areas || [];
  return (
    <div style={{ maxHeight: 520, overflowY: 'auto' }}>
      {narrative ? (
        <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{narrative}</Typography.Paragraph>
      ) : null}
      {areas.map((a, i) => (
        <Card key={i} size="small" style={{ marginBottom: 8 }} styles={{ body: { padding: 12 } }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Typography.Text strong>{a.focusArea}</Typography.Text>
            <Tag color={
              a.mastery === 'mastered' ? palette.state.correct :
              a.mastery === 'struggling' ? palette.state.wrong :
              undefined
            }>
              {a.mastery}
            </Tag>
          </div>
          {Array.isArray(a.outcomeCodes) && a.outcomeCodes.length > 0 ? (
            <div style={{ marginBottom: 4 }}>
              {a.outcomeCodes.map((c) => (
                <Tag key={c} style={{ fontFamily: 'monospace', fontSize: 11 }}>{c}</Tag>
              ))}
            </div>
          ) : null}
          {a.evidence ? (
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 13 }}>
              {a.evidence}
            </Typography.Paragraph>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

function CustomBody({ report }) {
  const content = report.content || {};
  return (
    <div style={{ maxHeight: 520, overflowY: 'auto' }}>
      {report.customPrompt ? (
        <Card size="small" style={{ background: palette.bgPanel, marginBottom: 12 }} styles={{ body: { padding: 12 } }}>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>Your prompt</Typography.Text>
          <Typography.Paragraph style={{ marginBottom: 0, fontSize: 13 }}>{report.customPrompt}</Typography.Paragraph>
        </Card>
      ) : null}
      {content.narrative ? (
        <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{content.narrative}</Typography.Paragraph>
      ) : null}
      {Array.isArray(content.sections) && content.sections.length > 0
        ? content.sections.map((s, i) => (
            <Card key={i} size="small" style={{ marginBottom: 8 }} styles={{ body: { padding: 12 } }}>
              <Typography.Text strong>{s.title}</Typography.Text>
              <ul style={{ marginTop: 4, marginBottom: 0, paddingLeft: 18 }}>
                {(s.bullets || []).map((b, j) => (
                  <li key={j}>{b}</li>
                ))}
              </ul>
            </Card>
          ))
        : null}
    </div>
  );
}
