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

// Renders Google Identity Services' own sign-in button into the page.
//
// History: we previously wrapped a custom AntD-styled button on top of a
// hidden GIS button and proxy-clicked it. That approach is fragile —
// modern GIS sometimes renders inside a cross-origin iframe, where
// .click() from the parent document is a no-op (the user sees no
// response). The supported path is to let GIS render its visible button
// and click it natively; we keep the AntD wrapper around it for spacing
// and surrounding states (loading / error).
export default function GoogleSignInButton({
  role = 'student',
  size = 'large',
  onSuccess,
  onError,
  block = true
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
            size: 'large',
            text: 'signin_with',
            shape: 'rectangular',
            logo_alignment: 'left',
            width: 320
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
  }, [role]);

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
      <div
        ref={containerRef}
        style={{
          display: 'flex',
          justifyContent: 'center',
          minHeight: 44
        }}
      />
      {submitting && (
        <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12, textAlign: 'center' }}>
          Signing in…
        </Text>
      )}
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
