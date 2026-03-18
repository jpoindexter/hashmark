import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout.tsx";
import Home from "./pages/Home.tsx";
import Agents from "./pages/Agents.tsx";
import Generate from "./pages/Generate.tsx";
import Sessions from "./pages/Sessions.tsx";
import Settings from "./pages/Settings.tsx";
import Files from "./pages/Files.tsx";
import Git from "./pages/Git.tsx";
import SourceControlPage from "./components/SourceControlPage.tsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="files" element={<Files />} />
        <Route path="git" element={<Git />} />
        <Route path="source-control" element={<SourceControlPage />} />
        <Route path="agents" element={<Agents />} />
        <Route path="generate" element={<Generate />} />
        <Route path="sessions" element={<Sessions />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
