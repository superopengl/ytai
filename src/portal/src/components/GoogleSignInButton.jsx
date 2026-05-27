import { useEffect, useState } from 'react';
import { GoogleIcon } from './InlineIcons.jsx';
import authSession from '../lib/authSession.js';
import loadGoogleSdk from '../lib/loadGoogleSdk.js';
import { radius } from '../theme.js';

// Read the client ID injected by Vite at build time. Falls back to empty
// string so the button can render a clear "not configured" hint in dev.
// eslint-disable-next-line no-undef
const CLIENT_ID = typeof __YTAI_GOOGLE_CLIENT_ID__ !== 'undefined' ? __YTAI_GOOGLE_CLIENT_ID__ : '';

// "Continue with Google" button backed by the OAuth 2.0 implicit flow
// (oauth2.initTokenClient). We previously tried id.renderButton, but GIS
// auto-personalizes that variant to "Sign in as <name>" the moment the
// visitor has a Google session — and the rendered button doesn't expose
// a way to opt out. initTokenClient leaves the button styling entirely to
// us and just pops Google's account chooser on click; the resulting
// access token goes to /api/auth/google, which resolves it via the
// userinfo endpoint server-side.
//
// Plain HTML buttons (no antd) so HomePage's initial chunk can skip the
// antd vendor bundle. antd only loads once the user navigates to a route
// that needs it.
export default function GoogleSignInButton({
  role = 'student',
  onSuccess,
  onError
}) {
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    loadGoogleSdk()
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

  const baseButtonStyle = {
    width: '100%',
    height: 48,
    borderRadius: radius.md,
    fontWeight: 600,
    fontSize: 15,
    fontFamily: 'inherit',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    border: '1px solid rgba(0,0,0,0.08)',
    background: '#fff',
    color: 'rgba(0,0,0,0.88)',
    cursor: 'pointer'
  };

  if (!CLIENT_ID) {
    return (
      <button
        type="button"
        disabled
        style={{ ...baseButtonStyle, opacity: 0.5, cursor: 'not-allowed' }}
      >
        <GoogleIcon />
        Google sign-in (configure YTAI_GOOGLE_CLIENT_ID)
      </button>
    );
  }

  const disabled = !ready || submitting;

  return (
    <div style={{ width: '100%' }}>
      <button
        type="button"
        onClick={triggerSignIn}
        disabled={disabled}
        style={{
          ...baseButtonStyle,
          opacity: disabled ? 0.6 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer'
        }}
      >
        <GoogleIcon />
        {submitting ? 'Signing in…' : 'Continue with Google'}
      </button>
      {error && (
        <div
          role="alert"
          style={{
            marginTop: 8,
            borderRadius: 8,
            padding: '6px 12px',
            background: '#fff2f0',
            color: '#a8071a',
            border: '1px solid #ffccc7',
            fontSize: 13,
            textAlign: 'center'
          }}
        >
          {error}
        </div>
      )}
      {!ready && !error && (
        <span
          style={{
            display: 'block',
            marginTop: 6,
            fontSize: 12,
            textAlign: 'center',
            color: 'rgba(0,0,0,0.45)'
          }}
        >
          Loading Google sign-in…
        </span>
      )}
    </div>
  );
}
