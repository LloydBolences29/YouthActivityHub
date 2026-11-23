function templateError(message, status = 422) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export async function loadTemplate(client, templateId, game, userId) {
const templateResult = await client.query(
  `SELECT id, title, description
   FROM game_templates
   WHERE id = $1
     AND game = $2
     AND is_published = TRUE
     AND (visibility = 'public' OR created_by = $3)`,
  [templateId, game, userId]
);

  const template = templateResult.rows[0];

  if (!template) {
    throw templateError("Template is unavailable", 404);
  }

  const roundResult = await client.query(
    `SELECT id, type, position, timer_seconds
     FROM template_rounds
     WHERE template_id = $1
     ORDER BY position`,
    [templateId]
  );

  const questionResult = await client.query(
    `SELECT
       tq.round_id,
       tq.position,
       q.id,
       q.text,
       q.game,
       q.status,
       COALESCE(
         jsonb_agg(
           jsonb_build_object(
             'id', a.id,
             'text', a.text,
             'points', a.points,
             'rank', a.rank
           )
           ORDER BY a.rank
         ) FILTER (WHERE a.id IS NOT NULL),
         '[]'::jsonb
       ) AS answers
     FROM template_questions tq
     JOIN template_rounds r ON r.id = tq.round_id
     JOIN questions q ON q.id = tq.question_id
     LEFT JOIN answers a ON a.question_id = q.id
     WHERE r.template_id = $1
     GROUP BY tq.id, q.id
     ORDER BY tq.position`,
    [templateId]
  );

  const rounds = roundResult.rows.map((round) => ({
    id: round.id,
    type: round.type,
    position: round.position,
    timerSeconds: round.timer_seconds,

    questions: questionResult.rows
      .filter((question) => question.round_id === round.id)
      .map((question) => {
        if (question.game !== game || question.status !== "published") {
          throw templateError(
            "All template questions must be published and belong to this game."
          );
        }

        return {
          id: question.id,
          text: question.text,
          position: question.position,
          answers: question.answers,
        };
      }),
  }));

  const regularRounds = rounds.filter(
    (round) => round.type === "regular"
  );

  const fastRounds = rounds.filter(
    (round) => round.type === "fast_answer"
  );

  if (!regularRounds.length) {
    throw templateError("A template needs at least one regular round.");
  }

  if (fastRounds.length !== 1) {
    throw templateError("A template needs exactly one Fast Answer round.");
  }

  if (rounds[rounds.length - 1]?.type !== "fast_answer") {
    throw templateError("Fast Answer must be the final round.");
  }

  for (const round of regularRounds) {
    if (round.questions.length !== 1) {
      throw templateError(
        "Each regular round must contain one question."
      );
    }

    if (!round.questions[0].answers.length) {
      throw templateError(
        "Each regular question needs at least one answer."
      );
    }
  }

  const fastRound = fastRounds[0];

  if (
    !Number.isInteger(fastRound.timerSeconds) ||
    fastRound.timerSeconds <= 0
  ) {
    throw templateError("Fast Answer needs a positive timer.");
  }

  if (!fastRound.questions.length) {
    throw templateError("Fast Answer needs at least one question.");
  }

  if (
    fastRound.questions.some(
      (question) => question.answers.length !== 1
    )
  ) {
    throw templateError(
      "Each Fast Answer question must have exactly one expected answer."
    );
  }

  return {
    schemaVersion: 2,
    templateId: template.id,
    title: template.title,
    description: template.description,
    rounds,
  };
}