import express from "express";
import argon2 from "argon2";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import pool from "../config/db.js";
import { loadTemplate } from "../services/loadTemplate.js";
import { createTemplate } from "../services/createTemplate.js";
import {
    applyGameAction,
    audienceBoard,
} from "../services/regularGame.js";

const router = express.Router();

const hash = (value) =>
    createHash("sha256").update(value).digest("hex");

const validId = (value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value
    );

const validToken = (value) =>
    typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);

const createLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    message: {
        message: "Too many game sessions. Please try again later.",
    },
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    message: {
        message: "Too many login attempts. Please try again later.",
    },
});

function regenerateSession(req) {
    return new Promise((resolve, reject) => {
        req.session.regenerate((error) => {
            if (error) reject(error);
            else resolve();
        });
    });
}

function saveSession(req) {
    return new Promise((resolve, reject) => {
        req.session.save((error) => {
            if (error) reject(error);
            else resolve();
        });
    });
}

// Do not cache pairing or controller responses.
router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");

    // Browser write requests must come from our frontend.
    if (
        ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
        req.get("origin") !== process.env.CLIENT_ORIGIN
    ) {
        return res.status(403).json({
            message: "Request origin not allowed",
        });
    }

    next();
});

// Create a session for the laptop.
router.post("/", createLimiter, async (req, res, next) => {
    try {
        if (req.body?.game !== "bible-feud") {
            return res.status(400).json({
                message: "This game is not available",
            });
        }

        const id = randomUUID();
        const pairingToken = randomBytes(32).toString("hex");
        const displayToken = randomBytes(32).toString("hex");

        const { rows } = await pool.query(
            `INSERT INTO game_sessions (
         id,
         game,
         pairing_token_hash,
         display_token_hash,
         pairing_expires_at,
         expires_at
       )
       VALUES (
         $1, $2, $3, $4,
         NOW() + INTERVAL '10 minutes',
         NOW() + INTERVAL '2 hours'
       )
       RETURNING pairing_expires_at`,
            [
                id,
                "bible-feud",
                hash(pairingToken),
                hash(displayToken),
            ]
        );

        res.status(201).json({
            id,
            pairingToken,
            displayToken,
            pairingExpiresAt: rows[0].pairing_expires_at,
        });
    } catch (error) {
        next(error);
    }
});

// The laptop can read presentation status only.
router.get("/:id/display", async (req, res, next) => {
    try {
        const displayToken = req.get("x-display-token");

        if (!validId(req.params.id) || !validToken(displayToken)) {
            return res.status(403).json({
                message: "Invalid presentation access",
            });
        }

        const { rows } = await pool.query(
            `SELECT
         game,
         status,
         template_snapshot,
         game_state,
         pairing_expires_at <= NOW() AS pairing_expired,
         expires_at <= NOW() AS session_expired
       FROM game_sessions
       WHERE id = $1
         AND display_token_hash = $2`,
            [req.params.id, hash(displayToken)]
        );

        const session = rows[0];

        if (!session) {
            return res.status(404).json({
                message: "Presentation session not found",
            });
        }

        res.json({
            game: session.game,
            status: session.status,
            template_title: session.template_snapshot?.title ?? null,
            pairing_expired: session.pairing_expired,
            session_expired: session.session_expired,

            board:
                session.status === "ready" && !session.session_expired
                    ? audienceBoard(
                        session.template_snapshot,
                        session.game_state
                    )
                    : null,
        });
    } catch (error) {
        next(error);
    }
});

// The phone logs in and claims the game session.
router.post("/:id/pair", loginLimiter, async (req, res, next) => {
    try {
        const { token, email, password } = req.body ?? {};

        if (
            !validId(req.params.id) ||
            !validToken(token) ||
            typeof email !== "string" ||
            !email.trim() ||
            email.length > 254 ||
            typeof password !== "string" ||
            !password ||
            password.length > 128
        ) {
            return res.status(400).json({
                message: "Invalid login or pairing details",
            });
        }

        const { rows } = await pool.query(
            `SELECT id, password_hash
       FROM users
       WHERE LOWER(email) = $1
         AND role = 'facilitator'
         AND is_active = TRUE`,
            [email.trim().toLowerCase()]
        );

        const facilitator = rows[0];

        if (
            !facilitator ||
            !(await argon2.verify(facilitator.password_hash, password))
        ) {
            return res.status(401).json({
                message: "Invalid facilitator email or password",
            });
        }

        await regenerateSession(req);

        req.session.userId = facilitator.id;
        req.session.gameSessionId = req.params.id;

        // Save authentication before making this browser the controller.
        await saveSession(req);

        // Only one phone can successfully change waiting → setup.
        const result = await pool.query(
            `UPDATE game_sessions
       SET facilitator_id = $1,
           controller_session_hash = $2,
           status = 'setup'
       WHERE id = $3
         AND pairing_token_hash = $4
         AND status = 'waiting'
         AND pairing_expires_at > NOW()
         AND expires_at > NOW()
       RETURNING id`,
            [
                facilitator.id,
                hash(req.sessionID),
                req.params.id,
                hash(token),
            ]
        );

        if (!result.rows[0]) {
            return res.status(409).json({
                message:
                    "This QR code expired or is already paired. Ask the laptop to create a new session.",
            });
        }

        res.json({
            message: "Phone paired successfully",
        });
    } catch (error) {
        next(error);
    }
});

