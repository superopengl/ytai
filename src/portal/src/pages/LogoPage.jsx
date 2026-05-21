import { Typography } from 'antd';
import theme, { palette as brand } from '../theme.js';

const { Title, Paragraph, Text } = Typography;

const QUICKSAND = "'Quicksand', 'Nunito', system-ui, sans-serif";

// Color sections — read straight from the brand palette so this page can
// never drift from theme.js. Each entry names the JSX-friendly path
// (`palette.X` or `theme.token.X`) so engineers can copy it into code.
const colorSections = [
  {
    heading: 'Brand',
    blurb: 'Sage-blue primary + mauve secondary. The two calming voices of the brand.',
    swatches: [
      { name: 'Primary · Sage', token: 'palette.primary', hex: brand.primary },
      { name: 'Primary · Dark', token: 'palette.primaryDark', hex: brand.primaryDark },
      { name: 'Secondary · Mauve', token: 'palette.secondary', hex: brand.secondary },
      { name: 'Secondary · Dark', token: 'palette.secondaryDark', hex: brand.secondaryDark }
    ]
  },
  {
    heading: 'Action',
    blurb: 'CTA shares the calming sage primary — depth comes from the shadow pair, not contrast.',
    swatches: [
      { name: 'CTA', token: 'palette.cta', hex: brand.cta },
      { name: 'CTA · Dark', token: 'palette.ctaDark', hex: brand.ctaDark },
      { name: 'Success', token: 'theme.token.colorSuccess', hex: theme.token.colorSuccess },
      { name: 'Error · Coral', token: 'palette.error', hex: brand.error }
    ]
  },
  {
    heading: 'Accents',
    blurb: 'Soft pastels for icon plinths, chips, and the AI annotation palette.',
    swatches: [
      { name: 'Mint', token: 'palette.accentMint', hex: brand.accentMint },
      { name: 'Lavender', token: 'palette.accentPurple', hex: brand.accentPurple },
      { name: 'Peach', token: 'palette.accentPeach', hex: brand.accentPeach },
      { name: 'Cream Peach', token: 'palette.accentYellow', hex: brand.accentYellow }
    ]
  },
  {
    heading: 'Neutrals',
    blurb: 'Cool-grey page bg is the neumorphism canvas — every raised card sits on this color.',
    swatches: [
      { name: 'Background', token: 'palette.bg', hex: brand.bg },
      { name: 'Background · Paper', token: 'palette.bgPaper', hex: brand.bgPaper },
      { name: 'Background · Panel', token: 'palette.bgPanel', hex: brand.bgPanel },
      { name: 'Background · Bubble', token: 'palette.bgBubble', hex: brand.bgBubble },
      { name: 'Surface', token: 'palette.surface', hex: brand.surface },
      { name: 'Surface · Oat', token: 'palette.surfaceOat', hex: brand.surfaceOat },
      { name: 'Text · Ink', token: 'palette.text', hex: brand.text },
      { name: 'Text · Soft Ink', token: 'palette.textInkSoft', hex: brand.textInkSoft },
      { name: 'Text · Muted', token: 'palette.textMuted', hex: brand.textMuted },
      { name: 'Text · Hint', token: 'palette.textHint', hex: brand.textHint },
      { name: 'Border', token: 'palette.border', hex: brand.border },
      { name: 'Border · Soft', token: 'palette.borderSoft', hex: brand.borderSoft }
    ]
  },
  {
    heading: 'Tints',
    blurb: 'Pale fills for icon plinths and section-eyebrow chips.',
    swatches: [
      { name: 'Tint · Primary', token: 'palette.tint.primary', hex: brand.tint.primary },
      { name: 'Tint · Secondary', token: 'palette.tint.secondary', hex: brand.tint.secondary },
      { name: 'Tint · CTA', token: 'palette.tint.cta', hex: brand.tint.cta },
      { name: 'Tint · Mint', token: 'palette.tint.mint', hex: brand.tint.mint },
      { name: 'Tint · Purple', token: 'palette.tint.purple', hex: brand.tint.purple },
      { name: 'Tint · Yellow', token: 'palette.tint.yellow', hex: brand.tint.yellow }
    ]
  },
  {
    heading: 'Subjects',
    blurb:
      'Subject identity — math/thinking/reading/writing. Used by the Tutor page chips and the Progress page.',
    swatches: [
      { name: 'Math', token: 'palette.subjects.math.color', hex: brand.subjects.math.color },
      { name: 'Math · Tint', token: 'palette.subjects.math.tint', hex: brand.subjects.math.tint },
      { name: 'Thinking', token: 'palette.subjects.thinking.color', hex: brand.subjects.thinking.color },
      { name: 'Thinking · Tint', token: 'palette.subjects.thinking.tint', hex: brand.subjects.thinking.tint },
      { name: 'Reading', token: 'palette.subjects.reading.color', hex: brand.subjects.reading.color },
      { name: 'Reading · Tint', token: 'palette.subjects.reading.tint', hex: brand.subjects.reading.tint },
      { name: 'Writing', token: 'palette.subjects.writing.color', hex: brand.subjects.writing.color },
      { name: 'Writing · Tint', token: 'palette.subjects.writing.tint', hex: brand.subjects.writing.tint }
    ]
  },
  {
    heading: 'Canvas & State',
    blurb: 'Drawing pens, the slate void behind the worksheet, and correct/wrong semantics.',
    swatches: [
      { name: 'Pen · Red', token: 'palette.pens.red', hex: brand.pens.red },
      { name: 'Pen · Green', token: 'palette.pens.green', hex: brand.pens.green },
      { name: 'Pen · Orange', token: 'palette.pens.orange', hex: brand.pens.orange },
      { name: 'Pen · Purple', token: 'palette.pens.purple', hex: brand.pens.purple },
      { name: 'Pen · Ink', token: 'palette.pens.ink', hex: brand.pens.ink },
      { name: 'Pen · Yellow', token: 'palette.pens.yellow', hex: brand.pens.yellow },
      { name: 'Pen · Cyan', token: 'palette.pens.cyan', hex: brand.pens.cyan },
      { name: 'AI Annotation Default', token: 'palette.aiAnnotationDefault', hex: brand.aiAnnotationDefault },
      { name: 'Canvas Void', token: 'palette.canvasVoid', hex: brand.canvasVoid },
      { name: 'State · Correct', token: 'palette.state.correct', hex: brand.state.correct },
      { name: 'State · Wrong', token: 'palette.state.wrong', hex: brand.state.wrong }
    ]
  }
];

