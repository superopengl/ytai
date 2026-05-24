import { useEffect, useState } from 'react';
import { Alert, Button, Typography } from 'antd';
import { GoogleOutlined } from '@ant-design/icons';
import authSession from '../lib/authSession.js';
import { radius } from '../theme.js';

const { Text } = Typography;

// Read the client ID injected by Vite at build time. Falls back to empty
// string so the button can render a clear "not configured" hint in dev.
// eslint-disable-next-line no-undef
const CLIENT_ID = typeof __YTAI_GOOGLE_CLIENT_ID__ !== 'undefined' ? __YTAI_GOOGLE_CLIENT_ID__ : '';

function waitForGoogle(timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve(window.google);
    const start = Date.now();
    const tick = () => {
      if (window.google?.accounts?.oauth2) return resolve(window.google);
      if (Date.now() - start > timeoutMs) return reject(new Error('Google SDK failed to load'));
      setTimeout(tick, 80);
    };
    tick();
  });
}

// AntD "Sign in with Google" button backed by the OAuth 2.0 implicit flow
// (oauth2.initTokenClient). We previously tried id.renderButton, but GIS
// auto-personalizes that variant to "Sign in as <name>" the moment the
// visitor has a Google session — and the rendered button doesn't expose
// a way to opt out. initTokenClient leaves the button styling entirely to
// us and just pops Google's account chooser on click; the resulting
// access token goes to /api/auth/google, which resolves it via the
// userinfo endpoint server-side.
export default function GoogleSignInButton({
  role = 'student',
  size = 'large',
  onSuccess,
  onError,
  block = true
}) {
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    waitForGoogle()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((e) => {
        console.error('[GoogleSignIn] Google SDK never loaded', e);
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const triggerSignIn = () => {
    if (!window.google?.accounts?.oauth2) {
      setError('Google sign-in not ready');
      return;
    }
    setError(null);
    let client;
    try {
      client = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: 'openid email profile',
        callback: async (response) => {
          if (response.error) {
            console.error('[GoogleSignIn] token client error', response);
            const detail = response.error_description || response.error;
            setError(detail);
            onError?.(new Error(detail));
            return;
          }
          if (!response.access_token) {
            console.error('[GoogleSignIn] no access_token in response', response);
            setError('No access token returned from Google');
            return;
          }
          setSubmitting(true);
          try {
            const res = await fetch('/api/auth/google', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ accessToken: response.access_token, role })
            });
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              const detail = body.error || `Sign-in failed (${res.status})`;
              console.error('[GoogleSignIn] /api/auth/google failed', {
                status: res.status,
                body
              });
              throw new Error(detail);
            }
            const data = await res.json();
            authSession().save(data);
            onSuccess?.(data.user);
          } catch (e) {
            console.error('[GoogleSignIn] sign-in exchange threw', e);
            setError(e.message);
            onError?.(e);
          } finally {
            setSubmitting(false);
          }
        }
      });
    } catch (e) {
      console.error('[GoogleSignIn] initTokenClient threw', e);
      setError(e.message);
      return;
    }
    try {
      client.requestAccessToken();
    } catch (e) {
      console.error('[GoogleSignIn] requestAccessToken threw', e);
      setError(e.message);
    }
  };

  if (!CLIENT_ID) {
    return (
      <Button
        size={size}
        icon={<GoogleOutlined />}
        disabled
        block={block}
        style={{ height: 48, borderRadius: radius.md, fontWeight: 600 }}
      >
        Google sign-in (configure YTAI_GOOGLE_CLIENT_ID)
      </Button>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      <Button
        size={size}
        icon={<GoogleOutlined />}
        onClick={triggerSignIn}
        loading={submitting}
        disabled={!ready}
        block={block}
        style={{ height: 48, borderRadius: radius.md, fontWeight: 600 }}
      >
        Sign in with Google
      </Button>
      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          style={{ marginTop: 8, borderRadius: 8, padding: '4px 10px' }}
        />
      )}
      {!ready && !error && (
        <Text type="secondary" style={{ display: 'block', marginTop: 6, fontSize: 12, textAlign: 'center' }}>
          Loading Google sign-in…
        </Text>
      )}
    </div>
  );
}
