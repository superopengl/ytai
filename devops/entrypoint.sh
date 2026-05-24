#!/bin/bash
# Boot the three processes that make up the merged ytai container. The app
# runs in the foreground as PID 1 so ECS task stop / SIGTERM cleanly exits
# the container; TTS and OCR are backgrounded.
#
# Restart semantics: if Kokoro or OCR crash, the app keeps serving and
# falls back gracefully (Brain uses Eyes-only when OCR is unavailable; the
# UI greys out voice when TTS returns errors). If the app crashes, the
# container exits and ECS schedules a fresh task. This is the prototype's
# explicit trade — one crashed sidecar shouldn't take the user-facing app
# down with it.

set -eu

# Forward SIGTERM to the background children so ECS task stop drains them
# rather than waiting for the grace-period SIGKILL.
shutdown() {
  kill -TERM "${TTS_PID:-0}" "${OCR_PID:-0}" 2>/dev/null || true
  exit 0
}
trap shutdown TERM INT

# TTS — Kokoro FastAPI. Replicates the base image's entrypoint but binds
# to localhost (only the ytai app talks to it).
(
  cd /app
  exec uv run --extra cpu --no-sync python -m uvicorn api.src.main:app \
    --host 127.0.0.1 --port 8880 --log-level warning
) &
TTS_PID=$!

# OCR — EasyOCR FastAPI wrapper. Uses Kokoro's venv (PyTorch already there).
(
  cd /opt/ocr
  exec /app/.venv/bin/python -m uvicorn server:app \
    --host 127.0.0.1 --port 9531 --log-level warning
) &
OCR_PID=$!

# ytai app — foreground, becomes PID 1's child but receives SIGTERM via the
# trap above when ECS stops the task.
cd /opt/ytai
exec node dist/src/api/server.js
