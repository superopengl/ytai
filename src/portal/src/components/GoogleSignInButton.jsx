import { useRef, useState } from 'react';
import { GoogleIcon } from './InlineIcons.jsx';
import authSession from '../lib/authSession.js';
import loadGoogleSdk from '../lib/loadGoogleSdk.js';
import { palette, radius } from '../theme.js';

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
  const [loadingSdk, setLoadingSdk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const warmedRef = useRef(false);

  // Kick off the SDK fetch on first hover/focus so the eventual click feels
  // instant, but only if the visitor actually shows intent. Visitors who
  // never aim at the button (most of them) skip the 95 KB entirely.
  const warmSdk = () => {
    if (warmedRef.current || !CLIENT_ID) return;
    warmedRef.current = true;
    loadGoogleSdk().catch(() => {
      // Real error surfaces on click; silent here so a flaky network on
      // hover doesn't paint a red banner the user never asked for.
      warmedRef.current = false;
    });
  };

  const triggerSignIn = async () => {
    setError(null);
    if (!window.google?.accounts?.oauth2) {
      setLoadingSdk(true);
      try {
        await loadGoogleSdk();
      } catch (e) {
        console.error('[GoogleSignIn] Google SDK never loaded', e);
        setError(e.message);
        setLoadingSdk(false);
        return;
      }
      setLoadingSdk(false);
    }
    if (!window.google?.accounts?.oauth2) {
      setError('Google sign-in not ready');
      return;
    }
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

  // Sunrise Yellow (palette.pens.yellow) with dark ink text — bright and
  // obvious without leaning on Google's blue brand color. White-on-yellow
  // fails contrast, so text/icon stay on the dark ink token.
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
    border: `1px solid ${palette.pens.yellow}`,
    background: palette.pens.yellow,
    color: palette.text,
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

  const disabled = loadingSdk || submitting;
  const label = submitting
    ? 'Signing in…'
    : loadingSdk
      ? 'Loading…'
      : 'Continue with Google';

  return (
    <div style={{ width: '100%' }}>
      <button
        type="button"
        onClick={triggerSignIn}
        onMouseEnter={warmSdk}
        onFocus={warmSdk}
        onTouchStart={warmSdk}
        disabled={disabled}
        style={{
          ...baseButtonStyle,
          opacity: disabled ? 0.6 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer'
        }}
      >
        <GoogleIcon />
        {label}
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
    </div>
  );
}
