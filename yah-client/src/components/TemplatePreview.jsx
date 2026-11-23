export default function TemplatePreview({ template }) {
  if (!template?.rounds) {
    return <p>Template content is unavailable. Start a new session.</p>;
  }

  const regularRounds = template.rounds.filter(
    (round) => round.type === "regular"
  );

  const fastRound = template.rounds.find(
    (round) => round.type === "fast_answer"
  );

  return (
    <section className="facilitator-setup">
      <h3>{template.title}</h3>

      <p className="text-muted">
        {regularRounds.length} regular rounds
        {" · "}
        {fastRound.questions.length} Fast Answer questions
        {" · "}
        {fastRound.timerSeconds} seconds per player
      </p>

      <span className="pairing-badge">Game pack loaded</span>

      <p className="text-muted" style={{ marginTop: "1rem" }}>
        Answers below are visible only on your controller.
      </p>

      {regularRounds.map((round, index) => {
        const question = round.questions[0];

        return (
          <details className="controller-question" key={round.id}>
            <summary>
              Round {index + 1} · {question.answers.length} answers
            </summary>

            <p>{question.text}</p>

            <ol>
              {question.answers.map((answer) => (
                <li key={answer.id}>
                  {answer.text} — {answer.points} points
                </li>
              ))}
            </ol>
          </details>
        );
      })}

      <details className="controller-question">
        <summary>
          Fast Answer · {fastRound.timerSeconds} seconds
        </summary>

        {fastRound.questions.map((question, index) => (
          <div className="fast-answer-preview" key={question.id}>
            <p>
              <strong>{index + 1}.</strong> {question.text}
            </p>

            <p>
              Answer: <strong>{question.answers[0].text}</strong>
              {" · "}
              {question.answers[0].points} points
            </p>
          </div>
        ))}
      </details>
    </section>
  );
}