function reject(message) {
  const error = new Error(message);
  error.status = 409;
  throw error;
}

export function regularRounds(template) {
  return template.rounds.filter((round) => round.type === "regular");
}

function freshRound(state, roundIndex) {
  return {
    ...state,
    roundIndex,
    phase: "awaiting_team",
    playingTeam: null,
    revealed: [],
    strikes: 0,
    multiplier: 1,
    winner: null,
  };
}

export function roundPot(template, state) {
  if (!state || state.phase === "fast_ready") return 0;

  const question = regularRounds(template)[state.roundIndex].questions[0];

  const points = question.answers
    .filter((answer) => state.revealed.includes(answer.id))
    .reduce((sum, answer) => sum + answer.points, 0);

  const total = points * state.multiplier;

  if (!Number.isSafeInteger(total)) {
    reject("Round points exceed the supported numeric range.");
  }

  return total;
}

export function applyGameAction(template, current, action) {
  if (!action || typeof action.type !== "string") {
    reject("Invalid game action.");
  }

  if (action.type === "START_GAME") {
    if (current) reject("The game has already started.");

    const names = action.teamNames;

    if (
      !Array.isArray(names) ||
      names.length !== 2 ||
      names.some(
        (name) =>
          typeof name !== "string" ||
          !name.trim() ||
          name.trim().length > 50
      ) ||
      names[0].trim().toLowerCase() === names[1].trim().toLowerCase()
    ) {
      reject("Enter two different team names, each up to 50 characters.");
    }

    return freshRound(
      {
        teams: names.map((name, id) => ({
          id,
          name: name.trim(),
          score: 0,
        })),
      },
      0
    );
  }

  if (!current) reject("Set up the teams first.");

  const state = structuredClone(current);

  if (action.type === "NEXT_ROUND") {
    if (state.phase !== "round_complete") {
      reject("Award this round before continuing.");
    }

    const nextIndex = state.roundIndex + 1;

    if (nextIndex >= regularRounds(template).length) {
      return {
        ...state,
        phase: "fast_ready",
      };
    }

    return freshRound(state, nextIndex);
  }

  if (state.phase === "fast_ready") {
    reject("Regular rounds are finished.");
  }

  if (action.type === "SET_MULTIPLIER") {
    if (
      state.phase !== "awaiting_team" ||
      ![1, 2, 3].includes(action.multiplier)
    ) {
      reject("Set a single, double, or triple multiplier before play.");
    }

    state.multiplier = action.multiplier;
    return state;
  }

  if (action.type === "SET_TEAM") {
    if (
      state.phase !== "awaiting_team" ||
      ![0, 1].includes(action.teamId)
    ) {
      reject("Select the playing team before the round begins.");
    }

    state.playingTeam = action.teamId;
    state.phase = "playing";
    return state;
  }

  const question =
    regularRounds(template)[state.roundIndex].questions[0];

  if (action.type === "REVEAL") {
    if (!["playing", "steal"].includes(state.phase)) {
      reject("Answers cannot be revealed in this phase.");
    }

    const answer = question.answers.find(
      (item) => item.id === action.answerId
    );

    if (!answer) reject("Answer does not belong to this question.");

    if (state.revealed.includes(answer.id)) {
      reject("That answer is already revealed.");
    }

    const stealing = state.phase === "steal";
    state.revealed.push(answer.id);

    if (stealing) {
      state.winner = 1 - state.playingTeam;
      state.phase = "awaiting_award";
    } else if (state.revealed.length === question.answers.length) {
      state.winner = state.playingTeam;
      state.phase = "awaiting_award";
    }

    return state;
  }

  if (action.type === "WRONG") {
    if (state.phase === "playing") {
      state.strikes += 1;

      if (state.strikes === 3) {
        state.phase = "steal";
      }

      return state;
    }

    if (state.phase === "steal") {
      state.winner = state.playingTeam;
      state.phase = "awaiting_award";
      return state;
    }

    reject("A wrong answer cannot be recorded in this phase.");
  }

  if (action.type === "AWARD") {
    if (
      state.phase !== "awaiting_award" ||
      action.teamId !== state.winner
    ) {
      reject("Select the team that won this round.");
    }

    const points = roundPot(template, state);
    const team = state.teams.find((item) => item.id === action.teamId);
    const score = team.score + points;

    if (!Number.isSafeInteger(score)) {
      reject("Team score exceeds the supported numeric range.");
    }

    team.score = score;
    state.phase = "round_complete";

    return state;
  }

  reject("Unknown game action.");
}

// Build an audience-safe response.
// Never return the template or unrevealed answer text/points here.
export function audienceBoard(template, state) {
  if (!template || !state) return null;

  if (state.phase === "fast_ready") {
    return {
      phase: state.phase,
      teams: state.teams,
    };
  }

  const rounds = regularRounds(template);
  const question = rounds[state.roundIndex].questions[0];

  return {
    phase: state.phase,
    teams: state.teams,
    roundNumber: state.roundIndex + 1,
    roundCount: rounds.length,
    playingTeam: state.playingTeam,
    winner: state.winner,
    strikes: state.strikes,
    multiplier: state.multiplier,
    pot: roundPot(template, state),
    question: question.text,

    answers: question.answers.map((answer, index) => {
      const revealed = state.revealed.includes(answer.id);

      return {
        position: index + 1,
        revealed,
        ...(revealed
          ? { text: answer.text, points: answer.points }
          : {}),
      };
    }),
  };
}