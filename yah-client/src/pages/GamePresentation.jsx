import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { gamePost, gameRequest } from "../api/gameSessions";
import "../styles/GamePairing.css";
import AudienceBoard from "../components/AudienceBoard";

const STORAGE_KEY = "bible-feud-presentation";

export default function GamePresentation() {
  const pending = useRef(null);
  const [pairing, setPairing] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    // Reuse the creation request during StrictMode effect checks.
    if (!pending.current) {
      pending.current = Promise.resolve().then(async () => {
        const saved = sessionStorage.getItem(STORAGE_KEY);

        if (saved) {
          return JSON.parse(saved);
        }

        const data = await gamePost("/", {
          game: "bible-feud",
        });

        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));

        return data;
      });
    }

    pending.current
      .then((data) => {
        if (active) setPairing(data);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!pairing) return;

    let active = true;
    let timer;

    async function refresh() {
      try {
        const data = await gameRequest(`/${pairing.id}/display`, {
          headers: {
            "x-display-token": pairing.displayToken,
          },
        });

        if (!active) return;

        setStatus(data);
        setError("");

        const finished =
          data.status === "ended" ||
          data.session_expired ||
          (data.status === "waiting" && data.pairing_expired);

        if (!finished) {
          timer = setTimeout(refresh, 2000);
        }
      } catch (error) {
        if (!active) return;

        setError(error.message);

        // Retry temporary failures; stop for missing/invalid sessions.
        if (![403, 404].includes(error.status)) {
          timer = setTimeout(refresh, 5000);
        }
      }
    }

    refresh();

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [pairing]);

  function createNewSession() {
    sessionStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  }

  const finished =
    status?.status === "ended" || status?.session_expired;

  const pairingExpired =
    status?.status === "waiting" && status?.pairing_expired;

  const controllerUrl = pairing
    ? `${window.location.origin}/facilitator/${pairing.id}#${pairing.pairingToken}`
    : "";

  return (
    <main className="pairing-page">
      <Link to="/dashboard" className="pairing-back">
        ← Back to games
      </Link>

      <section className="pairing-card pairing-display">
        <span className="pairing-eyebrow">Adventist Youth Activity Hub</span>
        <h1>Bible Feud</h1>

        {error ? ( 
          <>
            <p role="alert">{error}</p>
            <button onClick={createNewSession}>
              Create new session
            </button>
          </>
        ) : finished ? (
          <>
            <h2>Session ended</h2>
            <p className="text-muted">
              Start a new session when your group is ready.
            </p>
            <button onClick={createNewSession}>
              Create new session
            </button>
          </>
        ) : pairingExpired ? (
          <>
            <h2>QR code expired</h2>
            <p className="text-muted">
              Generate a new session to connect your facilitator.
            </p>
            <button onClick={createNewSession}>
              Generate new QR
            </button>
          </>
        ) : status?.board ? (
          <AudienceBoard board={status.board} /> 
        ) : status?.status === "ready" ? (
            <>
              <div className="pairing-emoji" aria-hidden="true">
                🏆
              </div>

              <h2>Game ready!</h2>

              <p>{status.template_title}</p>

              <p className="text-muted">
                Gather your teams. Your facilitator will begin shortly.
              </p>

              <span className="pairing-badge">Game pack loaded</span>
            </>
          ) : status?.status === "setup" ? (
            <>
              <div className="pairing-emoji" aria-hidden="true">
                🎉
              </div>
              <h2>Setting up the game…</h2>
              <p className="text-muted">
                Your facilitator is preparing the game.
                Gather your team!
              </p>
              <span className="pairing-badge">
                Facilitator connected
              </span>
            </>
          ) : pairing && status ? (
            <>
              <h2>Who’s hosting?</h2>
              <p className="text-muted">
                Scan this code with your phone and log in as facilitator.
              </p>

              <div className="pairing-qr">
                <QRCodeSVG
                  value={controllerUrl}
                  size={240}
                  title="Open facilitator login"
                />
              </div>

              <span className="pairing-badge">
                Waiting for facilitator
              </span>

              <p className="pairing-note">
                QR valid for 10 minutes.
              </p>

              <details className="pairing-test-link">
                <summary>Testing on this computer?</summary>
                <a
                  href={controllerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open facilitator login in a new tab
                </a>
              </details>
            </>
          ) : (
          <p>Preparing your game session…</p>
        )}
      </section>
    </main>
  );
}