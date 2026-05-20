import { useNavigate } from 'react-router-dom';
import { Button, Typography, Card, Row, Col, message } from 'antd';
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
  GoogleOutlined
} from '@ant-design/icons';
import theme from '../theme.js';
import GoogleSignInButton from '../components/GoogleSignInButton.jsx';

const { Title, Paragraph, Text, Link } = Typography;

const PRIMARY = theme.token.colorPrimary;
const SUCCESS = theme.token.colorSuccess;
const WARNING = theme.token.colorWarning;
const ERROR = theme.token.colorError;
const TEXT = theme.token.colorTextBase;
const BG = theme.token.colorBgLayout;
const RADIUS = theme.token.borderRadius;

const cardShadow =
  '0 1px 3px rgba(29, 34, 51, 0.08), 0 10px 24px rgba(29, 34, 51, 0.06)';
const subtleShadow = '0 1px 2px rgba(29, 34, 51, 0.06)';

function LogoMark({ size = 96 }) {
  const r = size / 2;
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-label="YouTutorAI logo">
      <defs>
        <linearGradient id="ytai-home-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={PRIMARY} />
          <stop offset="100%" stopColor={SUCCESS} />
        </linearGradient>
      </defs>
      <circle cx={r} cy={r} r={r} fill="url(#ytai-home-grad)" />
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
      <circle cx="74" cy="22" r="6" fill={WARNING} />
    </svg>
  );
}

const features = [
  {
    icon: <CameraOutlined />,
    color: PRIMARY,
    bg: 'rgba(91,141,239,0.10)',
    title: 'Snap a Photo',
    description:
      'Point your phone at any worksheet, exam, or homework page. The AI reads the questions and gets ready to help.'
  },
  {
    icon: <HighlightOutlined />,
    color: WARNING,
    bg: 'rgba(255,181,71,0.14)',
    title: 'Circle What’s Tricky',
    description:
      'Highlight, circle, or underline the part you’re stuck on. The tutor sees exactly what you’re pointing at.'
  },
  {
    icon: <BulbOutlined />,
    color: SUCCESS,
    bg: 'rgba(62,194,143,0.12)',
    title: 'Learn, Don’t Copy',
    description:
      'A Socratic tutor that scaffolds your thinking step by step — never dumps the answer, always builds understanding.'
  },
  {
    icon: <GoogleOutlined />,
    color: ERROR,
    bg: 'rgba(255,107,107,0.10)',
    title: 'Sign In with Google',
    description:
      'Skip the password. One tap with your Google account creates a parent, teacher, or student profile — admin approval keeps young learners safe.'
  }
];

const subjects = [
  { icon: <CalculatorOutlined />, label: 'Math', color: PRIMARY },
  { icon: <ExperimentOutlined />, label: 'Thinking Skills', color: SUCCESS },
  { icon: <ReadOutlined />, label: 'English', color: WARNING },
  { icon: <EditOutlined />, label: 'Writing', color: ERROR }
];

const steps = [
  {
    num: '1',
    title: 'Snap your worksheet',
    description: 'Take a clear photo of the homework, exam, or textbook page you need help with.',
    color: PRIMARY
  },
  {
    num: '2',
    title: 'Circle what’s tricky',
    description: 'Use the pen to point at the question — or region — that you don’t get yet.',
    color: WARNING
  },
  {
    num: '3',
    title: 'Get tutored',
    description: 'Ask in your own words. The tutor walks you through it, the way a great teacher would.',
    color: SUCCESS
  }
];

const personas = [
  {
    icon: <SmileOutlined />,
    title: 'Students',
    description:
      'Ages 8–14. Kid-friendly, encouraging, and never gives away answers without working through the reasoning with you.',
    color: PRIMARY
  },
  {
    icon: <TeamOutlined />,
    title: 'Parents',
    description:
      'Help your child with homework even when you don’t remember the material — YouTutorAI is your co-tutor.',
    color: SUCCESS
  },
  {
    icon: <SafetyCertificateOutlined />,
    title: 'Teachers',
    description:
      'Assign as homework support, or walk a student through tricky problems together during class.',
    color: WARNING
  }
];

