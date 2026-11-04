"use client";

/**
 * Last resort when the root layout itself fails (for example the database is down while reading the session).
 * It replaces the whole document, so it carries its own minimal styles and both languages.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Arial, sans-serif",
          background: "#f4f5f8",
          color: "#121722",
          padding: 16,
        }}
      >
        <main style={{ maxWidth: 480, textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ color: "#5a6373", margin: "0 0 4px" }}>The page could not be shown. Nothing was changed.</p>
          <p dir="rtl" lang="he" style={{ color: "#5a6373", margin: "0 0 20px" }}>
            משהו השתבש. שום דבר לא השתנה.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              font: "inherit",
              fontWeight: 600,
              padding: "10px 18px",
              borderRadius: 10,
              border: 0,
              background: "#2b59d9",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Try again · לנסות שוב
          </button>
        </main>
      </body>
    </html>
  );
}
