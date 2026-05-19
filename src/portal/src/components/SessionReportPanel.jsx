import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Skeleton, Space, Tag, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

const MISTAKE_COLORS = {
  conceptual: 'volcano',
  computational: 'orange',
  careless: 'gold',
  'misread-question': 'magenta',
  incomplete: 'geekblue'
};

function CorrectnessTag({ correct }) {
  if (correct === true) return <Tag color="green">Correct</Tag>;
  if (correct === false) return <Tag color="red">Wrong</Tag>;
  return <Tag>No attempt</Tag>;
}

function MistakeTag({ mistakeType }) {
  if (!mistakeType) return null;
  return <Tag color={MISTAKE_COLORS[mistakeType] || 'default'}>{mistakeType}</Tag>;
}

function QuestionCard({ q, index }) {
  return (
    <Card
      size="small"
      // Keep the head row short: long question text in the title forces the
      // card horizontally because AntD's .ant-card-head-title is nowrap.
      title={<Typography.Text strong>{`Q${index + 1}.`}</Typography.Text>}
      extra={
        <Space size="small" wrap>
          <CorrectnessTag correct={q.correct} />
          <MistakeTag mistakeType={q.mistakeType} />
        </Space>
      }
      style={{ marginBottom: 12 }}
      styles={{ body: { wordBreak: 'break-word' } }}
    >
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        <Typography.Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
          {q.question || '(unspecified question)'}
        </Typography.Paragraph>
        {q.studentAnswer ? (
          <Typography.Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
            <Typography.Text type="secondary">Student answered: </Typography.Text>
            {q.studentAnswer}
          </Typography.Paragraph>
        ) : null}
        {q.correctAnswer ? (
          <Typography.Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
            <Typography.Text type="secondary">Correct answer: </Typography.Text>
            {q.correctAnswer}
          </Typography.Paragraph>
        ) : null}
        {q.mistakeNotes ? (
          <Typography.Paragraph type="secondary" italic style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
            {q.mistakeNotes}
          </Typography.Paragraph>
        ) : null}
        <Space size={6} wrap style={{ marginTop: 4 }}>
          <Tag color="blue">{q.nswOutcomeCode}</Tag>
          {q.nswSubject ? <Tag>{q.nswSubject}</Tag> : null}
          {q.nswStage ? <Tag>{q.nswStage}</Tag> : null}
          {q.nswFocusArea ? <Tag>{q.nswFocusArea}</Tag> : null}
        </Space>
        {q.nswOutcomeText ? (
          <Typography.Paragraph type="secondary" style={{ margin: 0, fontSize: 13, whiteSpace: 'pre-wrap' }}>
            {q.nswOutcomeText}
          </Typography.Paragraph>
        ) : null}
      </Space>
    </Card>
  );
}

export default function SessionReportPanel({ sessionId, active }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const load = useCallback(
    async ({ force = false } = {}) => {
      if (!sessionId) return;
      setLoading(true);
      setError(null);
      try {
        const url = `/api/tutor/${sessionId}/report${force ? '?force=1' : ''}`;
        const res = await fetch(url);
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
        setReport(body);
      } catch (err) {
        setError(err.message || 'Could not load report');
      } finally {
        setLoading(false);
        setHasLoadedOnce(true);
      }
    },
    [sessionId]
  );

  // Defer the fetch until the tab is opened — the report call hits Brain on
  // first view and we don't want to burn tokens for sessions nobody reviews.
  useEffect(() => {
    if (active && sessionId && !hasLoadedOnce && !loading) load();
  }, [active, sessionId, hasLoadedOnce, loading, load]);

  // Reset when the session changes so opening the tab on a fresh session
  // triggers a fresh fetch.
  useEffect(() => {
    setReport(null);
    setHasLoadedOnce(false);
    setError(null);
  }, [sessionId]);

  const questions = Array.isArray(report?.questions) ? report.questions : [];

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '16px 20px'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12
        }}
      >
        <Typography.Text type="secondary">
          NSW K-10 Syllabus (2022) classification
        </Typography.Text>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => load({ force: true })}
          loading={loading}
          disabled={!sessionId}
          color="green" 
          variant="solid"
        >
          Regenerate
        </Button>
      </div>

      {error ? (
        <Alert
          type="error"
          message="Could not generate report"
          description={error}
          style={{ marginBottom: 16 }}
        />
      ) : null}

      {loading && !report ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : !report ? (
        <Empty description="Open this tab to generate a report for the session." />
      ) : (
        <>
          <Card style={{ marginBottom: 16 }}>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Space size={8} wrap>
                {report.subject ? <Tag color="purple">{report.subject}</Tag> : null}
                {report.stage ? <Tag color="cyan">{report.stage}</Tag> : null}
                <Tag>{questions.length} questions</Tag>
              </Space>
              <Typography.Paragraph style={{ margin: 0 }}>
                {report.summary || 'No summary available yet.'}
              </Typography.Paragraph>
            </Space>
          </Card>

          {questions.length === 0 ? (
            <Empty description="No questions were identified in this session." />
          ) : (
            questions.map((q, i) => (
              <QuestionCard key={`${q.nswOutcomeCode}-${i}`} q={q} index={i} />
            ))
          )}
        </>
      )}
    </div>
  );
}
