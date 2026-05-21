import { useEffect, useRef, useState } from 'react';
import {
  Stage,
  Layer,
  Image as KonvaImage,
  Line,
  Ellipse,
  Rect,
  Group,
  Label,
  Tag,
  Text as KonvaText
} from 'react-konva';
import { Button, ColorPicker, Slider, Space, Tooltip } from 'antd';
import { ClearOutlined, HighlightOutlined, UndoOutlined } from '@ant-design/icons';

const DEFAULT_AI_COLOR = '#3aa0ff';

const PEN_PRESETS = ['#ff1744', '#22c55e', '#f97316', '#a855f7', '#1d2233', '#ffd60a', '#06b6d4'];
const PEN_WIDTH_MIN = 2;
const PEN_WIDTH_MAX = 20;
const PEN_WIDTH_DEFAULT = 7;

// Single-page canvas. Strokes are passed in via `lines` and surfaced via
// `onLinesChange` so a parent (e.g. PagedCanvas) can keep a per-page map
// — strokes survive page switches that way.
export default function AnnotationCanvas({
  imageUrl,
  lines = [],
  onLinesChange,
  aiAnnotations = [],
  onClearAiAnnotations,
  toolbarExtras = null
}) {
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const aiLayerRef = useRef(null);
  const drawing = useRef(false);
  const [image, setImage] = useState(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [penColor, setPenColor] = useState(PEN_PRESETS[0]);
  const [penWidth, setPenWidth] = useState(PEN_WIDTH_DEFAULT);

  useEffect(() => {
    if (!imageUrl) {
      setImage(null);
      return undefined;
    }
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    const onLoad = () => setImage(img);
    img.addEventListener('load', onLoad);
    return () => img.removeEventListener('load', onLoad);
  }, [imageUrl]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const resize = () => setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fit = fitToContainer(image, containerSize);

  function toNormalized(pos) {
    if (fit.width === 0 || fit.height === 0) return null;
    return [pos.x / fit.width, pos.y / fit.height];
  }

  function setLines(updater) {
    if (typeof onLinesChange !== 'function') return;
    const next = typeof updater === 'function' ? updater(lines) : updater;
    onLinesChange(next);
  }

  function startLine(e) {
    if (!image) return;
    if (e.target?.getLayer?.() === aiLayerRef.current) return;
    const pt = toNormalized(e.target.getStage().getPointerPosition());
    if (!pt) return;
    drawing.current = true;
    setLines((prev) => [...prev, { points: pt, color: penColor, width: penWidth }]);
  }

  function extendLine(e) {
    if (!drawing.current) return;
    const pt = toNormalized(e.target.getStage().getPointerPosition());
    if (!pt) return;
    setLines((prev) => {
      const last = prev[prev.length - 1];
      if (!last) return prev;
      const next = { ...last, points: [...last.points, ...pt] };
      return [...prev.slice(0, -1), next];
    });
  }

  function endLine() {
    drawing.current = false;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Space style={{ marginTop: 4, marginBottom: 8, flexWrap: 'wrap', rowGap: 8 }} size={[8, 8]}>
        <Tooltip title="Undo last stroke">
          <Button
            icon={<UndoOutlined />}
            onClick={() => setLines((prev) => prev.slice(0, -1))}
            disabled={lines.length === 0}
          >
            Undo
          </Button>
        </Tooltip>
        <Tooltip title="Clear all annotations">
          <Button
            icon={<ClearOutlined />}
            onClick={() => setLines([])}
            disabled={lines.length === 0}
          >
            Clear
          </Button>
        </Tooltip>
        {onClearAiAnnotations && (
          <Tooltip title="Remove the tutor's highlights and circles">
            <Button
              icon={<HighlightOutlined />}
              onClick={onClearAiAnnotations}
              disabled={aiAnnotations.length === 0}
            >
              Clear tutor marks
            </Button>
          </Tooltip>
        )}

        <span style={toolbarDividerStyle} />

        <Tooltip title="Pen color">
          <ColorPicker
            value={penColor}
            onChange={(c) => setPenColor(c.toHexString())}
            disabledAlpha
            presets={[{ label: 'Quick colors', colors: PEN_PRESETS }]}
          />
        </Tooltip>

        <span style={toolbarDividerStyle} />

        <Tooltip title="Pen thickness">
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '0 8px'
            }}
          >
            <span
              aria-hidden
              style={{
                display: 'inline-block',
                width: penWidth,
                height: penWidth,
                borderRadius: '50%',
                background: penColor,
                flexShrink: 0
              }}
            />
            <Slider
              min={PEN_WIDTH_MIN}
              max={PEN_WIDTH_MAX}
              step={1}
              value={penWidth}
              onChange={setPenWidth}
              style={{ width: 120, margin: 0 }}
              tooltip={{ formatter: (v) => `${v}px` }}
            />
            <span style={{ minWidth: 28, fontSize: 12, color: '#5d6478' }}>{penWidth}px</span>
          </div>
        </Tooltip>

        {toolbarExtras}
      </Space>
      <div
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 0,
          background: '#0f1320',
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden'
        }}
      >
        {image && fit.width > 0 && (
          <Stage
            ref={stageRef}
            width={fit.width}
            height={fit.height}
            onMouseDown={startLine}
            onMouseMove={extendLine}
            onMouseUp={endLine}
            onTouchStart={startLine}
            onTouchMove={extendLine}
            onTouchEnd={endLine}
          >
            <Layer listening={false}>
              <KonvaImage image={image} width={fit.width} height={fit.height} />
            </Layer>
            <Layer ref={aiLayerRef}>
              {aiAnnotations.map((anno) => (
                <AiAnnotation
                  key={anno.id}
                  annotation={anno}
                  fitWidth={fit.width}
                  fitHeight={fit.height}
                />
              ))}
            </Layer>
            <Layer>
              {lines.map((line, idx) => (
                <Line
                  key={idx}
                  points={normalizedToPixels(line.points, fit.width, fit.height)}
                  stroke={line.color || '#ff1744'}
                  strokeWidth={line.width || 7}
                  tension={0.3}
                  lineCap="round"
                  lineJoin="round"
                  shadowColor="rgba(255, 255, 255, 0.95)"
                  shadowBlur={Math.max(4, (line.width || 7) * 0.7)}
                  shadowOpacity={1}
                  globalCompositeOperation="source-over"
                />
              ))}
            </Layer>
          </Stage>
        )}
      </div>
    </div>
  );
}

