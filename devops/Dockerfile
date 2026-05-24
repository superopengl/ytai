# Merged single-container production image for ytai. Three processes co-exist:
#
#   - Kokoro-FastAPI (TTS) on 127.0.0.1:8880  (inherited from the base image)
#   - EasyOCR FastAPI wrapper on 127.0.0.1:9531
#   - ytai Node.js app on 0.0.0.0:80 (the only port exposed externally)
#
# Rationale for one container: prototype cost. ECS Fargate would size the
# task to the peak of all three regardless of layout, but a single container
# (a) keeps the deploy unit small, (b) avoids a multi-container task
# definition, and (c) makes the dev compose → prod gap smaller to reason
# about. Per-container restart isolation is the cost — see the comment in
# entrypoint.sh.
#
# Dev keeps using docker-compose.dev.yml's separate containers because
# rebuilding this 3 GB image on every Python or JS change is too slow for
# iteration.

# === STAGE 1: build ytai frontend + backend ==================================
FROM node:24-alpine AS node-build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY src/portal/package.json ./src/portal/
COPY deploy/package.json ./deploy/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build:prod

# === STAGE 2: runtime ========================================================
# Kokoro-FastAPI's CPU image is Python 3.10 + PyTorch CPU + Kokoro weights +
# espeak. We layer Node.js (for the ytai app) and EasyOCR (sharing the
# already-installed PyTorch) on top.
#
# The digest is pinned because `latest` on ghcr.io moves; treat upgrades as
# a deliberate Dockerfile edit + rebuild.
FROM ghcr.io/remsky/kokoro-fastapi-cpu@sha256:d7df384acb57929f88a696d892c1a2e0c6b60fa934802ebec9a88626003b8e9a AS runtime

USER root

# Node.js 24 from NodeSource — the base image is Debian-based so apt works.
# Could have started from a Node image and reinstalled the Kokoro stack on
# top, but PyTorch + Kokoro weights are the heavy part; adding Node onto
# the Python base is the smaller delta.
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

# EasyOCR into the existing /app/.venv so it shares Kokoro's PyTorch build.
# Versions track devops/ocr/requirements.txt — keep them in sync when one
# changes.
RUN /app/.venv/bin/pip install --no-cache-dir \
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

# ytai built artifacts.
RUN mkdir -p /opt/ytai
COPY --from=node-build /app/dist /opt/ytai/dist
COPY --from=node-build /app/node_modules /opt/ytai/node_modules
COPY --from=node-build /app/package.json /opt/ytai/package.json

COPY --chmod=755 devops/entrypoint.sh /usr/local/bin/entrypoint.sh

ENV NODE_ENV=production \
    YTAI_OCR_BASE_URL=http://127.0.0.1:9531 \
    YTAI_TTS_BASE_URL=http://127.0.0.1:8880/v1 \
    YTAI_API_PORT=80

EXPOSE 80
WORKDIR /opt/ytai
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
