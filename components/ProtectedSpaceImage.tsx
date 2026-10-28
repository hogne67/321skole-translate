"use client";
import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { fetchAuthenticatedFileBlob } from "@/lib/spaceFiles.client";
import { privateSpaceFileUrlId } from "@/lib/spaceFiles";
import { legacySpaceImageProxyUrl } from "@/lib/security/legacySpaceImage";

export default function ProtectedSpaceImage({ src, alt, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [loaded, setLoaded] = useState<{ source: string; url: string } | null>(null);
  const privateSource = typeof src === "string" && privateSpaceFileUrlId(src) ? src
    : legacySpaceImageProxyUrl(src, process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "");
  useEffect(() => {
    if (!privateSource) return;
    let objectUrl: string | null = null;
    let controller = new AbortController();
    const unsubscribe = onAuthStateChanged(auth, user => {
      controller.abort(); controller = new AbortController();
      const signal = controller.signal;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setLoaded(null);
      if (!user) return;
      void fetchAuthenticatedFileBlob(privateSource, { signal }).then(blob => {
        if (signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setLoaded({ source: privateSource, url: objectUrl });
      }).catch(() => { if (!signal.aborted) setLoaded(null); });
    });
    return () => { controller.abort(); unsubscribe(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [privateSource]);
  const resolved = privateSource ? loaded?.source === privateSource ? loaded.url : undefined : src;
  // Private blob images cannot go through a public image optimizer.
  return <img {...props} src={resolved} alt={alt ?? ""} />;
}
