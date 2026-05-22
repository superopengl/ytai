import { useState } from 'react';
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
  ArrowRightOutlined
} from '@ant-design/icons';
import { palette, stickerShadow, radius } from '../theme.js';
import GoogleSignInButton from '../components/GoogleSignInButton.jsx';
import Logo from '../components/Logo.jsx';

const { Title, Paragraph, Text, Link } = Typography;

const {
  primary: SAGE,
  primaryDark: SAGE_DARK,
  secondary: MAUVE,
  accentMint: MINT,
  accentPurple: LAVENDER,
  accentPeach: PEACH,
  accentYellow: CREAM_PEACH,
  bg: BG,
  bgPanel: BG_PANEL,
  surface: WHITE,
  text: INK,
  textMuted: INK_MUTED,
  textHint: INK_HINT,
  onDark: ON_DARK,
  gradient: GRAD,
  tint: TINT
} = palette;

const QUICKSAND = "'Quicksand', 'Nunito', system-ui, sans-serif";

// --- Visual primitives ------------------------------------------------------

// Circular neumorphism icon plinth — the signature element of the Serenity
// reference. Uses a tinted fill so the icon stays readable against the
// raised cool-grey surface.
function IconCircle({ size = 56, color = MINT, children, style }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: INK,
        fontSize: Math.round(size * 0.42),
        flexShrink: 0,
        boxShadow: stickerShadow.button,
        ...style
      }}
    >
      {children}
    </div>
  );
}

// Decorative soft blob — adds depth behind hero sections without breaking
// the calm neumorphism aesthetic.
function Blob({ color, size, top, left, right, bottom, kind = 'a', opacity = 0.55, blur = 80 }) {
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

function SectionEyebrow({ children, color = SAGE }) {
  return (
    <div
      className="sticker-chip"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        background: BG,
        color,
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        marginBottom: 18
      }}
    >
      <span
        className="breathing-circle"
        style={{ width: 8, height: 8, background: color, borderRadius: '50%' }}
      />
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
    color: CREAM_PEACH,
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
  { icon: <CalculatorOutlined />, label: 'Math', color: SAGE },
  { icon: <ExperimentOutlined />, label: 'Thinking Skills', color: MAUVE },
  { icon: <ReadOutlined />, label: 'English', color: MINT },
  { icon: <EditOutlined />, label: 'Writing', color: PEACH }
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
    color: CREAM_PEACH
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
    color: SAGE
  },
  {
    icon: <SafetyCertificateOutlined />,
    title: 'Teachers',
    description:
      'Assign as homework support, or walk a student through tricky problems together during class.',
    color: LAVENDER
  }
];

// Mood selector — kid-friendly icebreaker in the hero. Same pattern as the
// reference mental-health demo but the moods map to homework feelings.
const moods = [
  { emoji: '😄', label: 'Got this' },
  { emoji: '🙂', label: 'Mostly ok' },
  { emoji: '😐', label: 'Confused' },
  { emoji: '😟', label: 'Stuck' },
  { emoji: '😭', label: 'Help!' }
];

// --- Hero preview (mood-meter card) ----------------------------------------

