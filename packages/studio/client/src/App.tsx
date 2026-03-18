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
import WorkspaceSetup from "./pages/WorkspaceSetup.tsx";
import Governance from "./pages/Governance.tsx";
import Files from "./pages/Files.tsx";
import Git from "./pages/Git.tsx";
import SourceControlPage from "./components/SourceControlPage.tsx";
import ProjectPicker from "./components/ProjectPicker.tsx";
import { ToastContainer } from "./components/Toasts.tsx";

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
          <Route index element={<Home />} />
          <Route path="files" element={<Files />} />
          <Route path="git" element={<Git />} />
          <Route path="source-control" element={<SourceControlPage />} />
          <Route path="agents" element={<Agents />} />
          <Route path="generate" element={<Generate />} />
          <Route path="run" element={<Run />} />
          <Route path="company" element={<Company />} />
          <Route path="governance" element={<Governance />} />
          <Route path="sessions" element={<Navigate to="/" replace />} />
          <Route path="settings" element={<Settings />} />
          <Route path="setup" element={<WorkspaceSetup />} />
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
