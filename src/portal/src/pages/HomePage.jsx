import { useNavigate } from 'react-router-dom';
import { Typography, Row, Col, message } from 'antd';
import {
  CameraOutlined,
  HighlightOutlined,
  BulbOutlined,
  ReadOutlined,
  EditOutlined,
  CalculatorOutlined,
  ExperimentOutlined,
  SafetyCertificateOutlined,
  SmileOutlined,
  TeamOutlined,
  GoogleOutlined,
  HeartFilled,
  CheckCircleFilled,
  ThunderboltFilled
} from '@ant-design/icons';
import { palette, stickerShadow, radius } from '../theme.js';
import GoogleSignInButton from '../components/GoogleSignInButton.jsx';

const { Title, Paragraph, Text, Link } = Typography;

// `palette.primary` is now sky-blue per brand decision; we keep the local
// names PEACH and SKY pointing at the *visual* colors they describe, so the
// JSX stays readable.
const {
  primary: SKY,
  secondary: PEACH,
  cta: GREEN,
  accentMint: MINT,
  accentPurple: LAVENDER,
  accentYellow: SUNSHINE,
  bg: CREAM,
  bgPaper: PAPER,
  surface: WHITE,
  text: INK,
  textMuted: INK_MUTED,
  tint: TINT,
  onDark: ON_DARK,
  overlay: OVERLAY
} = palette;

const FREDOKA = "'Fredoka', 'Nunito', system-ui, sans-serif";

// --- Visual primitives ------------------------------------------------------

// Squircle "icon plinth" — chunky outlined square in a solid color. The
// signature element of the reference design's logo and persona icons.
function IconSquircle({ size = 56, color = PEACH, radius: r = 18, children, style }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: r,
        background: color,
        border: `3px solid ${INK}`,
        boxShadow: `3px 3px 0 ${INK}`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: INK,
        fontSize: Math.round(size * 0.5),
        flexShrink: 0,
        ...style
      }}
    >
      {children}
    </div>
  );
}

function LogoMark({ size = 40 }) {
  return (
    <IconSquircle size={size} color={PEACH} radius={Math.round(size * 0.28)}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" aria-label="YouTutorAI">
        <path
          d="M5 5 L12 14 L19 5"
          fill="none"
          stroke={INK}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line x1="12" y1="14" x2="12" y2="20" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      </svg>
    </IconSquircle>
  );
}

// Decorative blurred blob — used sparingly behind cream sections to add depth
// without breaking the flat-sticker aesthetic.
function Blob({ color, size, top, left, right, bottom, kind = 'a', opacity = 0.35, blur = 60 }) {
  return (
    <div
      aria-hidden="true"
      className={kind === 'b' ? 'clay-blob-b' : 'clay-blob-a'}
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        filter: `blur(${blur}px)`,
        opacity,
        top,
        left,
        right,
        bottom,
        pointerEvents: 'none'
      }}
    />
  );
}

// Hand-drawn sparkle, useful on hero / CTA bands for kid energy.
function Sparkle({ size = 28, color = SUNSHINE, top, left, right, bottom, rotate = 0, opacity = 1 }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{
        position: 'absolute',
        top,
        left,
        right,
        bottom,
        transform: `rotate(${rotate}deg)`,
        opacity,
        pointerEvents: 'none'
      }}
    >
      <path
        d="M12 2 L13.5 9 L21 11 L13.5 13 L12 21 L10.5 13 L3 11 L10.5 9 Z"
        fill={color}
        stroke={INK}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SectionEyebrow({ children, bg, color }) {
  return (
    <div
      className="sticker-chip"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 18px',
        background: bg,
        color: color ?? INK,
        fontSize: 13,
        fontWeight: 800,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        marginBottom: 18
      }}
    >
      <span style={{ width: 8, height: 8, background: GREEN, border: `2px solid ${INK}`, borderRadius: '50%' }} />
      {children}
    </div>
  );
}

// --- Content data -----------------------------------------------------------

