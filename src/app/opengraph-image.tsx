import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Hashmark — One scan. Every format. Always in sync.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#09090b",
          fontFamily: "monospace",
          padding: "60px",
        }}
      >
        {/* Border frame */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            border: "2px solid #27272a",
            padding: "48px",
          }}
        >
          {/* Logo mark */}
          <div
            style={{
              fontSize: "120px",
              fontWeight: "bold",
              color: "#34d399",
              lineHeight: 1,
            }}
          >
            #
          </div>

          {/* Title */}
          <div
            style={{
              fontSize: "48px",
              fontWeight: "bold",
              color: "#fafafa",
              letterSpacing: "0.1em",
              marginTop: "16px",
            }}
          >
            HASHMARK
          </div>

          {/* Tagline */}
          <div
            style={{
              fontSize: "22px",
              color: "#a1a1aa",
              marginTop: "16px",
              letterSpacing: "0.05em",
            }}
          >
            One scan. Every format. Always in sync.
          </div>

          {/* Format badges */}
          <div
            style={{
              display: "flex",
              gap: "12px",
              marginTop: "40px",
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            {[
              "AGENTS.md",
              "CLAUDE.md",
              ".cursorrules",
              "GEMINI.md",
              ".windsurfrules",
              "copilot-instructions",
              ".clinerules",
              ".cursor/rules",
            ].map((format) => (
              <div
                key={format}
                style={{
                  padding: "6px 14px",
                  border: "1px solid #27272a",
                  color: "#a1a1aa",
                  fontSize: "14px",
                  letterSpacing: "0.05em",
                }}
              >
                {format}
              </div>
            ))}
          </div>

          {/* URL */}
          <div
            style={{
              fontSize: "16px",
              color: "#34d399",
              marginTop: "40px",
              letterSpacing: "0.05em",
            }}
          >
            hashmark.md
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
