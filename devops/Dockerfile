# Merged single-container production image for ytai. Three processes co-exist:
#
#   - Kokoro-FastAPI (TTS) on 127.0.0.1:8880
#   - EasyOCR FastAPI wrapper on 127.0.0.1:9531
#   - ytai Node.js app on 0.0.0.0:80  (the only port exposed externally)
#
# Layer ordering: layers are sorted by change-frequency so a typical
# code-only rebuild only invalidates the bottom ytai-source COPY. From the
# top down: pinned-SHA donor image, system packages, Python deps + EasyOCR
# weights, OCR wrapper, entrypoint + runtime ENVs, ytai prod node deps,
# ytai backend source, ytai frontend assets. The two ytai-source layers
# are split so a backend-only or frontend-only change invalidates just one.
#
# All large COPY operations use `--link` so BuildKit treats them as
# content-addressable add-ons. That keeps cached layers from being
# re-extracted when an unrelated layer above changes, and makes the donor
# COPY (~2 GB) a no-op on warm builds.
#
# `dist/` is built on the host (see `pnpm build:prod`) before docker
# build, so this Dockerfile has no Node build stage. The .dockerignore
# restricts the context to `dist/` + `devops/`, keeping context tiny.

# === STAGE 0: cleaned Kokoro donor ===========================================
FROM ghcr.io/remsky/kokoro-fastapi-cpu@sha256:d7df384acb57929f88a696d892c1a2e0c6b60fa934802ebec9a88626003b8e9a AS kokoro-donor

USER root

# Drop the Japanese unidic dictionary (~800 MB). We only ever request
# English voices from Kokoro, so the Japanese phonemization pipeline is
# never instantiated. unidic's Python wrapper imports cleanly without
# the dicdir/ — it only fails when something asks for the dict path.
RUN rm -rf /app/.venv/lib/python3.10/site-packages/unidic/dicdir

# === STAGE 1: production runtime =============================================
FROM python:3.10-slim

USER root

# Kokoro's runtime deps + Node.js 24 for the ytai app. Combined into one
# layer with cache cleanup so we don't carry apt's index around.
RUN apt-get update && apt-get install -y --no-install-recommends \
      espeak-ng espeak-ng-data libsndfile1 ffmpeg \
      curl ca-certificates gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt /tmp/* \
    && corepack enable \
    && mkdir -p /usr/share/espeak-ng-data \
    && ln -sf /usr/lib/x86_64-linux-gnu/espeak-ng-data/* /usr/share/espeak-ng-data/ 2>/dev/null || true

# Bring in uv (Kokoro's package manager) — we use it to add EasyOCR to
# the existing venv. Copying the static binary is smaller than reinstalling.
COPY --link --from=kokoro-donor /usr/local/bin/uv /usr/local/bin/uv
COPY --link --from=kokoro-donor /usr/local/bin/uvx /usr/local/bin/uvx

# Pull the cleaned /app from the donor — venv (sans unidic dict) + Kokoro
# API source + downloaded model weights. ~2 GB once the Japanese dict is
# gone, vs ~2.8 GB with it. `--link` makes this content-addressable so
# downstream layer churn doesn't force a re-extract.
COPY --link --from=kokoro-donor /app /app

# Kokoro's runtime env vars (reproduced from the upstream image so the
# Python code finds espeak data + the venv binaries on PATH).
ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app:/app/api \
    UV_LINK_MODE=copy \
    USE_GPU=false \
    PHONEMIZER_ESPEAK_PATH=/usr/bin \
    PHONEMIZER_ESPEAK_DATA=/usr/share/espeak-ng-data \
    ESPEAK_DATA_PATH=/usr/share/espeak-ng-data \
    DEVICE=cpu \
    PATH=/app/.venv/bin:/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin

WORKDIR /app

# EasyOCR into Kokoro's existing venv. CPU torch index keeps uv from
# pulling the 2.5 GB CUDA wheel set when resolving easyocr's torch dep.
RUN VIRTUAL_ENV=/app/.venv uv pip install --no-cache \
      --extra-index-url https://download.pytorch.org/whl/cpu \
      --index-strategy unsafe-best-match \
      easyocr==1.7.2 \
      fastapi==0.115.0 \
      "uvicorn[standard]==0.30.6" \
      python-multipart==0.0.9

# Pre-download EasyOCR's CRAFT detector + CRNN recognizer (~80 MB) so the
# first request after a cold task start doesn't pay the network fetch.
RUN /app/.venv/bin/python -c "import easyocr; easyocr.Reader(['en'], gpu=False)"

# OCR FastAPI wrapper. Sits above the ytai-source COPYs so a ytai-only
# change keeps this layer cached.
RUN mkdir -p /opt/ocr
COPY --link devops/ocr/server.py /opt/ocr/server.py

# Entrypoint + ytai runtime ENVs. Above the ytai-source COPYs for the
# same caching reason — they rarely change relative to app code.
COPY --link --chmod=755 devops/entrypoint.sh /usr/local/bin/entrypoint.sh
ENV NODE_ENV=production \
    YTAI_OCR_BASE_URL=http://127.0.0.1:9531 \
    YTAI_TTS_BASE_URL=http://127.0.0.1:8880/v1 \
    YTAI_API_PORT=80

# ytai prod node_modules. Lockfile-pinned, so this layer survives any
# source-only change.
WORKDIR /opt/ytai
COPY dist/package.json dist/pnpm-lock.yaml dist/.npmrc ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --prod

# ytai payload — split so a backend-only or frontend-only change
# invalidates just one of the two layers (and the donor + node_modules
# layers above stay cached either way).
COPY --link dist/src ./src
COPY --link dist/public ./public

EXPOSE 80
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