const features = [
  {
    icon: <CameraOutlined />,
    color: PEACH,
    title: 'Snap a Photo',
    description:
      'Point your phone at any worksheet, exam, or homework page. The AI reads the questions and gets ready to help.'
  },
  {
    icon: <HighlightOutlined />,
    color: SUNSHINE,
    title: 'Circle What’s Tricky',
    description:
      'Highlight, circle, or underline the part you’re stuck on. The tutor sees exactly what you’re pointing at.'
  },
  {
    icon: <BulbOutlined />,
    color: MINT,
    title: 'Learn, Don’t Copy',
    description:
      'A Socratic tutor that scaffolds your thinking step by step — never dumps the answer, always builds understanding.'
  },
  {
    icon: <GoogleOutlined />,
    color: LAVENDER,
    title: 'One-tap Sign-in',
    description:
      'Skip the password. Sign in with Google to create a parent, teacher, or student profile — admin approval keeps young learners safe.'
  }
];

const subjects = [
  { icon: <CalculatorOutlined />, label: 'Math', color: PEACH },
  { icon: <ExperimentOutlined />, label: 'Thinking Skills', color: LAVENDER },
  { icon: <ReadOutlined />, label: 'English', color: SKY },
  { icon: <EditOutlined />, label: 'Writing', color: MINT }
];

const steps = [
  {
    num: '1',
    title: 'Snap your worksheet',
    description: 'Take a clear photo of the homework, exam, or textbook page you need help with.',
    color: PEACH
  },
  {
    num: '2',
    title: 'Circle what’s tricky',
    description: 'Use the pen to point at the question — or region — that you don’t get yet.',
    color: SUNSHINE
  },
  {
    num: '3',
    title: 'Get tutored',
    description: 'Ask in your own words. The tutor walks you through it, the way a great teacher would.',
    color: MINT
  }
];

const personas = [
  {
    icon: <SmileOutlined />,
    title: 'Students',
    description:
      'Ages 8–14. Kid-friendly, encouraging, and never gives away answers without working through the reasoning with you.',
    color: PEACH
  },
  {
    icon: <TeamOutlined />,
    title: 'Parents',
    description:
      'Help your child with homework even when you don’t remember the material — YouTutorAI is your co-tutor.',
    color: SKY
  },
  {
    icon: <SafetyCertificateOutlined />,
    title: 'Teachers',
    description:
      'Assign as homework support, or walk a student through tricky problems together during class.',
    color: LAVENDER
  }
];

// --- Hero preview (mock worksheet + tutor bubble) ---------------------------

function HeroPreview() {
  return (
    <div
      className="sticker-card"
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 460,
        padding: 22,
        borderRadius: 28,
        transform: 'rotate(-1.5deg)',
        background: WHITE
      }}
    >
      {/* Mock worksheet */}
      <div
        style={{
          position: 'relative',
          background: PAPER,
          border: `3px solid ${INK}`,
          borderRadius: 18,
          padding: '22px 22px 26px',
          boxShadow: `3px 3px 0 ${INK}`
        }}
      >
        {/* faux ruled-paper lines */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 6,
            backgroundImage:
              `repeating-linear-gradient(transparent 0, transparent 27px, ${OVERLAY.paperRule} 27px, ${OVERLAY.paperRule} 28px)`,
            borderRadius: 14,
            opacity: 0.7,
            pointerEvents: 'none'
          }}
        />
        <div style={{ position: 'relative' }}>
          <Text style={{ fontSize: 12, fontWeight: 800, color: INK_MUTED, letterSpacing: 1 }}>
            MATH · WEEK 4
          </Text>
          <div style={{ marginTop: 10, fontSize: 17, lineHeight: 1.55, color: INK, fontWeight: 700 }}>
            <span>2.&nbsp;</span>
            <span style={{ position: 'relative', display: 'inline-block' }}>
              <span>If 3x + 7 = 22, what is x?</span>
              <svg
                aria-hidden="true"
                width="100%"
                height="42"
                viewBox="0 0 220 42"
                style={{ position: 'absolute', top: -8, left: -8, width: 'calc(100% + 16px)' }}
              >
                <ellipse
                  cx="110"
                  cy="21"
                  rx="102"
                  ry="16"
                  fill="none"
                  stroke={GREEN}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </div>
          <div style={{ marginTop: 18, fontSize: 16, color: INK_MUTED }}>
            3.&nbsp; The triangle has sides 5, 12, and 13. Is it a right triangle?
          </div>
          <div style={{ marginTop: 14, fontSize: 16, color: INK_MUTED }}>
            4.&nbsp; Round 4.836 to the nearest tenth.
          </div>
        </div>
      </div>

      {/* Tutor chat bubble */}
      <div
        style={{
          position: 'absolute',
          right: -18,
          bottom: -22,
          maxWidth: 270,
          padding: '14px 18px',
          background: SKY,
          color: INK,
          border: `3px solid ${INK}`,
          borderRadius: '22px 22px 6px 22px',
          fontSize: 14,
          lineHeight: 1.5,
          fontWeight: 600,
          boxShadow: `4px 4px 0 ${INK}`
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <IconSquircle size={22} color={SUNSHINE} radius={6}>
            <span style={{ fontSize: 11, fontWeight: 900 }}>AI</span>
          </IconSquircle>
          <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.7 }}>TUTOR</span>
        </div>
        Let’s start by getting <i>x</i> by itself. What can we subtract from both sides?
      </div>

      {/* "Nice work!" sticker */}
      <div
        className="sticker-chip"
        style={{
          position: 'absolute',
          left: -22,
          top: 28,
          padding: '8px 14px',
          background: GREEN,
          color: WHITE,
          fontSize: 13,
          fontWeight: 800,
          letterSpacing: 0.3,
          transform: 'rotate(-8deg)',
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}
      >
        <CheckCircleFilled /> Nice work!
      </div>
    </div>
  );
}

