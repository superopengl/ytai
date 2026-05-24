import { useEffect, useRef, useState } from 'react';
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

// Renders a visible AntDesign-styled "Sign in with Google" button that
// proxy-clicks an invisible Google Identity Services button. We can't
// directly restyle GIS's rendered button (corners, font, padding are baked
// in by Google), so we keep it off-screen and forward clicks to it from
// the AntD button. The GIS credential callback still drives the auth flow.
export default function GoogleSignInButton({
  role = 'student',
  size = 'large',
  onSuccess,
  onError,
  block = true
}) {
  const hiddenRef = useRef(null);
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

        if (hiddenRef.current) {
          hiddenRef.current.innerHTML = '';
          google.accounts.id.renderButton(hiddenRef.current, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: 'signin_with',
            shape: 'rectangular',
            logo_alignment: 'left'
          });
        }
        // renderButton injects the GIS iframe asynchronously. Poll for the
        // [role="button"] element before flipping ready, so the AntD proxy
        // click always has something to forward to. Without this gate,
        // fast-loading prod bundles set ready=true before the iframe is in
        // the DOM, and the first click reports "still loading".
        const startedAt = Date.now();
        const waitForButton = () => {
          if (cancelled) return;
          if (hiddenRef.current?.querySelector('[role="button"]')) {
            setReady(true);
            return;
          }
          if (Date.now() - startedAt > 5000) {
            setError('Google sign-in failed to render. Please refresh.');
            return;
          }
          setTimeout(waitForButton, 80);
        };
        waitForButton();
      })
      .catch((e) => {
        setError(e.message);
      });

    return () => {
      cancelled = true;
    };
  }, [role]);

  const triggerGoogle = () => {
    const gisButton = hiddenRef.current?.querySelector('[role="button"]');
    if (gisButton) {
      gisButton.click();
    } else {
      setError('Google sign-in is still loading. Please try again in a moment.');
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
      {/* Hidden GIS-rendered button — kept in the DOM so we can proxy-click it. */}
      <div
        ref={hiddenRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          width: 0,
          height: 0,
          overflow: 'hidden',
          opacity: 0,
          pointerEvents: 'none'
        }}
      />
      <Button
        size={size}
        icon={<GoogleOutlined />}
        onClick={triggerGoogle}
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