function NavBar({ onScrollToSignIn }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '14px clamp(16px, 4vw, 48px)',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: 'rgba(247, 248, 252, 0.78)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(29,34,51,0.06)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <LogoMark size={36} />
        <span style={{ fontWeight: 700, fontSize: 20, color: TEXT }}>
          YouTutor<span style={{ color: PRIMARY }}>AI</span>
        </span>
      </div>
      <Button
        size="large"
        type="primary"
        icon={<GoogleOutlined style={{ fontSize: 20 }} />}
        onClick={onScrollToSignIn}
        style={{
          borderRadius: 28,
          paddingInline: 28,
          fontWeight: 700,
          fontSize: 17,
          height: 52,
          boxShadow: subtleShadow
        }}
      >
        Sign in with Google
      </Button>
    </div>
  );
}

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
    <div style={{ minHeight: '100vh', background: BG, color: TEXT }}>
      <NavBar onScrollToSignIn={scrollToSignIn} />

      {/* Hero */}
      <div
        style={{
          background: `linear-gradient(135deg, ${PRIMARY} 0%, ${SUCCESS} 100%)`,
          padding: 'clamp(120px, 16vw, 180px) 24px 100px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
          color: '#fff'
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            width: 320,
            height: 320,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)',
            top: -80,
            left: -90
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            width: 200,
            height: 200,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.07)',
            bottom: -60,
            right: 40
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            width: 120,
            height: 120,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.10)',
            top: 60,
            right: '18%'
          }}
        />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 760, margin: '0 auto' }}>
          <div style={{ marginBottom: 24 }}>
            <LogoMark size={84} />
          </div>
          <Title
            style={{
              color: '#fff',
              fontSize: 'clamp(34px, 7vw, 56px)',
              marginBottom: 16,
              lineHeight: 1.15,
              textShadow: '0 2px 12px rgba(0,0,0,0.18)'
            }}
          >
            Snap. Circle. <span style={{ color: WARNING }}>Learn.</span>
          </Title>
          <Paragraph
            style={{
              color: 'rgba(255,255,255,0.92)',
              fontSize: 'clamp(16px, 2.2vw, 20px)',
              maxWidth: 580,
              margin: '0 auto 36px',
              lineHeight: 1.6
            }}
          >
            An AI tutor for students aged 8–14. Snap a photo of your homework, circle what’s
            tricky, and get walked through it — the way a real tutor would.
          </Paragraph>
          <div
            id="signin"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              scrollMarginTop: 100
            }}
          >
            <GoogleSignInButton
              role="student"
              size="large"
              width={200}
              scale={1.5}
              onSuccess={handleGoogleSuccess}
            />
          </div>
          <Paragraph style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 18, marginBottom: 0 }}>
            Free during early access — accounts approved by an admin to keep young learners safe.
          </Paragraph>
        </div>
      </div>

      {/* Subjects strip */}
      <div
        style={{
          background: '#fff',
          padding: '28px 24px',
          borderBottom: '1px solid rgba(29,34,51,0.06)'
        }}
      >
        <div
          style={{
            maxWidth: 880,
            margin: '0 auto',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            justifyContent: 'center',
            alignItems: 'center'
          }}
        >
          <Text type="secondary" style={{ marginRight: 8, fontSize: 14 }}>
            Covers
          </Text>
          {subjects.map((s) => (
            <div
              key={s.label}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                borderRadius: 999,
                background: BG,
                color: s.color,
                fontWeight: 600
              }}
            >
              <span style={{ fontSize: 18 }}>{s.icon}</span>
              <span style={{ color: TEXT }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '72px 24px 56px', textAlign: 'center' }}>
        <Title level={2} style={{ fontSize: 36, marginBottom: 12 }}>
          How YouTutorAI helps
        </Title>
        <Paragraph type="secondary" style={{ fontSize: 17, marginBottom: 48, maxWidth: 560, margin: '0 auto 48px' }}>
          Three things make this different from a chatbot that just hands you the answer.
        </Paragraph>
        <Row gutter={[24, 24]}>
          {features.map((f) => (
            <Col xs={24} sm={12} lg={6} key={f.title}>
              <Card
                style={{
                  borderRadius: RADIUS * 1.5,
                  border: 'none',
                  boxShadow: cardShadow,
                  height: '100%',
                  textAlign: 'center'
                }}
                styles={{ body: { padding: '32px 24px' } }}
              >
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 20,
                    background: f.bg,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 20,
                    fontSize: 32,
                    color: f.color
                  }}
                >
                  {f.icon}
                </div>
                <Title level={4} style={{ marginBottom: 8 }}>
                  {f.title}
                </Title>
                <Text type="secondary" style={{ fontSize: 15, lineHeight: 1.6 }}>
                  {f.description}
                </Text>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      {/* How it works */}
      <div style={{ background: '#fff', padding: '72px 24px', textAlign: 'center' }}>
        <Title level={2} style={{ fontSize: 36, marginBottom: 12 }}>
          From photo to “I get it” in three steps
        </Title>
        <Paragraph type="secondary" style={{ fontSize: 17, marginBottom: 48, maxWidth: 560, margin: '0 auto 48px' }}>
          No setup, no copy-paste. Works on the phone in your pocket.
        </Paragraph>
        <Row gutter={[32, 32]} style={{ maxWidth: 980, margin: '0 auto' }}>
          {steps.map((s) => (
            <Col xs={24} sm={8} key={s.num}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  background: s.color,
                  color: '#fff',
                  fontSize: 24,
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 20,
                  boxShadow: `0 6px 16px ${s.color}40`
                }}
              >
                {s.num}
              </div>
              <Title level={4} style={{ marginBottom: 8 }}>
                {s.title}
              </Title>
              <Text type="secondary" style={{ fontSize: 15, lineHeight: 1.6 }}>
                {s.description}
              </Text>
            </Col>
          ))}
        </Row>
      </div>

      {/* Personas */}
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '72px 24px', textAlign: 'center' }}>
        <Title level={2} style={{ fontSize: 36, marginBottom: 12 }}>
          Built for the whole homework table
        </Title>
        <Paragraph type="secondary" style={{ fontSize: 17, marginBottom: 48, maxWidth: 560, margin: '0 auto 48px' }}>
          The same friendly tutor, whoever’s using it.
        </Paragraph>
        <Row gutter={[24, 24]}>
          {personas.map((p) => (
            <Col xs={24} sm={8} key={p.title}>
              <div style={{ padding: '0 8px' }}>
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 18,
                    background: `${p.color}1a`,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 16,
                    fontSize: 28,
                    color: p.color
                  }}
                >
                  {p.icon}
                </div>
                <Title level={4} style={{ color: p.color, marginBottom: 8 }}>
                  {p.title}
                </Title>
                <Text type="secondary" style={{ fontSize: 15, lineHeight: 1.6 }}>
                  {p.description}
                </Text>
              </div>
            </Col>
          ))}
        </Row>
      </div>

      {/* CTA band */}
      <div
        style={{
          background: `linear-gradient(135deg, ${SUCCESS} 0%, ${PRIMARY} 100%)`,
          padding: '72px 24px',
          textAlign: 'center',
          color: '#fff'
        }}
      >
        <Title level={2} style={{ color: '#fff', fontSize: 34, marginBottom: 12 }}>
          Ready to start tutoring?
        </Title>
        <Paragraph style={{ color: 'rgba(255,255,255,0.9)', fontSize: 17, maxWidth: 520, margin: '0 auto 28px' }}>
          Create your account in seconds. An admin approves new accounts to keep young learners safe.
        </Paragraph>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8
          }}
        >
          <GoogleSignInButton
              role="student"
              size="large"
              width={200}
              scale={1.5}
              onSuccess={handleGoogleSuccess}
            />
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '32px 24px',
          textAlign: 'center',
          background: TEXT,
          color: 'rgba(255,255,255,0.7)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <LogoMark size={32} />
          <span style={{ fontWeight: 700, fontSize: 16, color: '#fff' }}>
            YouTutor<span style={{ color: PRIMARY }}>AI</span>
          </span>
        </div>
        <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>
          &copy;2019&ndash;2026 Techseeding PTY LTD. All rights reserved.
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
          YouTutorAI is a product owned by Techseeding
        </Text>
        <Link href="https://techseeding.com.au" target="_blank" rel="noopener noreferrer">
          https://techseeding.com.au/
        </Link>
        <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>
          ABN: 35631597450 / ACN: 631597450
        </Text>
        <div style={{ marginTop: 12, display: 'flex', gap: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link href="/privacy_policy" target="_blank" rel="noopener noreferrer">
            Privacy Policy
          </Link>
          <Link href="/terms_of_use" target="_blank" rel="noopener noreferrer">
            Terms of Use
          </Link>
        </div>
      </div>
    </div>
  );
}