// Pure-luminance text-contrast pick. Swaps to white text only when the
// swatch is genuinely dark.
function pickFg(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma < 0.55 ? '#ffffff' : brand.text;
}

function LogoMark({ size = 96 }) {
  // Circular neumorphism disc with a sage-to-mauve gradient and a white "Y"
  // mark — the new brand expression.
  const stroke = Math.max(4, size * 0.085);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      aria-label="YouTutorAI logo mark"
      style={{
        filter:
          'drop-shadow(-3px -3px 6px rgba(255,255,255,0.85)) drop-shadow(3px 3px 8px rgba(163,177,198,0.5))'
      }}
    >
      <defs>
        <linearGradient id="ytai-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={brand.primary} />
          <stop offset="100%" stopColor={brand.secondary} />
        </linearGradient>
      </defs>
      <circle cx="48" cy="48" r="46" fill="url(#ytai-grad)" />
      <path
        d="M28 30 L48 56 L68 30"
        stroke="#fff"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <line x1="48" y1="56" x2="48" y2="72" stroke="#fff" strokeWidth={stroke} strokeLinecap="round" />
      <circle cx="76" cy="22" r="6" fill={brand.accentPeach} />
    </svg>
  );
}

function LogoLockup({ size = 64, color = brand.text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <LogoMark size={size} />
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
        <span style={{ fontFamily: QUICKSAND, fontSize: size * 0.42, fontWeight: 700, color }}>
          YouTutor
          <span
            style={{
              background: brand.gradient.text,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}
          >
            AI
          </span>
        </span>
        <span
          style={{
            fontSize: size * 0.2,
            color,
            opacity: 0.7,
            marginTop: 4,
            fontFamily: QUICKSAND,
            fontWeight: 500
          }}
        >
          Homework, made gentler.
        </span>
      </div>
    </div>
  );
}

function NeuCard({ children, style }) {
  return (
    <div
      style={{
        background: brand.bg,
        borderRadius: theme.radius.lg,
        boxShadow: theme.stickerShadow.card,
        padding: 32,
        ...style
      }}
    >
      {children}
    </div>
  );
}

function Swatch({ name, token, hex }) {
  const fg = pickFg(hex);
  return (
    <div
      style={{
        borderRadius: theme.radius.lg,
        overflow: 'hidden',
        background: brand.bg,
        boxShadow: theme.stickerShadow.card
      }}
    >
      <div
        style={{
          background: hex,
          color: fg,
          padding: '32px 20px',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          minHeight: 120
        }}
      >
        <span style={{ fontSize: 17, fontWeight: 700 }}>{name}</span>
        <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 }}>
          {hex.toUpperCase()}
        </span>
      </div>
      <div style={{ padding: '14px 20px', background: brand.bg }}>
        <Text
          type="secondary"
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}
        >
          {token}
        </Text>
      </div>
    </div>
  );
}

