import { useEffect, useRef, useState } from "react";
import { gamePost, gameRequest } from "../api/gameSessions";

export default function GameController({ sessionId, template }) {
  const [game, setGame] = useState(null);
  const [names, setNames] = useState(["Team One", "Team Two"]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const locked = useRef(false);

  const rounds = template.rounds.filter(
    (round) => round.type === "regular"
  );

  useEffect(() => {
    let active = true;

    gameRequest(`/${sessionId}/play`)
      .then((data) => {
        if (active) setGame(data);
      })
      .catch((error) => {
        if (active) setMessage(error.message);
      });

    return () => {
      active = false;
    };
  }, [sessionId]);

  async function act(action) {
    if (!game || locked.current) return;

    locked.current = true;
    setBusy(true);
    setMessage("");

    try {
      const data = await gamePost(`/${sessionId}/actions`, {
        expectedVersion: game.version,
        action,
      });

      setGame(data);
    } catch (error) {
      setMessage(error.message);

      // Also recover after a lost response: the server may have committed.
      try {
        const latest = await gameRequest(`/${sessionId}/play`);
        setGame(latest);
      } catch {
        setMessage(
          `${error.message} Refresh the panel before trying another action.`
        );
        setGame(null);
      }
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  if (!game) {
    return (
      <section>
        <p>{message || "Loading game controls…"}</p>
        {message && (
          <button onClick={() => window.location.reload()}>
            Refresh panel
          </button>
        )}
      </section>
    );
  }

  const state = game.state;

  if (!state) {
    return (
      <form
        className="game-controls"
        onSubmit={(event) => {
          event.preventDefault();
          act({ type: "START_GAME", teamNames: names });
        }}
      >
        <h3>Set up your teams</h3>

        {message && <p role="alert">{message}</p>}

        <fieldset disabled={busy}>
          {names.map((name, index) => (
            <label key={index}>
              Team {index + 1}
              <input
                required
                maxLength={50}
                value={name}
                onChange={(event) =>
                  setNames((current) =>
                    current.map((value, teamIndex) =>
                      teamIndex === index
                        ? event.target.value
                        : value
                    )
                  )
                }
              />
            </label>
          ))}

          <button type="submit">
            {busy ? "Starting…" : "Start regular rounds"}
          </button>
        </fieldset>
      </form>
    );
  }

  const fastReady = state.phase === "fast_ready";
  const question = fastReady
    ? null
    : rounds[state.roundIndex].questions[0];

  const pot = question
    ? question.answers
        .filter((answer) => state.revealed.includes(answer.id))
        .reduce((total, answer) => total + answer.points, 0) *
      state.multiplier
    : 0;

  return (
    <section className="game-controls">
      {message && <p role="alert">{message}</p>}

      <div className="game-scoreboard">
        {state.teams.map((team) => (
          <div key={team.id}>
            <span>{team.name}</span>
            <strong>{team.score}</strong>
          </div>
        ))}
      </div>

      {fastReady ? (
        <>
          <h3>Regular rounds complete!</h3>
          {/* <p>
            Fast Answer is next. Its timer and results controls will
            be added in the next step.
          </p> */}
        </>
      ) : (
        <>
          <h3>
            Round {state.roundIndex + 1} of {rounds.length}
          </h3>

          <p>{question.text}</p>

          <p>
            Round pot: <strong>{pot}</strong>
            {" · "}
            Multiplier: ×{state.multiplier}
          </p>

          {state.phase === "awaiting_team" && (
            <>
              <label>
                Round multiplier
                <select
                  disabled={busy}
                  value={state.multiplier}
                  onChange={(event) =>
                    act({
                      type: "SET_MULTIPLIER",
                      multiplier: Number(event.target.value),
                    })
                  }
                >
                  <option value={1}>Single points</option>
                  <option value={2}>Double points</option>
                  <option value={3}>Triple points</option>
                </select>
              </label>

              <p className="text-muted">
                After the face-off and play/pass decision, select
                the team playing this round.
              </p>

              <div className="game-action-row">
                {state.teams.map((team) => (
                  <button
                    type="button"
                    key={team.id}
                    disabled={busy}
                    onClick={() =>
                      act({ type: "SET_TEAM", teamId: team.id })
                    }
                  >
                    {team.name} plays
                  </button>
                ))}
              </div>
            </>
          )}

          {state.playingTeam !== null && (
            <p>
              Playing:{" "}
              <strong>
                {state.teams[state.playingTeam].name}
              </strong>
            </p>
          )}

          <p className="game-strikes">
            Strikes: {"✕ ".repeat(state.strikes) || "0"} / 3
          </p>

          {state.phase === "steal" && (
            <p className="game-steal-message" role="status">
              {state.teams[1 - state.playingTeam].name} gets one
              steal attempt!
            </p>
          )}

          <div className="controller-answer-grid">
            {question.answers.map((answer, index) => {
              const revealed = state.revealed.includes(answer.id);

              return (
                <button
                  type="button"
                  key={answer.id}
                  className={`controller-answer ${
                    revealed ? "is-revealed" : ""
                  }`}
                  disabled={
                    busy ||
                    revealed ||
                    !["playing", "steal"].includes(state.phase)
                  }
                  onClick={() =>
                    act({
                      type: "REVEAL",
                      answerId: answer.id,
                    })
                  }
                >
                  <span>
                    {index + 1}. {answer.text}
                  </span>
                  <strong>{answer.points}</strong>
                  {revealed && <small>Revealed</small>}
                </button>
              );
            })}
          </div>

          {["playing", "steal"].includes(state.phase) && (
            <button
              type="button"
              className="game-wrong"
              disabled={busy}
              onClick={() => act({ type: "WRONG" })}
            >
              {state.phase === "steal"
                ? "Wrong — steal failed"
                : "✕ Wrong answer"}
            </button>
          )}

          {state.phase === "awaiting_award" && (
            <>
              <p>
                Round won by{" "}
                <strong>{state.teams[state.winner].name}</strong>.
                Award {pot} points:
              </p>

              <div className="game-action-row">
                {state.teams.map((team) => (
                  <button
                    type="button"
                    key={team.id}
                    disabled={busy || team.id !== state.winner}
                    onClick={() =>
                      act({ type: "AWARD", teamId: team.id })
                    }
                  >
                    Award to {team.name}
                  </button>
                ))}
              </div>
            </>
          )}

          {state.phase === "round_complete" && (
            <>
              <p>
                {pot} points awarded to{" "}
                {state.teams[state.winner].name}.
              </p>

              <button
                type="button"
                disabled={busy}
                onClick={() => act({ type: "NEXT_ROUND" })}
              >
                {state.roundIndex + 1 === rounds.length
                  ? "Continue to Fast Answer"
                  : "Next round"}
              </button>
            </>
          )}
        </>
      )}

      <button
        type="button"
        className="btn-secondary"
        disabled={busy || !game.canUndo}
        onClick={() => act({ type: "UNDO" })}
      >
        ↶ Undo last action
      </button>
    </section>
  );
}