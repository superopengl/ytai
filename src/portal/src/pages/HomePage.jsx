import { lazy, Suspense } from 'react';
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
  GoogleOutlined,
  HeartFilled,
  GlobalOutlined,
  RocketOutlined,
  LineChartOutlined
} from '@ant-design/icons';
import { palette, stickerShadow, radius } from '../theme.js';
import Logo from '../components/Logo.jsx';
import authSession from '../lib/authSession.js';

// Lazy so neither the GIS-dependent button code nor the decorative icon
// shower lands in the LCP chunk. Both render below or behind the headline
// — they paint after hydration with no visible shift.
const GoogleSignInButton = lazy(() => import('../components/GoogleSignInButton.jsx'));
const HeroBackdrop = lazy(() => import('../components/HeroBackdrop.jsx'));

// Skeleton matches the AntD `Button size="large"` footprint so layout
// doesn't jump when the lazy chunk lands.
function SignInButtonSkeleton() {
  return (
    <div
      aria-hidden="true"
      style={{
        height: 48,
        borderRadius: radius.md,
        background: 'rgba(0,0,0,0.06)'
      }}
    />
  );
}

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
  textInkSoft: INK_SOFT,
  onDark: ON_DARK,
  gradient: GRAD,
  tint: TINT,
  subjects: SUBJECTS
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
      'A Socratic tutor that scaffolds your thinking step by step — never just hands over the answer, always builds understanding.'
  },
  {
    icon: <LineChartOutlined />,
    color: LAVENDER,
    title: 'Spot the Patterns',
    description:
      'Every session rolls up into a clear report — weak spots, wins, and growth over time, subject by subject.'
  }
];

const subjects = [
  { icon: <CalculatorOutlined />, label: 'Math', color: SAGE },
  { icon: <ExperimentOutlined />, label: 'Thinking Skills', color: MAUVE },
  { icon: <ReadOutlined />, label: 'English', color: MINT },
  { icon: <EditOutlined />, label: 'Writing', color: PEACH }
];

const personas = [
  {
    title: 'Students',
    description:
      'Ages 8–14. A kind, encouraging tutor that walks you through the thinking — never just hands over the answer.',
    bgColor: SUBJECTS.writing.tint
  },
  {
    title: 'Parents',
    description:
      'Help your kid with homework even when you don’t remember the material yourself. YouTutorAI is your co-tutor at the table.',
    bgColor: SUBJECTS.reading.tint
  },
  {
    title: 'Teachers',
    description:
      'Assign it as homework support, or work through a tricky problem with a student during class.',
    bgColor: SUBJECTS.thinking.tint
  }
];

// --- NavBar (floating rounded) ---------------------------------------------

function NavBar({ isSignedIn, onSignIn, onGoToTutor }) {
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
          background: 'rgba(255, 255, 255, 0.85)',
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
        <Logo height={24} />

        {isSignedIn ? (
          <button
            type="button"
            className="sticker-btn sticker-press"
            onClick={onGoToTutor}
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
            <RocketOutlined style={{ fontSize: 18 }} />
            Start session
          </button>
        ) : (
          <button
            type="button"
            className="sticker-btn sticker-press"
            onClick={onSignIn}
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
        )}
      </div>
    </div>
  );
}

// --- Page -------------------------------------------------------------------

