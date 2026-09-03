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

export type CloudProgress = {
  studentLevel: string;
  practiceTopic: string;
  questionsSolved: number;
  practiceAttempted: number;
  practiceCorrect: number;
  activity: CloudActivityItem[];
  practiceProgress: CloudPracticeProgress;
};

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
  };
}
