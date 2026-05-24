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
  ArrowRightOutlined,
  GlobalOutlined
} from '@ant-design/icons';
import { palette, stickerShadow } from '../theme.js';
import GoogleSignInButton from '../components/GoogleSignInButton.jsx';
import Logo from '../components/Logo.jsx';
import HeroBackdrop from '../components/HeroBackdrop.jsx';

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
      'A Socratic tutor that scaffolds your thinking step by step — never just hands over the answer, always builds understanding.'
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

// --- NavBar (floating rounded) ---------------------------------------------

function NavBar({ onSignIn }) {
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
        <Logo height={32} />

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
      </div>
    </div>
  );
}

// --- Page -------------------------------------------------------------------

export default function HomePage() {
  const navigate = useNavigate();
  const handleGoogleSuccess = (u) => {
    message.success(`Welcome, ${u.name}! Loading your tutor…`);
    navigate('/tutor');
  };

  const goToLogin = () => navigate('/login');

  return (
    <div style={{ minHeight: '100vh', background: BG, color: INK }}>
      <NavBar onSignIn={goToLogin} />

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
        <HeroBackdrop />

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
              YouTutorAI is a Socratic homework tutor for kids 8–14. Snap the worksheet, circle
              what’s tricky, and the AI walks you through it — never just hands over the answer.
              The pace is calm. The voice is kind.
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
              <GoogleSignInButton
                role="student"
                size="large"
                onSuccess={handleGoogleSuccess}
              />
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
          background: '#A595B8'
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
            One tap with Google. An admin approves new accounts to keep young learners safe.
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
            <GoogleSignInButton
              role="student"
              size="large"
              onSuccess={handleGoogleSuccess}
            />
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
          background: '#1A202C',
          color: ON_DARK.text,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10
        }}
      >
        <div style={{ marginBottom: 6 }}>
          <Logo height={28} />
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
