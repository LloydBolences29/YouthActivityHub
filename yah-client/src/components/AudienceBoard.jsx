export default function AudienceBoard({ board }) {
  return (
    <section className="audience-board">
      <div className="game-scoreboard">
        {board.teams.map((team) => (
          <div key={team.id}>
            <span>{team.name}</span>
            <strong>{team.score}</strong>
          </div>
        ))}
      </div>

      {board.phase === "fast_ready" ? (
        <>
          <h2>Fast Answer</h2>
          <p>Our final challenge is coming up!</p>
        </>
      ) : (
        <>
          <p className="pairing-eyebrow">
            Round {board.roundNumber} of {board.roundCount}
            {" · "}×{board.multiplier} points
          </p>

          <h2 className="audience-question">{board.question}</h2>

          <div className="audience-pot">
            Round pot <strong>{board.pot}</strong>
          </div>

          <div className="audience-answer-grid">
            {board.answers.map((answer) => (
              <div
                className={`audience-answer ${
                  answer.revealed ? "is-revealed" : ""
                }`}
                key={answer.position}
              >
                {answer.revealed ? (
                  <>
                    <span>{answer.text}</span>
                    <strong>{answer.points}</strong>
                  </>
                ) : (
                  <span className="answer-number">
                    {answer.position}
                  </span>
                )}
              </div>
            ))}
          </div>

          <p className="game-strikes">
            Strikes: {"✕ ".repeat(board.strikes) || "0"} / 3
          </p>

          {board.phase === "steal" && (
            <h3 className="game-steal-message">
              {board.teams[1 - board.playingTeam].name} — steal!
            </h3>
          )}

          {board.phase === "round_complete" && (
            <h3>
              {board.teams[board.winner].name} wins {board.pot} points!
            </h3>
          )}
        </>
      )}
    </section>
  );
}