const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

// Verify a Google-issued OAuth 2.0 access token and resolve it to a user
// profile. Two hops because the access token itself doesn't carry the
// profile — unlike an ID token:
//   1. tokeninfo confirms the token is live and was issued for *our*
//      client (audience check — rejects access tokens issued to other
//      apps). Google validates signature + expiry for us.
//   2. userinfo returns the user's profile (sub/email/name/picture) when
//      the `openid email profile` scope was granted.
//
// Returns the same shape as verifyGoogleIdToken so the route can treat
// both auth paths identically downstream.
export default async function verifyGoogleAccessToken(accessToken, { clientId } = {}) {
  if (!accessToken || typeof accessToken !== 'string') {
    throw new Error('Missing Google access token');
  }

  const tiRes = await fetch(`${TOKENINFO_URL}?access_token=${encodeURIComponent(accessToken)}`);
  if (!tiRes.ok) {
    throw new Error(`Google tokeninfo returned ${tiRes.status}`);
  }
  const tiClaims = await tiRes.json();
  if (tiClaims.error_description || tiClaims.error) {
    throw new Error(tiClaims.error_description || tiClaims.error);
  }
  if (clientId && tiClaims.aud !== clientId) {
    throw new Error('Google access token audience mismatch');
  }

  const uiRes = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!uiRes.ok) {
    throw new Error(`Google userinfo returned ${uiRes.status}`);
  }
  const profile = await uiRes.json();
  if (!profile.sub) {
    throw new Error('Google userinfo response missing subject');
  }
  // userinfo returns booleans (not the string "false" tokeninfo returns).
  if (profile.email && profile.email_verified === false) {
    throw new Error('Google email is not verified');
  }

  return {
    sub: profile.sub,
    email: profile.email || null,
    name: profile.name || profile.email || 'Student',
    picture: profile.picture || null
  };
}
