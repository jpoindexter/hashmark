import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Hashmark — One scan. Every format. Always in sync.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function TwitterImage() {
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
