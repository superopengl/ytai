import useAuthedImageUrl from '../hooks/useAuthedImageUrl.js';

// Drop-in `<img>` for JWT-protected `/api/...` image URLs. Fetches via
// apiFetch and renders a blob URL so the Authorization header is sent.
export default function AuthedImage({ src, alt = '', style, ...rest }) {
  const resolved = useAuthedImageUrl(src);
  return (
    <img
      {...rest}
      src={resolved ?? undefined}
      alt={alt}
      style={style}
    />
  );
}
