import "dotenv/config";
import pool from "../config/db.js";

const template = {
  title: "Bible Feud — Starter Pack",
  description: "Six regular rounds and one Fast Answer challenge.",
  fastAnswerSeconds: 20,

  // Each regular round has one question and a variable answer count.
  regularRounds: [
    {
      question: "Name an animal mentioned in the Bible.",
      answers: [
        ["Sheep", 30],
        ["Lion", 25],
        ["Dove", 20],
        ["Donkey", 10],
        ["Fish", 10],
        ["Serpent", 5],
      ],
    },
    {
      question: "Name something associated with Noah's story.",
      answers: [
        ["Ark", 40],
        ["Animals", 30],
        ["Rainbow", 20],
        ["Flood", 10],
      ],
    },
    {
      question: "Name someone called by God.",
      answers: [
        ["Moses", 40],
        ["Abraham", 35],
        ["Samuel", 25],
      ],
    },
    {
      question: "Name something people do during worship.",
      answers: [
        ["Pray", 30],
        ["Sing", 25],
        ["Read Scripture", 20],
        ["Listen", 15],
        ["Give offerings", 10],
      ],
    },
    {
      question: "Name a disciple of Jesus.",
      answers: [
        ["Peter", 25],
        ["John", 20],
        ["James", 15],
        ["Andrew", 15],
        ["Thomas", 10],
        ["Matthew", 10],
        ["Philip", 5],
      ],
    },
    {
      question: "Name a place connected with Jesus' early life.",
      answers: [
        ["Bethlehem", 40],
        ["Nazareth", 35],
        ["Egypt", 25],
      ],
    },
  ],

  // Each Fast Answer question has exactly one expected answer.
  fastAnswerQuestions: [
    { question: "Who built the ark?", answer: "Noah", points: 20 },
    {
      question: "Where was Jesus born?",
      answer: "Bethlehem",
      points: 20,
    },
    {
      question: "Who defeated Goliath?",
      answer: "David",
      points: 20,
    },
    {
      question: "Who was swallowed by a great fish?",
      answer: "Jonah",
      points: 20,
    },
    {
      question: "Who led Israel out of Egypt?",
      answer: "Moses",
      points: 20,
    },
  ],
};

// These are illustrative assigned points, not survey results.
async function addQuestion(client, roundId, position, text, answers, userId) {
  const questionResult = await client.query(
    `INSERT INTO questions (
       game, text, category, status, created_by
     )
     VALUES ('bible-feud', $1, 'Starter Pack', 'published', $2)
     RETURNING id`,
    [text, userId]
  );

  const questionId = questionResult.rows[0].id;

  for (const [index, answer] of answers.entries()) {
    await client.query(
      `INSERT INTO answers (question_id, text, points, rank)
       VALUES ($1, $2, $3, $4)`,
      [questionId, answer[0], answer[1], index + 1]
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

let client;

try {
  client = await pool.connect();
  await client.query("BEGIN");

  // Prevent duplicate seeds if the script runs simultaneously.
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext($1))",
    [template.title]
  );

  const existing = await client.query(
    "SELECT id FROM game_templates WHERE title = $1",
    [template.title]
  );

  if (existing.rows.length) {
    console.log("Starter template already exists. Nothing was changed.");
  } else {
    const adminResult = await client.query(
      `SELECT id
       FROM users
       WHERE role = 'admin' AND is_active = TRUE
       ORDER BY id
       LIMIT 1`
    );

    const admin = adminResult.rows[0];

    if (!admin) {
      throw new Error("Create an active admin account first.");
    }

    const templateResult = await client.query(
      `INSERT INTO game_templates (
         title, description, created_by
       )
       VALUES ($1, $2, $3)
       RETURNING id`,
      [template.title, template.description, admin.id]
    );

    const templateId = templateResult.rows[0].id;

    // Create however many regular rounds are in the array.
    for (const [index, round] of template.regularRounds.entries()) {
      const roundResult = await client.query(
        `INSERT INTO template_rounds (
           template_id, type, position, timer_seconds
         )
         VALUES ($1, 'regular', $2, NULL)
         RETURNING id`,
        [templateId, index + 1]
      );

      await addQuestion(
        client,
        roundResult.rows[0].id,
        1,
        round.question,
        round.answers,
        admin.id
      );
    }

    // Create the single Fast Answer round after the regular rounds.
    const fastRoundResult = await client.query(
      `INSERT INTO template_rounds (
         template_id, type, position, timer_seconds
       )
       VALUES ($1, 'fast_answer', $2, $3)
       RETURNING id`,
      [
        templateId,
        template.regularRounds.length + 1,
        template.fastAnswerSeconds,
      ]
    );

    for (const [index, item] of template.fastAnswerQuestions.entries()) {
      await addQuestion(
        client,
        fastRoundResult.rows[0].id,
        index + 1,
        item.question,
        [[item.answer, item.points]],
        admin.id
      );
    }

    await client.query(
      `UPDATE game_templates
       SET is_published = TRUE,
           updated_at = NOW()
       WHERE id = $1`,
      [templateId]
    );

    console.log(`Template created: ${template.title}`);
    console.log(`Regular rounds: ${template.regularRounds.length}`);
    console.log(
      `Fast Answer questions: ${template.fastAnswerQuestions.length}`
    );
    console.log(`Timer: ${template.fastAnswerSeconds} seconds`);
  }

  await client.query("COMMIT");
} catch (error) {
  if (client) await client.query("ROLLBACK");

  console.error("Template creation failed:", error.message);
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}