import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Dropdown, Input, message, Modal, Select, Tag, Tooltip, Upload } from 'antd';
import {
  AudioOutlined,
  CheckOutlined,
  CopyOutlined,
  DeleteOutlined,
  FilePdfOutlined,
  LoadingOutlined,
  MoreOutlined,
  MutedOutlined,
  PictureOutlined,
  PlusOutlined,
  SendOutlined,
  SoundOutlined,
  StopOutlined
} from '@ant-design/icons';
import apiFetch, { authHeaders } from '../lib/apiFetch.js';
import streamSSE from '../lib/streamSSE.js';
import uploadDoc from '../lib/uploadDoc.js';
import useTutorVoice from '../hooks/useTutorVoice.js';
import AuthedImage from './AuthedImage.jsx';
import PhotoCapture from './PhotoCapture.jsx';
import { palette } from '../theme.js';

// Subject-blue is the "accent" for chat — it's the math subject color and
// the user-bubble background, used as a single named token here so the
// ChatPanel doesn't pick blue out of thin air.
const ACCENT_BLUE = palette.subjects.math.color;
const USER_BUBBLE_BG = ACCENT_BLUE;
const USER_BUBBLE_TINT = palette.subjects.math.tint;
const ASSISTANT_BUBBLE_BG = palette.bgBubble;
import useSpeechRecognition from '../hooks/useSpeechRecognition.js';
import MarkdownMessage from './MarkdownMessage.jsx';

