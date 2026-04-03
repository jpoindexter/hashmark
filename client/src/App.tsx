import { useState, useEffect, lazy, Suspense, Component, type ReactNode, type ErrorInfo } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Shell from "./components/shell/Shell.tsx";
import ProjectPicker from "./components/ProjectPicker.tsx";
import { ToastContainer } from "./components/Toasts.tsx";
import { PageTransition } from "./components/PageTransition.tsx";
import { fetchApi } from "./lib/api";

// Lazy-load pages — keeps initial bundle lean
const Agents = lazy(() => import("./pages/Agents.tsx"));
const Generate = lazy(() => import("./pages/Generate.tsx"));
const Settings = lazy(() => import("./pages/Settings.tsx"));

interface InfoResponse {
  projectName: string;
  projectDir: string;
  configured: boolean;
}

// Minimal fallback shown while a lazy chunk loads
function PageSkeleton() {
  return <div style={{ flex: 1, background: "var(--bg)" }} />;
}

// App-level error boundary — catches unhandled render errors
class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[hashmark studio] render error", error, info);
  }

  render() {
    if (this.state.error) {
      const err = this.state.error as Error;
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          height: "100vh", background: "var(--bg)", gap: 12,
        }}>
          <div style={{ fontFamily: "var(--font)", fontSize: 20, color: "var(--accent)" }}>#</div>
          <div style={{ fontFamily: "var(--font)", fontSize: 12, color: "var(--red)" }}>
            {err.message || "unexpected error"}
          </div>
          <button
            style={{
              fontFamily: "var(--font)", fontSize: 11, padding: "6px 16px",
              background: "transparent", border: "1px solid var(--border)",
              color: "var(--text-dim)", cursor: "pointer", borderRadius: "var(--radius)",
            }}
            onClick={() => window.location.reload()}
          >
            reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppShell() {
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    fetchApi("/api/info")
      .then((r) => r.json())
      .then((d: InfoResponse) => setConfigured(d.configured))
      .catch(() => setConfigured(true));
  }, []);

  if (configured === null) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", background: "var(--bg)",
      }}>
        <div style={{ fontFamily: "var(--font)", fontSize: 20, color: "var(--text-dimmer)" }}>#</div>
      </div>
    );
  }

  if (!configured) return <ProjectPicker />;

  return (
    <>
      <Routes>
        <Route path="/" element={<Shell />}>
          <Route path="agents" element={<Suspense fallback={<PageSkeleton />}><PageTransition><Agents /></PageTransition></Suspense>} />
          <Route path="generate" element={<Suspense fallback={<PageSkeleton />}><PageTransition><Generate /></PageTransition></Suspense>} />
          <Route path="settings" element={<Suspense fallback={<PageSkeleton />}><PageTransition><Settings /></PageTransition></Suspense>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <ToastContainer />
    </>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AppShell />
    </AppErrorBoundary>
  );
}
