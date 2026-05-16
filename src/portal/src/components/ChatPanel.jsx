import { useCallback, useEffect, useRef, useState } from 'react';
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
import MarkdownMessage from './MarkdownMessage.jsx';

export default function ChatPanel({ sessionId, imageUrl, getImage, onAiAnnotations, onCastImage }) {
  const [messages, setMessages] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  // True between "request sent / tool-call started" and "next token arrives" —
  // i.e. moments where Brain is working but nothing is visibly streaming.
  const [awaitingTokens, setAwaitingTokens] = useState(false);
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
    setAwaitingTokens(true);

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

    // Render the image as its own bubble *only* when the photo is actually
    // changing this turn. Subsequent text turns under the same image just
    // show text — the page itself is already in the transcript above.
    const placeholderId = `pending-${Date.now()}`;
    const userLocalId = `local-${placeholderId}`;
    const imageLocalId = imageToSend ? `local-img-${placeholderId}` : null;
    setMessages((prev) => [
      ...prev,
      ...(imageLocalId
        ? [
            {
              id: imageLocalId,
              role: 'user',
              content: '',
              _local: true,
              imageDataUrl: image.dataUrl
            }
          ]
        : []),
      {
        id: userLocalId,
        role: 'user',
        content: text,
        _local: true
      },
      { id: placeholderId, role: 'assistant', content: '', _streaming: true }
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    voice.stop();
    // Bind voice to the streaming bubble so the speaking icon shows on the
    // right message during auto-speak. Rebound to the real message id on
    // 'done' below — until then, the bubble is keyed by placeholderId.
    voice.setActiveTarget(placeholderId);

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
            prev.flatMap((m) => {
              if (imageLocalId && m.id === imageLocalId) {
                if (!data.imageMessage) return [];
                return [
                  {
                    id: data.imageMessage.id,
                    role: 'user',
                    content: '',
                    imageId: data.imageMessage.imageId,
                    imageDataUrl: m.imageDataUrl,
                    createdAt: data.imageMessage.createdAt
                  }
                ];
              }
              if (m.id === userLocalId) {
                return [
                  {
                    id: data.id,
                    role: 'user',
                    content: data.content,
                    imageId: data.imageId ?? null,
                    createdAt: data.createdAt
                  }
                ];
              }
              return [m];
            })
          );
        } else if (event === 'token') {
          setAwaitingTokens(false);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === placeholderId ? { ...m, content: m.content + data.delta } : m
            )
          );
          voice.appendDelta(data.delta);
        } else if (event === 'done') {
          setAwaitingTokens(false);
          if (imageHashThisTurn) lastSentImageHashRef.current = imageHashThisTurn;
          if (data.interrupted) voice.stop();
          else {
            // Re-bind voice ownership from placeholderId to the persistent
            // message id so the icon stays on the bubble as the queue
            // drains past the SSE 'done' boundary.
            voice.setActiveTarget(data.messageId);
            voice.finalize();
          }
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
        } else if (event === 'lookup-start' || event === 'lookup') {
          // Brain has paused to consult Eyes (or just got a result back and
          // is about to pick its next move). Surface "Thinking…" until the
          // next token arrives.
          setAwaitingTokens(true);
        } else if (event === 'tool') {
          setAwaitingTokens(true);
          if (data?.name === 'draw_annotation' && onAiAnnotations) {
            const id = `${placeholderId}:${data.id ?? Math.random().toString(36).slice(2)}`;
            onAiAnnotations((prev) => [...prev, { id, args: data.args }]);
          }
        } else if (event === 'error') {
          setAwaitingTokens(false);
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
      setAwaitingTokens(false);
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

  // Show "Thinking…" inline inside the streaming assistant bubble whenever
  // Brain is working but no tokens are arriving — covers both the initial
  // wait and mid-stream pauses while Eyes is being consulted.
  const thinkingActive = busy && awaitingTokens;

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
          messages.map((message, idx) => {
            const isThisSpeaking = voice.supported && voice.speakingId === message.id;
            const isStreamingTail =
              idx === messages.length - 1 && message.role === 'assistant' && message._streaming;
            return (
              <Bubble
                key={message.id}
                message={message}
                sessionId={sessionId}
                isSpeaking={isThisSpeaking}
                thinking={isStreamingTail && thinkingActive}
                onCastImage={onCastImage}
                onReplay={
                  voice.supported
                    ? () =>
                        isThisSpeaking
                          ? voice.stop()
                          : voice.speak(message.content, message.id)
                    : null
                }
              />
            );
          })
        )}
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
        {busy || voice.speaking ? (
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

function Bubble({ message, sessionId, onReplay, isSpeaking, thinking, onCastImage }) {
  const isUser = message.role === 'user';
  // Keep the bubble around while Brain is thinking, even with no content yet —
  // the inline "Thinking…" line below stands in for the message text.
  if (!isUser && !message.content && !thinking) return null;
  // Show the speaker control whenever the bubble is done streaming (so the
  // user can replay it) OR when auto-speak is currently reading this
  // streaming bubble aloud (so the user sees the "I'm reading this" icon
  // and can click to stop). Hiding it entirely during _streaming would
  // make the auto-speak feel silent visually.
  const canReplay = !isUser && onReplay && (!message._streaming || isSpeaking);
  // Image-only user messages carry `imageId` (and, for freshly-sent ones,
  // an in-memory `imageDataUrl`); text user turns and assistant turns don't.
  // Prefer the local dataUrl when available; fall back to the server
  // endpoint for messages loaded from history.
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
          // User bubbles are author-typed text; preserve their newlines.
          // Assistant bubbles are rendered as markdown so their HTML carries
          // its own whitespace semantics — pre-wrap would add stray gaps
          // between block elements.
          whiteSpace: isUser ? 'pre-wrap' : 'normal',
          wordBreak: 'break-word',
          lineHeight: 1.5,
          opacity: message.interrupted ? 0.85 : 1
        }}
      >
        {imageSrc && (
          <img
            src={imageSrc}
            alt="worksheet"
            title={onCastImage ? 'Click to load this photo onto the canvas' : undefined}
            onClick={onCastImage ? () => onCastImage(imageSrc) : undefined}
            style={{
              display: 'block',
              maxWidth: '100%',
              maxHeight: 240,
              borderRadius: 10,
              marginBottom: message.content ? 8 : 0,
              background: '#fff',
              cursor: onCastImage ? 'pointer' : 'default'
            }}
          />
        )}
        {message.content && (
          <div style={{ padding: imageSrc ? '0 6px' : 0 }}>
            {isUser ? message.content : <MarkdownMessage>{message.content}</MarkdownMessage>}
          </div>
        )}
        {thinking && (
          <div
            style={{
              padding: imageSrc ? '0 6px' : 0,
              marginTop: message.content ? 6 : 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              opacity: 0.7
            }}
          >
            <LoadingOutlined /> Thinking…
          </div>
        )}
        {message.interrupted && (
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4, padding: imageSrc ? '0 6px' : 0 }}>
            (stopped)
          </div>
        )}
        {canReplay && (
          <div style={{ marginTop: 6, padding: imageSrc ? '0 6px' : 0, textAlign: 'right' }}>
            <Tooltip title={isSpeaking ? 'Stop reading' : 'Read this aloud'}>
              <Button
                type="text"
                size="small"
                icon={isSpeaking ? <SpeakingIcon /> : <SoundOutlined />}
                onClick={onReplay}
                aria-label={isSpeaking ? 'Stop reading this message' : 'Replay this message'}
                aria-pressed={isSpeaking}
                style={{ color: '#5b8def', height: 22, padding: '0 6px' }}
              />
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
}

// Inline speaker-with-animated-dots indicator. Sized to match
// SoundOutlined (1em square) so the surrounding Button doesn't jump when
// the icon swaps in/out. The three dots fade in sequentially so it reads
// as "speaking right now" rather than "loading".
function SpeakingIcon() {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        fontSize: '1em',
        lineHeight: 1
      }}
    >
      <SoundOutlined />
      <span style={{ display: 'inline-flex', gap: 1, marginLeft: 2 }}>
        <span className="ytai-speak-dot ytai-speak-dot-1" />
        <span className="ytai-speak-dot ytai-speak-dot-2" />
        <span className="ytai-speak-dot ytai-speak-dot-3" />
      </span>
      <style>{`
        .ytai-speak-dot {
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: currentColor;
          opacity: 0.2;
          animation: ytaiSpeakDot 1.1s infinite ease-in-out;
        }
        .ytai-speak-dot-2 { animation-delay: 0.18s; }
        .ytai-speak-dot-3 { animation-delay: 0.36s; }
        @keyframes ytaiSpeakDot {
          0%, 60%, 100% { opacity: 0.2; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-1px); }
        }
      `}</style>
    </span>
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
