import { useEffect, useRef, useState } from "react";
import { gamePost, gameRequest } from "../api/gameSessions";
import {
  clearDraft,
  draftKey,
  readDraft,
} from "../utils/templateDrafts";

let nextKey = 0;

function newAnswer() {
  return {
    key: crypto.randomUUID(),
    text: "",
    points: 0,
  };
}

function newQuestion() {
  return {
    key: crypto.randomUUID(),
    text: "",
    answers: [newAnswer()],
  };
}

function editableQuestion(question) {
  return {
    key: crypto.randomUUID(),
    text: question.text,
    answers: question.answers.map((answer) => ({
      key: crypto.randomUUID(),
      text: answer.text,
      points: answer.points,
    })),
  };
}

function initialEditorState(userId, template) {
  const recovered = readDraft(userId, template?.templateId);

  if (recovered) {
    // Restore fresh UI keys and preserve the draft's original revision.
    return {
      ...recovered,
      regularRounds: recovered.regularRounds.map(editableQuestion),
      fastQuestions: recovered.fastQuestions.map(editableQuestion),
      recovered: true,
    };
  }

  if (template) {
    const fastRound = template.rounds.find(
      (round) => round.type === "fast_answer"
    );

    return {
      title: template.title,
      description: template.description || "",
      timerSeconds: fastRound.timerSeconds,
      revision: template.revision,
      regularRounds: template.rounds
        .filter((round) => round.type === "regular")
        .map((round) => editableQuestion(round.questions[0])),
      fastQuestions: fastRound.questions.map(editableQuestion),
      recovered: false,
    };
  }

  return {
    title: "",
    description: "",
    timerSeconds: 20,
    revision: null,
    regularRounds: Array.from({ length: 6 }, () => newQuestion()),
    fastQuestions: [newQuestion()],
    recovered: false,
  };
}

function QuestionFields({ question, onChange, singleAnswer = false }) {
  function updateAnswer(index, field, value) {
    onChange({
      ...question,
      answers: question.answers.map((answer, answerIndex) =>
        answerIndex === index
          ? { ...answer, [field]: value }
          : answer
      ),
    });
  }

  return (
    <>
      <label>
        Question
        <textarea
          required
          maxLength={500}
          value={question.text}
          onChange={(event) =>
            onChange({ ...question, text: event.target.value })
          }
        />
      </label>

      <p className="text-muted">
        {singleAnswer
          ? "Enter one expected answer."
          : "List answers in rank order, highest first."}
      </p>

      {question.answers.map((answer, index) => (
        <div className="template-answer-row" key={answer.key}>
          <label>
            {singleAnswer ? "Expected answer" : `Answer ${index + 1}`}
            <input
              required
              maxLength={200}
              value={answer.text}
              onChange={(event) =>
                updateAnswer(index, "text", event.target.value)
              }
            />
          </label>

          <label>
            Points
            <input
              type="number"
              required
              min={0}
              max={2147483647}
              step={1}
              value={answer.points}
              onChange={(event) =>
                updateAnswer(index, "points", event.target.value)
              }
            />
          </label>

          {!singleAnswer && (
            <button
              type="button"
              className="btn-secondary"
              disabled={question.answers.length === 1}
              aria-label={`Remove answer ${index + 1}`}
              onClick={() =>
                onChange({
                  ...question,
                  answers: question.answers.filter(
                    (_, answerIndex) => answerIndex !== index
                  ),
                })
              }
            >
              Remove
            </button>
          )}
        </div>
      ))}

      {!singleAnswer && (
        <button
          type="button"
          className="btn-secondary"
          onClick={() =>
            onChange({
              ...question,
              answers: [...question.answers, newAnswer()],
            })
          }
        >
          + Add answer
        </button>
      )}
    </>
  );
}

