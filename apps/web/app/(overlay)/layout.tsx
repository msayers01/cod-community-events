import "../globals.css";

/** Minimal chrome-less layout for OBS browser sources. Transparent background, no navigation. */
export default function OverlayLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: "transparent", margin: 0 }}>{children}</body>
    </html>
  );
}
