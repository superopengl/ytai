# OCR sidecar — RapidOCR (ONNX Runtime wrapper around PaddleOCR's PP-OCRv4
# models). We swapped off PaddlePaddle because Paddle's CPU build segfaults
# under QEMU emulation on Apple Silicon hosts; ONNX Runtime ships native
# arm64 wheels so the same image works on Linux/amd64 and Darwin/arm64.

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# RapidOCR pulls in the full opencv-python (libGL), plus libgomp for ORT.
# Without libgl1 you get `ImportError: libGL.so.1` on first import.
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

# Warm the model cache during build so the first request doesn't pay the
# initial ONNX download. RapidOCR ships its models inside the package, so
# this is a quick instantiation rather than a large network fetch.
RUN python -c "from rapidocr_onnxruntime import RapidOCR; RapidOCR()"

EXPOSE 8000

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
