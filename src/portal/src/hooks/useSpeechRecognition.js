import { useCallback, useEffect, useRef, useState } from 'react';

// Thin wrapper around the browser SpeechRecognition API for the chat
// composer. Continuous + interimResults so kids can speak a full sentence
// (or three) without the engine cutting them off, and so they can watch
// the words appear as they talk. Consumers read `transcript` to render
// what's been heard so far; it accumulates final phrases and replaces
// the in-progress interim each event.
//
// `start()` resets the transcript; `stop()` ends the session but leaves
// the transcript intact so the consumer can decide what to do with it.
// Unsupported browsers (Firefox at the moment) get `supported: false`
// and the UI should hide the mic.

export default function useSpeechRecognition({ lang = 'en-US' } = {}) {
  const SR =
    typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const supported = !!SR;

  const recogRef = useRef(null);
  const accumulatedFinalRef = useRef('');
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState(null);

  const stop = useCallback(() => {
    const recog = recogRef.current;
    if (!recog) return;
    try {
      recog.stop();
    } catch {
      // stop() throws if the recognizer was never started or already ended.
    }
  }, []);

  const start = useCallback(() => {
    if (!supported || recogRef.current) return;
    const recog = new SR();
    recog.lang = lang;
    recog.continuous = true;
    recog.interimResults = true;

    accumulatedFinalRef.current = '';
    setTranscript('');
    setError(null);

    recog.onresult = (event) => {
      let newFinal = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        const text = r[0]?.transcript ?? '';
        if (r.isFinal) newFinal += text;
        else interim += text;
      }
      if (newFinal) {
        // Join phrases with a single space so back-to-back finals don't
        // smush together (Chrome doesn't always include the trailing space).
        accumulatedFinalRef.current = joinWithSpace(accumulatedFinalRef.current, newFinal);
      }
      const combined = joinWithSpace(accumulatedFinalRef.current, interim);
      setTranscript(combined);
    };

    recog.onerror = (event) => {
      // `aborted` and `no-speech` are routine when the user stops or pauses;
      // don't surface those as errors.
      if (event.error && event.error !== 'aborted' && event.error !== 'no-speech') {
        setError(event.error);
      }
    };

    recog.onend = () => {
      setListening(false);
      recogRef.current = null;
    };

    try {
      recog.start();
      recogRef.current = recog;
      setListening(true);
    } catch (err) {
      setError(err?.message || 'speech-start-failed');
      recogRef.current = null;
    }
  }, [SR, supported, lang]);

  const reset = useCallback(() => {
    accumulatedFinalRef.current = '';
    setTranscript('');
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      const recog = recogRef.current;
      if (!recog) return;
      try {
        recog.abort();
      } catch {
        // ignore
      }
      recogRef.current = null;
    };
  }, []);

  return { supported, listening, transcript, error, start, stop, reset };
}

function joinWithSpace(a, b) {
  const left = (a || '').replace(/\s+$/, '');
  const right = (b || '').replace(/^\s+/, '');
  if (!left) return right;
  if (!right) return left;
  return `${left} ${right}`;
}
