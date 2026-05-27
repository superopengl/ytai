import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Divider,
  Input,
  Space,
  Typography,
  message
} from 'antd';
import {
  ArrowLeftOutlined,
  MailOutlined,
  SendOutlined
} from '@ant-design/icons';
import { palette, stickerShadow, radius } from '../theme.js';
import GoogleSignInButton from '../components/GoogleSignInButton.jsx';
import Logo from '../components/Logo.jsx';
import HeroBackdrop from '../components/HeroBackdrop.jsx';
import authSession from '../lib/authSession.js';

const { Title, Paragraph, Text, Link } = Typography;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_RE = /^\d{6}$/;

async function postJson(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  let json = {};
  try {
    json = await res.json();
  } catch {
    /* empty */
  }
  if (!res.ok) {
    const err = new Error(json.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return json;
}

function goAfterLogin(navigate, user) {
  if (user.role === 'admin') {
    navigate('/admin');
  } else {
    message.success(`Welcome, ${user.name}!`);
    navigate('/tutor');
  }
}

function EmailOtpTab() {
  const navigate = useNavigate();
  const [stage, setStage] = useState('email');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState(null);
  const [sending, setSending] = useState(false);

  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [expiresAt, setExpiresAt] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  const codeRef = useRef(null);

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      setRemaining(Math.max(0, Math.ceil(ms / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  const sendOtp = async () => {
    const value = email.trim().toLowerCase();
    if (!EMAIL_RE.test(value)) {
      setEmailError('Please enter a valid email address');
      return;
    }
    setEmailError(null);
    setSending(true);
    try {
      const data = await postJson('/api/auth/email', { email: value });
      setExpiresAt(data.expiresAt);
      setCode('');
      setCodeError(null);
      setResendCooldown(30);
      setStage('code');
      setTimeout(() => codeRef.current?.focus(), 0);
    } catch (e) {
      setEmailError(e.message || 'Could not send code. Try again.');
    } finally {
      setSending(false);
    }
  };

  const verifyOtp = async (codeValue = code) => {
    const value = codeValue.trim();
    if (!CODE_RE.test(value)) {
      setCodeError('Enter the 6-digit code from your email');
      return;
    }
    setCodeError(null);
    setVerifying(true);
    try {
      const data = await postJson('/api/auth/otp', {
        email: email.trim().toLowerCase(),
        code: value
      });
      authSession().save(data);
      goAfterLogin(navigate, data.user);
    } catch (e) {
      setCodeError(e.message || "That code didn't work. Try again.");
      setCode('');
      codeRef.current?.focus();
    } finally {
      setVerifying(false);
    }
  };

  if (stage === 'code') {
    const expired = expiresAt && remaining <= 0;
    return (
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Paragraph style={{ color: palette.textMuted, margin: 0 }}>
          We sent a 6-digit code to{' '}
          <strong style={{ color: palette.text }}>{email}</strong>.
        </Paragraph>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Input.OTP
            ref={codeRef}
            length={6}
            size="large"
            value={code}
            onChange={(value) => {
              setCode(value);
              setCodeError(null);
              if (CODE_RE.test(value) && !expired) verifyOtp(value);
            }}
            formatter={(str) => str.replace(/\D/g, '')}
            autoFocus
          />
        </div>
        {codeError && <Alert type="error" showIcon message={codeError} />}
        {!codeError && (
          <Text style={{ display: 'block', textAlign: 'center', color: palette.textMuted, fontSize: 13 }}>
            {verifying
              ? 'Verifying…'
              : expired
                ? 'This code has expired. Tap Resend to get a fresh one.'
                : expiresAt
                  ? `Code expires in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`
                  : null}
          </Text>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button
            type="link"
            icon={<ArrowLeftOutlined />}
            onClick={() => {
              setStage('email');
              setCode('');
              setCodeError(null);
            }}
            style={{ paddingInline: 0, color: palette.textMuted }}
          >
            Change email
          </Button>
          <Button
            type="link"
            loading={sending}
            disabled={resendCooldown > 0}
            onClick={sendOtp}
            style={{ paddingInline: 0, color: palette.primary }}
          >
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
          </Button>
        </div>
      </Space>
    );
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Input
        size="large"
        type="email"
        placeholder="your@email.com"
        autoFocus
        allowClear
        maxLength={120}
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setEmailError(null);
        }}
        onPressEnter={sendOtp}
        prefix={<MailOutlined style={{ color: palette.textMuted }} />}
        style={{ height: 48, borderRadius: radius.md }}
        styles={{ input: { textAlign: 'center' } }}
      />
      <Button
        type="primary"
        size="large"
        block
        loading={sending}
        onClick={sendOtp}
        disabled={!EMAIL_RE.test(email.trim().toLowerCase())}
        icon={<SendOutlined />}
        style={{ height: 48, borderRadius: radius.md, fontWeight: 600 }}
      >
        Email me code
      </Button>
      {emailError && <Alert type="error" showIcon message={emailError} />}
    </Space>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  useEffect(() => {
    document.title = 'Sign in · YouTutorAI';
  }, []);

  const handleGoogleSuccess = (user) => goAfterLogin(navigate, user);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: palette.gradient.surface,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <HeroBackdrop />
      <Card
        style={{
          width: '100%',
          maxWidth: 440,
          borderRadius: radius.xl,
          border: 'none',
          background: palette.surface,
          boxShadow: stickerShadow.card,
          position: 'relative',
          zIndex: 1
        }}
        styles={{ body: { padding: '40px 32px' } }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <span
            role="button"
            tabIndex={0}
            onClick={() => navigate('/')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigate('/');
              }
            }}
            style={{ display: 'inline-block', cursor: 'pointer', marginBottom: 12 }}
            aria-label="Go to home"
          >
            <Logo height={36} />
          </span>
          <Title
            level={3}
            style={{
              marginBottom: 4,
              color: palette.text,
              fontWeight: 700
            }}
          >
            Sign in to YouTutorAI
          </Title>
          <Paragraph style={{ color: palette.textMuted, marginTop: 6, marginBottom: 0 }}>
            One tap with Google, or get a code sent to your email.
          </Paragraph>
        </div>

        <div style={{ marginBottom: 8 }}>
          <GoogleSignInButton
            role="student"
            size="large"
            onSuccess={handleGoogleSuccess}
          />
        </div>

        <Divider plain style={{ color: palette.textMuted, fontSize: 12, margin: '20px 0 16px' }}>
          or
        </Divider>

        <EmailOtpTab />

        <Paragraph
          style={{
            color: palette.textMuted,
            textAlign: 'center',
            marginTop: 24,
            marginBottom: 0,
            fontSize: 13
          }}
        >
          By signing in you agree to our{' '}
          <Link
            href="/terms_of_use"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 'inherit' }}
          >
            Terms of Use
          </Link>{' '}
          and{' '}
          <Link
            href="/privacy_policy"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 'inherit' }}
          >
            Privacy Policy
          </Link>
          .
        </Paragraph>
      </Card>
    </div>
  );
}
