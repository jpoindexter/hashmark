import { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout.tsx";
import Home from "./pages/Home.tsx";
import Agents from "./pages/Agents.tsx";
import Generate from "./pages/Generate.tsx";
import Sessions from "./pages/Sessions.tsx";
import Settings from "./pages/Settings.tsx";
import Company from "./pages/Company.tsx";
import Run from "./pages/Run.tsx";
import History from "./pages/History.tsx";
import WorkspaceSetup from "./pages/WorkspaceSetup.tsx";
import Governance from "./pages/Governance.tsx";
import Files from "./pages/Files.tsx";
import Git from "./pages/Git.tsx";
import SourceControlPage from "./components/SourceControlPage.tsx";
import ProjectPicker from "./components/ProjectPicker.tsx";
import { ToastContainer } from "./components/Toasts.tsx";
import { PageTransition } from "./components/PageTransition.tsx";

interface InfoResponse {
  projectName: string;
  projectDir: string;
  configured: boolean;
}

function AppShell() {
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/info")
      .then((r) => r.json())
      .then((d: InfoResponse) => setConfigured(d.configured))
      .catch(() => setConfigured(true));
  }, []);

  if (configured === null) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "#09090b",
      }} />
    );
  }

  if (!configured) return <ProjectPicker />;

  return (
    <>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<PageTransition><Home /></PageTransition>} />
          <Route path="files" element={<PageTransition><Files /></PageTransition>} />
          <Route path="git" element={<PageTransition><Git /></PageTransition>} />
          <Route path="source-control" element={<PageTransition><SourceControlPage /></PageTransition>} />
          <Route path="agents" element={<PageTransition><Agents /></PageTransition>} />
          <Route path="generate" element={<PageTransition><Generate /></PageTransition>} />
          <Route path="run" element={<PageTransition><Run /></PageTransition>} />
          <Route path="history" element={<PageTransition><History /></PageTransition>} />
          <Route path="company" element={<PageTransition><Company /></PageTransition>} />
          <Route path="governance" element={<PageTransition><Governance /></PageTransition>} />
          <Route path="sessions" element={<Navigate to="/" replace />} />
          <Route path="settings" element={<PageTransition><Settings /></PageTransition>} />
          <Route path="setup" element={<PageTransition><WorkspaceSetup /></PageTransition>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <ToastContainer />
    </>
  );
}

export default function App() {
  return <AppShell />;
}
