# Merged single-container production image for ytai. Three processes co-exist:
#
#   - Kokoro-FastAPI (TTS) on 127.0.0.1:8880  (inherited from the base image)
#   - EasyOCR FastAPI wrapper on 127.0.0.1:9531
#   - ytai Node.js app on 0.0.0.0:80 (the only port exposed externally)
#
# Build pattern (kpai-style): `pnpm build:prod` runs OUTSIDE docker and
# produces `dist/` with the Vite-built portal, the api source, and a
# consolidated package.json + pnpm-lock.yaml. Docker just installs prod
# Node deps and copies dist in. Avoids in-image pnpm prompts and keeps
# the build context tiny via .dockerignore.

# Kokoro-FastAPI CPU image: Python 3.10 + PyTorch CPU + Kokoro weights +
# espeak. Digest pinned because `latest` on ghcr.io moves.
FROM ghcr.io/remsky/kokoro-fastapi-cpu@sha256:d7df384acb57929f88a696d892c1a2e0c6b60fa934802ebec9a88626003b8e9a

USER root

# Node.js 24 from NodeSource. Debian-based base image so apt works.
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

# EasyOCR into Kokoro's existing /app/.venv so it shares the already-
# installed PyTorch CPU build. The base image uses `uv`, not pip, so we
# go via `uv pip install` with VIRTUAL_ENV pointing at the existing venv.
# Versions track devops/ocr/requirements.txt.
RUN VIRTUAL_ENV=/app/.venv uv pip install --no-cache \
      easyocr==1.7.2 \
      fastapi==0.115.0 \
      "uvicorn[standard]==0.30.6" \
      python-multipart==0.0.9

# Pre-download EasyOCR's CRAFT detector + CRNN recognizer (~80 MB) so the
# first request after a cold task start doesn't pay the network fetch.
RUN /app/.venv/bin/python -c "import easyocr; easyocr.Reader(['en'], gpu=False)"

# OCR FastAPI wrapper.
RUN mkdir -p /opt/ocr
COPY devops/ocr/server.py /opt/ocr/server.py

# ytai runtime — prod-only node deps first (cached across source changes),
# then the pre-built dist contents.
WORKDIR /opt/ytai
COPY dist/package.json dist/pnpm-lock.yaml dist/.npmrc ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --prod
COPY dist ./

COPY --chmod=755 devops/entrypoint.sh /usr/local/bin/entrypoint.sh

ENV NODE_ENV=production \
    YTAI_OCR_BASE_URL=http://127.0.0.1:9531 \
    YTAI_TTS_BASE_URL=http://127.0.0.1:8880/v1 \
    YTAI_API_PORT=80

EXPOSE 80
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
