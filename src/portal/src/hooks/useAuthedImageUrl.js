import { useEffect, useState } from 'react';
import apiFetch from '../lib/apiFetch.js';

// Browser image loaders can't attach a Bearer token, so any `<img>` that
// points at a JWT-protected `/api/...` URL 401s. This hook fetches the
// bytes via apiFetch (which sets Authorization) and hands back a
// short-lived blob: URL the caller can drop into `<img src>` or
// `new Image().src`. Blob URLs are revoked on unmount or url change.
export default function useAuthedImageUrl(url) {
  const [blobUrl, setBlobUrl] = useState(null);

  useEffect(() => {
    if (!url) {
      setBlobUrl(null);
      return undefined;
    }
    let cancelled = false;
    let created = null;
    apiFetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        created = URL.createObjectURL(blob);
        setBlobUrl(created);
      })
      .catch(() => {
        if (!cancelled) setBlobUrl(null);
      });

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [url]);

  return blobUrl;
}
