import { lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CameraIcon,
  HighlightIcon,
  BulbIcon,
  ReadIcon,
  EditIcon,
  CalculatorIcon,
  ExperimentIcon,
  GoogleIcon,
  HeartFilledIcon,
  GlobalIcon,
  RocketIcon,
  LineChartIcon
} from '../components/InlineIcons.jsx';
import { palette, stickerShadow, radius, fonts } from '../theme.js';
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

const QUICKSAND = fonts.heading;

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

// --- Content data -----------------------------------------------------------

const features = [
  {
    icon: <CameraIcon />,
    color: PEACH,
    title: 'Snap a Photo',
    description:
      'Point your phone at any worksheet, exam, or homework page. The AI reads the questions and gets ready to help.'
  },
  {
    icon: <HighlightIcon />,
    color: CREAM_PEACH,
    title: 'Circle What’s Tricky',
    description:
      'Highlight, circle, or underline the part you’re stuck on. The tutor sees exactly what you’re pointing at.'
  },
  {
    icon: <BulbIcon />,
    color: MINT,
    title: 'Learn, Don’t Copy',
    description:
      'A Socratic tutor that scaffolds your thinking step by step — never just hands over the answer, always builds understanding.'
  },
  {
    icon: <LineChartIcon />,
    color: LAVENDER,
    title: 'Spot the Patterns',
    description:
      'Every session rolls up into a clear report — weak spots, wins, and growth over time, subject by subject.'
  }
];

const subjects = [
  { icon: <CalculatorIcon />, label: 'Math', color: SAGE },
  { icon: <ExperimentIcon />, label: 'Thinking Skills', color: MAUVE },
  { icon: <ReadIcon />, label: 'English', color: MINT },
  { icon: <EditIcon />, label: 'Writing', color: PEACH }
];

const personas = [
  {
    title: 'Students',
    description:
      'Ages 8–14. A kind, encouraging tutor that walks you through the thinking — never just hands over the answer.'
  },
  {
    title: 'Parents',
    description:
      'Help your kid with homework even when you don’t remember the material yourself. YouTutorAI is your co-tutor at the table.'
  },
  {
    title: 'Teachers',
    description:
      'Assign it as homework support, or work through a tricky problem with a student during class.'
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
        className="ytai-nav-glass"
        style={{
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
            <RocketIcon style={{ fontSize: 18 }} />
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
            <GoogleIcon style={{ fontSize: 18 }} />
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
  const handleGoogleSuccess = () => {
    navigate('/tutor');
  };

  const goToLogin = () => navigate('/login');
  const goToTutor = () => navigate('/tutor');

  return (
    <div style={{ minHeight: '100vh', background: BG, color: INK }}>
      <NavBar isSignedIn={isSignedIn} onSignIn={goToLogin} onGoToTutor={goToTutor} />

      <main>
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
            <h1
              style={{
                fontFamily: QUICKSAND,
                fontSize: 'clamp(48px, 7.5vw, 84px)',
                margin: '0 0 22px',
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
            </h1>
            <p
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
            </p>

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
        style={{ background: WHITE, padding: '88px 24px', position: 'relative', overflow: 'hidden' }}
      >
        <div style={{ position: 'relative', maxWidth: 1180, margin: '0 auto', textAlign: 'center' }}>
          <h2
            style={{
              fontFamily: QUICKSAND,
              fontSize: 'clamp(32px, 4.5vw, 46px)',
              margin: '0 0 14px',
              letterSpacing: -1,
              fontWeight: 700,
              color: INK
            }}
          >
            What makes this <span className="gradient-text">different</span>
          </h2>
          <p
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
          </p>
          <div className="ytai-grid-4">
            {features.map((f) => (
              <div
                key={f.title}
                className="sticker-card"
                style={{
                  padding: '32px 24px',
                  // height: '100%',
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
                <h3
                  style={{
                    fontFamily: QUICKSAND,
                    fontSize: 20,
                    margin: '0 0 10px',
                    fontWeight: 700,
                    color: INK
                  }}
                >
                  {f.title}
                </h3>
                <span
                  style={{
                    fontSize: 15,
                    lineHeight: 1.65,
                    color: INK_MUTED,
                    fontWeight: 500
                  }}
                >
                  {f.description}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ PERSONAS ============ */}
      <section
        style={{ background: WHITE, padding: '24px 24px 88px', position: 'relative', overflow: 'hidden' }}
      >
        <div style={{ position: 'relative', maxWidth: 1080, margin: '0 auto', textAlign: 'center' }}>
          <h2
            style={{
              fontFamily: QUICKSAND,
              fontSize: 'clamp(32px, 4.5vw, 46px)',
              margin: '0 0 14px',
              letterSpacing: -1,
              fontWeight: 700,
              color: INK
            }}
          >
            Built for the whole <span className="gradient-text">homework table</span>
          </h2>
          <p
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
          </p>
          <div className="ytai-grid-3">
            {personas.map((p) => (
              <div
                key={p.title}
                className="sticker-card"
                style={{
                  padding: '32px 28px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 12,
                  background: WHITE,
                  border: `2px solid ${palette.border}`,
                  borderRadius: 28
                }}
              >
                <h3
                  style={{
                    fontFamily: QUICKSAND,
                    fontSize: 20,
                    margin: 0,
                    fontWeight: 700,
                    color: INK
                  }}
                >
                  {p.title}
                </h3>
                <span
                  style={{
                    fontSize: 15,
                    lineHeight: 1.65,
                    color: INK_MUTED,
                    fontWeight: 500
                  }}
                >
                  {p.description}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ CTA band ============ */}
      <section
        style={{
          padding: '96px 24px',
          textAlign: 'center',
          background: palette.secondaryDark
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
            <HeartFilledIcon />
          </div>
          <h2
            style={{
              fontFamily: QUICKSAND,
              color: WHITE,
              fontSize: 'clamp(32px, 5vw, 46px)',
              margin: '0 0 14px',
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
          </h2>
          <p
            style={{
              color: 'rgba(255, 255, 255, 0.88)',
              fontSize: 18,
              margin: '0 0 36px',
              lineHeight: 1.65,
              fontWeight: 500
            }}
          >
            One tap with Google. New accounts are admin-reviewed to keep young learners safe.
          </p>
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

      </main>

      {/* ============ Footer ============ */}
      <footer
        style={{
          padding: '48px 24px 40px',
          textAlign: 'center',
          background: palette.bgDeep,
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
        <span style={{ color: ON_DARK.textMuted, fontSize: 12 }}>
          &copy;2019&ndash;2026 Techseeding PTY LTD. All rights reserved.
        </span>
        <a
          href="https://techseeding.com.au"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: ON_DARK.textMuted, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <GlobalIcon /> techseeding.com.au
        </a>
        <span style={{ color: ON_DARK.textMuted, fontSize: 12 }}>
          ABN: 35631597450 / ACN: 631597450
        </span>
        <div
          style={{
            marginTop: 14,
            display: 'flex',
            gap: 28,
            flexWrap: 'wrap',
            justifyContent: 'center'
          }}
        >
          <a
            href="/privacy_policy"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: ON_DARK.textMuted, fontWeight: 600 }}
          >
            Privacy
          </a>
          <a
            href="/terms_of_use"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: ON_DARK.textMuted, fontWeight: 600 }}
          >
            Terms
          </a>
        </div>
      </footer>
    </div>
  );
}
