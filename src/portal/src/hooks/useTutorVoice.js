import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

  // Mutable session state lives in refs so SSE callbacks (which close over
  // the initial render) always see the freshest values.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const bufferRef = useRef('');
  const queueRef = useRef([]); // [{ audio: HTMLAudioElement | null, urlPromise: Promise<string|null>, controller: AbortController, done: boolean }]
  const playingRef = useRef(false);
  const currentAudioRef = useRef(null);

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
      try {
        currentAudioRef.current.pause();
      } catch {
        // ignore
      }
      const src = currentAudioRef.current.src;
      currentAudioRef.current.src = '';
      if (src && src.startsWith('blob:')) URL.revokeObjectURL(src);
      currentAudioRef.current = null;
    }
    drainQueue();
    playingRef.current = false;
    setSpeaking(false);
  }, [drainQueue]);

  // Take the next entry off the queue and play it. Recursively chains to
  // the entry after via onended. If a fetch fails or the entry was
  // aborted, skip it and continue.
  const playNext = useCallback(() => {
    if (playingRef.current) return;
    const entry = queueRef.current[0];
    if (!entry) {
      setSpeaking(false);
      return;
    }
    playingRef.current = true;
    setSpeaking(true);

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
        audio.onended = () => {
          URL.revokeObjectURL(url);
          if (queueRef.current[0] === entry) queueRef.current.shift();
          currentAudioRef.current = null;
          playingRef.current = false;
          playNext();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          if (queueRef.current[0] === entry) queueRef.current.shift();
          currentAudioRef.current = null;
          playingRef.current = false;
          playNext();
        };
        audio.play().catch(() => {
          // Autoplay blocked — surface by clearing the queue; the user
          // will need to interact (toggle voice) before audio can play.
          URL.revokeObjectURL(url);
          stop();
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
      const urlPromise = fetch(`/api/tutor/${sessionId}/speak`, {
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
            return null;
          }
          if (!res.ok) return null;
          const blob = await res.blob();
          return URL.createObjectURL(blob);
        })
        .catch((err) => {
          if (err?.name === 'AbortError') return null;
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
  // doesn't wait for one giant synth call.
  const speak = useCallback(
    (rawText) => {
      if (!supported) return;
      stop();
      const text = typeof rawText === 'string' ? rawText : '';
      if (!text.trim()) return;
      const { completed, remainder } = splitSentences(text);
      const sentences = [...completed];
      const tail = remainder.trim();
      if (tail) sentences.push(tail);
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
      setEnabled,
      appendDelta,
      finalize,
      speak,
      stop
    }),
    [enabled, supported, speaking, setEnabled, appendDelta, finalize, speak, stop]
  );
}