const toolbarDividerStyle = {
  display: 'inline-block',
  width: 1,
  height: 24,
  background: '#ececf3',
  alignSelf: 'center'
};

function normalizedToPixels(points, width, height) {
  const out = new Array(points.length);
  for (let i = 0; i < points.length; i += 2) {
    out[i] = points[i] * width;
    out[i + 1] = points[i + 1] * height;
  }
  return out;
}

function fitToContainer(image, container) {
  if (!image || container.width === 0 || container.height === 0) {
    return { width: 0, height: 0 };
  }
  const ratio = Math.min(container.width / image.width, container.height / image.height);
  return { width: image.width * ratio, height: image.height * ratio };
}

const HIGHLIGHT_SWEEP_MS = 900;
function easeOut(t) {
  return 1 - Math.pow(1 - t, 3);
}

const LABEL_PILL_HEIGHT = 22;
const LABEL_PILL_GAP = 6;

function AiAnnotation({ annotation, fitWidth, fitHeight }) {
  const args = annotation?.args;
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const id = annotation?.id;
    if (!id) return undefined;
    setProgress(0);
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / HIGHLIGHT_SWEEP_MS);
      setProgress(easeOut(t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [annotation?.id]);

  const coords = readCornerBbox(args);
  if (!coords) return null;
  const x = coords.x1 * fitWidth;
  const y = coords.y1 * fitHeight;
  const w = (coords.x2 - coords.x1) * fitWidth;
  const h = (coords.y2 - coords.y1) * fitHeight;
  const color = isCssColor(args.color) ? args.color : DEFAULT_AI_COLOR;
  const labelText = typeof args.label === 'string' ? args.label.trim() : '';

  return (
    <Group>
      {renderShape({ shape: args.shape, x, y, w, h, color, progress })}
      {labelText && (
        <AnnotationLabel
          text={labelText}
          color={color}
          bboxX={x}
          bboxY={y}
          bboxW={w}
          bboxH={h}
          fitWidth={fitWidth}
          fitHeight={fitHeight}
          opacity={progress}
        />
      )}
    </Group>
  );
}

