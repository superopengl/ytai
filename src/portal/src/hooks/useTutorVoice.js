import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { message } from 'antd';
import apiFetch from '../lib/apiFetch.js';
import normalizeForSpeech from '../lib/normalizeForSpeech.js';
import splitSentences from '../lib/splitSentences.js';

// Voice playback for the tutor chat. Brain's tokens stream into appendDelta;
// once we have a complete sentence we POST it to /api/tutor/:sessionId/speak
// and queue the resulting MP3 for playback. The queue plays sentences in
// order — fetches happen in parallel for latency, but audio is serialized.
//
// Lifecycle:
//   - mount with sessionId; preference for enabled lives in localStorage.
//   - ChatPanel calls appendDelta(delta) for every SSE token chunk.
//   - On 'done' or after the SSE loop ends, ChatPanel calls finalize() to
//     flush any trailing sentence with no terminal punctuation.
//   - On 'error', Stop click, or new send, ChatPanel calls stop() to cut
//     audio, abort fetches, drop the queue, and reset the buffer.
//
// The hook is a no-op when disabled — no fetches go out, the buffer is
// not even accumulated. Re-enabling mid-turn starts speaking from the
// NEXT sentence forward; we don't replay what's already in the bubble.

const STORAGE_KEY = 'ytai.voice.enabled';
// Mirror the route's safety cap so we don't even bother POSTing a wall of
// text — splitSentences should have broken it up; if it didn't, drop it.
const MAX_SENTENCE_CHARS = 1500;

// One toast at a time for /speak failures. A failing turn enqueues many
// sentences in parallel; without the shared key we'd stack a dozen
// identical error toasts on top of each other.
function toastVoiceError(content) {
  message.error({ key: 'tutor-voice-error', content });
}

function readPreference() {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writePreference(value) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    // private mode etc. — silently ignore
  }
}

