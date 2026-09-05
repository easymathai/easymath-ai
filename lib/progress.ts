export type CloudActivityItem = {
  label: string;
  at: string;
};

export type CloudPracticeProgress = {
  topic?: string;
  index?: number;
  score?: number;
  set?: string[];
  tokens?: string[];
  completed?: boolean;
};

export const SOLVER_HISTORY_LIMIT = 10;

export type CloudSolverHistorySource = "text" | "photo";

export type CloudSolverHistoryItem = {
  question: string;
  solution: string;
  at?: string;
  source?: CloudSolverHistorySource;
};

export type CloudProgress = {
  studentLevel: string;
  practiceTopic: string;
  questionsSolved: number;
  practiceAttempted: number;
  practiceCorrect: number;
  activity: CloudActivityItem[];
  practiceProgress: CloudPracticeProgress;
  solverHistory: CloudSolverHistoryItem[];
};

export function normalizeSolverHistory(input: unknown): CloudSolverHistoryItem[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const items: CloudSolverHistoryItem[] = [];

  for (const raw of input) {
    if (!raw || typeof raw !== "object") {
      continue;
    }

    const row = raw as Record<string, unknown>;
    const question = typeof row.question === "string" ? row.question.trim() : "";
    const solution = typeof row.solution === "string" ? row.solution.trim() : "";

    if (!question || !solution) {
      continue;
    }

    const item: CloudSolverHistoryItem = { question, solution };

    if (typeof row.at === "string" && row.at.trim()) {
      const parsed = Date.parse(row.at);

      if (!Number.isNaN(parsed)) {
        item.at = row.at;
      }
    }

    if (row.source === "text" || row.source === "photo") {
      item.source = row.source;
    }

    items.push(item);

    if (items.length >= SOLVER_HISTORY_LIMIT) {
      break;
    }
  }

  return items;
}

export function normalizeCloudProgress(input: unknown): CloudProgress {
  const row = (input || {}) as Record<string, unknown>;

  const activity = Array.isArray(row.activity)
    ? row.activity
        .filter(
          (item): item is CloudActivityItem =>
            Boolean(
              item &&
                typeof item === "object" &&
                typeof (item as CloudActivityItem).label === "string" &&
                typeof (item as CloudActivityItem).at === "string"
            )
        )
        .slice(0, 8)
    : [];

  const practiceProgress =
    row.practice_progress && typeof row.practice_progress === "object"
      ? (row.practice_progress as CloudPracticeProgress)
      : row.practiceProgress && typeof row.practiceProgress === "object"
        ? (row.practiceProgress as CloudPracticeProgress)
        : {};

  return {
    studentLevel:
      typeof row.student_level === "string"
        ? row.student_level
        : typeof row.studentLevel === "string"
          ? row.studentLevel
          : "middle",
    practiceTopic:
      typeof row.practice_topic === "string"
        ? row.practice_topic
        : typeof row.practiceTopic === "string"
          ? row.practiceTopic
          : "mixed",
    questionsSolved: Number(row.questions_solved ?? row.questionsSolved) || 0,
    practiceAttempted:
      Number(row.practice_attempted ?? row.practiceAttempted) || 0,
    practiceCorrect: Number(row.practice_correct ?? row.practiceCorrect) || 0,
    activity,
    practiceProgress,
    solverHistory: normalizeSolverHistory(
      row.solver_history ?? row.solverHistory
    ),
  };
}
