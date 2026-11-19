import { Link } from "react-router-dom";
import "../styles/Dashboard.css";

const games = [
  {
    id: "bible-feud",
    title: "Bible Feud",
    category: "Team Challenge",
    description:
      "Bring your teams together and guess the top answers in this Bible-themed Family Feud game.",
    icon: "🏆",
    available: true,
    path: "/games/bible-feud",
  },
  {
    id: "rebus",
    title: "Rebus Puzzles",
    category: "Brain Teaser",
    description:
      "Look closely, connect the clues, and uncover the hidden phrase.",
    icon: "🧩",
    available: false,
  },
  {
    id: "bible-trivia",
    title: "Bible Trivia",
    category: "Knowledge Challenge",
    description:
      "Discover how much your group knows about Bible stories and characters.",
    icon: "💡",
    available: false,
  },
];

export default function Dashboard() {
  return (
    <main className="dashboard">
      <div className="container">
        <header className="dashboard-header">
          <Link to="/" className="dashboard-brand">
            <span className="dashboard-brand-icon" aria-hidden="true">
              ✦
            </span>
            Youth Activity Hub
          </Link>

          <span className="dashboard-header-label">Let’s play together</span>
        </header>

        <section className="dashboard-intro" aria-labelledby="dashboard-title">
          <span className="dashboard-eyebrow">One hub. More ways to connect.</span>
          <h1 id="dashboard-title">Pick your next challenge.</h1>
          <p>
            Bring your group together for a little friendly competition.
            Choose a game to get started.
          </p>
        </section>

        <section aria-labelledby="games-title">
          <div className="dashboard-section-heading">
            <h2 id="games-title">Explore games</h2>
            <span className="text-muted">1 game available</span>
          </div>

          <div className="games-grid">
            {games.map((game) => (
              <article
                key={game.id}
                className={`game-card ${
                  game.available ? "game-card-available" : "game-card-upcoming"
                }`}
              >
                <div className="game-card-top">
                  <span className="game-icon" aria-hidden="true">
                    {game.icon}
                  </span>

                  <span
                    className={`game-status ${
                      game.available ? "game-status-live" : ""
                    }`}
                  >
                    {game.available ? "Ready to play" : "Coming soon"}
                  </span>
                </div>

                <div className="game-card-content">
                  <p className="game-category">{game.category}</p>
                  <h3>{game.title}</h3>
                  <p className="game-description">{game.description}</p>
                </div>

                {game.available ? (
                  <Link to={game.path} className="btn game-card-action">
                    Select game <span aria-hidden="true">→</span>
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary game-card-action"
                    disabled
                  >
                    Coming soon
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>

        <footer className="dashboard-footer">
          More games. More shared moments. Stay tuned.
        </footer>
      </div>
    </main>
  );
}