export default function HomePage() {
  const navigate = useNavigate();
  const isSignedIn = Boolean(authSession().token);
  const handleGoogleSuccess = (u) => {
    message.success(`Welcome, ${u.name}! Loading your tutor…`);
    navigate('/tutor');
  };

  const goToLogin = () => navigate('/login');
  const goToTutor = () => navigate('/tutor');

  return (
    <div style={{ minHeight: '100vh', background: BG, color: INK }}>
      <NavBar isSignedIn={isSignedIn} onSignIn={goToLogin} onGoToTutor={goToTutor} />

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
        <Suspense fallback={null}>
          <HeroBackdrop />
        </Suspense>

        <div
          style={{
            position: 'relative',
            zIndex: 1,
            maxWidth: 720,
            margin: '0 auto',
            textAlign: 'center'
          }}
        >
          <div>
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
                maxWidth: 560,
                margin: '0 auto 36px',
                lineHeight: 1.65,
                fontWeight: 500
              }}
            >
              A Socratic homework tutor for kids 8–14. Snap the worksheet, circle what’s tricky,
              and the tutor walks you through it — calmly, one step at a time.
            </Paragraph>

            <div
              id="signin"
              style={{
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: 14,
                scrollMarginTop: 100,
                minWidth: 320
              }}
            >
              <Suspense fallback={<SignInButtonSkeleton />}>
                <GoogleSignInButton
                  role="student"
                  size="large"
                  onSuccess={handleGoogleSuccess}
                />
              </Suspense>
              <button
                type="button"
                onClick={goToLogin}
                style={{
                  background: 'transparent',
                  border: 0,
                  cursor: 'pointer',
                  color: SAGE_DARK,
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: 'underline'
                }}
              >
                Or use a sign-in code
              </button>
            </div>
          </div>
        </div>
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
        style={{ background: WHITE, padding: '88px 24px 144px', position: 'relative', overflow: 'hidden' }}
      >
        <div style={{ position: 'relative', maxWidth: 1180, margin: '0 auto', textAlign: 'center' }}>
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
            What makes this <span className="gradient-text">different</span>
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
                  <IconCircle
                    size={48}
                    color={f.color}
                    style={{
                      marginBottom: 8,
                      fontSize: 40,
                      background: 'transparent',
                      boxShadow: 'none',
                      color: INK_HINT
                    }}
                  >
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

      {/* ============ PERSONAS ============ */}
      <section
        style={{ background: WHITE, padding: '24px 24px 144px', position: 'relative', overflow: 'hidden' }}
      >
        <div style={{ position: 'relative', maxWidth: 1080, margin: '0 auto', textAlign: 'center' }}>
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
                    padding: '32px 28px 24px',
                    height: '100%',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 12,
                    background: p.bgColor,
                    borderRadius: 28
                  }}
                >
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
          background: SUBJECTS.thinking.color
        }}
      >
        <div
          style={{
            maxWidth: 620,
            margin: '0 auto'
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
              color: WHITE,
              fontSize: 'clamp(32px, 5vw, 46px)',
              marginBottom: 14,
              letterSpacing: -1,
              fontWeight: 700
            }}
          >
            Ready for a{' '}
            <span
              style={{
                background: `linear-gradient(135deg, ${CREAM_PEACH} 0%, ${PEACH} 100%)`,
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                color: 'transparent'
              }}
            >
              calmer
            </span>{' '}
            homework hour?
          </Title>
          <Paragraph
            style={{
              color: 'rgba(255, 255, 255, 0.88)',
              fontSize: 18,
              marginBottom: 36,
              lineHeight: 1.65,
              fontWeight: 500
            }}
          >
            One tap with Google. New accounts are admin-reviewed to keep young learners safe.
          </Paragraph>
          <div
            style={{
              display: 'inline-flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              gap: 12,
              minWidth: 320
            }}
          >
            <Suspense fallback={<SignInButtonSkeleton />}>
              <GoogleSignInButton
                role="student"
                size="large"
                onSuccess={handleGoogleSuccess}
              />
            </Suspense>
            <button
              type="button"
              onClick={goToLogin}
              style={{
                background: 'transparent',
                border: 0,
                cursor: 'pointer',
                color: WHITE,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'underline'
              }}
            >
              Or use a sign-in code
            </button>
          </div>
        </div>
      </section>

      {/* ============ Footer ============ */}
      <footer
        style={{
          padding: '48px 24px 40px',
          textAlign: 'center',
          background: palette.canvasVoid,
          color: ON_DARK.text,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10
        }}
      >
        <div style={{ marginBottom: 6 }}>
          <Logo height={24} />
        </div>
        <Text style={{ color: ON_DARK.textMuted, fontSize: 12 }}>
          &copy;2019&ndash;2026 Techseeding PTY LTD. All rights reserved.
        </Text>
        <Link
          href="https://techseeding.com.au"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: ON_DARK.textMuted, fontWeight: 600 }}
        >
          <GlobalOutlined/> techseeding.com.au
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
            style={{ color: ON_DARK.textMuted, fontWeight: 600 }}
          >
            Privacy
          </Link>
          <Link
            href="/terms_of_use"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: ON_DARK.textMuted, fontWeight: 600 }}
          >
            Terms
          </Link>
        </div>
      </footer>
    </div>
  );
}
