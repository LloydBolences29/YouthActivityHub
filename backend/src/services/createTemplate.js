function invalid(message) {
    const error = new Error(message);
    error.status = 422;
    throw error;
}

function text(value, label, maxLength) {
    if (
        typeof value !== "string" ||
        !value.trim() ||
        value.trim().length > maxLength
    ) {
        invalid(`${label} is required and must be at most ${maxLength} characters.`);
    }

    return value.trim();
}

function validateQuestion(question, label, singleAnswer = false) {
    if (!question || typeof question !== "object") {
        invalid(`${label} is invalid.`);
    }

    const questionText = text(question.text, `${label}: question`, 500);

    if (
        !Array.isArray(question.answers) ||
        !question.answers.length ||
        (singleAnswer && question.answers.length !== 1)
    ) {
        invalid(
            singleAnswer
                ? `${label} needs exactly one expected answer.`
                : `${label} needs at least one answer.`
        );
    }

    const answers = question.answers.map((answer, index) => {
        if (!answer || typeof answer !== "object") {
            invalid(`${label}: answer ${index + 1} is invalid.`);
        }

        const answerText = text(
            answer.text,
            `${label}: answer ${index + 1}`,
            200
        );

        if (
            !Number.isSafeInteger(answer.points) ||
            answer.points < 0 ||
            answer.points > 2147483647
        ) {
            invalid(`${label}: points must be a non-negative whole number.`);
        }

        return {
            text: answerText,
            points: answer.points,
        };
    });

    const uniqueAnswers = new Set(
        answers.map((answer) => answer.text.toLowerCase())
    );

    if (uniqueAnswers.size !== answers.length) {
        invalid(`${label} contains duplicate answers.`);
    }

    return {
        text: questionText,
        answers,
    };
}

export async function createTemplate(
    client,
    input,
    userId,
    templateIdToUpdate = null
) {
    if (!input || typeof input !== "object") {
        invalid("Template details are required.");
    }

    const title = text(input.title, "Template title", 150);

    const description =
        typeof input.description === "string"
            ? input.description.trim()
            : "";

    if (description.length > 1000) {
        invalid("Description must be at most 1000 characters.");
    }

    if (!Array.isArray(input.regularRounds) || !input.regularRounds.length) {
        invalid("Add at least one regular round.");
    }

    const regularRounds = input.regularRounds.map((question, index) =>
        validateQuestion(question, `Round ${index + 1}`)
    );

    if (!Array.isArray(input.fastQuestions) || !input.fastQuestions.length) {
        invalid("Add at least one Fast Answer question.");
    }

    const fastQuestions = input.fastQuestions.map((question, index) =>
        validateQuestion(question, `Fast Answer question ${index + 1}`, true)
    );

    if (
        !Number.isSafeInteger(input.timerSeconds) ||
        input.timerSeconds < 1 ||
        input.timerSeconds > 2147483647
    ) {
        invalid("Timer must be a positive whole number of seconds.");
    }

    let templateId;
    let oldQuestionIds = [];

    if (templateIdToUpdate !== null) {
        if (!Number.isSafeInteger(input.revision) || input.revision < 1) {
            const error = new Error("Template revision is required.");
            error.status = 422;
            throw error;
        }

        const existing = await client.query(
            `SELECT id, revision
     FROM game_templates
     WHERE id = $1 AND created_by = $2
     FOR UPDATE`,
            [templateIdToUpdate, userId]
        );

        if (!existing.rows[0]) {
            const error = new Error("Template not found or you do not own it.");
            error.status = 404;
            throw error;
        }

        if (existing.rows[0].revision !== input.revision) {
            const error = new Error(
                "This template changed after you opened it. Your draft is preserved. Reopen the latest version before saving."
            );
            error.status = 409;
            throw error;
        }

        const oldQuestions = await client.query(
            `SELECT tq.question_id
     FROM template_questions tq
     JOIN template_rounds r ON r.id = tq.round_id
     WHERE r.template_id = $1`,
            [templateIdToUpdate]
        );

        oldQuestionIds = oldQuestions.rows.map((row) => row.question_id);
        templateId = templateIdToUpdate;

        await client.query(
            `UPDATE game_templates
     SET title = $1,
         description = $2,
         is_published = TRUE,
         updated_at = NOW(),
         revision = revision + 1
     WHERE id = $3`,
            [title, description, templateId]
        );

        // Question assignments are removed by cascading.
        // Their old question content is cleaned up after replacements are inserted.
        await client.query(
            "DELETE FROM template_rounds WHERE template_id = $1",
            [templateId]
        );
    } else {
        const templateResult = await client.query(
            `INSERT INTO game_templates (
       title,
       description,
       game,
       created_by,
       is_published,
       visibility
     )
     VALUES ($1, $2, 'bible-feud', $3, TRUE, 'private')
     RETURNING id`,
            [title, description, userId]
        );

        templateId = templateResult.rows[0].id;
    }

    async function insertQuestion(roundId, position, question) {
        const result = await client.query(
            `INSERT INTO questions (
         game, text, status, created_by
       )
       VALUES ('bible-feud', $1, 'published', $2)
       RETURNING id`,
            [question.text, userId]
        );

        const questionId = result.rows[0].id;

        for (const [index, answer] of question.answers.entries()) {
            await client.query(
                `INSERT INTO answers (question_id, text, points, rank)
         VALUES ($1, $2, $3, $4)`,
                [questionId, answer.text, answer.points, index + 1]
            );
        }

        await client.query(
            `INSERT INTO template_questions (
         round_id, question_id, position
       )
       VALUES ($1, $2, $3)`,
            [roundId, questionId, position]
        );
    }

    for (const [index, question] of regularRounds.entries()) {
        const result = await client.query(
            `INSERT INTO template_rounds (
         template_id, type, position
       )
       VALUES ($1, 'regular', $2)
       RETURNING id`,
            [templateId, index + 1]
        );

        await insertQuestion(result.rows[0].id, 1, question);
    }

    const fastRoundResult = await client.query(
        `INSERT INTO template_rounds (
       template_id, type, position, timer_seconds
     )
     VALUES ($1, 'fast_answer', $2, $3)
     RETURNING id`,
        [templateId, regularRounds.length + 1, input.timerSeconds]
    );

    for (const [index, question] of fastQuestions.entries()) {
        await insertQuestion(fastRoundResult.rows[0].id, index + 1, question);
    }

    if (oldQuestionIds.length) {
        // Delete only content owned by this facilitator that no other template uses.
        // Its answer rows are removed by the existing ON DELETE CASCADE.
        await client.query(
            `DELETE FROM questions q
     WHERE q.id = ANY($1::int[])
       AND q.created_by = $2
       AND NOT EXISTS (
         SELECT 1
         FROM template_questions tq
         WHERE tq.question_id = q.id
       )`,
            [oldQuestionIds, userId]
        );
    }

    return {
        id: templateId,
        title,
    };
}