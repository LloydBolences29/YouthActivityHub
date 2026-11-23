import { Link } from "react-router-dom";
import "../styles/LandingPage.css";

const LandingPage = () => {
  return (
    <main className="landing">
      <span className="landing-decoration decoration-star" aria-hidden="true">
        ✦
      </span>
      <span className="landing-decoration decoration-ring" aria-hidden="true" />
      <span className="landing-decoration decoration-spark" aria-hidden="true">
        ✳
      </span>

      <header className="landing-header">
        <Link to="/" className="landing-brand">
          <span aria-hidden="true">✦</span>
          Adventist Youth Activity Hub
        </Link>

        <span className="landing-header-note">Good friends. Great games.</span>
      </header>

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-copy">
          <span className="landing-badge">
            <span aria-hidden="true">🎉</span> Your next game starts here
          </span>

          <h1 id="landing-title">
            Bring your people.
            <br />
            <span>Bring the fun.</span>
          </h1>

          <p className="landing-description">
            Big laughs, friendly competition, and moments worth sharing.
            Get your group together and turn an ordinary gathering into
            game time.
          </p>

          <div className="landing-actions">
            <Link to="/dashboard" className="btn landing-cta">
              Explore games <span aria-hidden="true">↗</span>
            </Link>

            <span className="landing-action-note">
              Pick a game. Gather your team. Let’s go!
            </span>
          </div>

          <div className="landing-tags" aria-label="Activity highlights">
            <span>🤝 Play together</span>
            <span>💡 Think fast</span>
            <span>✨ Make memories</span>
          </div>
        </div>

        <div className="landing-preview">
          <span className="preview-sticker" aria-hidden="true">
            Squad ready?
          </span>

          <div className="landing-game-card">
            <div className="preview-topline">
              <span className="preview-label">First up on the hub</span>
              <span className="preview-live">Available now</span>
            </div>

            <span className="preview-trophy" aria-hidden="true">🏆</span>

            <h2>
              Bible
              <span>Feud!</span>
            </h2>

            <p>Two teams. Top answers. Big energy.</p>

            <div className="preview-answers" aria-hidden="true">
              <div><span>01</span> Gather your team <span>★</span></div>
              <div><span>02</span> Guess the answers <span>★</span></div>
              <div><span>03</span> Celebrate together <span>★</span></div>
            </div>

            <Link to="/games/bible-feud" className="preview-link">
              Check out Bible Feud <span aria-hidden="true">→</span>
            </Link>
          </div>

          <span className="preview-caption">
            A little competition. A whole lot of connection.
          </span>
        </div>
      </section>

      <footer className="landing-footer">
        Made for youth gatherings, fellowship, and your favorite people.
      </footer>
    </main>
  );
};

export default LandingPage;