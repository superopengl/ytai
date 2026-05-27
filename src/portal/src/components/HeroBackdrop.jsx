import {
  BulbIcon,
  EditIcon,
  BookIcon,
  ExperimentIcon,
  RocketIcon,
  StarFilledIcon
} from './InlineIcons.jsx';
import { palette } from '../theme.js';

const {
  primary: SAGE,
  primaryDark: SAGE_DARK,
  secondary: MAUVE,
  accentMint: MINT,
  accentPurple: LAVENDER,
  accentPeach: PEACH,
  accentYellow: CREAM_PEACH
} = palette;

const QUICKSAND = "'Quicksand', 'Nunito', system-ui, sans-serif";

const DOODLE_ITEMS = [
  // Top band
  { kind: 'sym',  char: '+',                       top: '8%',  left: '6%',   size: 64, color: SAGE,        rotate: -14, dur: 9.2,  delay: 0   },
  { kind: 'icon', node: <BulbIcon />,              top: '14%', left: '17%',  size: 42, color: CREAM_PEACH, rotate: 8,   dur: 10.6, delay: 1.5 },
  { kind: 'sym',  char: '×',                       top: '6%',  left: '32%',  size: 44, color: MAUVE,       rotate: 18,  dur: 8.4,  delay: 3.1 },
  { kind: 'sym',  char: '?',                       top: '4%',  right: '28%', size: 52, color: PEACH,       rotate: -8,  dur: 11.0, delay: 0.7 },
  { kind: 'sym',  char: 'π',                       top: '11%', right: '8%',  size: 60, color: LAVENDER,    rotate: 10,  dur: 9.8,  delay: 2.2 },
  { kind: 'icon', node: <StarFilledIcon />,            top: '20%', right: '20%', size: 28, color: MINT,        rotate: 0,   dur: 7.6,  delay: 4.0 },
  // Mid band — sides only, central area stays empty for the headline / card.
  { kind: 'icon', node: <EditIcon />,              top: '46%', left: '4%',   size: 50, color: PEACH,       rotate: -32, dur: 10.4, delay: 2.6 },
  { kind: 'sym',  char: '√',                       top: '58%', left: '13%',  size: 56, color: SAGE_DARK,   rotate: 4,   dur: 9.0,  delay: 0.4 },
  { kind: 'icon', node: <BookIcon />,              top: '48%', right: '5%',  size: 54, color: MINT,        rotate: 14,  dur: 11.2, delay: 1.8 },
  { kind: 'sym',  char: '=',                       top: '60%', right: '15%', size: 48, color: MAUVE,       rotate: -10, dur: 8.6,  delay: 3.4 },
  // Bottom band
  { kind: 'sym',  char: '÷',                       bottom: '14%', left: '8%',  size: 52, color: LAVENDER,    rotate: 16,  dur: 9.6,  delay: 1.2 },
  { kind: 'icon', node: <StarFilledIcon />,            bottom: '7%',  left: '24%', size: 26, color: CREAM_PEACH, rotate: 0,   dur: 8.0,  delay: 4.5 },
  { kind: 'icon', node: <ExperimentIcon />,        bottom: '12%', right: '10%', size: 52, color: SAGE,       rotate: -16, dur: 10.8, delay: 2.9 },
  { kind: 'sym',  char: 'Σ',                       bottom: '22%', right: '4%', size: 60, color: PEACH,       rotate: 8,   dur: 9.4,  delay: 0.6 },
  { kind: 'sym',  char: '+',                       bottom: '6%',  right: '28%', size: 36, color: MINT,        rotate: -22, dur: 7.8,  delay: 5.0 },
  { kind: 'icon', node: <RocketIcon />,            bottom: '30%', left: '3%',  size: 44, color: MAUVE,       rotate: -28, dur: 11.4, delay: 3.7 }
];

// Floating-doodles layer — scatters math symbols, school icons, and stars
// around the wrapper edges. Two nested elements separate the bob (outer,
// drives the animation) from the static tilt (inner, sets rotation) — if
// both lived on one element the keyframe's transform would clobber the
// tilt.
function FloatingDoodles() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden'
      }}
    >
      <style>{`
        @keyframes ytai-doodle-bob {
          0%, 100% { transform: translate3d(0, 0, 0); }
          50%      { transform: translate3d(0, -14px, 0); }
        }
      `}</style>
      {DOODLE_ITEMS.map((it, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: it.top,
            left: it.left,
            right: it.right,
            bottom: it.bottom,
            animation: `ytai-doodle-bob ${it.dur}s ease-in-out ${it.delay}s infinite`,
            willChange: 'transform'
          }}
        >
          <div
            style={{
              transform: `rotate(${it.rotate}deg)`,
              color: it.color,
              opacity: 0.35,
              fontSize: it.size,
              fontFamily: QUICKSAND,
              fontWeight: 800,
              lineHeight: 1,
              display: 'inline-flex',
              textShadow: `0 4px 18px ${it.color}55`
            }}
          >
            {it.kind === 'icon' ? it.node : it.char}
          </div>
        </div>
      ))}
    </div>
  );
}

// Notebook ruled-paper overlay — soft horizontal lines and a peach left
// margin rule, fading top-to-bottom so it reads as "homework page".
function NotebookPaper() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(${LAVENDER}55 1px, transparent 1px),
          linear-gradient(90deg, transparent 0, transparent calc(11% - 1px), ${PEACH}66 calc(11% - 1px), ${PEACH}66 11%, transparent 11%)
        `,
        backgroundSize: '100% 38px, 100% 100%',
        maskImage:
          'linear-gradient(180deg, transparent 0%, black 18%, black 70%, transparent 100%)',
        WebkitMaskImage:
          'linear-gradient(180deg, transparent 0%, black 18%, black 70%, transparent 100%)',
        opacity: 0.45
      }}
    />
  );
}

// Combined hero backdrop. Place inside any `position: relative; overflow:
// hidden` container — emits notebook paper, a center-faded dot grid, and
// the floating doodles, all `pointer-events: none` and `aria-hidden`. The
// parent owns the base background gradient.
export default function HeroBackdrop() {
  return (
    <>
      <NotebookPaper />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `radial-gradient(circle, ${SAGE_DARK}55 1.2px, transparent 1.6px)`,
          backgroundSize: '26px 26px',
          maskImage:
            'radial-gradient(ellipse 75% 70% at 50% 45%, black 20%, transparent 85%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 75% 70% at 50% 45%, black 20%, transparent 85%)',
          pointerEvents: 'none'
        }}
      />
      <FloatingDoodles />
    </>
  );
}
