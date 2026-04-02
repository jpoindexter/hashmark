import { Component, type ReactNode, type ErrorInfo, type CSSProperties } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

const overlay: CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--bg)",
  padding: 32,
  minHeight: 0,
  overflow: "auto",
};

const card: CSSProperties = {
  maxWidth: 560,
  width: "100%",
  background: "var(--bg-2)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: 24,
  fontFamily: "var(--font)",
  color: "var(--text)",
};

const heading: CSSProperties = {
  margin: 0,
  marginBottom: 4,
  fontSize: 14,
  fontWeight: 600,
  color: "var(--red)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const subtitle: CSSProperties = {
  margin: 0,
  marginBottom: 16,
  fontSize: 12,
  color: "var(--text-dim)",
};

const codeBlock: CSSProperties = {
  margin: 0,
  padding: 12,
  background: "var(--bg-3)",
  border: "1px solid var(--border-dim)",
  borderRadius: "var(--radius-sm)",
  fontSize: 12,
  fontFamily: "var(--font)",
  color: "var(--red)",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  overflowX: "auto",
  maxHeight: 200,
};

const actions: CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 16,
};

const btnBase: CSSProperties = {
  padding: "6px 14px",
  fontSize: 12,
  fontFamily: "var(--font)",
  fontWeight: 600,
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
  transition: "background 0.1s ease",
};

const reloadBtn: CSSProperties = {
  ...btnBase,
  background: "var(--accent)",
  borderColor: "var(--accent-dim)",
  color: "#fff",
};

const continueBtn: CSSProperties = {
  ...btnBase,
  background: "var(--bg-3)",
  color: "var(--text-dim)",
};

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleContinue = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div style={overlay}>
          <div style={card}>
            <h2 style={heading}>Runtime Error</h2>
            <p style={subtitle}>Something crashed in this panel. You can reload the app or try to continue.</p>
            <pre style={codeBlock}>{this.state.error.message}{this.state.error.stack ? `\n\n${this.state.error.stack}` : ""}</pre>
            <div style={actions}>
              <button style={reloadBtn} onClick={this.handleReload}>
                Reload
              </button>
              <button style={continueBtn} onClick={this.handleContinue}>
                Continue
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
