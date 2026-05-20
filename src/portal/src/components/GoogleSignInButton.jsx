import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Typography } from 'antd';
import { GoogleOutlined } from '@ant-design/icons';
import authSession from '../lib/authSession.js';

const { Text } = Typography;

// Read the client ID injected by Vite at build time. Falls back to empty
// string so the button can render a clear "not configured" hint in dev.
// eslint-disable-next-line no-undef
const CLIENT_ID = typeof __YTAI_GOOGLE_CLIENT_ID__ !== 'undefined' ? __YTAI_GOOGLE_CLIENT_ID__ : '';

function waitForGoogle(timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve(window.google);
    const start = Date.now();
    const tick = () => {
      if (window.google?.accounts?.id) return resolve(window.google);
      if (Date.now() - start > timeoutMs) return reject(new Error('Google SDK failed to load'));
      setTimeout(tick, 80);
    };
    tick();
  });
}

// Renders Google's official "Sign in with Google" button. On credential
// receipt, POSTs to /api/auth/google with the desired role, persists the
// returned JWT + user, then calls onSuccess(user). Render either a real
// Google button (preferred) or a styled fallback if the SDK / client ID is
// missing.
export default function GoogleSignInButton({
  role = 'student',
  size = 'large',
  text = 'signin_with',
  onSuccess,
  onError,
  width,
  // Visual scale multiplier applied via CSS zoom so the GIS-rendered
  // button (capped at 40px tall natively) can match the page's larger
  // action buttons. Layout reflows correctly with `zoom`, unlike
  // `transform: scale()`.
  scale = 1
}) {
  const containerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;

    waitForGoogle()
      .then((google) => {
        if (cancelled) return;
        google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: async (response) => {
            if (!response?.credential) {
              setError('No credential returned from Google');
              return;
            }
            setSubmitting(true);
            setError(null);
            try {
              const res = await fetch('/api/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential: response.credential, role })
              });
              if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || `Sign-in failed (${res.status})`);
              }
              const data = await res.json();
              authSession().save(data);
              onSuccess?.(data.user);
            } catch (e) {
              setError(e.message);
              onError?.(e);
            } finally {
              setSubmitting(false);
            }
          },
          ux_mode: 'popup',
          auto_select: false,
          itp_support: true
        });

        if (containerRef.current) {
          containerRef.current.innerHTML = '';
          google.accounts.id.renderButton(containerRef.current, {
            type: 'standard',
            theme: 'outline',
            size: size === 'large' ? 'large' : 'medium',
            text,
            shape: 'pill',
            logo_alignment: 'left',
            width: typeof width === 'number' ? Math.min(Math.max(width, 200), 400) : undefined
          });
        }
        setReady(true);
      })
      .catch((e) => {
        setError(e.message);
      });

    return () => {
      cancelled = true;
    };
  }, [role, size, text, width]);

  if (!CLIENT_ID) {
    return (
      <Button
        size={size}
        icon={<GoogleOutlined />}
        disabled
        style={{ borderRadius: 24, fontWeight: 600 }}
      >
        Google sign-in (configure YTAI_GOOGLE_CLIENT_ID)
      </Button>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div ref={containerRef} aria-busy={submitting} style={scale !== 1 ? { zoom: scale } : undefined} />
      {!ready && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          Loading Google sign-in…
        </Text>
      )}
      {submitting && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          Signing you in…
        </Text>
      )}
      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          style={{ borderRadius: 8, padding: '4px 10px' }}
        />
      )}
    </div>
  );
}
