import { Typography } from 'antd';
import theme from '../theme.js';

const { Title, Paragraph, Text } = Typography;

const palette = [
  { name: 'Primary', token: 'colorPrimary', hex: theme.token.colorPrimary },
  { name: 'Success', token: 'colorSuccess', hex: theme.token.colorSuccess },
  { name: 'Warning', token: 'colorWarning', hex: theme.token.colorWarning },
  { name: 'Error', token: 'colorError', hex: theme.token.colorError },
  { name: 'Text Base', token: 'colorTextBase', hex: theme.token.colorTextBase },
  { name: 'Bg Layout', token: 'colorBgLayout', hex: theme.token.colorBgLayout }
];

function LogoMark({ size = 96 }) {
  const r = size / 2;
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-label="YouTutorAI logo mark">
      <circle cx={r} cy={r} r={r} fill={theme.token.colorPrimary} />
      <path
        d="M28 30 L48 56 L68 30"
        stroke="#ffffff"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <line
        x1="48"
        y1="56"
        x2="48"
        y2="72"
        stroke="#ffffff"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <circle cx="74" cy="22" r="6" fill={theme.token.colorWarning} />
    </svg>
  );
}

function LogoLockup({ size = 64, color = theme.token.colorTextBase }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <LogoMark size={size} />
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
        <span style={{ fontSize: size * 0.42, fontWeight: 700, color }}>
          YouTutor<span style={{ color: theme.token.colorPrimary }}>AI</span>
        </span>
        <span style={{ fontSize: size * 0.2, color, opacity: 0.7, marginTop: 4 }}>
          Snap. Circle. Learn.
        </span>
      </div>
    </div>
  );
}

function Swatch({ name, token, hex }) {
  const isLight = ['#f7f8fc', '#ffb547'].includes(hex.toLowerCase());
  const fg = isLight ? theme.token.colorTextBase : '#ffffff';
  return (
    <div
      style={{
        borderRadius: theme.token.borderRadius,
        overflow: 'hidden',
        background: '#fff',
        boxShadow: '0 1px 3px rgba(29, 34, 51, 0.08), 0 4px 12px rgba(29, 34, 51, 0.04)'
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
        <span style={{ fontSize: 18, fontWeight: 600 }}>{name}</span>
        <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
          {hex.toUpperCase()}
        </span>
      </div>
      <div style={{ padding: '12px 20px' }}>
        <Text type="secondary" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
          theme.token.{token}
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
              background: '#fff',
              borderRadius: theme.token.borderRadius,
              padding: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 160,
              boxShadow: '0 1px 3px rgba(29, 34, 51, 0.08), 0 4px 12px rgba(29, 34, 51, 0.04)'
            }}
          >
            <LogoLockup size={72} />
          </div>
          <div
            style={{
              background: theme.token.colorTextBase,
              borderRadius: theme.token.borderRadius,
              padding: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 160
            }}
          >
            <LogoLockup size={72} color="#ffffff" />
          </div>
          <div
            style={{
              background: theme.token.colorPrimary,
              borderRadius: theme.token.borderRadius,
              padding: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 160
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
            background: '#fff',
            borderRadius: theme.token.borderRadius,
            marginBottom: 48,
            boxShadow: '0 1px 3px rgba(29, 34, 51, 0.08), 0 4px 12px rgba(29, 34, 51, 0.04)'
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
          Always reference colors via the Ant Design theme tokens — no hardcoded hex values in
          components.
        </Paragraph>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 16
          }}
        >
          {palette.map((c) => (
            <Swatch key={c.token} {...c} />
          ))}
        </div>
      </div>
    </div>
  );
}
