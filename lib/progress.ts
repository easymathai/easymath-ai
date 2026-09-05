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

export const DASHBOARD_TOPIC_IDS = [
  "arithmetic",
  "algebra",
  "fractions",
  "percentages",
  "geometry",
  "equations",
  "mixed",
] as const;

export type DashboardTopicId = (typeof DASHBOARD_TOPIC_IDS)[number];

export type CloudDashboardTopicStat = {
  attempted: number;
  correct: number;
};

export type CloudDashboardStats = {
  streakCount: number;
  streakDate: string;
  topics: Partial<Record<DashboardTopicId, CloudDashboardTopicStat>>;
};

export const TOPIC_RANK_MIN_ATTEMPTS = 3;

export type CloudProgress = {
  studentLevel: string;
  practiceTopic: string;
  questionsSolved: number;
  practiceAttempted: number;
  practiceCorrect: number;
  activity: CloudActivityItem[];
  practiceProgress: CloudPracticeProgress;
  solverHistory: CloudSolverHistoryItem[];
  dashboardStats: CloudDashboardStats;
};

const DASHBOARD_TOPIC_SET = new Set<string>(DASHBOARD_TOPIC_IDS);
const UTC_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function safeCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

export function emptyDashboardStats(): CloudDashboardStats {
  return {
    streakCount: 0,
    streakDate: "",
    topics: {},
  };
}

export function normalizeDashboardStats(input: unknown): CloudDashboardStats {
  const row =
    input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  const topicsIn =
    row.topics && typeof row.topics === "object"
      ? (row.topics as Record<string, unknown>)
      : {};

  const topics: CloudDashboardStats["topics"] = {};

  for (const id of DASHBOARD_TOPIC_IDS) {
    const raw = topicsIn[id];

    if (!raw || typeof raw !== "object") {
      continue;
    }

    const stat = raw as Record<string, unknown>;
    const attempted = safeCount(stat.attempted);
    const correct = Math.min(attempted, safeCount(stat.correct));

    if (attempted === 0 && correct === 0) {
      continue;
    }

    topics[id] = { attempted, correct };
  }

  const streakDate =
    typeof row.streakDate === "string" && UTC_DATE_PATTERN.test(row.streakDate)
      ? row.streakDate
      : "";
  const streakCount = safeCount(row.streakCount);

  return {
    streakCount: streakDate ? streakCount : 0,
    streakDate,
    topics,
  };
}

function utcDayDiff(fromDate: string, toDate: string): number | null {
  if (!UTC_DATE_PATTERN.test(fromDate) || !UTC_DATE_PATTERN.test(toDate)) {
    return null;
  }

  const from = Date.parse(`${fromDate}T00:00:00.000Z`);
  const to = Date.parse(`${toDate}T00:00:00.000Z`);

  if (Number.isNaN(from) || Number.isNaN(to)) {
    return null;
  }

  return Math.round((to - from) / 86_400_000);
}

/** Apply a UTC-day streak touch. Same day is a no-op; next day +1; any gap resets to 1. */
export function applyDashboardStreak(
  current: CloudDashboardStats,
  utcDate: string
): CloudDashboardStats {
  const normalized = normalizeDashboardStats(current);

  if (!UTC_DATE_PATTERN.test(utcDate)) {
    return normalized;
  }

  if (normalized.streakDate === utcDate) {
    return normalized;
  }

  const diff = utcDayDiff(normalized.streakDate, utcDate);
  const nextCount = diff === 1 ? normalized.streakCount + 1 : 1;

  return {
    ...normalized,
    streakCount: nextCount,
    streakDate: utcDate,
  };
}

export function recordDashboardTopicAttempt(
  current: CloudDashboardStats,
  topic: string,
  extra: { attemptedDelta?: number; correctDelta?: number }
): CloudDashboardStats {
  const normalized = normalizeDashboardStats(current);

  if (!DASHBOARD_TOPIC_SET.has(topic)) {
    return normalized;
  }

  const topicId = topic as DashboardTopicId;
  const attemptedDelta = safeCount(extra.attemptedDelta);
  const correctDelta = safeCount(extra.correctDelta);

  if (attemptedDelta === 0 && correctDelta === 0) {
    return normalized;
  }

  const previous = normalized.topics[topicId] || { attempted: 0, correct: 0 };
  const attempted = previous.attempted + attemptedDelta;
  const correct = Math.min(attempted, previous.correct + correctDelta);

  return {
    ...normalized,
    topics: {
      ...normalized.topics,
      [topicId]: { attempted, correct },
    },
  };
}

export function isDashboardStatsEmpty(stats: CloudDashboardStats): boolean {
  const normalized = normalizeDashboardStats(stats);
  return (
    normalized.streakCount === 0 && Object.keys(normalized.topics).length === 0
  );
}

export function rankDashboardTopics(
  stats: CloudDashboardStats
): { strongest: DashboardTopicId | null; weakest: DashboardTopicId | null } {
  const normalized = normalizeDashboardStats(stats);
  const ranked = DASHBOARD_TOPIC_IDS.filter((id) => id !== "mixed")
    .map((id) => {
      const stat = normalized.topics[id];
      return {
        id,
        attempted: stat?.attempted || 0,
        correct: stat?.correct || 0,
      };
    })
    .filter((item) => item.attempted >= TOPIC_RANK_MIN_ATTEMPTS)
    .map((item) => ({
      ...item,
      accuracy: item.correct / item.attempted,
    }));

  if (ranked.length === 0) {
    return { strongest: null, weakest: null };
  }

  const strongest = [...ranked].sort((a, b) => {
    if (b.accuracy !== a.accuracy) {
      return b.accuracy - a.accuracy;
    }

    if (b.attempted !== a.attempted) {
      return b.attempted - a.attempted;
    }

    return a.id.localeCompare(b.id);
  })[0];

  const weakest = [...ranked].sort((a, b) => {
    if (a.accuracy !== b.accuracy) {
      return a.accuracy - b.accuracy;
    }

    if (b.attempted !== a.attempted) {
      return b.attempted - a.attempted;
    }

    return a.id.localeCompare(b.id);
  })[0];

  return {
    strongest: strongest?.id ?? null,
    weakest: weakest?.id ?? null,
  };
}

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
    dashboardStats: normalizeDashboardStats(
      row.dashboard_stats ?? row.dashboardStats
    ),
  };
}