function HeroPreview() {
  const [mood, setMood] = useState(2);
  return (
    <div
      className="sticker-card"
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 440,
        padding: 28,
        borderRadius: 28,
        background: BG
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          marginBottom: 22
        }}
      >
        <IconCircle size={52} color={MINT}>
          <SmileOutlined />
        </IconCircle>
        <div>
          <div style={{ fontSize: 13, color: INK_MUTED, fontWeight: 600, letterSpacing: 0.4 }}>
            HOW DOES THIS QUESTION FEEL?
          </div>
          <div style={{ fontFamily: QUICKSAND, fontSize: 22, fontWeight: 700, color: INK, marginTop: 2 }}>
            Today’s homework
          </div>
        </div>
      </div>

      {/* Mood meter — neumorphism pill row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 10,
          padding: '14px 10px',
          borderRadius: 20,
          marginBottom: 22
        }}
        className="neu-inset"
      >
        {moods.map((m, i) => (
          <button
            type="button"
            key={m.label}
            onClick={() => setMood(i)}
            aria-label={m.label}
            className="sticker-press"
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              border: 0,
              cursor: 'pointer',
              background: BG,
              fontSize: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: mood === i ? stickerShadow.inset : stickerShadow.button,
              transform: mood === i ? 'scale(0.96)' : 'none',
              transition: 'box-shadow 200ms, transform 200ms'
            }}
          >
            {m.emoji}
          </button>
        ))}
      </div>

      <div
        style={{
          padding: 18,
          borderRadius: 18,
          background: BG,
          boxShadow: stickerShadow.button,
          marginBottom: 16
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: SAGE,
              boxShadow: `0 0 0 4px ${SAGE}33`
            }}
          />
          <Text style={{ fontSize: 12, fontWeight: 700, color: SAGE, letterSpacing: 0.5 }}>
            TUTOR
          </Text>
        </div>
        <Text style={{ fontSize: 15, color: INK, lineHeight: 1.55, fontWeight: 500 }}>
          You’re feeling <b>{moods[mood].label.toLowerCase()}</b>. Let’s slow down — what part of this
          question makes the most sense to you so far?
        </Text>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          color: INK_MUTED,
          fontSize: 13,
          fontWeight: 600
        }}
      >
        <CheckCircleFilled style={{ color: SAGE }} />
        Calm pace. No shame. No copying.
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
        style={{
          background: 'rgba(240, 244, 248, 0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          borderRadius: 22,
          boxShadow: stickerShadow.button
        }}
      >
        <Logo height={40} />

        <button
          type="button"
          className="sticker-btn sticker-press"
          onClick={onScrollToSignIn}
          style={{
            background: GRAD.primary,
            color: '#fff',
            padding: '10px 24px',
            fontSize: 15,
            cursor: 'pointer',
            fontFamily: 'inherit',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            border: 0
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
    <div style={{ minHeight: '100vh', background: BG, color: INK }}>
      <NavBar onScrollToSignIn={scrollToSignIn} />

      {/* ============ HERO ============ */}
      <section
        style={{
          padding: 'clamp(120px, 14vw, 160px) 24px clamp(80px, 10vw, 110px)',
          position: 'relative',
          overflow: 'hidden',
          background: `
            radial-gradient(ellipse 80% 60% at 50% 0%, ${TINT.primary} 0%, transparent 70%),
            linear-gradient(180deg, ${TINT.primary} 0%, ${BG} 60%)
          `
        }}
      >
        {/* Tech dot-grid — fades center-out so the pattern reads as
            "infinite plane" without fighting the headline. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `radial-gradient(circle, ${SAGE_DARK}40 1px, transparent 1.4px)`,
            backgroundSize: '26px 26px',
            maskImage:
              'radial-gradient(ellipse 75% 70% at 50% 45%, black 20%, transparent 85%)',
            WebkitMaskImage:
              'radial-gradient(ellipse 75% 70% at 50% 45%, black 20%, transparent 85%)',
            pointerEvents: 'none'
          }}
        />
        {/* Diagonal scan beam — HUD-style highlight angling across the hero. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(115deg, transparent 35%, ${SAGE}1F 50%, transparent 65%)`,
            mixBlendMode: 'screen',
            pointerEvents: 'none'
          }}
        />
        {/* Thin glowing horizon line at the section seam — "data plane" cue. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 1,
            background: `linear-gradient(90deg, transparent 0%, ${SAGE}99 50%, transparent 100%)`,
            boxShadow: `0 0 24px ${SAGE}88`,
            pointerEvents: 'none'
          }}
        />
        <Blob color={SAGE} size={520} top={-120} left={-160} opacity={0.4} blur={90} />
        <Blob color={MAUVE} size={420} top={80} right="-100px" kind="b" opacity={0.32} blur={90} />
        <Blob color={MINT} size={300} top={260} right="12%" kind="b" opacity={0.35} blur={70} />
        <Blob color={PEACH} size={240} bottom={-40} left="22%" opacity={0.25} blur={60} />

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
                padding: '8px 18px',
                background: SAGE,
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: 0.3,
                marginBottom: 28,
                boxShadow: `0 6px 18px ${SAGE}55`
              }}
            >
              <span
                className="breathing-circle"
                style={{
                  width: 10,
                  height: 10,
                  background: '#fff',
                  borderRadius: '50%',
                  boxShadow: '0 0 0 4px rgba(255,255,255,0.35)'
                }}
              />
              Early access · A calmer way to learn
            </div>

            <Title
              style={{
                fontFamily: QUICKSAND,
                fontSize: 'clamp(48px, 7.5vw, 84px)',
                marginBottom: 22,
                lineHeight: 1.02,
                letterSpacing: -1.8,
                color: INK,
                fontWeight: 800
              }}
            >
              <span
                style={{
                  background: GRAD.text,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text'
                }}
              >
                Homework,
              </span>{' '}
              <br />
              <span style={{ color: SAGE_DARK }}>made gentler.</span>
            </Title>
            <Paragraph
              style={{
                color: INK_MUTED,
                fontSize: 'clamp(17px, 2vw, 21px)',
                maxWidth: 540,
                marginBottom: 36,
                lineHeight: 1.65,
                fontWeight: 500
              }}
            >
              YouTutorAI is a Socratic homework tutor for kids 8–14. Snap the worksheet, circle
              what’s tricky, and the AI walks you through it — never dumps the answer. The pace is
              calm. The voice is kind.
            </Paragraph>

            <div
              id="signin"
              style={{
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 14,
                padding: '24px 28px 22px',
                background: WHITE,
                borderRadius: radius.xl,
                border: `2px solid ${SAGE}33`,
                boxShadow: `0 14px 40px ${SAGE}33, ${stickerShadow.card}`,
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
              <Text style={{ color: INK_MUTED, fontSize: 13, fontWeight: 600 }}>
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
                fontWeight: 600
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <CheckCircleFilled style={{ color: SAGE, fontSize: 18 }} /> Kid-safe by design
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <CheckCircleFilled style={{ color: SAGE, fontSize: 18 }} /> Math · Reading · Writing
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <CheckCircleFilled style={{ color: SAGE, fontSize: 18 }} /> Never just gives the answer
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
            .hero-grid > div:first-child .sticker-chip,
            .hero-grid > div:first-child > div[id="signin"] { margin-inline: auto; }
          }
        `}</style>
      </section>

      {/* ============ SUBJECTS strip ============ */}
      <section
        style={{
          background: BG,
          padding: '32px 24px 64px'
        }}
      >
        <div
          style={{
            maxWidth: 980,
            margin: '0 auto',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 14,
            justifyContent: 'center',
            alignItems: 'center'
          }}
        >
          <Text
            style={{
              color: INK_MUTED,
              marginRight: 4,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: 'uppercase'
            }}
          >
            Covers
          </Text>
          {subjects.map((s) => (
            <div
              key={s.label}
              className="sticker-chip"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 22px 10px 10px',
                background: BG,
                color: INK,
                fontWeight: 700,
                fontSize: 15
              }}
            >
              <IconCircle size={34} color={s.color} style={{ boxShadow: 'none', fontSize: 14 }}>
                {s.icon}
              </IconCircle>
              {s.label}
            </div>
          ))}
        </div>
      </section>

      {/* ============ FEATURES ============ */}
      <section
        style={{ background: BG, padding: '88px 24px 96px', position: 'relative', overflow: 'hidden' }}
      >
        <Blob color={LAVENDER} size={300} top={60} right="-60px" opacity={0.45} blur={80} />
        <Blob color={MINT} size={260} bottom={-50} left="-60px" kind="b" opacity={0.45} blur={80} />
        <div style={{ position: 'relative', maxWidth: 1180, margin: '0 auto', textAlign: 'center' }}>
          <SectionEyebrow color={SAGE}>How it helps</SectionEyebrow>
          <Title
            level={2}
            style={{
              fontFamily: QUICKSAND,
              fontSize: 'clamp(32px, 4.5vw, 46px)',
              marginBottom: 14,
              letterSpacing: -1,
              fontWeight: 700,
              color: INK
            }}
          >
            Four things make this <span className="gradient-text">different</span>
          </Title>
          <Paragraph
            style={{
              fontSize: 18,
              color: INK_MUTED,
              maxWidth: 580,
              margin: '0 auto 56px',
              lineHeight: 1.65,
              fontWeight: 500
            }}
          >
            Not another chatbot that hands you the answer. A real tutor that meets you on the page.
          </Paragraph>
          <Row gutter={[28, 28]}>
            {features.map((f) => (
              <Col xs={24} sm={12} lg={6} key={f.title}>
                <div
                  className="sticker-card"
                  style={{
                    padding: '32px 24px 36px',
                    height: '100%',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    background: BG,
                    borderRadius: 28
                  }}
                >
                  <IconCircle size={72} color={f.color} style={{ marginBottom: 24, fontSize: 28 }}>
                    {f.icon}
                  </IconCircle>
                  <Title
                    level={4}
                    style={{
                      fontFamily: QUICKSAND,
                      marginBottom: 10,
                      fontWeight: 700,
                      color: INK
                    }}
                  >
                    {f.title}
                  </Title>
                  <Text
                    style={{
                      fontSize: 15,
                      lineHeight: 1.65,
                      color: INK_MUTED,
                      fontWeight: 500
                    }}
                  >
                    {f.description}
                  </Text>
                </div>
              </Col>
            ))}
          </Row>
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section
        style={{ background: BG, padding: '24px 24px 96px', position: 'relative', overflow: 'hidden' }}
      >
        <div style={{ position: 'relative', maxWidth: 1080, margin: '0 auto', textAlign: 'center' }}>
          <SectionEyebrow color={MAUVE}>How it works</SectionEyebrow>
          <Title
            level={2}
            style={{
              fontFamily: QUICKSAND,
              fontSize: 'clamp(32px, 4.5vw, 46px)',
              marginBottom: 14,
              letterSpacing: -1,
              fontWeight: 700,
              color: INK
            }}
          >
            From photo to <span className="gradient-text">“I get it”</span> in three steps
          </Title>
          <Paragraph
            style={{
              fontSize: 18,
              color: INK_MUTED,
              maxWidth: 560,
              margin: '0 auto 56px',
              lineHeight: 1.65,
              fontWeight: 500
            }}
          >
            No setup, no copy-paste. Works on the phone in your pocket.
          </Paragraph>
          <Row gutter={[28, 32]}>
            {steps.map((s, idx) => (
              <Col xs={24} sm={8} key={s.num}>
                <div
                  className="sticker-card"
                  style={{
                    padding: '40px 26px 32px',
                    height: '100%',
                    textAlign: 'center',
                    background: BG,
                    borderRadius: 28,
                    position: 'relative'
                  }}
                >
                  <IconCircle
                    size={76}
                    color={s.color}
                    style={{
                      marginBottom: 22,
                      fontFamily: QUICKSAND,
                      fontSize: 32,
                      fontWeight: 700
                    }}
                  >
                    {s.num}
                  </IconCircle>
                  <Title
                    level={4}
                    style={{
                      fontFamily: QUICKSAND,
                      marginBottom: 10,
                      fontWeight: 700,
                      color: INK
                    }}
                  >
                    {s.title}
                  </Title>
                  <Text
                    style={{
                      fontSize: 15,
                      lineHeight: 1.65,
                      color: INK_MUTED,
                      fontWeight: 500
                    }}
                  >
                    {s.description}
                  </Text>
                  {idx < steps.length - 1 && (
                    <ArrowRightOutlined
                      style={{
                        position: 'absolute',
                        right: -18,
                        top: '40%',
                        color: INK_HINT,
                        fontSize: 22
                      }}
                      className="step-arrow"
                    />
                  )}
                </div>
              </Col>
            ))}
          </Row>
          <style>{`
            @media (max-width: 768px) {
              .step-arrow { display: none; }
            }
          `}</style>
        </div>
      </section>

      {/* ============ PERSONAS ============ */}
      <section
        style={{ background: BG, padding: '24px 24px 96px', position: 'relative', overflow: 'hidden' }}
      >
        <Blob color={PEACH} size={300} top={-80} right="-60px" opacity={0.35} blur={80} />
        <Blob color={LAVENDER} size={260} bottom={-60} left="-50px" kind="b" opacity={0.45} blur={80} />
        <div style={{ position: 'relative', maxWidth: 1080, margin: '0 auto', textAlign: 'center' }}>
          <SectionEyebrow color={PEACH}>Who it’s for</SectionEyebrow>
          <Title
            level={2}
            style={{
              fontFamily: QUICKSAND,
              fontSize: 'clamp(32px, 4.5vw, 46px)',
              marginBottom: 14,
              letterSpacing: -1,
              fontWeight: 700,
              color: INK
            }}
          >
            Built for the whole <span className="gradient-text">homework table</span>
          </Title>
          <Paragraph
            style={{
              fontSize: 18,
              color: INK_MUTED,
              maxWidth: 580,
              margin: '0 auto 56px',
              lineHeight: 1.65,
              fontWeight: 500
            }}
          >
            The same calming, patient tutor — whoever’s using it.
          </Paragraph>
          <Row gutter={[28, 28]}>
            {personas.map((p) => (
              <Col xs={24} sm={8} key={p.title}>
                <div
                  className="sticker-card"
                  style={{
                    padding: '36px 28px',
                    height: '100%',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                    background: BG,
                    borderRadius: 28
                  }}
                >
                  <IconCircle size={64} color={p.color} style={{ fontSize: 26 }}>
                    {p.icon}
                  </IconCircle>
                  <Title
                    level={4}
                    style={{
                      fontFamily: QUICKSAND,
                      margin: 0,
                      fontWeight: 700,
                      color: INK
                    }}
                  >
                    {p.title}
                  </Title>
                  <Text
                    style={{
                      fontSize: 15,
                      lineHeight: 1.65,
                      color: INK_MUTED,
                      fontWeight: 500
                    }}
                  >
                    {p.description}
                  </Text>
                </div>
              </Col>
            ))}
          </Row>
        </div>
      </section>

      {/* ============ CTA band ============ */}
      <section
        style={{
          padding: '96px 24px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
          background: BG
        }}
      >
        <Blob color={MINT} size={420} top="10%" left="8%" opacity={0.4} blur={90} />
        <Blob color={LAVENDER} size={360} bottom="10%" right="12%" kind="b" opacity={0.45} blur={90} />
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            maxWidth: 620,
            margin: '0 auto',
            padding: '56px 40px 48px',
            background: BG,
            borderRadius: 32,
            boxShadow: stickerShadow.cardHover
          }}
        >
          <div
            className="breathing-circle"
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: GRAD.primary,
              boxShadow: `0 0 0 14px ${SAGE}1A, 0 0 0 28px ${SAGE}0F`,
              margin: '0 auto 28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 36
            }}
          >
            <HeartFilled />
          </div>
          <Title
            level={2}
            style={{
              fontFamily: QUICKSAND,
              color: INK,
              fontSize: 'clamp(32px, 5vw, 46px)',
              marginBottom: 14,
              letterSpacing: -1,
              fontWeight: 700
            }}
          >
            Ready for a <span className="gradient-text">calmer</span> homework hour?
          </Title>
          <Paragraph
            style={{
              color: INK_MUTED,
              fontSize: 18,
              marginBottom: 36,
              lineHeight: 1.65,
              fontWeight: 500
            }}
          >
            One tap with Google. An admin approves new accounts to keep young learners safe.
          </Paragraph>
          <div
            style={{
              display: 'inline-flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12
            }}
          >
            <GoogleSignInButton
              role="student"
              size="large"
              width={280}
              scale={1.4}
              onSuccess={handleGoogleSuccess}
            />
            <Text style={{ color: INK_MUTED, fontSize: 13, fontWeight: 600 }}>
              No password. Cancel any time.
            </Text>
          </div>
        </div>
      </section>

      {/* ============ Footer ============ */}
      <footer
        style={{
          padding: '48px 24px 40px',
          textAlign: 'center',
          background: '#4A5568',
          color: ON_DARK.text,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10
        }}
      >
        <div style={{ marginBottom: 6 }}>
          <Logo height={40} />
        </div>
        <Text style={{ color: ON_DARK.text, fontSize: 13, fontWeight: 500 }}>
          Made with <HeartFilled style={{ color: PEACH, fontSize: 12 }} /> for kids who learn out loud.
        </Text>
        <Text style={{ color: ON_DARK.textMuted, fontSize: 12 }}>
          &copy;2019&ndash;2026 Techseeding PTY LTD. All rights reserved.
        </Text>
        <Link
          href="https://techseeding.com.au"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: MINT, fontWeight: 600 }}
        >
          techseeding.com.au
        </Link>
        <Text style={{ color: ON_DARK.textMuted, fontSize: 12 }}>
          ABN: 35631597450 / ACN: 631597450
        </Text>
        <div
          style={{
            marginTop: 14,
            display: 'flex',
            gap: 28,
            flexWrap: 'wrap',
            justifyContent: 'center'
          }}
        >
          <Link
            href="/privacy_policy"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: ON_DARK.text, fontWeight: 600 }}
          >
            Privacy
          </Link>
          <Link
            href="/terms_of_use"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: ON_DARK.text, fontWeight: 600 }}
          >
            Terms
          </Link>
        </div>
      </footer>
    </div>
  );
}
