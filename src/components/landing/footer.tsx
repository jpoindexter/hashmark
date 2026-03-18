export function Footer() {
  return (
    <footer
      className="py-4"
      style={{ borderTop: "1px solid rgba(232,228,217,0.6)" }}
    >
      <div className="max-w-6xl mx-auto px-6 lg:px-12">
        <div className="flex flex-row justify-between items-center gap-4">

          <div className="flex items-center gap-2" style={{ opacity: 0.45 }}>
            <div className="w-5 h-5 flex items-center justify-center rounded-md bg-foreground">
              <span className="text-background font-bold text-[10px] leading-none">#</span>
            </div>
            <span
              style={{
                fontFamily: "var(--font-montserrat), sans-serif",
                fontSize: "10px",
                fontWeight: 600,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "var(--foreground)",
              }}
            >
              Hashmark &copy; {new Date().getFullYear()}
            </span>
          </div>

          <div className="flex gap-8">
            {[
              { label: "GitHub", href: "https://github.com/jpoindexter/hashmark" },
              { label: "theft.studio", href: "https://theft.studio" },
              { label: "Privacy", href: "/privacy" },
            ].map((link) => (
              <a
                key={link.label}
                href={link.href}
                target={link.href.startsWith("http") ? "_blank" : undefined}
                rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
                className="transition-colors hover:text-foreground"
                style={{
                  fontFamily: "var(--font-montserrat), sans-serif",
                  fontSize: "10px",
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: "rgba(26,26,26,0.35)",
                  textDecoration: "none",
                }}
              >
                {link.label}
              </a>
            ))}
          </div>

        </div>
      </div>
    </footer>
  );
}
