import { Link, Route, Routes } from "react-router-dom";
import LandingPage from "./pages/LandingPage.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import AdminPanel from "./pages/AdminPanel.jsx";
import GamePresentation from "./pages/GamePresentation";
import FacilitatorPanel from "./pages/FacilitatorPanel";
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/admin" element={<AdminPanel />} />

      {/* <Route
        path="/games/bible-feud"
        element={
          <main className="container section">
            <h1>Bible Feud</h1>
            <p>Game setup is coming next.</p>
            <Link to="/dashboard">← Back to games</Link>
          </main>
        }
      /> */}

      <Route
        path="/games/bible-feud"
        element={<GamePresentation />}
      />

      <Route
        path="/facilitator/:sessionId"
        element={<FacilitatorPanel key={window.location.pathname} />}
      />

      <Route path="*" element={<h1>404 — Page not found</h1>} />
    </Routes>
  );
}