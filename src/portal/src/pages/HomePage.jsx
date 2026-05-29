import { lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GoogleIcon,
  StarFilledIcon,
  GlobalIcon,
  RocketIcon
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

// Stroke-outline icons used only on the "How it works" cards. Kept local
// to this page so the shared InlineIcons (which mirror AntD filled-path
// outlines) stay untouched.
function StrokeIcon({ children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}
function CameraOutlineIcon() {
  return (
    <StrokeIcon>
      <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H8l1.5-2h5L16 6h2.5A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z" />
      <circle cx="12" cy="13" r="3.5" />
    </StrokeIcon>
  );
}
function HighlightOutlineIcon() {
  return (
    <StrokeIcon>
      <path d="M14 3l7 7-9 9H5v-7z" />
      <path d="M11 6l7 7" />
      <path d="M5 19l-2 2" />
    </StrokeIcon>
  );
}
function BulbOutlineIcon() {
  return (
    <StrokeIcon>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.9.7 1.6 1.7 1.6 2.7V18h4v-1.5c0-1 .7-2 1.6-2.7A6 6 0 0 0 12 3z" />
    </StrokeIcon>
  );
}
function LineChartOutlineIcon() {
  return (
    <StrokeIcon>
      <path d="M4 4v16h16" />
      <path d="M7 15l4-4 3 3 5-6" />
    </StrokeIcon>
  );
}

// --- Content data -----------------------------------------------------------

const features = [
  {
    icon: <CameraOutlineIcon />,
    color: PEACH,
    title: 'Snap the worksheet',
    description:
      'Point your phone at any worksheet, exam, or homework page. The tutor reads the questions and gets ready to help.'
  },
  {
    icon: <HighlightOutlineIcon />,
    color: CREAM_PEACH,
    title: 'Circle the tricky bit',
    description:
      "Highlight, circle, or underline the part you're stuck on. The tutor sees exactly what you're pointing at."
  },
  {
    icon: <BulbOutlineIcon />,
    color: MINT,
    title: "Let's figure it out",
    description:
      'A kind, patient tutor walks you through the thinking step by step. It never just hands over the answer.'
  },
  {
    icon: <LineChartOutlineIcon />,
    color: LAVENDER,
    title: 'See how you grow',
    description:
      'Every session rolls up into a clear report. Weak spots, wins, and progress over time, subject by subject.'
  }
];

const subjects = [
  { label: 'Math', color: SAGE },
  { label: 'Thinking Skills', color: MAUVE },
  { label: 'Reading', color: MINT },
  { label: 'Writing', color: PEACH }
];

const personas = [
  {
    color: PEACH,
    title: 'Students',
    description:
      "Ages 8 to 14. A kind, encouraging tutor that walks you through the thinking. Never just hands you the answer."
  },
  {
    color: MINT,
    title: 'Parents',
    description:
      "Help your kid with homework even when you don't remember the material yourself. A calm co-tutor at the table."
  },
  {
    color: LAVENDER,
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
            className="sticker-btn sticker-press ytai-nav-cta"
            onClick={onGoToTutor}
            style={{
              background: GRAD.primary,
              color: '#fff',
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              border: 0
            }}
          >
            <RocketIcon style={{ fontSize: 16 }} />
            Start session
          </button>
        ) : (
          <button
            type="button"
            className="sticker-btn sticker-press ytai-nav-cta"
            onClick={onSignIn}
            style={{
              background: GRAD.primary,
              color: '#fff',
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              border: 0
            }}
          >
            <GoogleIcon style={{ fontSize: 16 }} />
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
          padding: 'clamp(120px, 14vw, 160px) 24px clamp(40px, 5vw, 60px)',
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
              <span style={{ color: INK }}>Stuck on homework?</span>{' '}
              <br />
              <span style={{ color: SAGE_DARK }}>Let&apos;s figure it out.</span>
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
              A patient homework tutor for kids 8 to 14. Snap the page, circle what&apos;s tricky,
              we figure it out together.
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
          padding: '0 24px 64px'
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
                gap: 10,
                padding: '10px 20px',
                background: BG,
                color: INK,
                fontWeight: 400,
                fontSize: 15
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: s.color,
                  flexShrink: 0
                }}
              />
              {s.label}
            </div>
          ))}
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
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
            How it works
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
            Three steps to get unstuck, plus a clear picture of how you&apos;re growing.
          </p>
          <div className="ytai-grid-4">
            {features.map((f) => (
              <div
                key={f.title}
                className="sticker-card"
                style={{
                  padding: '32px 24px 28px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  background: BG,
                  borderRadius: radius.xl + 4
                }}
              >
                <IconCircle
                  size={72}
                  color={f.color}
                  style={{ marginBottom: 18 }}
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
            Built for the whole homework table
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
            The same calming, patient tutor for whoever&apos;s using it.
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
                  borderTop: `6px solid ${p.color}`,
                  borderRadius: radius.xl + 4
                }}
              >
                <h3
                  style={{
                    fontFamily: QUICKSAND,
                    fontSize: 22,
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
              background: CREAM_PEACH,
              boxShadow: `0 0 0 14px rgba(255, 255, 255, 0.10), 0 0 0 28px rgba(255, 255, 255, 0.05)`,
              margin: '0 auto 28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: SAGE_DARK,
              fontSize: 38
            }}
          >
            <StarFilledIcon />
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
            Ready to get unstuck?
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
