# RapidOCR HTTP wrapper.
#
# POST /ocr-json  body: {"image_base64": "..."}  →
#   {
#     "modelVersion": "rapidocr-onnxruntime-1.4.4/PP-OCRv4",
#     "width":  <px>,
#     "height": <px>,
#     "lines": [
#       {
#         "text": "Question 3",
#         "confidence": 0.97,
#         "bbox": [x, y, w, h]   # normalized 0..1, axis-aligned from the polygon
#       },
#       ...
#     ]
#   }
#
# We use RapidOCR (ONNX Runtime port of PaddleOCR's PP-OCRv4 detect+recognize
# pipeline) instead of PaddleOCR itself because Paddle's CPU SIMD code
# segfaults under QEMU emulation on Apple Silicon. RapidOCR ships native
# arm64 wheels so the container works on every dev machine.

import base64
import io
import os

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image
from pydantic import BaseModel
from rapidocr_onnxruntime import RapidOCR

MODEL_VERSION = os.environ.get(
    "YTAI_OCR_MODEL_VERSION",
    "rapidocr-onnxruntime-1.4.4/PP-OCRv4",
)

# Singleton; loading the ONNX models takes ~hundreds of ms.
_engine = RapidOCR()

app = FastAPI()


class OcrJsonBody(BaseModel):
    image_base64: str


@app.get("/health")
def health():
    return {"ok": True, "modelVersion": MODEL_VERSION}


@app.post("/ocr")
async def ocr_endpoint_multipart(file: UploadFile = File(...)):
    bytes_in = await file.read()
    return _run(bytes_in)


@app.post("/ocr-json")
def ocr_endpoint_json(body: OcrJsonBody):
    try:
        bytes_in = base64.b64decode(body.image_base64, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"image_base64 invalid: {exc}")
    return _run(bytes_in)


def _run(bytes_in: bytes):
    if not bytes_in:
        raise HTTPException(status_code=400, detail="empty image payload")

    try:
        image = Image.open(io.BytesIO(bytes_in))
        image.load()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"cannot decode image: {exc}")

    rgb = image.convert("RGB")
    w, h = rgb.size
    arr = np.array(rgb)

    # RapidOCR returns (result, elapse_dict). result is either None (empty
    # page) or a list of [polygon, text, confidence] tuples.
    result, _elapse = _engine(arr)
    items = result or []

    lines = []
    for entry in items:
        if not entry or len(entry) < 3:
            continue
        poly, text, conf = entry[0], entry[1], entry[2]
        if not text:
            continue
        xs = [p[0] for p in poly]
        ys = [p[1] for p in poly]
        x0 = max(0, min(xs))
        y0 = max(0, min(ys))
        x1 = min(w, max(xs))
        y1 = min(h, max(ys))
        if x1 <= x0 or y1 <= y0:
            continue
        lines.append(
            {
                "text": text,
                "confidence": float(conf),
                "bbox": [x0 / w, y0 / h, (x1 - x0) / w, (y1 - y0) / h],
            }
        )

    return {
        "modelVersion": MODEL_VERSION,
        "width": w,
        "height": h,
        "lines": lines,
    }
