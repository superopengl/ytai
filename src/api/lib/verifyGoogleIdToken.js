const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';

// Verify a Google-issued ID token by handing it back to Google's tokeninfo
// endpoint. This avoids pulling in `google-auth-library` + a JWKS cache for
// the MVP; the tradeoff is one extra outbound HTTP per sign-in. Google
// validates the signature, expiry, and issuer for us and returns the claims.
//
// Throws on any failure (network, invalid token, audience mismatch). On
// success returns { sub, email, name, picture, email_verified, aud, iss }.
export default async function verifyGoogleIdToken(idToken, { clientId } = {}) {
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('Missing Google ID token');
  }

  const url = `${TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Google tokeninfo returned ${res.status}`);
  }
  const claims = await res.json();

  if (claims.error_description || claims.error) {
    throw new Error(claims.error_description || claims.error);
  }
  if (!claims.sub) {
    throw new Error('Google tokeninfo response missing subject claim');
  }
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)) {
    throw new Error(`Unexpected token issuer: ${claims.iss}`);
  }
  if (clientId && claims.aud !== clientId) {
    throw new Error('Google ID token audience mismatch');
  }
  if (claims.email && claims.email_verified === 'false') {
    throw new Error('Google email is not verified');
  }

  return {
    sub: claims.sub,
    email: claims.email || null,
    name: claims.name || claims.email || 'Student',
    picture: claims.picture || null,
    aud: claims.aud,
    iss: claims.iss
  };
}
