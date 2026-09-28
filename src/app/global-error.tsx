"use client";

import { useEffect } from "react";

/**
 * When the root layout itself fails (the brand couldn't load, the server is
 * restarting), this replaces the whole document. Nothing of the app's is
 * trusted here, its styles included: plain HTML that follows the system's
 * light or dark, and a full reload home.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    // On the root: the canvas and inherited text follow it, not body.
    <html lang="en" style={{ colorScheme: "light dark" }}>
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
        <title>Something went wrong</title>
        <main style={{ minHeight: "100svh", display: "grid", placeItems: "center", padding: 16 }}>
          <div style={{ maxWidth: 360, display: "grid", gap: 12 }}>
            <h1 style={{ fontSize: 20, margin: 0 }}>Something went wrong</h1>
            <p style={{ margin: 0, opacity: 0.7, lineHeight: 1.5 }}>
              The app couldn&apos;t start. Try again in a moment.
              {error.digest && <span style={{ display: "block", fontFamily: "monospace", fontSize: 12 }}>Reference {error.digest}</span>}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={retry} style={{ font: "inherit", padding: "6px 12px" }}>
                Try again
              </button>
              {/* A full load, on purpose: the client app is what broke. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/" style={{ padding: "6px 12px", color: "inherit" }}>
                Go home
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
