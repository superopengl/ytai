// YouTutorAI brand logo. Three variants:
//   - "lockup" (default): the figure-mark + "YouTutorAI" wordmark
//   - "mark": just the figure-mark on its native canvas (slightly taller
//             than wide — for non-square slots that want the full figure)
//   - "square": the figure-mark trimmed to a 1:1 tile — for favicons,
//               avatars, and anywhere the slot must be perfectly square.
//               This is also the source for every favicon and the
//               apple-touch-icon.
// `height` is the *intended* display height — it becomes a `maxHeight`
// so the image scales DOWN whenever its natural width would overflow
// the container. The lockup is ~6.15:1 wide, so a fixed `height={64}`
// renders ~394px wide and busts narrow flex/grid cells; pairing
// `maxHeight` with `maxWidth: 100%` keeps the aspect ratio intact while
// honoring whatever space the container can give.

const LOCKUP_RATIO = 800 / 130;
const MARK_RATIO = 256 / 280;
const SQUARE_RATIO = 1;

export default function Logo({
  variant = 'lockup',
  height = 36,
  alt = 'YouTutorAI',
  style,
  ...rest
}) {
  let src;
  let ratio;
  if (variant === 'square') {
    src = '/ytai-logo-square.webp';
    ratio = SQUARE_RATIO;
  } else if (variant === 'mark') {
    src = '/ytai-logo-square.webp';
    ratio = MARK_RATIO;
  } else {
    src = '/ytai-logo.webp';
    ratio = LOCKUP_RATIO;
  }
  return (
    <img
      src={src}
      alt={alt}
      width={Math.round(height * ratio)}
      height={height}
      style={{
        display: 'block',
        width: 'auto',
        height: 'auto',
        maxHeight: height,
        maxWidth: '100%',
        ...style
      }}
      {...rest}
    />
  );
}
