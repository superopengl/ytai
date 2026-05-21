import { Typography } from 'antd';
import theme, { palette as brand } from '../theme.js';

const { Title, Paragraph, Text } = Typography;

// Color sections — read straight from the brand palette so this page can
// never drift from theme.js. Each entry names the JSX-friendly path
// (`palette.X` or `theme.token.X`) so engineers can copy it into code.
const colorSections = [
  {
    heading: 'Brand',
    blurb: 'Sky-blue primary + peach secondary. The two voices of the brand.',
    swatches: [
      { name: 'Primary', token: 'palette.primary', hex: brand.primary },
      { name: 'Primary · Dark', token: 'palette.primaryDark', hex: brand.primaryDark },
      { name: 'Secondary', token: 'palette.secondary', hex: brand.secondary },
      { name: 'Secondary · Dark', token: 'palette.secondaryDark', hex: brand.secondaryDark }
    ]
  },
  {
    heading: 'Action',
    blurb: 'CTA green is mapped to Ant\'s colorPrimary — the click-targets of the app.',
    swatches: [
      { name: 'CTA', token: 'palette.cta', hex: brand.cta },
      { name: 'CTA · Dark', token: 'palette.ctaDark', hex: brand.ctaDark },
      { name: 'Success', token: 'theme.token.colorSuccess', hex: theme.token.colorSuccess },
      { name: 'Error', token: 'palette.error', hex: brand.error }
    ]
  },
  {
    heading: 'Accents',
    blurb: 'Saturated tints for chips, highlights, and the AI annotation palette.',
    swatches: [
      { name: 'Mint', token: 'palette.accentMint', hex: brand.accentMint },
      { name: 'Lavender', token: 'palette.accentPurple', hex: brand.accentPurple },
      { name: 'Sunshine', token: 'palette.accentYellow', hex: brand.accentYellow }
    ]
  },
  {
    heading: 'Neutrals',
    blurb: 'Cream page, white surface, slate ink — the foundation under every pastel.',
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
    blurb: 'Pale fills for icon plinths, section eyebrows, and selected-row backgrounds.',
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
    blurb: 'Subject identity — math/thinking/reading/writing. Used by both the Tutor page chips and the Progress page.',
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
    blurb: 'Drawing pens the student picks from + the deep void behind the worksheet + correct/wrong semantics.',
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
// swatch is genuinely dark (the slate ink, the error red) — every pastel
// in the palette is bright enough that the slate ink reads cleanly on it.
function pickFg(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // Relative luminance, sRGB shortcut (good enough for swatches).
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma < 0.5 ? '#ffffff' : brand.text;
}

function LogoMark({ size = 96 }) {
  // Mark uses the brand palette directly so it doesn't drift when Ant's
  // colorPrimary points at the CTA. Sky-blue disc, slate-ink "Y", peach
  // dot for the spark of personality.
  const r = size / 2;
  const stroke = Math.max(4, size * 0.085);
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-label="YouTutorAI logo mark">
      <circle cx={r} cy={r} r={r - 2} fill={brand.primary} stroke={brand.border} strokeWidth={3} />
      <path
        d="M28 30 L48 56 L68 30"
        stroke={brand.text}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <line
        x1="48"
        y1="56"
        x2="48"
        y2="72"
        stroke={brand.text}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      <circle cx="74" cy="22" r="6" fill={brand.secondary} stroke={brand.border} strokeWidth={2} />
    </svg>
  );
}

function LogoLockup({ size = 64, color = brand.text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <LogoMark size={size} />
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
        <span style={{ fontSize: size * 0.42, fontWeight: 800, color }}>
          YouTutor<span style={{ color: brand.cta }}>AI</span>
        </span>
        <span style={{ fontSize: size * 0.2, color, opacity: 0.7, marginTop: 4 }}>
          Snap. Circle. Learn.
        </span>
      </div>
    </div>
  );
}

function Swatch({ name, token, hex }) {
  const fg = pickFg(hex);
  return (
    <div
      style={{
        borderRadius: theme.radius.md,
        overflow: 'hidden',
        background: brand.surface,
        border: `3px solid ${brand.border}`,
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
          minHeight: 120,
          borderBottom: `3px solid ${brand.border}`
        }}
      >
        <span style={{ fontSize: 18, fontWeight: 700 }}>{name}</span>
        <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
          {hex.toUpperCase()}
        </span>
      </div>
      <div style={{ padding: '12px 20px' }}>
        <Text type="secondary" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
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
        padding: '48px 24px',
        color: theme.token.colorTextBase
      }}
    >
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <Title level={1} style={{ marginBottom: 8 }}>Brand</Title>
        <Paragraph type="secondary" style={{ marginBottom: 48 }}>
          Logo and color tokens for YouTutorAI. All values are sourced from{' '}
          <Text code>src/portal/src/theme.js</Text>.
        </Paragraph>

        <Title level={2}>Logo</Title>
        <Paragraph type="secondary">
          A friendly “Y” mark in the brand gradient, paired with the wordmark.
        </Paragraph>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 24,
            marginBottom: 48
          }}
        >
          <div
            style={{
              background: brand.surface,
              borderRadius: theme.radius.md,
              border: `3px solid ${brand.border}`,
              padding: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 160,
              boxShadow: theme.stickerShadow.card
            }}
          >
            <LogoLockup size={72} />
          </div>
          <div
            style={{
              background: brand.text,
              borderRadius: theme.radius.md,
              border: `3px solid ${brand.border}`,
              padding: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 160,
              boxShadow: theme.stickerShadow.card
            }}
          >
            <LogoLockup size={72} color={brand.surface} />
          </div>
          <div
            style={{
              background: brand.secondary,
              borderRadius: theme.radius.md,
              border: `3px solid ${brand.border}`,
              padding: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 160,
              boxShadow: theme.stickerShadow.card
            }}
          >
            <LogoMark size={96} />
          </div>
        </div>

        <Title level={3}>Mark sizes</Title>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 32,
            padding: 32,
            background: brand.surface,
            borderRadius: theme.radius.md,
            border: `3px solid ${brand.border}`,
            marginBottom: 48,
            boxShadow: theme.stickerShadow.card
          }}
        >
          {[32, 48, 64, 96, 128].map((s) => (
            <div key={s} style={{ textAlign: 'center' }}>
              <LogoMark size={s} />
              <div style={{ marginTop: 8 }}>
                <Text type="secondary">{s}px</Text>
              </div>
            </div>
          ))}
        </div>

        <Title level={2}>Color palette</Title>
        <Paragraph type="secondary">
          Always reference colors via the brand palette or Ant theme tokens — no hardcoded hex
          values in components. Sky-blue primary, peach secondary, vibrant green CTA — soft pastel
          surfaces on a warm cream page, all wrapped in the 3px slate sticker outline.
        </Paragraph>
        {colorSections.map((section) => (
          <div key={section.heading} style={{ marginBottom: 40 }}>
            <Title level={3} style={{ marginBottom: 4 }}>{section.heading}</Title>
            <Paragraph type="secondary" style={{ marginBottom: 16 }}>
              {section.blurb}
            </Paragraph>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: 16
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
