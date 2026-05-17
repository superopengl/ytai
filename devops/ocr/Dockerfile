# OCR sidecar — EasyOCR (CRAFT detector + CRNN recognizer) on CPU PyTorch.
# We use the CPU-only torch wheels (see requirements.txt's --extra-index-url)
# to keep the image small; CUDA wheels are multi-GB and would never be used
# in the sidecar's CPU-only deploy targets anyway.

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# EasyOCR pulls in opencv-python (libGL), libgomp1 for torch, and the usual
# headless-X11 stubs for Pillow / OpenCV image decoding.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

# Pre-download CRAFT detector + CRNN recognizer weights (~80MB) at build
# time so the first request after a fresh container start doesn't pay the
# network fetch.
RUN python -c "import easyocr; easyocr.Reader(['en'], gpu=False)"

EXPOSE 8000

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