// Chat side of the tutor page. Renders message bubbles interleaved with
// doc-upload bubbles (the visual marker that a worksheet was added at
// this point in the conversation). Doc state and current doc/page lives
// in the parent (TutorPage) so the canvas and chat stay in sync.
//
// Props:
//   sessionId, currentDocId, currentPage  — session + active doc/page
//   docs                                  — full doc list (with pages)
//   onDocsLoaded({ docs, currentDocId, aiAnnotationsByPage })
//                                         — fired after history fetch
//   onAiAnnotation(annotation)            — fired per streaming draw_annotation
//   onDocCreated(doc)                     — fired when a new doc was uploaded
//   onSelectDoc(docId, pageNumber)        — fired when student clicks a
//                                           past doc bubble
//   getAnnotatedImage()                   — pull-callback returning the
//     current canvas as { imageId, dataUrl } when the student has drawn on
//     the active page, else null. Read at send time so Eyes sees the marks.
export default function ChatPanel({
  sessionId,
  currentDocId,
  currentPage,
  docs,
  onDocsLoaded,
  onAiAnnotation,
  onDocCreated,
  onSelectDoc,
  onSessionDeleted,
  getAnnotatedImage
}) {
  const [messages, setMessages] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [awaitingTokens, setAwaitingTokens] = useState(false);
  const [error, setError] = useState(null);
  const [guidanceLevel, setGuidanceLevel] = useState('direct');
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef(null);
  const abortRef = useRef(null);
  const voice = useTutorVoice(sessionId);
  const speech = useSpeechRecognition();
  const dictationBaseRef = useRef('');
  const sendGenRef = useRef(0);

  useEffect(() => {
    if (!sessionId) return undefined;
    let cancelled = false;
    setMessages([]);
    setHistoryLoaded(false);
    setError(null);

    apiFetch(`/api/tutor/${sessionId}/messages`)
      .then((res) => {
        if (!res.ok) throw new Error("Couldn't load chat history");
        return res.json();
      })
      .then((body) => {
        if (cancelled) return;
        const loaded = body.messages ?? [];
        // Filter out legacy image-only user messages (role=user, empty
        // content, with imageId). The new model represents those via doc
        // bubbles; keeping the legacy rows around would render the same
        // image twice.
        const filtered = loaded.filter(
          (m) => !(m.role === 'user' && !m.content && m.imageId)
        );
        setMessages(filtered);
        setHistoryLoaded(true);
        if (body.session?.guidanceLevel) setGuidanceLevel(body.session.guidanceLevel);

        // Rebuild per-page AI annotations from past tool calls. Each call
        // carries imageId so we can route it directly.
        const aiByPage = new Map();
        for (const m of loaded) {
          if (!Array.isArray(m.toolCalls)) continue;
          for (const tc of m.toolCalls) {
            if (tc?.name !== 'draw_annotation') continue;
            const imageId = tc.args?.imageId;
            if (!imageId) continue;
            if (!aiByPage.has(imageId)) aiByPage.set(imageId, []);
            aiByPage.get(imageId).push({ id: `${m.id}:${tc.id ?? aiByPage.get(imageId).length}`, args: tc.args });
          }
        }
        onDocsLoaded?.({
          docs: body.docs ?? [],
          currentDocId: body.session?.currentDocId ?? null,
          subject: body.session?.subject ?? null,
          aiAnnotationsByPage: aiByPage
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setHistoryLoaded(true);
          setError(err.message || "Couldn't load chat history.");
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, docs]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!speech.listening) return;
    const base = dictationBaseRef.current;
    const next = speech.transcript ? (base ? `${base} ${speech.transcript}` : speech.transcript) : base;
    setInput(next);
  }, [speech.transcript, speech.listening]);

  // Combine messages + docs into a single chronologically-ordered timeline.
  // Doc bubbles slot in at the position they were uploaded.
  const timeline = useMemo(() => {
    const items = [];
    for (const m of messages) items.push({ kind: 'message', createdAt: m.createdAt, data: m });
    for (const d of docs ?? []) items.push({ kind: 'doc', createdAt: d.createdAt, data: d });
    items.sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return ta - tb;
    });
    return items;
  }, [messages, docs]);

  const changeGuidanceLevel = useCallback(
    async (next) => {
      if (!sessionId || next === guidanceLevel) return;
      const previous = guidanceLevel;
      setGuidanceLevel(next);
      try {
        const res = await apiFetch(`/api/tutor/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guidanceLevel: next })
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Couldn't change tutor mode");
        }
      } catch (err) {
        setGuidanceLevel(previous);
        setError(err.message || "Couldn't change tutor mode.");
      }
    },
    [guidanceLevel, sessionId]
  );

  const toggleDictation = useCallback(() => {
    if (!speech.supported) return;
    if (speech.listening) {
      speech.stop();
      return;
    }
    // Cut TTS before opening the mic — without this the recognizer hears
    // the spoken sentence coming out of the speakers and feeds it back
    // into the input box.
    if (voice.speaking) voice.stop();
    dictationBaseRef.current = input.replace(/\s+$/, '');
    speech.start();
  }, [input, speech, voice]);

  const handleUploadFiles = useCallback(
    async (files) => {
      if (!sessionId || !files || files.length === 0) return;
      setUploading(true);
      setError(null);
      try {
        const { doc } = await uploadDoc(sessionId, files);
        onDocCreated?.(doc);
      } catch (err) {
        setError(err.message || "Couldn't upload that worksheet.");
      } finally {
        setUploading(false);
      }
    },
    [sessionId, onDocCreated]
  );

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || !sessionId) return;

    const myGen = ++sendGenRef.current;
    if (abortRef.current) {
      abortRef.current.abort();
      setMessages((prev) =>
        prev.map((m) => (m._streaming ? { ...m, _streaming: false, interrupted: true } : m))
      );
    }
    voice.stop();
    if (speech.listening) speech.stop();
    speech.reset();
    dictationBaseRef.current = '';

    setInput('');
    setError(null);
    setBusy(true);
    setAwaitingTokens(true);

    const placeholderId = `pending-${Date.now()}`;
    const userLocalId = `local-${placeholderId}`;
    setMessages((prev) => [
      ...prev,
      { id: userLocalId, role: 'user', content: text, _local: true, createdAt: new Date().toISOString() },
      { id: placeholderId, role: 'assistant', content: '', _streaming: true, createdAt: new Date().toISOString() }
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    voice.setActiveTarget(placeholderId);

    // Pull a flattened PNG of the photo + freehand strokes if the student
    // has marked the page. Null when the canvas is clean — server then
    // falls back to the original photo for vision lookups.
    let annotatedImage = null;
    try {
      annotatedImage = typeof getAnnotatedImage === 'function' ? getAnnotatedImage() : null;
    } catch {
      // Konva can throw if the underlying image is tainted (cross-origin
      // without anonymous). Swallow and proceed without annotations rather
      // than blocking the send.
      annotatedImage = null;
    }

    try {
      const stream = streamSSE(`/api/tutor/${sessionId}/message`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          content: text,
          viewingPage: Number.isInteger(currentPage) ? currentPage : undefined,
          annotatedImage: annotatedImage || undefined
        }),
        signal: controller.signal
      });

      for await (const { event, data } of stream) {
        if (sendGenRef.current !== myGen) break;
        if (event === 'user') {
          // Keep the local placeholder createdAt: the server timestamp is
          // strictly later than the assistant placeholder's local time, so
          // swapping it in would flip the two bubbles in the timeline sort
          // until the 'done' event lands. Server times are reconciled on
          // the next history fetch.
          setMessages((prev) =>
            prev.map((m) =>
              m.id === userLocalId
                ? {
                    id: data.id,
                    role: 'user',
                    content: data.content,
                    createdAt: m.createdAt
                  }
                : m
            )
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
          if (data.interrupted) voice.stop();
          else {
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
        } else if (event === 'retry') {
          // Server detected a phantom-highlight reply and is re-running
          // Brain in the same HTTP turn. Clear the in-progress bubble and
          // kill the voice queue so the retry's tokens stream into a
          // clean slate. The same placeholder id keeps audio bound to
          // this bubble after re-binding the voice target.
          setAwaitingTokens(true);
          setMessages((prev) =>
            prev.map((m) => (m.id === placeholderId ? { ...m, content: '' } : m))
          );
          voice.stop();
          voice.setActiveTarget(placeholderId);
        } else if (event === 'lookup-start' || event === 'lookup') {
          setAwaitingTokens(true);
        } else if (event === 'tool') {
          setAwaitingTokens(true);
          if (data?.name === 'draw_annotation' && data.args?.imageId) {
            onAiAnnotation?.({
              id: `${placeholderId}:${data.id ?? Math.random().toString(36).slice(2)}`,
              args: data.args
            });
          }
        } else if (event === 'error') {
          setAwaitingTokens(false);
          setError(data.error || "Something went wrong. Please try again.");
          voice.stop();
        }
      }
    } catch (err) {
      if (sendGenRef.current === myGen && err.name !== 'AbortError') {
        setError(err.message || "Couldn't reach the tutor. Please try again.");
        voice.stop();
      }
    } finally {
      if (sendGenRef.current === myGen) {
        abortRef.current = null;
        setBusy(false);
        setAwaitingTokens(false);
      }
    }
  }, [input, sessionId, currentPage, voice, speech, onAiAnnotation, getAnnotatedImage]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    voice.stop();
    if (speech.listening) speech.stop();
  }, [voice, speech]);

  const [modal, modalContextHolder] = Modal.useModal();

  const handleDeleteSession = useCallback(() => {
    if (!sessionId) return;
    modal.confirm({
      title: 'Delete this session?',
      content: "This permanently removes the chat, images, and any reports. You can't undo it.",
      okText: 'Delete',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const res = await apiFetch(`/api/tutor/${sessionId}`, { method: 'DELETE' });
          if (!res.ok) throw new Error("Couldn't delete that session");
          onSessionDeleted?.(sessionId);
        } catch (err) {
          message.error(err.message || "Couldn't delete that session");
        }
      }
    });
  }, [modal, sessionId, onSessionDeleted]);

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

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
      {modalContextHolder}
      <div style={headerStyle}>
        <Tooltip
          title={
            guidanceLevel === 'guided'
              ? 'Guided: one tiny step at a time, lots of check-ins'
              : guidanceLevel === 'balanced'
                ? 'Balanced: short chunks with a check-in between'
                : 'Direct: full walkthrough in one message'
          }
        >
          <Select
            value={guidanceLevel}
            onChange={changeGuidanceLevel}
            options={[
              { label: 'Guided', value: 'guided' },
              { label: 'Balanced', value: 'balanced' },
              { label: 'Direct', value: 'direct' }
            ]}
            style={{ marginLeft: 'auto', width: 110 }}
          />
        </Tooltip>
        <Tooltip
          title={
            !voice.supported
              ? "Voice isn't set up yet."
              : voice.enabled
                ? 'Turn voice off'
                : 'Turn voice on — tutor will read replies aloud'
          }
        >
          <Button
            disabled={!voice.supported}
            aria-pressed={voice.enabled}
            icon={voice.enabled ? <SoundOutlined /> : <MutedOutlined />}
            onClick={() => voice.setEnabled(!voice.enabled)}
            type={voice.enabled ? 'primary' : 'default'}
          />
        </Tooltip>
        <Dropdown
          trigger={['click']}
          placement="bottomRight"
          menu={{
            items: [
              {
                key: 'delete',
                label: 'Delete this session',
                icon: <DeleteOutlined />,
                danger: true,
                onClick: handleDeleteSession
              }
            ]
          }}
        >
          <Button icon={<MoreOutlined />} aria-label="Session menu" />
        </Dropdown>
      </div>
      <div ref={scrollRef} style={scrollStyle}>
        {!historyLoaded ? (
          <div style={centeredHint}>
            <LoadingOutlined style={{ marginRight: 8 }} /> Loading chat…
          </div>
        ) : timeline.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <PhotoCapture onStart={handleUploadFiles} busy={uploading} />
          </div>
        ) : (
          timeline.map((item, idx) => {
            if (item.kind === 'doc') {
              return (
                <DocBubble
                  key={`doc:${item.data.id}`}
                  doc={item.data}
                  sessionId={sessionId}
                  isCurrent={item.data.id === currentDocId}
                  onSelect={(pageNumber) => onSelectDoc?.(item.data.id, pageNumber ?? 1)}
                />
              );
            }
            const message = item.data;
            const isThisSpeaking = voice.supported && voice.speakingId === message.id;
            const isStreamingTail =
              idx === timeline.length - 1 && message.role === 'assistant' && message._streaming;
            return (
              <Bubble
                key={message.id}
                message={message}
                isSpeaking={isThisSpeaking}
                thinking={isStreamingTail && thinkingActive}
                onReplay={
                  voice.supported
                    ? () => {
                        if (isThisSpeaking) {
                          voice.stop();
                          return;
                        }
                        // Close the mic before TTS starts — otherwise the
                        // recognizer would pick up the read-aloud audio.
                        if (speech.listening) speech.stop();
                        voice.speak(message.content, message.id);
                      }
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

      {speech.error && (
        <Alert
          type="warning"
          showIcon
          closable
          message={dictationErrorMessage(speech.error)}
          onClose={speech.reset}
          style={{ margin: '0 12px 8px' }}
        />
      )}

      <div style={composerStyle}>
        <Tooltip title="Add a worksheet or PDF">
          <Upload
            beforeUpload={(file, list) => {
              // antd fires beforeUpload once per file in a multi-select.
              // Only act on the first call (when file === list[0]) so we
              // don't upload the same batch N times.
              if (Array.isArray(list) && list.length > 0 && file === list[0]) {
                handleUploadFiles(list);
              } else if (!Array.isArray(list) || list.length === 0) {
                handleUploadFiles([file]);
              }
              return false;
            }}
            accept="image/*,application/pdf"
            multiple
            showUploadList={false}
            disabled={uploading}
          >
            <Button
              icon={uploading ? <LoadingOutlined /> : <PlusOutlined />}
              disabled={uploading}
              aria-label="Upload a new worksheet"
            />
          </Upload>
        </Tooltip>
        {speech.supported && (
          <Tooltip
            title={
              speech.listening
                ? 'Stop dictation'
                : voice.speaking
                  ? 'Stop reading and dictate'
                  : 'Dictate your question'
            }
          >
            <Button
              icon={<AudioOutlined />}
              onClick={toggleDictation}
              danger={speech.listening}
              type={speech.listening ? 'primary' : 'default'}
              aria-pressed={speech.listening}
              aria-label={
                speech.listening
                  ? 'Stop dictation'
                  : voice.speaking
                    ? 'Stop reading and start dictation'
                    : 'Start dictation'
              }
            />
          </Tooltip>
        )}
        <Input.TextArea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onKeyDown}
          autoSize={{ minRows: 1, maxRows: 5 }}
          placeholder={
            speech.listening
              ? 'Listening… speak now, then click the mic to stop.'
              : busy
                ? 'Tutor is thinking — type or speak to jump in…'
                : 'Ask a question, or add a worksheet…'
          }
          readOnly={speech.listening}
          maxLength={2000}
          style={{
            flex: 1,
            borderRadius: 12,
            borderColor: speech.listening ? palette.error : undefined,
            boxShadow: speech.listening ? `0 0 0 2px ${palette.error}26` : undefined
          }}
        />
        {(busy || voice.speaking) && (
          <Tooltip title="Stop the tutor">
            <Button danger icon={<StopOutlined />} onClick={stop} aria-label="Stop the tutor" />
          </Tooltip>
        )}
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={send}
          disabled={!input.trim()}
          title={busy || voice.speaking ? 'Send (the tutor will pause and listen)' : undefined}
        >
          Send
        </Button>
      </div>
    </div>
  );
}

function Bubble({ message, onReplay, isSpeaking, thinking }) {
  const isUser = message.role === 'user';
  if (!isUser && !message.content && !thinking) return null;
  const canReplay = !isUser && onReplay && (!message._streaming || isSpeaking);
  const canCopy = Boolean(message.content) && !message._streaming;
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(copyTimerRef.current), []);
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard write can fail on insecure contexts or denied permission;
      // surface nothing — the user can retry or copy by hand.
    }
  }, [message.content]);
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
          display: 'flex',
          flexDirection: 'column',
          alignItems: isUser ? 'flex-end' : 'flex-start',
          maxWidth: '78%'
        }}
      >
        <div
          style={{
            padding: '10px 14px',
            borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
            background: isUser ? USER_BUBBLE_BG : ASSISTANT_BUBBLE_BG,
            color: isUser ? palette.surface : palette.textInkSoft,
            whiteSpace: isUser ? 'pre-wrap' : 'normal',
            wordBreak: 'break-word',
            lineHeight: 1.5,
            opacity: message.interrupted ? 0.85 : 1
          }}
        >
          {message.content && (
            <div>
              {isUser ? message.content : <MarkdownMessage>{message.content}</MarkdownMessage>}
            </div>
          )}
          {thinking && (
            <div
              style={{
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
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>(stopped)</div>
          )}
        </div>
        {(canReplay || canCopy) && (
          <div style={{ marginTop: 4, display: 'flex', gap: 0, alignSelf: 'flex-end' }}>
            {canReplay && (
              <Tooltip title={isSpeaking ? 'Stop reading' : 'Read this aloud'}>
                <Button
                  type="text"
                  size="small"
                  shape="circle"
                  icon={isSpeaking ? <SpeakingIcon /> : <SoundOutlined />}
                  onClick={onReplay}
                  aria-label={isSpeaking ? 'Stop reading this message' : 'Replay this message'}
                  aria-pressed={isSpeaking}
                  style={{ color: ACCENT_BLUE }}
                />
              </Tooltip>
            )}
            {canCopy && (
              <Tooltip title={copied ? 'Copied' : 'Copy message'}>
                <Button
                  type="text"
                  size="small"
                  shape="circle"
                  icon={copied ? <CheckOutlined /> : <CopyOutlined />}
                  onClick={handleCopy}
                  aria-label={copied ? 'Message copied' : 'Copy message to clipboard'}
                  style={{ color: ACCENT_BLUE }}
                />
              </Tooltip>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DocBubble({ doc, sessionId, isCurrent, onSelect }) {
  const pages = doc.pages ?? [];
  const isPdf = doc.kind === 'pdf';
  const label = isPdf ? 'PDF worksheet' : pages.length > 1 ? `${pages.length}-page worksheet` : 'Worksheet';
  // `min(78%, 360px)` caps the bubble at ~4 thumbnails on wide chat
  // panels — without it, a 10-page upload stretches the bubble across
  // the whole chat panel even though the strip is scrollable. Native
  // <button> intrinsic sizing also fights flex overflow, so we drive
  // the click target as a div with role="button".
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect?.(1)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect?.(1);
          }
        }}
        style={{
          maxWidth: 'min(78%, 360px)',
          minWidth: 0,
          padding: 8,
          border: `2px solid ${isCurrent ? ACCENT_BLUE : 'transparent'}`,
          borderRadius: '16px 16px 4px 16px',
          background: USER_BUBBLE_TINT,
          cursor: 'pointer',
          textAlign: 'left',
          boxSizing: 'border-box'
        }}
        aria-label={`${label} — click to make current`}
        title={isCurrent ? 'Currently being studied' : 'Make this the worksheet we are studying'}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: palette.textInkSoft,
            fontSize: 13,
            marginBottom: 6,
            padding: '0 4px'
          }}
        >
          {isPdf ? <FilePdfOutlined /> : <PictureOutlined />}
          <span style={{ fontWeight: 600 }}>{label}</span>
          {isCurrent && (
            <Tag color="green" style={{ marginInlineEnd: 0 }} variant='outlined'>
              current
            </Tag>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 6,
            overflowX: 'auto',
            minWidth: 0,
            scrollbarWidth: 'thin'
          }}
        >
          {pages.map((page) => (
            <AuthedImage
              key={page.id}
              src={`/api/tutor/${sessionId}/image/${page.id}`}
              alt={`page ${page.pageNumber}`}
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(page.pageNumber);
              }}
              style={{
                width: 80,
                height: 100,
                objectFit: 'cover',
                borderRadius: 6,
                background: palette.surface,
                flex: '0 0 auto',
                cursor: 'pointer'
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

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

function dictationErrorMessage(code) {
  if (code === 'not-allowed' || code === 'service-not-allowed') {
    return 'Microphone is blocked. Allow it in your browser settings to use voice.';
  }
  if (code === 'audio-capture') {
    return "I couldn't find a microphone.";
  }
  if (code === 'network') {
    return 'Voice needs an internet connection.';
  }
  return "Voice isn't working right now.";
}

const headerStyle = {
  padding: '12px 16px',
  borderBottom: `1px solid ${palette.borderSoft}`,
  display: 'flex',
  alignItems: 'center',
  gap: 8
};
const scrollStyle = { flex: 1, overflowY: 'auto', padding: 16, minHeight: 0 };
const composerStyle = {
  padding: 12,
  borderTop: `1px solid ${palette.borderSoft}`,
  display: 'flex',
  gap: 8,
  alignItems: 'flex-end'
};
const centeredHint = {
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: palette.textHint,
  textAlign: 'center'
};
