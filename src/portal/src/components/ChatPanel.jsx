import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Input, Tooltip, Typography } from 'antd';
import {
  AudioMutedOutlined,
  LoadingOutlined,
  SendOutlined,
  SoundOutlined,
  StopOutlined
} from '@ant-design/icons';
import hashDataUrl from '../lib/hashDataUrl.js';
import streamSSE from '../lib/streamSSE.js';
import useTutorVoice from '../hooks/useTutorVoice.js';

export default function ChatPanel({ sessionId, imageUrl, getImage, onAiAnnotations }) {
  const [messages, setMessages] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);
  const abortRef = useRef(null);
  const voice = useTutorVoice(sessionId);
  // Hash of the last image dataUrl successfully sent to the server. Lets us
  // skip resending bytes when neither the photo nor the user's annotations
  // have changed since the previous turn — the server keeps the cached
  // vision_extraction keyed off the matching content_hash.
  const lastSentImageHashRef = useRef(null);

  useEffect(() => {
    if (!sessionId) return undefined;
    let cancelled = false;
    setMessages([]);
    setHistoryLoaded(false);
    setError(null);
    lastSentImageHashRef.current = null;

    fetch(`/api/tutor/${sessionId}/messages`)
      .then((res) => {
        if (!res.ok) throw new Error(`History fetch failed (${res.status})`);
        return res.json();
      })
      .then((body) => {
        if (cancelled) return;
        const loaded = body.messages ?? [];
        setMessages(loaded);
        setHistoryLoaded(true);
        if (onAiAnnotations) {
          const restored = [];
          for (const m of loaded) {
            if (Array.isArray(m.toolCalls)) {
              for (const tc of m.toolCalls) {
                if (tc?.name === 'draw_annotation') {
                  restored.push({ id: `${m.id}:${tc.id ?? restored.length}`, args: tc.args });
                }
              }
            }
          }
          onAiAnnotations(restored);
        }
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

  // Clear the "already sent" hash whenever the user replaces or removes the
  // image. Without this, the dirty-check could keep matching the previous
  // photo's hash and never re-send the new one.
  useEffect(() => {
    lastSentImageHashRef.current = null;
  }, [imageUrl]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy || !sessionId) return;

    setInput('');
    setError(null);
    setBusy(true);

    const image = getImage?.();
    // Guard against the race where the user replaced the image but the new
    // photo hasn't finished loading into the canvas yet: in that case
    // exportImage() returns null while imageUrl is non-empty. Falling
    // through would send a text-only request and the server would reuse the
    // previous image's vision_extraction — which looks like "the AI is
    // ignoring my new photo."
    if (imageUrl && !image?.dataUrl) {
      setBusy(false);
      setInput(text);
      setError('Photo is still loading — give it a moment, then send again.');
      return;
    }

    let imageToSend = null;
    let imageHashThisTurn = null;
    if (image?.dataUrl) {
      imageHashThisTurn = await hashDataUrl(image.dataUrl);
      if (imageHashThisTurn && imageHashThisTurn !== lastSentImageHashRef.current) {
        imageToSend = {
          dataUrl: image.dataUrl,
          width: image.width,
          height: image.height,
          hasAnnotations: image.hasAnnotations
        };
      }
    }

    // Attach the freshly-flattened canvas to the user bubble so the image is
    // visible the instant the message appears — no wait for the server
    // round-trip. After the 'user' event we replace this with the server's
    // imageId so history reloads can hit the /image endpoint.
    const placeholderId = `pending-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: `local-${placeholderId}`,
        role: 'user',
        content: text,
        _local: true,
        imageDataUrl: image?.dataUrl || null
      },
      { id: placeholderId, role: 'assistant', content: '', _streaming: true }
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    voice.stop();

    try {
      const stream = streamSSE(`/api/tutor/${sessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: text,
          image: imageToSend || undefined
        }),
        signal: controller.signal
      });

      for await (const { event, data } of stream) {
        if (event === 'user') {
          setMessages((prev) =>
            prev.map((m) =>
              m._local && m.role === 'user' && m.content === text && m.id.startsWith('local-')
                ? {
                    id: data.id,
                    role: 'user',
                    content: data.content,
                    imageId: data.imageId ?? null,
                    imageDataUrl: m.imageDataUrl,
                    createdAt: data.createdAt
                  }
                : m
            )
          );
        } else if (event === 'token') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === placeholderId ? { ...m, content: m.content + data.delta } : m
            )
          );
          voice.appendDelta(data.delta);
        } else if (event === 'done') {
          if (imageHashThisTurn) lastSentImageHashRef.current = imageHashThisTurn;
          if (data.interrupted) voice.stop();
          else voice.finalize();
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
        } else if (event === 'tool') {
          if (data?.name === 'draw_annotation' && onAiAnnotations) {
            const id = `${placeholderId}:${data.id ?? Math.random().toString(36).slice(2)}`;
            onAiAnnotations((prev) => [...prev, { id, args: data.args }]);
          }
        } else if (event === 'error') {
          setError(data.error || 'Something went wrong.');
          voice.stop();
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Request failed.');
      }
      voice.stop();
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }, [busy, input, sessionId, imageUrl, getImage, onAiAnnotations, voice]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    voice.stop();
  }, [voice]);

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
        <Tooltip
          title={
            !voice.supported
              ? 'Voice is not configured on the server.'
              : voice.enabled
                ? 'Turn voice off'
                : 'Turn voice on (tutor will read replies aloud)'
          }
        >
          <Button
            type="text"
            size="small"
            disabled={!voice.supported}
            aria-pressed={voice.enabled}
            icon={voice.enabled ? <SoundOutlined /> : <AudioMutedOutlined />}
            onClick={() => voice.setEnabled(!voice.enabled)}
            style={{ marginLeft: 'auto', color: voice.enabled ? '#5b8def' : undefined }}
          />
        </Tooltip>
      </div>
      <div ref={scrollRef} style={scrollStyle}>
        {!historyLoaded ? (
          <div style={centeredHint}>
            <LoadingOutlined style={{ marginRight: 8 }} /> Loading chat…
          </div>
        ) : messages.length === 0 ? (
          <EmptyHint />
        ) : (
          messages.map((message) => (
            <Bubble key={message.id} message={message} sessionId={sessionId} />
          ))
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

function Bubble({ message, sessionId }) {
  const isUser = message.role === 'user';
  if (!isUser && !message.content) return null;
  // Only user turns show the attached photo — assistant rows store the same
  // imageId for vision context but the transcript shouldn't echo it back.
  // Prefer the local dataUrl (already in memory for freshly-sent messages)
  // and fall back to the server endpoint for messages loaded from history.
  const imageSrc = isUser
    ? message.imageDataUrl ||
      (message.imageId && sessionId ? `/api/tutor/${sessionId}/image/${message.imageId}` : null)
    : null;
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
          padding: imageSrc ? '8px 8px 10px' : '10px 14px',
          borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          background: isUser ? '#5b8def' : '#f0f2f7',
          color: isUser ? '#fff' : '#1d2233',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          lineHeight: 1.5,
          opacity: message.interrupted ? 0.85 : 1
        }}
      >
        {imageSrc && (
          <img
            src={imageSrc}
            alt="worksheet"
            style={{
              display: 'block',
              maxWidth: '100%',
              maxHeight: 240,
              borderRadius: 10,
              marginBottom: message.content ? 8 : 0,
              background: '#fff'
            }}
          />
        )}
        {message.content && (
          <div style={{ padding: imageSrc ? '0 6px' : 0 }}>{message.content}</div>
        )}
        {message.interrupted && (
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4, padding: imageSrc ? '0 6px' : 0 }}>
            (stopped)
          </div>
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

const headerStyle = {
  padding: '12px 16px',
  borderBottom: '1px solid #ececf3',
  display: 'flex',
  alignItems: 'center',
  gap: 8
};
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