function renderShape({ shape, x, y, w, h, color, progress }) {
  if (shape === 'rect') {
    return (
      <Rect
        x={x}
        y={y}
        width={Math.max(w, 4)}
        height={Math.max(h, 4)}
        stroke={color}
        strokeWidth={4}
        dash={[10, 6]}
        cornerRadius={6}
        listening={false}
      />
    );
  }

  if (shape === 'circle') {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = Math.max(w / 2, 12);
    const ry = Math.max(h / 2, 12);
    return (
      <Ellipse
        x={cx}
        y={cy}
        radiusX={rx}
        radiusY={ry}
        stroke={color}
        strokeWidth={4}
        listening={false}
      />
    );
  }

  const fullWidth = Math.max(w, 4);
  const fullHeight = Math.max(h, 4);
  const sweptWidth = Math.max(fullWidth * progress, 0);
  return (
    <Rect
      x={x}
      y={y}
      width={sweptWidth}
      height={fullHeight}
      fill={color}
      opacity={0.25}
      cornerRadius={4}
      listening={false}
    />
  );
}

function AnnotationLabel({ text, color, bboxX, bboxY, bboxW, bboxH, fitWidth, fitHeight, opacity }) {
  const [dragged, setDragged] = useState(null);

  const below = bboxY + bboxH + LABEL_PILL_GAP + LABEL_PILL_HEIGHT <= fitHeight;
  const defaultY = below ? bboxY + bboxH + LABEL_PILL_GAP : bboxY - LABEL_PILL_GAP - LABEL_PILL_HEIGHT;
  const defaultX = Math.max(0, bboxX);

  const labelX = dragged ? dragged.nx * fitWidth : defaultX;
  const labelY = dragged ? dragged.ny * fitHeight : defaultY;

  const handleMouseEnter = (e) => {
    const stage = e.target.getStage();
    if (stage) stage.container().style.cursor = 'grab';
  };
  const handleMouseLeave = (e) => {
    const stage = e.target.getStage();
    if (stage) stage.container().style.cursor = '';
  };
  const handleDragStart = (e) => {
    const stage = e.target.getStage();
    if (stage) stage.container().style.cursor = 'grabbing';
  };
  const handleDragEnd = (e) => {
    const stage = e.target.getStage();
    if (stage) stage.container().style.cursor = 'grab';
    if (!fitWidth || !fitHeight) return;
    setDragged({
      nx: clamp01(e.target.x() / fitWidth),
      ny: clamp01(e.target.y() / fitHeight)
    });
  };

  return (
    <Label
      x={labelX}
      y={labelY}
      opacity={opacity}
      draggable
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <Tag
        fill={color}
        cornerRadius={6}
        shadowColor="rgba(0, 0, 0, 0.25)"
        shadowBlur={4}
        shadowOffsetY={1}
      />
      <KonvaText
        text={text}
        fill="#fff"
        fontStyle="600"
        fontSize={12}
        padding={5}
      />
    </Label>
  );
}

function clamp01(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function readCornerBbox(args) {
  if (!args) return null;
  const x1raw = args.x1;
  const y1raw = args.y1;
  const x2raw = args.x2;
  const y2raw = args.y2;
  if ([x1raw, y1raw, x2raw, y2raw].some((v) => typeof v !== 'number' || Number.isNaN(v))) {
    return null;
  }
  const x1 = clamp01(Math.min(x1raw, x2raw));
  const y1 = clamp01(Math.min(y1raw, y2raw));
  const x2 = clamp01(Math.max(x1raw, x2raw));
  const y2 = clamp01(Math.max(y1raw, y2raw));
  if (x2 <= x1 || y2 <= y1) return null;
  return { x1, y1, x2, y2 };
}

function isCssColor(s) {
  return typeof s === 'string' && /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+|rgba?\([^)]+\)|hsla?\([^)]+\))$/.test(s);
}