export default function useTutorVoice(sessionId) {
  const [enabled, setEnabledState] = useState(readPreference);
  const [supported, setSupported] = useState(true); // flips false on first 503
  const [speaking, setSpeaking] = useState(false);
  // Identifies which message bubble (if any) is currently being read aloud.
  // Set both by explicit replay clicks (via speak()) and by streaming
  // auto-speak (via setActiveTarget(), called from ChatPanel as it starts
  // each turn). The UI uses this to show the "I'm reading THIS one"
  // indicator on the right bubble.
  const [speakingId, setSpeakingId] = useState(null);

  // Mutable session state lives in refs so SSE callbacks (which close over
  // the initial render) always see the freshest values.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const bufferRef = useRef('');
  const queueRef = useRef([]); // [{ audio: HTMLAudioElement | null, urlPromise: Promise<string|null>, controller: AbortController, done: boolean }]
  const playingRef = useRef(false);
  const currentAudioRef = useRef(null);
  // The id of the message bubble that owns the current audio queue. Updated
  // by ChatPanel as a turn flows (placeholderId → real messageId on 'done').
  // playNext copies this into speakingId every time it starts a new entry,
  // so the icon follows the active bubble through the whole turn.
  const targetIdRef = useRef(null);

  const drainQueue = useCallback(() => {
    // Revoke any pending blob URLs we won't play.
    for (const entry of queueRef.current) {
      entry.controller?.abort();
      entry.urlPromise?.then?.((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    }
    queueRef.current = [];
  }, []);

  const stop = useCallback(() => {
    bufferRef.current = '';
    if (currentAudioRef.current) {
      const audio = currentAudioRef.current;
      // Detach handlers BEFORE pausing/clearing the src. Setting src='' on
      // a playing element fires an async 'error' event on most browsers;
      // without this, the stale handler would later clobber currentAudioRef
      // and playingRef just as a replacement audio has started playing.
      audio.onended = null;
      audio.onerror = null;
      try {
        audio.pause();
      } catch {
        // ignore
      }
      const src = audio.src;
      audio.src = '';
      if (src && src.startsWith('blob:')) URL.revokeObjectURL(src);
      currentAudioRef.current = null;
    }
    drainQueue();
    playingRef.current = false;
    targetIdRef.current = null;
    setSpeaking(false);
    setSpeakingId(null);
  }, [drainQueue]);

  // Called by ChatPanel to associate the audio queue with a specific message
  // bubble. During streaming this is the placeholder id; on 'done' it's
  // re-bound to the real message id. Updates speakingId immediately when
  // audio is already playing so the icon doesn't lag behind the rebind.
  const setActiveTarget = useCallback((id) => {
    targetIdRef.current = id;
    if (playingRef.current) setSpeakingId(id);
  }, []);

  // Take the next entry off the queue and play it. Recursively chains to
  // the entry after via onended. If a fetch fails or the entry was
  // aborted, skip it and continue.
  const playNext = useCallback(() => {
    if (playingRef.current) return;
    const entry = queueRef.current[0];
    if (!entry) {
      setSpeaking(false);
      setSpeakingId(null);
      return;
    }
    playingRef.current = true;
    setSpeaking(true);
    // Bind the visible "speaking" indicator to whatever bubble the active
    // turn currently belongs to. Leaving this stale-but-set across turns is
    // fine because ChatPanel rebinds at the start of every send().
    setSpeakingId(targetIdRef.current);

    entry.urlPromise
      .then((url) => {
        // Defend against stop() racing with the fetch resolution.
        if (queueRef.current[0] !== entry) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        if (!url) {
          queueRef.current.shift();
          playingRef.current = false;
          playNext();
          return;
        }
        const audio = new Audio(url);
        currentAudioRef.current = audio;
        const advance = () => {
          // If stop() (or a replay) detached us, this audio is no longer
          // the active one — leave currentAudioRef/playingRef alone so we
          // don't trample whatever took our place.
          if (currentAudioRef.current !== audio) {
            URL.revokeObjectURL(url);
            return;
          }
          URL.revokeObjectURL(url);
          if (queueRef.current[0] === entry) queueRef.current.shift();
          currentAudioRef.current = null;
          playingRef.current = false;
          playNext();
        };
        audio.onended = advance;
        audio.onerror = advance;
        audio.play().catch(() => {
          // Either autoplay was blocked or stop() pulled the rug. If we
          // were superseded, just bail; otherwise wipe the queue.
          URL.revokeObjectURL(url);
          if (currentAudioRef.current === audio) stop();
        });
      })
      .catch(() => {
        if (queueRef.current[0] === entry) queueRef.current.shift();
        playingRef.current = false;
        playNext();
      });
  }, [stop]);

  // Push one sentence onto the queue and kick playback. Caller is
  // responsible for whatever gating policy applies (the streaming path
  // checks enabledRef; the replay path bypasses it).
  const enqueueDirect = useCallback(
    (rawSentence) => {
      if (!supported || !sessionId) return;
      const text = normalizeForSpeech(rawSentence);
      if (!text || text.length > MAX_SENTENCE_CHARS) return;

      const controller = new AbortController();
      const urlPromise = apiFetch(`/api/tutor/${sessionId}/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: controller.signal
      })
        .then(async (res) => {
          if (res.status === 503) {
            // Server has no TTS configured — disable the feature for the
            // rest of the session so we don't keep firing pointless POSTs.
            setSupported(false);
            toastVoiceError('Voice is not configured on the server (YTAI_TTS_BASE_URL unset).');
            return null;
          }
          if (!res.ok) {
            // Surface backend failures (502 from synthesis error, 404 from
            // a foreign sessionId, …) so the user isn't left wondering why
            // nothing's coming out of their speakers.
            const detail = await res
              .json()
              .then((j) => j?.error)
              .catch(() => null);
            const summary = detail || `HTTP ${res.status}`;
            console.warn('[tutor-voice] /speak failed:', summary);
            toastVoiceError(`Couldn't read this aloud: ${summary}`);
            return null;
          }
          const blob = await res.blob();
          return URL.createObjectURL(blob);
        })
        .catch((err) => {
          if (err?.name === 'AbortError') return null;
          console.warn('[tutor-voice] /speak threw:', err);
          toastVoiceError(`Couldn't read this aloud: ${err?.message || 'network error'}`);
          return null;
        });

      queueRef.current.push({ urlPromise, controller });
      playNext();
    },
    [sessionId, supported, playNext]
  );

  const appendDelta = useCallback(
    (delta) => {
      if (!enabledRef.current || !supported) return;
      if (typeof delta !== 'string' || !delta) return;
      bufferRef.current += delta;
      const { completed, remainder } = splitSentences(bufferRef.current);
      bufferRef.current = remainder;
      for (const sentence of completed) enqueueDirect(sentence);
    },
    [enqueueDirect, supported]
  );

  const finalize = useCallback(() => {
    if (!enabledRef.current || !supported) return;
    const tail = bufferRef.current.trim();
    bufferRef.current = '';
    if (tail) enqueueDirect(tail);
  }, [enqueueDirect, supported]);

  // Replay a full message. Explicit user action — bypasses the enabled
  // toggle so the icon works even when the live-speech preference is off.
  // Splits into sentences for incremental playback so a long bubble
  // doesn't wait for one giant synth call. The optional id is the message
  // bubble's id; the UI uses speakingId to show a "talking" indicator on
  // that specific bubble.
  const speak = useCallback(
    (rawText, id = null) => {
      if (!supported) return;
      stop();
      const text = typeof rawText === 'string' ? rawText : '';
      if (!text.trim()) return;
      const { completed, remainder } = splitSentences(text);
      const sentences = [...completed];
      const tail = remainder.trim();
      if (tail) sentences.push(tail);
      if (sentences.length === 0) return;
      // Bind the queue to this bubble before enqueuing so playNext picks
      // the right id when the first audio kicks off. setSpeakingId(id) on
      // its own would race with playNext's own setSpeakingId(targetIdRef).
      targetIdRef.current = id;
      setSpeakingId(id);
      for (const s of sentences) enqueueDirect(s);
    },
    [supported, stop, enqueueDirect]
  );

  const setEnabled = useCallback(
    (next) => {
      writePreference(next);
      setEnabledState(next);
      if (!next) stop();
    },
    [stop]
  );

  // Hook unmount — kill audio and pending fetches so we don't speak after
  // navigating away.
  useEffect(() => stop, [stop]);

  return useMemo(
    () => ({
      enabled,
      supported,
      speaking,
      speakingId,
      setEnabled,
      setActiveTarget,
      appendDelta,
      finalize,
      speak,
      stop
    }),
    [
      enabled,
      supported,
      speaking,
      speakingId,
      setEnabled,
      setActiveTarget,
      appendDelta,
      finalize,
      speak,
      stop
    ]
  );
}
