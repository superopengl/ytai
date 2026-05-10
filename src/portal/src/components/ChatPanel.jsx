import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Input, Typography } from 'antd';
import { LoadingOutlined, SendOutlined, StopOutlined } from '@ant-design/icons';
import streamSSE from '../lib/streamSSE.js';

export default function ChatPanel({ sessionId, getImage }) {
  const [messages, setMessages] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (!sessionId) return undefined;
    let cancelled = false;
    setMessages([]);
    setHistoryLoaded(false);
    setError(null);

    fetch(`/api/tutor/${sessionId}/messages`)
      .then((res) => {
        if (!res.ok) throw new Error(`History fetch failed (${res.status})`);
        return res.json();
      })
      .then((body) => {
        if (cancelled) return;
        setMessages(body.messages ?? []);
        setHistoryLoaded(true);
      })
      .catch((err) => {
        if (!cancelled) {
          setHistoryLoaded(true);
          setError(err.message || 'Could not load chat history.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy || !sessionId) return;

    setInput('');
    setError(null);
    setBusy(true);

    const placeholderId = `pending-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: `local-${placeholderId}`, role: 'user', content: text, _local: true },
      { id: placeholderId, role: 'assistant', content: '', _streaming: true }
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    const image = getImage?.();

    try {
      const stream = streamSSE(`/api/tutor/${sessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text, image: image || undefined }),
        signal: controller.signal
      });

      for await (const { event, data } of stream) {
        if (event === 'user') {
          setMessages((prev) =>
            prev.map((m) =>
              m._local && m.role === 'user' && m.content === text && m.id.startsWith('local-')
                ? { id: data.id, role: 'user', content: data.content, createdAt: data.createdAt }
                : m
            )
          );
        } else if (event === 'token') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === placeholderId ? { ...m, content: m.content + data.delta } : m
            )
          );
        } else if (event === 'done') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === placeholderId
                ? {
                    id: data.messageId,
                    role: 'assistant',
                    content: m.content,
                    interrupted: data.interrupted,
                    createdAt: data.createdAt
                  }
                : m
            )
          );
        } else if (event === 'error') {
          setError(data.error || 'Something went wrong.');
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Request failed.');
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }, [busy, input, sessionId, getImage]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  const showThinking = useMemo(() => {
    if (!busy) return false;
    const last = messages[messages.length - 1];
    return last?.role === 'assistant' && !last.content;
  }, [busy, messages]);

  if (!sessionId) {
    return (
      <div style={centeredHint}>
        <LoadingOutlined style={{ marginRight: 8 }} /> Starting your tutor session…
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={headerStyle}>
        <Typography.Text strong>Tutor chat</Typography.Text>
      </div>
      <div ref={scrollRef} style={scrollStyle}>
        {!historyLoaded ? (
          <div style={centeredHint}>
            <LoadingOutlined style={{ marginRight: 8 }} /> Loading chat…
          </div>
        ) : messages.length === 0 ? (
          <EmptyHint />
        ) : (
          messages.map((message) => <Bubble key={message.id} message={message} />)
        )}
        {showThinking && <ThinkingBubble />}
      </div>

      {error && (
        <Alert
          type="warning"
          showIcon
          closable
          message={error}
          onClose={() => setError(null)}
          style={{ margin: '0 12px 8px' }}
        />
      )}

      <div style={composerStyle}>
        <Input.TextArea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onKeyDown}
          autoSize={{ minRows: 1, maxRows: 5 }}
          placeholder={
            busy ? 'Tutor is responding…' : 'Ask about a question, or circle something on the photo first…'
          }
          maxLength={2000}
          style={{ flex: 1, borderRadius: 12 }}
        />
        {busy ? (
          <Button danger icon={<StopOutlined />} onClick={stop}>
            Stop
          </Button>
        ) : (
          <Button type="primary" icon={<SendOutlined />} onClick={send} disabled={!input.trim()}>
            Send
          </Button>
        )}
      </div>
    </div>
  );
}

function Bubble({ message }) {
  const isUser = message.role === 'user';
  if (!isUser && !message.content) return null;
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 12
      }}
    >
      <div
        style={{
          maxWidth: '78%',
          padding: '10px 14px',
          borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          background: isUser ? '#5b8def' : '#f0f2f7',
          color: isUser ? '#fff' : '#1d2233',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          lineHeight: 1.5,
          opacity: message.interrupted ? 0.85 : 1
        }}
      >
        {message.content}
        {message.interrupted && (
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>(stopped)</div>
        )}
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
      <div
        style={{
          padding: '10px 14px',
          borderRadius: '16px 16px 16px 4px',
          background: '#f0f2f7',
          color: '#1d2233',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13
        }}
      >
        <LoadingOutlined /> Thinking…
      </div>
    </div>
  );
}

function EmptyHint() {
  return (
    <div style={{ ...centeredHint, flexDirection: 'column', gap: 6 }}>
      <Typography.Text strong>Ask away</Typography.Text>
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        Try: "Can you help me with question 3?"
      </Typography.Text>
    </div>
  );
}

const headerStyle = { padding: '12px 16px', borderBottom: '1px solid #ececf3' };
const scrollStyle = { flex: 1, overflowY: 'auto', padding: 16, minHeight: 0 };
const composerStyle = {
  padding: 12,
  borderTop: '1px solid #ececf3',
  display: 'flex',
  gap: 8,
  alignItems: 'flex-end'
};
const centeredHint = {
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#5d6478',
  textAlign: 'center'
};
