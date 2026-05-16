import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Line, Ellipse, Rect, Text } from 'react-konva';
import { Button, ColorPicker, Slider, Space, Tooltip } from 'antd';
import { ClearOutlined, SwapOutlined, UndoOutlined } from '@ant-design/icons';

const DEFAULT_AI_COLOR = '#3aa0ff';

const PEN_PRESETS = ['#ff1744', '#22c55e', '#f97316', '#a855f7', '#1d2233', '#ffd60a', '#06b6d4'];
const PEN_WIDTH_MIN = 2;
const PEN_WIDTH_MAX = 20;
const PEN_WIDTH_DEFAULT = 7;

const AnnotationCanvas = forwardRef(function AnnotationCanvas(
  { imageUrl, onReplace, aiAnnotations = [] },
  ref
) {
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const drawing = useRef(false);
  const [image, setImage] = useState(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [lines, setLines] = useState([]);
  const [penColor, setPenColor] = useState(PEN_PRESETS[0]);
  const [penWidth, setPenWidth] = useState(PEN_WIDTH_DEFAULT);

  useImperativeHandle(
    ref,
    () => ({
      exportImage() {
        if (!image || !stageRef.current) return null;
        const stage = stageRef.current;
        const fit = fitToContainer(image, containerSize);
        if (fit.width === 0) return null;
        const pixelRatio = image.width / fit.width;
        return {
          // Strokes are drawn on top of the image inside the Stage, so
          // toDataURL captures them baked into the bytes. Eyes sees the
          // student's circles and underlines directly when Brain calls
          // lookup_on_image — no separate stroke bbox needed.
          dataUrl: stage.toDataURL({ mimeType: 'image/png', pixelRatio }),
          width: image.width,
          height: image.height,
          hasAnnotations: lines.length > 0
        };
      }
    }),
    [image, containerSize, lines]
  );

  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => setImage(img);
    // Strokes are anchored in normalized coords to whichever image was
    // showing when they were drawn — they don't make sense over a freshly
    // cast or replaced photo, so wipe them when the image source changes.
    setLines([]);
    return () => {
      img.onload = null;
    };
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

  // Lines are stored in 0..1 normalized coords (same convention as AI
  // annotations) so they stay anchored to the page when the window resizes.
  function toNormalized(pos) {
    if (fit.width === 0 || fit.height === 0) return null;
    return [pos.x / fit.width, pos.y / fit.height];
  }

  function startLine(e) {
    if (!image) return;
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
      const next = { ...last, points: [...last.points, ...pt] };
      return [...prev.slice(0, -1), next];
    });
  }

  function endLine() {
    drawing.current = false;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Space style={{ marginBottom: 12, flexWrap: 'wrap', rowGap: 8 }} size={[8, 8]}>
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
        <Tooltip title="Replace this image">
          <Button icon={<SwapOutlined />} onClick={onReplace}>
            Replace image
          </Button>
        </Tooltip>

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
            <Layer listening={false}>
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
});

export default AnnotationCanvas;

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

function AiAnnotation({ annotation, fitWidth, fitHeight }) {
  const args = annotation?.args;
  if (!args || typeof args.x !== 'number' || typeof args.y !== 'number') return null;
  const x = clamp01(args.x) * fitWidth;
  const y = clamp01(args.y) * fitHeight;
  const w = clamp01(args.width ?? 0) * fitWidth;
  const h = clamp01(args.height ?? 0) * fitHeight;
  const color = isCssColor(args.color) ? args.color : DEFAULT_AI_COLOR;
  const label = typeof args.label === 'string' ? args.label.slice(0, 24) : '';

  const labelNode = label ? (
    <Text
      text={label}
      x={x}
      y={Math.max(0, y - 18)}
      fontSize={14}
      fontStyle="bold"
      fill={color}
      shadowColor="rgba(255,255,255,0.9)"
      shadowBlur={4}
    />
  ) : null;

  if (args.shape === 'highlight') {
    return (
      <>
        <Rect
          x={x}
          y={y}
          width={Math.max(w, 4)}
          height={Math.max(h, 4)}
          fill={color}
          opacity={0.25}
          cornerRadius={4}
        />
        {labelNode}
      </>
    );
  }

  if (args.shape === 'rect') {
    return (
      <>
        <Rect
          x={x}
          y={y}
          width={Math.max(w, 4)}
          height={Math.max(h, 4)}
          stroke={color}
          strokeWidth={4}
          dash={[10, 6]}
          cornerRadius={6}
        />
        {labelNode}
      </>
    );
  }

  // default: circle (ellipse fits any aspect)
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = Math.max(w / 2, 12);
  const ry = Math.max(h / 2, 12);
  return (
    <>
      <Ellipse x={cx} y={cy} radiusX={rx} radiusY={ry} stroke={color} strokeWidth={4} />
      {labelNode}
    </>
  );
}

function clamp01(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function isCssColor(s) {
  return typeof s === 'string' && /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+|rgba?\([^)]+\)|hsla?\([^)]+\))$/.test(s);
}
