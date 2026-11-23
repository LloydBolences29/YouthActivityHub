export function draftKey(userId, templateId = null) {
  return `template-draft:v1:${userId}:${templateId ?? "new"}`;
}

export function readDraft(userId, templateId = null) {
  try {
    const raw = localStorage.getItem(draftKey(userId, templateId));

    if (!raw) return null;

    const draft = JSON.parse(raw);

    if (
      draft.version !== 1 ||
      typeof draft.title !== "string" ||
      !Array.isArray(draft.regularRounds) ||
      !draft.regularRounds.length ||
      !Array.isArray(draft.fastQuestions) ||
      !draft.fastQuestions.length
    ) {
      return null;
    }

    const questions = [
      ...draft.regularRounds,
      ...draft.fastQuestions,
    ];

    if (
      questions.some(
        (question) =>
          !question ||
          typeof question.text !== "string" ||
          !Array.isArray(question.answers) ||
          !question.answers.length ||
          question.answers.some(
            (answer) => !answer || typeof answer.text !== "string"
          )
      )
    ) {
      return null;
    }

    return draft;
  } catch {
    return null;
  }
}

export function clearDraft(userId, templateId = null) {
  try {
    localStorage.removeItem(draftKey(userId, templateId));
    return true;
  } catch {
    return false;
  }
}