export default function TemplateEditor({
  sessionId,
  userId,
  initialTemplate = null,
  onCreated,
  onCancel,
}) {
  const templateId = initialTemplate?.templateId ?? null;

  const [initial] = useState(() =>
    initialEditorState(userId, initialTemplate)
  );

  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [timerSeconds, setTimerSeconds] = useState(initial.timerSeconds);
  const [regularRounds, setRegularRounds] = useState(initial.regularRounds);
  const [fastQuestions, setFastQuestions] = useState(initial.fastQuestions);
  const [revision] = useState(initial.revision);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [draftStatus, setDraftStatus] = useState(
    initial.recovered ? "Recovered your unsaved draft." : ""
  );

  const finished = useRef(false);

  useEffect(() => {
    if (finished.current) return;

    try {
      localStorage.setItem(
        draftKey(userId, templateId),
        JSON.stringify({
          version: 1,
          title,
          description,
          timerSeconds,
          regularRounds,
          fastQuestions,
          revision,
          savedAt: new Date().toISOString(),
        })
      );

      setDraftStatus(
        initial.recovered
          ? "Recovered draft. Changes are saved on this device."
          : "Draft saved on this device."
      );
    } catch {
      setDraftStatus(
        "Draft recovery is unavailable: browser storage could not be written."
      );
    }
  }, [
    userId,
    templateId,
    title,
    description,
    timerSeconds,
    regularRounds,
    fastQuestions,
    revision,
    initial.recovered,
  ]);

  // Keep updateQuestion(), serialize(), and the form JSX below.

  function updateQuestion(setter, index, value) {
    setter((questions) =>
      questions.map((question, questionIndex) =>
        questionIndex === index ? value : question
      )
    );
  }

  function serialize(question) {
    return {
      text: question.text,
      answers: question.answers.map((answer) => ({
        text: answer.text,
        points: Number(answer.points),
      })),
    };
  }

  async function handleSave(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    const body = {
      title,
      description,
      timerSeconds: Number(timerSeconds),
      regularRounds: regularRounds.map(serialize),
      fastQuestions: fastQuestions.map(serialize),
      revision,
    };

    try {
      const data = templateId
        ? await gameRequest(
          `/${sessionId}/templates/${templateId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        )
        : await gamePost(`/${sessionId}/templates`, body);

      finished.current = true;
      clearDraft(userId, templateId);
      onCreated(data.template);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="template-editor" onSubmit={handleSave}>
      <h3>{templateId ? "Edit game pack" : "Create your game pack"}</h3>

      <p className="text-muted" role="status">
        {draftStatus}
      </p>

      {message && <p role="alert">{message}</p>}

      <fieldset disabled={busy}>
        <label>
          Template name
          <input
            required
            maxLength={150}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <label>
          Description
          <textarea
            maxLength={1000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>

        <h3>Regular rounds</h3>

        {regularRounds.map((question, index) => (
          <section className="template-editor-section" key={question.key}>
            <div className="template-editor-heading">
              <h4>Round {index + 1}</h4>

              <button
                type="button"
                className="btn-secondary"
                disabled={regularRounds.length === 1}
                onClick={() =>
                  setRegularRounds((rounds) =>
                    rounds.filter((_, roundIndex) => roundIndex !== index)
                  )
                }
              >
                Remove round
              </button>
            </div>

            <QuestionFields
              question={question}
              onChange={(value) =>
                updateQuestion(setRegularRounds, index, value)
              }
            />
          </section>
        ))}

        <button
          type="button"
          className="btn-secondary"
          onClick={() =>
            setRegularRounds((rounds) => [...rounds, newQuestion()])
          }
        >
          + Add regular round
        </button>

        <h3>Fast Answer round</h3>

        <label>
          Seconds per player
          <input
            type="number"
            required
            min={1}
            max={2147483647}
            step={1}
            value={timerSeconds}
            onChange={(event) => setTimerSeconds(event.target.value)}
          />
        </label>

        {fastQuestions.map((question, index) => (
          <section className="template-editor-section" key={question.key}>
            <div className="template-editor-heading">
              <h4>Question {index + 1}</h4>

              <button
                type="button"
                className="btn-secondary"
                disabled={fastQuestions.length === 1}
                onClick={() =>
                  setFastQuestions((questions) =>
                    questions.filter(
                      (_, questionIndex) => questionIndex !== index
                    )
                  )
                }
              >
                Remove question
              </button>
            </div>

            <QuestionFields
              question={question}
              singleAnswer
              onChange={(value) =>
                updateQuestion(setFastQuestions, index, value)
              }
            />
          </section>
        ))}

        <button
          type="button"
          className="btn-secondary"
          onClick={() =>
            setFastQuestions((questions) => [
              ...questions,
              newQuestion(),
            ])
          }
        >
          + Add Fast Answer question
        </button>

        <div className="template-editor-actions">
          <button type="submit">
            {busy
              ? "Saving…"
              : templateId
                ? "Save changes"
                : "Save template"}
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
          >
            Back — keep draft
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              if (!window.confirm("Discard this unsaved draft?")) return;

              const removed = clearDraft(userId, templateId);

              if (!removed) {
                setMessage("Could not remove the draft from browser storage.");
                return;
              }

              finished.current = true;
              onCancel();
            }}
          >
            Discard draft
          </button>
        </div>
      </fieldset>
    </form>
  );
}