// Apply controller authorization to the routes below.
router.use("/:id", async (req, res, next) => {
    try {
        if (
            !validId(req.params.id) ||
            !req.session.userId ||
            req.session.gameSessionId !== req.params.id
        ) {
            return res.status(401).json({
                message: "Please log in using the presentation QR code",
            });
        }

        const { rows } = await pool.query(
            `SELECT
         gs.id,
         gs.game,
         gs.status,
         gs.game_state,
         gs.game_version,
         gs.facilitator_id,
        gs.template_snapshot,
         u.name AS facilitator_name
       FROM game_sessions gs
       JOIN users u ON u.id = gs.facilitator_id
       WHERE gs.id = $1
         AND gs.facilitator_id = $2
         AND gs.controller_session_hash = $3
        AND gs.status IN ('setup', 'ready')
         AND gs.expires_at > NOW()
         AND u.role = 'facilitator'
         AND u.is_active = TRUE`,
            [
                req.params.id,
                req.session.userId,
                hash(req.sessionID),
            ]
        );

        if (!rows[0]) {
            return res.status(403).json({
                message: "Controller access expired or unavailable",
            });
        }

        req.gameSession = rows[0];
        next();
    } catch (error) {
        next(error);
    }
});

router.get("/:id/controller", (req, res) => {
    res.json(req.gameSession);
});

router.post("/:id/templates", async (req, res, next) => {
    let client;

    try {
        client = await pool.connect();
        await client.query("BEGIN");

        // Recheck authorization and prevent the session ending during creation.
        const access = await client.query(
            `SELECT gs.id
       FROM game_sessions gs
       JOIN users u ON u.id = gs.facilitator_id
       WHERE gs.id = $1
         AND gs.facilitator_id = $2
         AND gs.controller_session_hash = $3
         AND gs.status = 'setup'
         AND gs.expires_at > NOW()
         AND u.role = 'facilitator'
         AND u.is_active = TRUE
       FOR SHARE OF gs, u`,
            [
                req.gameSession.id,
                req.session.userId,
                hash(req.sessionID),
            ]
        );

        if (!access.rows.length) {
            await client.query("ROLLBACK");

            return res.status(409).json({
                message: "Create templates while this session is in setup.",
            });
        }

        const template = await createTemplate(
            client,
            req.body,
            req.session.userId
        );

        await client.query("COMMIT");

        res.status(201).json({
            message: "Template created",
            template,
        });
    } catch (error) {
        if (client) await client.query("ROLLBACK");

        if (error.status === 422) {
            return res.status(422).json({
                message: error.message,
            });
        }

        next(error);
    } finally {
        client?.release();
    }
});

