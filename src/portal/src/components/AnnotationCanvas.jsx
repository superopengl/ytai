import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Line } from 'react-konva';
import { Button, Space, Tooltip } from 'antd';
import { ClearOutlined, SwapOutlined, UndoOutlined } from '@ant-design/icons';

const AnnotationCanvas = forwardRef(function AnnotationCanvas({ imageUrl, onReplace }, ref) {
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const drawing = useRef(false);
  const [image, setImage] = useState(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [lines, setLines] = useState([]);

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
          dataUrl: stage.toDataURL({ mimeType: 'image/png', pixelRatio }),
          width: image.width,
          height: image.height,
          hasAnnotations: lines.length > 0
        };
      }
    }),
    [image, containerSize, lines.length]
  );

  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => setImage(img);
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

  function startLine(e) {
    if (!image) return;
    drawing.current = true;
    const pos = e.target.getStage().getPointerPosition();
    setLines((prev) => [...prev, { points: [pos.x, pos.y] }]);
  }

  function extendLine(e) {
    if (!drawing.current) return;
    const pos = e.target.getStage().getPointerPosition();
    setLines((prev) => {
      const last = prev[prev.length - 1];
      const next = { points: [...last.points, pos.x, pos.y] };
      return [...prev.slice(0, -1), next];
    });
  }

  function endLine() {
    drawing.current = false;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Space style={{ marginBottom: 12 }}>
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
            <Layer>
              {lines.map((line, idx) => (
                <Line
                  key={idx}
                  points={line.points}
                  stroke="#ff5252"
                  strokeWidth={4}
                  tension={0.3}
                  lineCap="round"
                  lineJoin="round"
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

function fitToContainer(image, container) {
  if (!image || container.width === 0 || container.height === 0) {
    return { width: 0, height: 0 };
  }
  const ratio = Math.min(container.width / image.width, container.height / image.height);
  return { width: image.width * ratio, height: image.height * ratio };
}
