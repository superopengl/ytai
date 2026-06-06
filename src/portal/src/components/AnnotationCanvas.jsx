import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
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
import { Button, ColorPicker, Popover, Slider, Space, Tooltip } from 'antd';
import {
  ClearOutlined,
  DragOutlined,
  HighlightOutlined,
  UndoOutlined,
  ZoomInOutlined,
  ZoomOutOutlined
} from '@ant-design/icons';
import { palette } from '../theme.js';

const DEFAULT_AI_COLOR = palette.aiAnnotationDefault;
const PEN_PRESETS = palette.penPresets;
const PEN_WIDTH_MIN = 2;
const PEN_WIDTH_MAX = 20;
const PEN_WIDTH_DEFAULT = 7;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.25;

// Single-page canvas. Strokes are passed in via `lines` and surfaced via
// `onLinesChange` so a parent (e.g. PagedCanvas) can keep a per-page map
// — strokes survive page switches that way.
//
// Imperative handle: { flatten() } — returns a PNG dataURL of the photo +
// strokes (rendered at the original image resolution so Eyes sees the
// marks crisply) when there is at least one user stroke, else null.
function AnnotationCanvas(
  {
    imageUrl,
    lines = [],
    onLinesChange,
    aiAnnotations = [],
    onClearAiAnnotations,
    toolbarExtras = null
  },
  ref
) {
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const aiLayerRef = useRef(null);
  const drawing = useRef(false);
  const [image, setImage] = useState(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [penColor, setPenColor] = useState(PEN_PRESETS[0]);
  const [penWidth, setPenWidth] = useState(PEN_WIDTH_DEFAULT);
  const [zoom, setZoom] = useState(1);
  const [panMode, setPanMode] = useState(false);
  const [panning, setPanning] = useState(false);
  const panStart = useRef(null);

  useImperativeHandle(
    ref,
    () => ({
      flatten() {
        if (!stageRef.current || !image) return null;
        if (!Array.isArray(lines) || lines.length === 0) return null;
        // Re-export at the source image's native resolution so freehand
        // strokes are sharp for Eyes — the display fit may be much smaller.
        // Cap the pixel ratio at 2 to keep payload sizes reasonable even on
        // very high-res photos.
        const fitWidth = stageRef.current.width();
        const pixelRatio =
          fitWidth > 0 && image.width > 0 ? Math.min(2, image.width / fitWidth) : 1;
        return stageRef.current.toDataURL({ mimeType: 'image/png', pixelRatio });
      }
    }),
    [image, lines]
  );

  useEffect(() => {
    setZoom(1);
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
  const displayWidth = fit.width * zoom;
  const displayHeight = fit.height * zoom;

  function toNormalized(pos) {
    if (displayWidth === 0 || displayHeight === 0) return null;
    return [pos.x / displayWidth, pos.y / displayHeight];
  }

  function setLines(updater) {
    if (typeof onLinesChange !== 'function') return;
    const next = typeof updater === 'function' ? updater(lines) : updater;
    onLinesChange(next);
  }

  function startLine(e) {
    if (panMode) return;
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

  function startPan(clientX, clientY) {
    const el = containerRef.current;
    if (!panMode || !el) return;
    panStart.current = {
      x: clientX,
      y: clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop
    };
    setPanning(true);
  }

  function extendPan(clientX, clientY) {
    const el = containerRef.current;
    const start = panStart.current;
    if (!start || !el) return;
    el.scrollLeft = start.scrollLeft - (clientX - start.x);
    el.scrollTop = start.scrollTop - (clientY - start.y);
  }

  function endPan() {
    if (!panStart.current) return;
    panStart.current = null;
    setPanning(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Space
        align="center"
        style={{ marginTop: 4, marginBottom: 8, flexWrap: 'wrap', rowGap: 8 }}
        size={[8, 8]}
      >
        <Tooltip title="Undo last mark">
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

        <Tooltip title="Pen color">
          <ColorPicker
            value={penColor}
            onChange={(c) => setPenColor(c.toHexString())}
            disabledAlpha
            presets={[{ label: 'Quick colors', colors: PEN_PRESETS }]}
          />
        </Tooltip>

        <Popover
          trigger="click"
          placement="bottom"
          content={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 200 }}>
              <Slider
                min={PEN_WIDTH_MIN}
                max={PEN_WIDTH_MAX}
                step={1}
                value={penWidth}
                onChange={setPenWidth}
                style={{ flex: 1, margin: 0 }}
                tooltip={{ formatter: null }}
              />
              <span style={{ minWidth: 28, fontSize: 12, color: palette.textHint, lineHeight: 1 }}>
                {penWidth}px
              </span>
            </div>
          }
        >
          <Button
            title="Pen thickness"
            aria-label={`Pen thickness: ${penWidth}px`}
            style={{ width: 48, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <span
              aria-hidden
              style={{
                display: 'inline-block',
                width: penWidth,
                height: penWidth,
                borderRadius: '50%',
                background: penColor
              }}
            />
          </Button>
        </Popover>

        <span aria-hidden style={toolbarDividerStyle} />

        <Tooltip title={panMode ? 'Pan mode (drag to move) — click to switch back to pen' : 'Pan mode — drag the image around when zoomed in'}>
          <Button
            icon={<DragOutlined />}
            type={panMode ? 'primary' : 'default'}
            onClick={() => setPanMode((p) => !p)}
            disabled={!image}
            aria-label="Pan tool"
            aria-pressed={panMode}
          />
        </Tooltip>

        <Tooltip title="Zoom out">
          <Button
            icon={<ZoomOutOutlined />}
            onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z / ZOOM_STEP))}
            disabled={!image || zoom <= ZOOM_MIN + 1e-3}
            aria-label="Zoom out"
          />
        </Tooltip>
        <Tooltip title="Reset zoom">
          <Button
            onClick={() => setZoom(1)}
            disabled={!image || Math.abs(zoom - 1) < 1e-3}
            style={{ minWidth: 56, paddingInline: 8, fontVariantNumeric: 'tabular-nums' }}
          >
            {Math.round(zoom * 100)}%
          </Button>
        </Tooltip>
        <Tooltip title="Zoom in">
          <Button
            icon={<ZoomInOutlined />}
            onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z * ZOOM_STEP))}
            disabled={!image || zoom >= ZOOM_MAX - 1e-3}
            aria-label="Zoom in"
          />
        </Tooltip>

        {toolbarExtras}
      </Space>
      <div
        ref={containerRef}
        onMouseDown={(e) => startPan(e.clientX, e.clientY)}
        onMouseMove={(e) => extendPan(e.clientX, e.clientY)}
        onMouseUp={endPan}
        onMouseLeave={endPan}
        onTouchStart={(e) => {
          const t = e.touches[0];
          if (t) startPan(t.clientX, t.clientY);
        }}
        onTouchMove={(e) => {
          const t = e.touches[0];
          if (t) extendPan(t.clientX, t.clientY);
        }}
        onTouchEnd={endPan}
        style={{
          flex: 1,
          minHeight: 0,
          background: palette.pens.ink,
          borderRadius: 12,
          display: 'flex',
          // `safe center` keeps the stage centered when it fits, but falls
          // back to start alignment when zoomed past the viewport so the
          // top/left edge stays reachable via scroll instead of clipped.
          alignItems: 'safe center',
          justifyContent: 'safe center',
          overflow: 'auto',
          cursor: panMode ? (panning ? 'grabbing' : 'grab') : 'default',
          // Prevent text/image selection during a pan drag.
          userSelect: panMode ? 'none' : 'auto'
        }}
      >
        {image && displayWidth > 0 && (
          <Stage
            ref={stageRef}
            width={displayWidth}
            height={displayHeight}
            onMouseDown={startLine}
            onMouseMove={extendLine}
            onMouseUp={endLine}
            onTouchStart={startLine}
            onTouchMove={extendLine}
            onTouchEnd={endLine}
          >
            <Layer listening={false}>
              <KonvaImage image={image} width={displayWidth} height={displayHeight} />
            </Layer>
            <Layer ref={aiLayerRef}>
              {aiAnnotations.map((anno) => (
                <AiAnnotation
                  key={anno.id}
                  annotation={anno}
                  fitWidth={displayWidth}
                  fitHeight={displayHeight}
                />
              ))}
            </Layer>
            <Layer>
              {lines.map((line, idx) => (
                <Line
                  key={idx}
                  points={normalizedToPixels(line.points, displayWidth, displayHeight)}
                  stroke={line.color || palette.pens.red}
                  strokeWidth={(line.width || 7) * zoom}
                  tension={0.3}
                  lineCap="round"
                  lineJoin="round"
                  shadowColor="rgba(255, 255, 255, 0.95)"
                  shadowBlur={Math.max(4, (line.width || 7) * 0.7) * zoom}
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

export default forwardRef(AnnotationCanvas);

const toolbarDividerStyle = {
  display: 'inline-block',
  width: 1,
  height: 24,
  background: palette.borderSoft,
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
        fill={palette.surface}
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