export default function LogoPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: theme.token.colorBgLayout,
        padding: '64px 24px',
        color: theme.token.colorTextBase
      }}
    >
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <Title
          level={1}
          style={{
            marginBottom: 8,
            fontFamily: QUICKSAND,
            letterSpacing: -1,
            fontSize: 'clamp(40px, 6vw, 64px)'
          }}
        >
          <span
            style={{
              background: brand.gradient.text,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}
          >
            Brand
          </span>
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 56, fontSize: 16, maxWidth: 640 }}>
          Logo and color tokens for YouTutorAI. All values are sourced from{' '}
          <Text code>src/portal/src/theme.js</Text>. The design system is{' '}
          <b>soft neumorphism</b> — depth comes from paired light/dark shadows, never hard borders.
        </Paragraph>

        <Title level={2} style={{ fontFamily: QUICKSAND }}>
          Logo
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 24, fontSize: 15 }}>
          A circular disc in the sage-to-mauve brand gradient, with a friendly “Y” mark in white and
          a peach personality dot.
        </Paragraph>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 24,
            marginBottom: 56
          }}
        >
          <NeuCard
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 200
            }}
          >
            <LogoLockup size={72} />
          </NeuCard>
          <div
            style={{
              background: '#4A5568',
              borderRadius: theme.radius.lg,
              padding: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 200,
              boxShadow: theme.stickerShadow.card
            }}
          >
            <LogoLockup size={72} color="#fff" />
          </div>
          <NeuCard
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 200
            }}
          >
            <LogoMark size={108} />
          </NeuCard>
        </div>

        <Title level={3} style={{ fontFamily: QUICKSAND }}>
          Mark sizes
        </Title>
        <NeuCard
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 36,
            marginBottom: 56,
            flexWrap: 'wrap'
          }}
        >
          {[32, 48, 64, 96, 128].map((s) => (
            <div key={s} style={{ textAlign: 'center' }}>
              <LogoMark size={s} />
              <div style={{ marginTop: 12 }}>
                <Text type="secondary" style={{ fontWeight: 600 }}>
                  {s}px
                </Text>
              </div>
            </div>
          ))}
        </NeuCard>

        <Title level={3} style={{ fontFamily: QUICKSAND }}>
          Typography
        </Title>
        <NeuCard style={{ marginBottom: 56 }}>
          <div style={{ display: 'grid', gap: 20 }}>
            <div>
              <Text type="secondary" style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6 }}>
                DISPLAY · QUICKSAND 700
              </Text>
              <div
                style={{
                  fontFamily: QUICKSAND,
                  fontSize: 44,
                  fontWeight: 700,
                  letterSpacing: -1,
                  lineHeight: 1.1,
                  marginTop: 6
                }}
              >
                Homework,{' '}
                <span
                  style={{
                    background: brand.gradient.text,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}
                >
                  made gentler.
                </span>
              </div>
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6 }}>
                BODY · NUNITO 500
              </Text>
              <div
                style={{
                  fontFamily: 'Nunito, system-ui, sans-serif',
                  fontSize: 17,
                  fontWeight: 500,
                  lineHeight: 1.65,
                  marginTop: 6,
                  color: brand.textMuted
                }}
              >
                A Socratic homework tutor for kids 8–14. Snap the worksheet, circle what’s tricky,
                and the AI walks you through it — never dumps the answer.
              </div>
            </div>
          </div>
        </NeuCard>

        <Title level={2} style={{ fontFamily: QUICKSAND }}>
          Color palette
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 32, maxWidth: 640, fontSize: 15 }}>
          Always reference colors via the brand palette or Ant theme tokens — no hardcoded hex
          values in components. Sage-blue primary, mauve secondary, peach personality — all sitting
          on the cool-grey neumorphism canvas.
        </Paragraph>
        {colorSections.map((section) => (
          <div key={section.heading} style={{ marginBottom: 48 }}>
            <Title level={3} style={{ marginBottom: 4, fontFamily: QUICKSAND }}>
              {section.heading}
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 20 }}>
              {section.blurb}
            </Paragraph>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: 20
              }}
            >
              {section.swatches.map((c) => (
                <Swatch key={c.token} {...c} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
