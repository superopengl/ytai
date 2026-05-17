# EasyOCR HTTP wrapper.
#
# POST /ocr-json  body: {"image_base64": "..."}  →
#   {
#     "modelVersion": "easyocr-1.7.2/craft+crnn",
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
# EasyOCR runs the CRAFT detector + a CRNN recognizer through PyTorch. Native
# arm64 wheels mean the same image works on Apple Silicon dev machines and
# Linux/amd64 deploy targets.

import base64
import io
import os

import easyocr
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image
from pydantic import BaseModel

MODEL_VERSION = os.environ.get(
    "YTAI_OCR_MODEL_VERSION",
    "easyocr-1.7.2/craft+crnn",
)

# EasyOCR happily emits low-confidence guesses on blank margins, page noise,
# and crinkled-paper shadows. Anything below this score gets dropped before
# it can poison find_text_on_image ranking.
MIN_CONFIDENCE = float(os.environ.get("YTAI_OCR_MIN_CONFIDENCE", "0.3"))

# Singleton; loading the detector + recognizer weights from disk costs a
# few seconds, so we pay it once at process start.
_engine = easyocr.Reader(["en"], gpu=False)

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

    # EasyOCR returns a list of (polygon, text, confidence) tuples. polygon
    # is four [x, y] points clockwise from the top-left.
    result = _engine.readtext(arr)

    lines = []
    for entry in result or []:
        if not entry or len(entry) < 3:
            continue
        poly, text, conf = entry[0], entry[1], entry[2]
        if not text:
            continue
        if conf < MIN_CONFIDENCE:
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
