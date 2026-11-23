import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { gamePost, gameRequest } from "../api/gameSessions";
import "../styles/GamePairing.css";

import TemplatePicker from "../components/TemplatePicker";
// import TemplatePreview from "../components/TemplatePreview";
import GameController from "../components/GameController";

export default function FacilitatorPanel() {
    const { sessionId } = useParams();

    const [token, setToken] = useState("");
    const [controller, setController] = useState(null);
    const [checking, setChecking] = useState(true);
    const [busy, setBusy] = useState(false);
    const [ended, setEnded] = useState(false);
    const [message, setMessage] = useState("");

    const [form, setForm] = useState({
        email: "",
        password: "",
    });

    useEffect(() => {
        let active = true;
        const key = `pairing-token:${sessionId}`;
        const incomingToken = window.location.hash.slice(1);

        if (incomingToken) {
            sessionStorage.setItem(key, incomingToken);

            // Remove the token from the visible URL after reading it.
            window.history.replaceState(
                null,
                "",
                window.location.pathname
            );
        }

        setToken(sessionStorage.getItem(key) || "");

        gameRequest(`/${sessionId}/controller`)
            .then((data) => {
                if (active) setController(data);
            })
            .catch((error) => {
                if (active && ![401, 403].includes(error.status)) {
                    setMessage(error.message);
                }
            })
            .finally(() => {
                if (active) setChecking(false);
            });

        return () => {
            active = false;
        };
    }, [sessionId]);

    async function handleLogin(event) {
        event.preventDefault();
        setBusy(true);
        setMessage("");

        try {
            await gamePost(`/${sessionId}/pair`, {
                token,
                email: form.email,
                password: form.password,
            });

            const data = await gameRequest(
                `/${sessionId}/controller`
            );

            setController(data);
            setForm({ email: "", password: "" });

            sessionStorage.removeItem(`pairing-token:${sessionId}`);
            setToken("");
        } catch (error) {
            setMessage(error.message);
        } finally {
            setBusy(false);
        }
    }

    async function handleEnd() {
        if (!window.confirm("End this game session?")) return;

        setBusy(true);
        setMessage("");

        try {
            await gamePost(`/${sessionId}/end`);

            sessionStorage.removeItem(`pairing-token:${sessionId}`);
            setController(null);
            setEnded(true);
        } catch (error) {
            setMessage(error.message);
        } finally {
            setBusy(false);
        }
    }

    if (checking) {
        return (
            <main className="pairing-page">
                <p>Checking your session…</p>
            </main>
        );
    }

    return (
        <main className="pairing-page">
            <section className="pairing-card facilitator-card">
                <span className="pairing-eyebrow">Bible Feud</span>

                {message && (
                    <p className="pairing-message" role="status">
                        {message}
                    </p>
                )}

                {ended ? (
                    <>
                        <h2>Session ended</h2>
                        <p className="text-muted">
                            Scan a new presentation QR to host another game.
                        </p>
                    </>
                ) : controller ? (
                    <>
                        <h2>Facilitator panel</h2>

                        <span className="pairing-badge">
                            Connected to presentation
                        </span>

                        <p className="facilitator-welcome">
                            Welcome, {controller.facilitator_name}!
                        </p>

                        {/* <div className="facilitator-setup">
              <h3>Prepare your game</h3>
              <p className="text-muted">
                Your audience sees “Setting up the game…”.
              </p>
              <p>
                Template selection and game controls will appear here
                in the next step.
              </p>
            </div> */}

                        {controller.status === "setup" ? (
                            <TemplatePicker
                                sessionId={sessionId}
                                userId={controller.facilitator_id}
                                onSelected={setController}
                            />
                        ) : (
                            <GameController
                                sessionId={sessionId}
                                template={controller.template_snapshot}
                            />
                        )}

                        <button
                            type="button"
                            className="btn-secondary"
                            disabled={busy}
                            onClick={handleEnd}
                        >
                            {busy ? "Ending…" : "End session"}
                        </button>
                    </>
                ) : (
                    <>
                        <h2>Ready to host?</h2>
                        <p className="text-muted">
                            Log in with your facilitator account to control this game.
                        </p>

                        {!token ? (
                            <p>
                                Scan the QR code on the audience screen to continue.
                            </p>
                        ) : (
                            <form onSubmit={handleLogin}>
                                <fieldset disabled={busy}>
                                    <label htmlFor="facilitator-email">Email</label>
                                    <input
                                        id="facilitator-email"
                                        type="email"
                                        autoComplete="username"
                                        required
                                        maxLength={254}
                                        value={form.email}
                                        onChange={(event) =>
                                            setForm({
                                                ...form,
                                                email: event.target.value,
                                            })
                                        }
                                    />

                                    <label htmlFor="facilitator-password">
                                        Password
                                    </label>
                                    <input
                                        id="facilitator-password"
                                        type="password"
                                        autoComplete="current-password"
                                        required
                                        maxLength={128}
                                        value={form.password}
                                        onChange={(event) =>
                                            setForm({
                                                ...form,
                                                password: event.target.value,
                                            })
                                        }
                                    />

                                    <button type="submit">
                                        {busy ? "Connecting…" : "Log in and connect"}
                                    </button>
                                </fieldset>
                            </form>
                        )}
                    </>
                )}
            </section>
        </main>
    );
}