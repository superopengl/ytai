// YouTutorAI brand logo. Two variants:
//   - "lockup" (default): the figure-mark + "YouTutorAI" wordmark
//   - "mark": just the figure-mark, for square slots (favicon-ish chips,
//             avatars on dark surfaces)
// Drive size by `height` — the underlying images keep their aspect ratio.

const LOCKUP_RATIO = 800 / 130;
const MARK_RATIO = 256 / 280;

export default function Logo({
  variant = 'lockup',
  height = 36,
  alt = 'YouTutorAI',
  style,
  ...rest
}) {
  const src = variant === 'mark' ? '/ytai-mark.png' : '/ytai-logo.png';
  const ratio = variant === 'mark' ? MARK_RATIO : LOCKUP_RATIO;
  return (
    <img
      src={src}
      alt={alt}
      height={height}
      width={Math.round(height * ratio)}
      style={{ display: 'block', height, width: 'auto', ...style }}
      {...rest}
    />
  );
}
