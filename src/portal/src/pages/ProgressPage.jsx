import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Avatar,
  Button,
  Card,
  Collapse,
  Empty,
  Progress,
  Spin,
  Statistic,
  Tag,
  Typography
} from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import SUBJECTS from '../lib/subjects.js';
import { palette } from '../theme.js';

const MISTAKE_LABEL = {
  conceptual: 'Conceptual',
  computational: 'Computational slip',
  careless: 'Careless',
  'misread-question': 'Misread question',
  incomplete: 'Incomplete'
};

const MISTAKE_COLOR = {
  conceptual: 'magenta',
  computational: 'orange',
  careless: 'gold',
  'misread-question': 'cyan',
  incomplete: 'default'
};

export default function ProgressPage() {
  const navigate = useNavigate();
  const [subject, setSubject] = useState('math');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const activeSubject = useMemo(() => SUBJECTS.find((s) => s.key === subject), [subject]);

  useEffect(() => {
    if (!activeSubject?.supported) {
      setData(null);
      setError(null);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/me/weaknesses?subject=${encodeURIComponent(subject)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Could not load progress (${res.status})`);
        return res.json();
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [subject, activeSubject?.supported]);

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
          My Progress
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

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px 64px' }}>
        {!activeSubject?.supported ? (
          <Alert
            type="info"
            showIcon
            message={`${activeSubject?.label} progress is coming soon`}
            description="We're only mapping Math to NSW K-10 outcomes so far. Other subjects will join once their syllabus mapping lands."
          />
        ) : loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin />
          </div>
        ) : error ? (
          <Alert type="error" showIcon message={error} />
        ) : !data || data.totals.attempted === 0 ? (
          <Empty description="No graded questions yet. Finish a few questions in the tutor and they'll show up here." />
        ) : (
          <ProgressBody data={data} subjectColor={activeSubject.color} />
        )}
      </div>
    </div>
  );
}

function ProgressBody({ data, subjectColor }) {
  const { totals, focusAreas } = data;
  const correctCount = totals.attempted - totals.wrong;
  const successRate = totals.attempted > 0 ? Math.round((correctCount / totals.attempted) * 100) : 0;

  return (
    <>
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>
          <Statistic title="Questions attempted" value={totals.attempted} />
          <Statistic title="Got right" value={correctCount} valueStyle={{ color: palette.state.correct }} />
          <Statistic title="Struggled with" value={totals.wrong} valueStyle={{ color: palette.state.wrong }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Overall success rate
            </Typography.Text>
            <Progress
              percent={successRate}
              strokeColor={subjectColor}
              format={(p) => `${p}%`}
            />
          </div>
        </div>
      </Card>

      <Typography.Title level={5} style={{ marginTop: 8, marginBottom: 12 }}>
        Where you're getting stuck
      </Typography.Title>

      <Collapse
        accordion={false}
        defaultActiveKey={focusAreas.length > 0 ? [focusAreas[0].focusArea] : []}
        items={focusAreas.map((fa) => ({
          key: fa.focusArea,
          label: <FocusAreaLabel fa={fa} subjectColor={subjectColor} />,
          children: <FocusAreaBody fa={fa} />
        }))}
      />
    </>
  );
}

function FocusAreaLabel({ fa, subjectColor }) {
  const rate = Math.round(fa.missRate * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <Typography.Text strong>{fa.focusArea}</Typography.Text>
      {fa.strand ? (
        <Tag color="default" style={{ marginInlineEnd: 0 }}>
          {fa.strand}
        </Tag>
      ) : null}
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          {fa.wrong} of {fa.attempted} struggled
        </Typography.Text>
        <Progress
          type="circle"
          percent={rate}
          size={36}
          strokeColor={subjectColor}
          format={(p) => `${p}%`}
        />
      </span>
    </div>
  );
}

function FocusAreaBody({ fa }) {
  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          NSW outcomes touched
        </Typography.Text>
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {fa.outcomes.map((o) => (
            <div key={o.code} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <Tag color="blue" style={{ fontFamily: 'monospace' }}>{o.code}</Tag>
              {o.stage ? <Tag>{o.stage}</Tag> : null}
              <Typography.Text style={{ fontSize: 13 }}>{o.text}</Typography.Text>
              <Typography.Text type="secondary" style={{ marginLeft: 'auto', fontSize: 12, whiteSpace: 'nowrap' }}>
                {o.wrong}/{o.attempted}
              </Typography.Text>
            </div>
          ))}
        </div>
      </div>

      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Questions you struggled with
      </Typography.Text>
      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {fa.questions.map((q, idx) => (
          <QuestionItem key={`${q.sessionId}-${idx}`} q={q} />
        ))}
      </div>
    </>
  );
}

function QuestionItem({ q }) {
  return (
    <Card size="small" styles={{ body: { padding: 12 } }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Avatar size="small" style={{ background: palette.state.wrong, flexShrink: 0 }}>
          {q.correct === false ? '✗' : '?'}
        </Avatar>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Typography.Paragraph style={{ marginBottom: 6 }}>{q.question}</Typography.Paragraph>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
            <span>
              <Typography.Text type="secondary">Your answer: </Typography.Text>
              <Typography.Text>{q.studentAnswer || <em>—</em>}</Typography.Text>
            </span>
            {q.correctAnswer ? (
              <span>
                <Typography.Text type="secondary">Correct: </Typography.Text>
                <Typography.Text strong>{q.correctAnswer}</Typography.Text>
              </span>
            ) : null}
            {q.mistakeType ? (
              <Tag color={MISTAKE_COLOR[q.mistakeType] || 'default'}>
                {MISTAKE_LABEL[q.mistakeType] || q.mistakeType}
              </Tag>
            ) : null}
          </div>
          {q.mistakeNotes ? (
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
              {q.mistakeNotes}
            </Typography.Paragraph>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