// List available template summaries.
router.get("/:id/templates", async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT
         t.id,
         t.title,
         t.description,
         t.revision,
         (t.created_by = $2) AS is_owner,
         (
           SELECT COUNT(*)::int
           FROM template_rounds r
           WHERE r.template_id = t.id
             AND r.type = 'regular'
         ) AS regular_round_count,
         (
           SELECT COUNT(*)::int
           FROM template_questions tq
           JOIN template_rounds r ON r.id = tq.round_id
           WHERE r.template_id = t.id
             AND r.type = 'fast_answer'
         ) AS fast_question_count
       FROM game_templates t
            WHERE t.game = $1
            AND t.is_published = TRUE
            AND (t.visibility = 'public' OR t.created_by = $2)
       ORDER BY t.created_at DESC, t.id DESC`,
            [req.gameSession.game, req.session.userId]
        );

        res.json({ templates: rows });
    } catch (error) {
        next(error);
    }
});

// Select a template and save a private session snapshot.
router.post("/:id/template", async (req, res, next) => {
    const templateId = req.body?.templateId;

    if (!Number.isSafeInteger(templateId) || templateId < 1) {
        return res.status(400).json({
            message: "Select a valid template",
        });
    }

    let client;

    try {
        client = await pool.connect();
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");

        const sessionResult = await client.query(
            `SELECT status
       FROM game_sessions
       WHERE id = $1
         AND controller_session_hash = $2
         AND expires_at > NOW()
         AND EXISTS (
           SELECT 1
           FROM users
           WHERE id = game_sessions.facilitator_id
             AND role = 'facilitator'
             AND is_active = TRUE
         )
       FOR UPDATE`,
            [req.gameSession.id, hash(req.sessionID)]
        );

        if (sessionResult.rows[0]?.status !== "setup") {
            await client.query("ROLLBACK");

            return res.status(409).json({
                message: "This session is no longer accepting template selections",
            });
        }

        const snapshot = await loadTemplate(
            client,
            templateId,
            req.gameSession.game,
            req.session.userId
        );

        await client.query(
            `UPDATE game_sessions
       SET template_snapshot = $1::jsonb,
           status = 'ready'
       WHERE id = $2`,
            [JSON.stringify(snapshot), req.gameSession.id]
        );

        await client.query("COMMIT");

        res.json({ message: "Template selected successfully" });
    } catch (error) {
        if (client) await client.query("ROLLBACK");

        if (error.code === "40001") {
            return res.status(409).json({
                message: "Session changed. Refresh the panel and try again.",
            });
        }

        if ([404, 422].includes(error.status)) {
            return res.status(error.status).json({
                message: error.message,
            });
        }

        next(error);
    } finally {
        client?.release();
    }
});



router.post("/:id/end", async (req, res, next) => {
    try {
        await pool.query(
            `UPDATE game_sessions
   SET status = 'ended',
       controller_session_hash = NULL
   WHERE id = $1
     AND controller_session_hash = $2
     AND status IN ('setup', 'ready')`,
            [req.gameSession.id, hash(req.sessionID)]
        );

        delete req.session.gameSessionId;
        await saveSession(req);

        res.json({
            message: "Game session ended",
        });
    } catch (error) {
        next(error);
    }
});

function validTemplateId(value) {
    return /^[1-9]\d*$/.test(value) &&
        Number.isSafeInteger(Number(value));
}

// Load an owned template for editing.
router.get("/:id/templates/:templateId", async (req, res, next) => {
    if (!validTemplateId(req.params.templateId)) {
        return res.status(400).json({ message: "Invalid template ID" });
    }

    let client;

    try {
        client = await pool.connect();
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");

        const owned = await client.query(
            `SELECT revision
       FROM game_templates
       WHERE id = $1
         AND created_by = $2`,
            [Number(req.params.templateId), req.session.userId]
        );

        if (!owned.rows[0]) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                message: "Template not found or you do not own it",
            });
        }

        const template = await loadTemplate(
            client,
            Number(req.params.templateId),
            req.gameSession.game,
            req.session.userId
        );

        await client.query("COMMIT");

        res.json({
            template: {
                ...template,
                revision: owned.rows[0].revision,
            },
        });
    } catch (error) {
        if (client) await client.query("ROLLBACK");

        if ([404, 422].includes(error.status)) {
            return res.status(error.status).json({ message: error.message });
        }

        next(error);
    } finally {
        client?.release();
    }
});

// Update an owned template.
router.put("/:id/templates/:templateId", async (req, res, next) => {
    if (!validTemplateId(req.params.templateId)) {
        return res.status(400).json({ message: "Invalid template ID" });
    }

    if (req.gameSession.status !== "setup") {
        return res.status(409).json({
            message: "Manage templates while your game is in setup",
        });
    }

    let client;

    try {
        client = await pool.connect();
        await client.query("BEGIN");

        const template = await createTemplate(
            client,
            req.body,
            req.session.userId,
            Number(req.params.templateId)
        );

        await client.query("COMMIT");

        res.json({
            message: "Template updated",
            template,
        });
    } catch (error) {
        if (client) await client.query("ROLLBACK");

        if ([404, 409, 422].includes(error.status)) {
            return res.status(error.status).json({ message: error.message });
        }

        next(error);
    } finally {
        client?.release();
    }
});

// Permanently delete an owned template.
router.delete("/:id/templates/:templateId", async (req, res, next) => {
    if (!validTemplateId(req.params.templateId)) {
        return res.status(400).json({ message: "Invalid template ID" });
    }

    if (req.gameSession.status !== "setup") {
        return res.status(409).json({
            message: "Manage templates while your game is in setup",
        });
    }

    if (!Number.isSafeInteger(req.body?.revision)) {
        return res.status(400).json({
            message: "Template revision is required",
        });
    }

    let client;

    try {
        client = await pool.connect();
        await client.query("BEGIN");

        const owned = await client.query(
            `SELECT revision
       FROM game_templates
       WHERE id = $1 AND created_by = $2
       FOR UPDATE`,
            [Number(req.params.templateId), req.session.userId]
        );

        if (!owned.rows[0]) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                message: "Template not found or you do not own it",
            });
        }

        if (owned.rows[0].revision !== req.body.revision) {
            await client.query("ROLLBACK");

            return res.status(409).json({
                message: "Template changed. Refresh the list before deleting.",
            });
        }

        const oldQuestions = await client.query(
            `SELECT tq.question_id
       FROM template_questions tq
       JOIN template_rounds r ON r.id = tq.round_id
       WHERE r.template_id = $1`,
            [Number(req.params.templateId)]
        );

        await client.query(
            "DELETE FROM game_templates WHERE id = $1",
            [Number(req.params.templateId)]
        );

        const questionIds = oldQuestions.rows.map((row) => row.question_id);

        if (questionIds.length) {
            await client.query(
                `DELETE FROM questions q
         WHERE q.id = ANY($1::int[])
           AND q.created_by = $2
           AND NOT EXISTS (
             SELECT 1
             FROM template_questions tq
             WHERE tq.question_id = q.id
           )`,
                [questionIds, req.session.userId]
            );
        }

        await client.query("COMMIT");

        res.json({ message: "Template deleted" });
    } catch (error) {
        if (client) await client.query("ROLLBACK");
        next(error);
    } finally {
        client?.release();
    }
});


router.get("/:id/play", async (req, res, next) => {
    try {
        const history = await pool.query(
            `SELECT EXISTS (
         SELECT 1
         FROM game_actions
         WHERE session_id = $1 AND undone = FALSE
       ) AS can_undo`,
            [req.gameSession.id]
        );

        res.json({
            state: req.gameSession.game_state,
            version: req.gameSession.game_version,
            canUndo: history.rows[0].can_undo,
        });
    } catch (error) {
        next(error);
    }
});

router.post("/:id/actions", async (req, res, next) => {
    const { expectedVersion, action } = req.body ?? {};

    if (
        !Number.isSafeInteger(expectedVersion) ||
        expectedVersion < 0 ||
        !action ||
        typeof action.type !== "string"
    ) {
        return res.status(400).json({
            message: "Invalid game action",
        });
    }

    let client;

    try {
        client = await pool.connect();
        await client.query("BEGIN");

        const result = await client.query(
            `SELECT gs.*
       FROM game_sessions gs
       WHERE gs.id = $1
         AND gs.facilitator_id = $2
         AND gs.controller_session_hash = $3
         AND gs.status = 'ready'
         AND gs.expires_at > NOW()
         AND EXISTS (
           SELECT 1
           FROM users u
           WHERE u.id = gs.facilitator_id
             AND u.role = 'facilitator'
             AND u.is_active = TRUE
         )
       FOR UPDATE`,
            [
                req.gameSession.id,
                req.session.userId,
                hash(req.sessionID),
            ]
        );

        const session = result.rows[0];

        if (!session || !session.template_snapshot) {
            await client.query("ROLLBACK");

            return res.status(409).json({
                message: "This session is not ready for gameplay",
            });
        }

        if (session.game_version !== expectedVersion) {
            await client.query("ROLLBACK");

            return res.status(409).json({
                message: "The game changed. The latest state has been refreshed.",
            });
        }

        let nextState;

        if (action.type === "UNDO") {
            const previous = await client.query(
                `SELECT id, state_before
         FROM game_actions
         WHERE session_id = $1 AND undone = FALSE
         ORDER BY id DESC
         LIMIT 1
         FOR UPDATE`,
                [session.id]
            );

            if (!previous.rows[0]) {
                await client.query("ROLLBACK");

                return res.status(409).json({
                    message: "Nothing to undo",
                });
            }

            nextState = previous.rows[0].state_before;

            await client.query(
                "UPDATE game_actions SET undone = TRUE WHERE id = $1",
                [previous.rows[0].id]
            );
        } else {
            nextState = applyGameAction(
                session.template_snapshot,
                session.game_state,
                action
            );

            await client.query(
                `INSERT INTO game_actions (
           session_id, action_type, state_before
         )
         VALUES ($1, $2, $3::jsonb)`,
                [
                    session.id,
                    action.type,
                    JSON.stringify(session.game_state),
                ]
            );
        }

        const updated = await client.query(
            `UPDATE game_sessions
       SET game_state = $1::jsonb,
           game_version = game_version + 1
       WHERE id = $2
       RETURNING game_version`,
            [JSON.stringify(nextState), session.id]
        );

        const history = await client.query(
            `SELECT EXISTS (
         SELECT 1
         FROM game_actions
         WHERE session_id = $1 AND undone = FALSE
       ) AS can_undo`,
            [session.id]
        );

        await client.query("COMMIT");

        res.json({
            state: nextState,
            version: updated.rows[0].game_version,
            canUndo: history.rows[0].can_undo,
        });
    } catch (error) {
        if (client) await client.query("ROLLBACK");

        if (error.status === 409) {
            return res.status(409).json({
                message: error.message,
            });
        }

        next(error);
    } finally {
        client?.release();
    }
});

export default router;