// --- NavBar (floating rounded) ---------------------------------------------

function NavBar({ onScrollToSignIn }) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        left: 16,
        right: 16,
        zIndex: 100,
        maxWidth: 1200,
        margin: '0 auto'
      }}
    >
      <div
        className="sticker-card"
        style={{
          background: WHITE,
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          borderRadius: 22
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LogoMark size={42} />
          <span style={{ fontWeight: 900, fontSize: 20, color: INK, letterSpacing: -0.3, fontFamily: FREDOKA }}>
            YouTutor<span style={{ color: GREEN }}>AI</span>
          </span>
        </div>
        <button
          type="button"
          className="sticker-btn sticker-press"
          onClick={onScrollToSignIn}
          style={{
            background: GREEN,
            color: WHITE,
            padding: '10px 22px',
            fontSize: 15,
            cursor: 'pointer',
            fontFamily: 'inherit',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10
          }}
        >
          <GoogleOutlined style={{ fontSize: 18 }} />
          Sign in
        </button>
      </div>
    </div>
  );
}

// --- Page -------------------------------------------------------------------

export default function HomePage() {
  const navigate = useNavigate();
  const handleGoogleSuccess = (u) => {
    if (u.status === 'approved') {
      message.success(`Welcome, ${u.name}! Loading your tutor…`);
    } else {
      message.info('Signed in — waiting for admin approval before you can start tutoring.');
    }
    navigate('/tutor');
  };

  const scrollToSignIn = () => {
    document.getElementById('signin')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div style={{ minHeight: '100vh', background: CREAM, color: INK }}>
      <NavBar onScrollToSignIn={scrollToSignIn} />

      {/* ============ HERO (sky) ============ */}
      <section
        style={{
          padding: 'clamp(120px, 14vw, 160px) 24px clamp(80px, 10vw, 110px)',
          position: 'relative',
          overflow: 'hidden',
          background: SKY
        }}
      >
        <Blob color={PEACH} size={420} top={-100} left={-140} opacity={0.45} blur={60} />
        <Blob color={CREAM} size={300} top={120} right="-40px" kind="b" opacity={0.45} blur={60} />
        <Blob color={LAVENDER} size={260} bottom={-80} left="20%" opacity={0.6} blur={50} />
        <Sparkle size={36} color={SUNSHINE} top={120} left="12%" rotate={12} />
        <Sparkle size={24} color={MINT} top="38%" left="6%" rotate={-18} />
        <Sparkle size={28} color={PEACH} top="20%" right="38%" rotate={28} />
        <Sparkle size={22} color={SUNSHINE} bottom="22%" right="10%" rotate={-12} />

        <div
          className="hero-grid"
          style={{
            position: 'relative',
            zIndex: 1,
            maxWidth: 1180,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 0.95fr)',
            gap: 'clamp(32px, 6vw, 72px)',
            alignItems: 'center'
          }}
        >
          {/* Copy column */}
          <div>
            <div
              className="sticker-chip"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 16px',
                background: MINT,
                color: INK,
                fontSize: 14,
                fontWeight: 800,
                marginBottom: 24
              }}
            >
              <ThunderboltFilled style={{ color: GREEN }} />
              Early access · For ages 8–14
            </div>

            <Title
              style={{
                fontFamily: FREDOKA,
                fontSize: 'clamp(44px, 7vw, 76px)',
                marginBottom: 22,
                lineHeight: 1.05,
                letterSpacing: -1.2,
                color: INK,
                fontWeight: 700
              }}
            >
              Snap.{' '}
              <span style={{ color: GREEN, position: 'relative', display: 'inline-block' }}>
                Circle.
                <svg
                  aria-hidden="true"
                  width="100%"
                  height="14"
                  viewBox="0 0 240 14"
                  style={{ position: 'absolute', left: 0, bottom: -8, width: '100%' }}
                >
                  <path
                    d="M4 7 Q 60 0 120 7 T 236 7"
                    stroke={SUNSHINE}
                    strokeWidth="6"
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>
              </span>{' '}
              <span style={{ color: PEACH }}>Learn.</span>
            </Title>
            <Paragraph
              style={{
                color: INK_MUTED,
                fontSize: 'clamp(17px, 2vw, 21px)',
                maxWidth: 540,
                marginBottom: 36,
                lineHeight: 1.6,
                fontWeight: 500
              }}
            >
              An AI homework tutor that reads the worksheet, sees what you’ve circled, and walks
              you through it — the way a great teacher would. Never just dumps the answer.
            </Paragraph>

            <div
              id="signin"
              className="sticker-card"
              style={{
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 14,
                padding: '24px 28px 22px',
                background: WHITE,
                scrollMarginTop: 100
              }}
            >
              <GoogleSignInButton
                role="student"
                size="large"
                width={280}
                scale={1.4}
                onSuccess={handleGoogleSuccess}
              />
              <Text style={{ color: INK_MUTED, fontSize: 13, fontWeight: 700 }}>
                Free during early access · Admin-approved only
              </Text>
            </div>

            <div
              style={{
                marginTop: 28,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 18,
                color: INK,
                fontSize: 14,
                fontWeight: 700
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <CheckCircleFilled style={{ color: GREEN, fontSize: 18 }} /> Kid-safe by design
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <CheckCircleFilled style={{ color: GREEN, fontSize: 18 }} /> Math · Reading · Writing
              </span>
            </div>
          </div>

          {/* Preview column */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <HeroPreview />
          </div>
        </div>

        <style>{`
          @media (max-width: 880px) {
            .hero-grid {
              grid-template-columns: minmax(0, 1fr) !important;
              text-align: center;
            }
            .hero-grid > div:first-child > .sticker-chip,
            .hero-grid > div:first-child > #signin { margin-inline: auto; }
          }
        `}</style>
      </section>

      {/* ============ SUBJECTS strip (white band) ============ */}
      <section style={{ background: WHITE, padding: '48px 24px', borderTop: `3px solid ${INK}`, borderBottom: `3px solid ${INK}` }}>
        <div
          style={{
            maxWidth: 980,
            margin: '0 auto',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            justifyContent: 'center',
            alignItems: 'center'
          }}
        >
          <Text style={{ color: INK, marginRight: 4, fontSize: 14, fontWeight: 800, letterSpacing: 0.5 }}>
            COVERS
          </Text>
          {subjects.map((s) => (
            <div
              key={s.label}
              className="sticker-chip"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 18px 10px 10px',
                background: s.color,
                color: INK,
                fontWeight: 800,
                fontSize: 15
              }}
            >
              <IconSquircle size={30} color={WHITE} radius={10} style={{ boxShadow: 'none' }}>
                {s.icon}
              </IconSquircle>
              {s.label}
            </div>
          ))}
        </div>
      </section>

      {/* ============ FEATURES (cream) ============ */}
      <section style={{ background: CREAM, padding: '88px 24px 96px', position: 'relative', overflow: 'hidden' }}>
        <Blob color={SKY} size={300} top={60} right="-60px" opacity={0.35} blur={70} />
        <Blob color={PEACH} size={260} bottom={-50} left="-60px" kind="b" opacity={0.4} blur={70} />
        <div style={{ position: 'relative', maxWidth: 1180, margin: '0 auto', textAlign: 'center' }}>
          <SectionEyebrow bg={MINT}>How it helps</SectionEyebrow>
          <Title level={2} style={{ fontFamily: FREDOKA, fontSize: 'clamp(32px, 4.5vw, 46px)', marginBottom: 14, letterSpacing: -0.8, fontWeight: 700, color: INK }}>
            Four things make this different
          </Title>
          <Paragraph style={{ fontSize: 18, color: INK_MUTED, maxWidth: 580, margin: '0 auto 56px', lineHeight: 1.6, fontWeight: 500 }}>
            Not another chatbot that hands you the answer. A real tutor that meets you on the page.
          </Paragraph>
          <Row gutter={[24, 24]}>
            {features.map((f) => (
              <Col xs={24} sm={12} lg={6} key={f.title}>
                <div
                  className="sticker-card"
                  style={{
                    padding: '28px 22px 32px',
                    height: '100%',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    background: WHITE
                  }}
                >
                  <IconSquircle size={72} color={f.color} radius={20} style={{ marginBottom: 22, fontSize: 30 }}>
                    {f.icon}
                  </IconSquircle>
                  <Title level={4} style={{ fontFamily: FREDOKA, marginBottom: 10, fontWeight: 700, color: INK }}>
                    {f.title}
                  </Title>
                  <Text style={{ fontSize: 15, lineHeight: 1.65, color: INK_MUTED, fontWeight: 500 }}>
                    {f.description}
                  </Text>
                </div>
              </Col>
            ))}
          </Row>
        </div>
      </section>

      {/* ============ HOW IT WORKS (white) ============ */}
      <section style={{ background: WHITE, padding: '88px 24px 96px', position: 'relative', overflow: 'hidden' }}>
        <Blob color={MINT} size={280} top={40} left="-40px" opacity={0.45} blur={60} />
        <Blob color={LAVENDER} size={260} bottom={20} right="-50px" kind="b" opacity={0.55} blur={60} />
        <div style={{ position: 'relative', maxWidth: 1080, margin: '0 auto', textAlign: 'center' }}>
          <SectionEyebrow bg={SUNSHINE}>How it works</SectionEyebrow>
          <Title level={2} style={{ fontFamily: FREDOKA, fontSize: 'clamp(32px, 4.5vw, 46px)', marginBottom: 14, letterSpacing: -0.8, fontWeight: 700, color: INK }}>
            From photo to “I get it” in three steps
          </Title>
          <Paragraph style={{ fontSize: 18, color: INK_MUTED, maxWidth: 560, margin: '0 auto 56px', lineHeight: 1.6, fontWeight: 500 }}>
            No setup, no copy-paste. Works on the phone in your pocket.
          </Paragraph>
          <Row gutter={[28, 32]}>
            {steps.map((s) => (
              <Col xs={24} sm={8} key={s.num}>
                <div
                  className="sticker-card"
                  style={{
                    padding: '36px 24px 32px',
                    height: '100%',
                    textAlign: 'center',
                    background: WHITE
                  }}
                >
                  <IconSquircle
                    size={76}
                    color={s.color}
                    radius={22}
                    style={{
                      marginBottom: 22,
                      fontFamily: FREDOKA,
                      fontSize: 36,
                      fontWeight: 700
                    }}
                  >
                    {s.num}
                  </IconSquircle>
                  <Title level={4} style={{ fontFamily: FREDOKA, marginBottom: 10, fontWeight: 700, color: INK }}>
                    {s.title}
                  </Title>
                  <Text style={{ fontSize: 15, lineHeight: 1.65, color: INK_MUTED, fontWeight: 500 }}>
                    {s.description}
                  </Text>
                </div>
              </Col>
            ))}
          </Row>
        </div>
      </section>

      {/* ============ PERSONAS (sky tint) ============ */}
      <section style={{ background: TINT.secondary, padding: '88px 24px 96px', position: 'relative', overflow: 'hidden', borderTop: `3px solid ${INK}`, borderBottom: `3px solid ${INK}` }}>
        <Blob color={PEACH} size={300} top={-80} right="-60px" opacity={0.35} blur={70} />
        <Blob color={LAVENDER} size={260} bottom={-60} left="-50px" kind="b" opacity={0.45} blur={70} />
        <div style={{ position: 'relative', maxWidth: 1080, margin: '0 auto', textAlign: 'center' }}>
          <SectionEyebrow bg={WHITE}>Who it's for</SectionEyebrow>
          <Title level={2} style={{ fontFamily: FREDOKA, fontSize: 'clamp(32px, 4.5vw, 46px)', marginBottom: 14, letterSpacing: -0.8, fontWeight: 700, color: INK }}>
            Built for the whole homework table
          </Title>
          <Paragraph style={{ fontSize: 18, color: INK, maxWidth: 580, margin: '0 auto 56px', lineHeight: 1.6, fontWeight: 600 }}>
            The same friendly tutor, whoever’s using it.
          </Paragraph>
          <Row gutter={[24, 24]}>
            {personas.map((p) => (
              <Col xs={24} sm={8} key={p.title}>
                <div
                  className="sticker-card"
                  style={{
                    padding: '32px 26px',
                    height: '100%',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                    background: WHITE
                  }}
                >
                  <IconSquircle size={64} color={p.color} radius={18} style={{ fontSize: 28 }}>
                    {p.icon}
                  </IconSquircle>
                  <Title level={4} style={{ fontFamily: FREDOKA, margin: 0, fontWeight: 700, color: INK }}>
                    {p.title}
                  </Title>
                  <Text style={{ fontSize: 15, lineHeight: 1.65, color: INK_MUTED, fontWeight: 500 }}>
                    {p.description}
                  </Text>
                </div>
              </Col>
            ))}
          </Row>
        </div>
      </section>

      {/* ============ CTA band (mint, with sparkles) ============ */}
      <section
        style={{
          padding: '96px 24px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
          background: MINT,
          borderBottom: `3px solid ${INK}`
        }}
      >
        <Sparkle size={36} color={SUNSHINE} top="18%" left="14%" rotate={18} />
        <Sparkle size={28} color={PEACH} top="66%" right="14%" rotate={-22} />
        <Sparkle size={24} color={WHITE} bottom="14%" left="36%" rotate={42} />
        <Sparkle size={20} color={LAVENDER} top="14%" right="38%" rotate={-12} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 620, margin: '0 auto' }}>
          <Title level={2} style={{ fontFamily: FREDOKA, color: INK, fontSize: 'clamp(34px, 5vw, 48px)', marginBottom: 14, letterSpacing: -0.8, fontWeight: 700 }}>
            Ready to start tutoring?
          </Title>
          <Paragraph style={{ color: INK, fontSize: 18, marginBottom: 36, lineHeight: 1.6, fontWeight: 600 }}>
            One tap with Google. An admin approves new accounts to keep young learners safe.
          </Paragraph>
          <div
            className="sticker-card"
            style={{
              display: 'inline-flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 14,
              padding: '26px 30px 22px',
              background: WHITE
            }}
          >
            <GoogleSignInButton
              role="student"
              size="large"
              width={280}
              scale={1.4}
              onSuccess={handleGoogleSuccess}
            />
            <Text style={{ color: INK_MUTED, fontSize: 13, fontWeight: 700 }}>
              No password. Cancel any time.
            </Text>
          </div>
        </div>
      </section>

      {/* ============ Footer ============ */}
      <footer
        style={{
          padding: '44px 24px',
          textAlign: 'center',
          background: INK,
          color: ON_DARK.text,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <LogoMark size={36} />
          <span style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 20, color: WHITE, letterSpacing: -0.2 }}>
            YouTutor<span style={{ color: MINT }}>AI</span>
          </span>
        </div>
        <Text style={{ color: ON_DARK.text, fontSize: 13, fontWeight: 600 }}>
          Made with <HeartFilled style={{ color: PEACH, fontSize: 12 }} /> for kids who learn out loud.
        </Text>
        <Text style={{ color: ON_DARK.textMuted, fontSize: 12 }}>
          &copy;2019&ndash;2026 Techseeding PTY LTD. All rights reserved.
        </Text>
        <Link href="https://techseeding.com.au" target="_blank" rel="noopener noreferrer" style={{ color: SUNSHINE, fontWeight: 700 }}>
          techseeding.com.au
        </Link>
        <Text style={{ color: ON_DARK.textMuted, fontSize: 12 }}>
          ABN: 35631597450 / ACN: 631597450
        </Text>
        <div style={{ marginTop: 14, display: 'flex', gap: 28, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link href="/privacy_policy" target="_blank" rel="noopener noreferrer" style={{ color: ON_DARK.text, fontWeight: 700 }}>
            Privacy
          </Link>
          <Link href="/terms_of_use" target="_blank" rel="noopener noreferrer" style={{ color: ON_DARK.text, fontWeight: 700 }}>
            Terms
          </Link>
        </div>
      </footer>
    </div>
  );
}
