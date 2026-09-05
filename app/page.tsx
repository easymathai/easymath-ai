"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  authHeaders,
  cloudAccountsAvailable,
  getAccessToken,
  readAuthState,
} from "@/lib/client-auth";
import {
  DAILY_LIMIT_MESSAGE,
  FREE_DAILY_SOLVER_LIMIT,
  FREE_PLAN_NAME,
  utcUsageDate,
} from "@/lib/constants";
import {
  getPlanDisplayName,
  resolveUserPlan,
  type UserPlan,
} from "@/lib/plans";
import {
  applyDashboardStreak,
  emptyDashboardStats,
  isDashboardStatsEmpty,
  normalizeDashboardStats,
  normalizeSolverHistory,
  rankDashboardTopics,
  recordDashboardTopicAttempt,
  SOLVER_HISTORY_LIMIT,
  type CloudDashboardStats,
} from "@/lib/progress";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  canUseLocalSolver,
  consumeLocalSolver,
  getLocalUsageSnapshot,
} from "@/lib/usage-local";

type HistoryItem = {
  question: string;
  solution: string;
  at?: string;
  source?: "text" | "photo";
};

type StudentLevel = "primary" | "middle" | "high" | "advanced";

type PracticeTopic =
  | "arithmetic"
  | "algebra"
  | "fractions"
  | "percentages"
  | "geometry"
  | "equations"
  | "mixed";

type ActivityItem = {
  label: string;
  at: string;
};

type StudentStats = {
  questionsSolved: number;
  practiceAttempted: number;
  practiceCorrect: number;
  activity: ActivityItem[];
};

const STUDENT_LEVELS: { id: StudentLevel; label: string }[] = [
  { id: "primary", label: "Primary" },
  { id: "middle", label: "Middle School" },
  { id: "high", label: "High School" },
  { id: "advanced", label: "Advanced" },
];

const PRACTICE_TOPICS: { id: PracticeTopic; label: string }[] = [
  { id: "arithmetic", label: "Arithmetic" },
  { id: "algebra", label: "Algebra" },
  { id: "fractions", label: "Fractions" },
  { id: "percentages", label: "Percentages" },
  { id: "geometry", label: "Geometry" },
  { id: "equations", label: "Equations" },
  { id: "mixed", label: "Mixed" },
];

const PRACTICE_SET_SIZE = 5;

function isStudentLevel(value: string): value is StudentLevel {
  return STUDENT_LEVELS.some((level) => level.id === value);
}

function isPracticeTopic(value: string): value is PracticeTopic {
  return PRACTICE_TOPICS.some((topic) => topic.id === value);
}

function emptyStats(): StudentStats {
  return {
    questionsSolved: 0,
    practiceAttempted: 0,
    practiceCorrect: 0,
    activity: [],
  };
}

function formatActivityTime(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function studentFriendlyError(message: unknown, fallback: string): string {
  if (typeof message !== "string" || !message.trim()) {
    return fallback;
  }

  const known: Record<string, string> = {
    "Unable to read image.":
      "We couldn't read that photo. Please try a clearer picture.",
    "No image uploaded.": "Please choose a photo first.",
    "Unable to solve the question right now.":
      "We couldn't solve that yet. Please try again.",
    "No solution returned.":
      "We couldn't finish that solution. Please try again.",
    "Unable to check that answer right now.":
      "We couldn't check that answer. Please try again.",
    "Unable to create a new question right now.":
      "We couldn't create a new question. Please try again.",
    "Generate a practice question first, then try Show Solution.":
      "Generate a practice question first, then try Show Solution.",
    "This practice question isn't valid anymore. Generate a new practice question and try Show Solution again.":
      "This practice question isn't valid anymore. Generate a new practice question and try Show Solution again.",
    "Practice solutions are temporarily unavailable. Please try again later.":
      "Practice solutions are temporarily unavailable. Please try again later.",
    "Unable to read the math in this photo.":
      "We couldn't read the math in this photo. Try a clearer picture.",
    "Something went wrong.":
      "Something went wrong. Please try again.",
    [DAILY_LIMIT_MESSAGE]: DAILY_LIMIT_MESSAGE,
  };

  return known[message] || message;
}

function parseSolution(text: string) {
  const headings = [
    "FINAL ANSWER",
    "STEP-BY-STEP EXPLANATION",
    "WHY IT WORKS",
    "COMMON MISTAKE",
    "PRACTICE QUESTION",
  ];

  const result: Record<string, string> = {};

  headings.forEach((heading, index) => {
    const start = text.indexOf(heading);

    if (start === -1) return;

    const contentStart = start + heading.length;
    let contentEnd = text.length;

    for (let i = index + 1; i < headings.length; i++) {
      const nextHeading = text.indexOf(headings[i], contentStart);

      if (nextHeading !== -1) {
        contentEnd = nextHeading;
        break;
      }
    }

    result[heading] = text.slice(contentStart, contentEnd).trim();
  });

  return result;
}

function getSourceMathQuestion(question: string, solution: string): string {
  const steps = parseSolution(solution)["STEP-BY-STEP EXPLANATION"] || "";
  const match =
    steps.match(/Read from photo:\s*(.+)/i);

  if (match?.[1]) {
    return match[1].trim().split("\n")[0].trim();
  }

  return question.trim();
}

export default function Home() {
  const [question, setQuestion] = useState("");
  const [solution, setSolution] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [darkMode, setDarkMode] = useState(false);
  const [studentLevel, setStudentLevel] = useState<StudentLevel>("middle");

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [imageLoading, setImageLoading] = useState(false);

  const [practiceAnswer, setPracticeAnswer] = useState("");
  const [practiceChecking, setPracticeChecking] = useState(false);
  const [practiceFeedback, setPracticeFeedback] = useState("");
  const [practiceHint, setPracticeHint] = useState("");
  const [practiceCorrect, setPracticeCorrect] = useState<boolean | null>(null);
  const [practiceWrongAttempts, setPracticeWrongAttempts] = useState(0);
  const [practiceRevealing, setPracticeRevealing] = useState(false);
  const [practiceRevealedSolution, setPracticeRevealedSolution] = useState("");
  const [activePracticeQuestion, setActivePracticeQuestion] = useState("");
  const [practiceGenerating, setPracticeGenerating] = useState(false);
  const [practiceTopic, setPracticeTopic] = useState<PracticeTopic>("mixed");
  const [practiceSet, setPracticeSet] = useState<string[]>([]);
  const [practiceTokens, setPracticeTokens] = useState<string[]>([]);
  const [solverPracticeToken, setSolverPracticeToken] = useState("");
  const [solverPracticeQuestion, setSolverPracticeQuestion] = useState("");
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [practiceScore, setPracticeScore] = useState(0);
  const [practiceScoredCurrent, setPracticeScoredCurrent] = useState(false);
  const [practiceCountedAttempt, setPracticeCountedAttempt] = useState(false);
  const [practiceCompleted, setPracticeCompleted] = useState(false);
  const [dashboardStats, setDashboardStats] = useState<CloudDashboardStats>(
    emptyDashboardStats
  );
  const [detectedProblem, setDetectedProblem] = useState("");
  const [stats, setStats] = useState<StudentStats>(emptyStats);
  const [hasMounted, setHasMounted] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [dailyUsed, setDailyUsed] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(FREE_DAILY_SOLVER_LIMIT);
  const [userPlan, setUserPlan] = useState<UserPlan>("free");
  const [solverUnlimited, setSolverUnlimited] = useState(false);
  const [cloudEnabled] = useState(() => cloudAccountsAvailable());
  const [pricingOpen, setPricingOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const latestSolutionRef = useRef(solution);
  const latestPracticeQuestionRef = useRef("");
  const practiceRequestRef = useRef(0);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloudReadyRef = useRef(false);
  const statsRef = useRef(stats);
  const historyRef = useRef(history);
  const dashboardStatsRef = useRef(dashboardStats);
  const levelRef = useRef(studentLevel);
  const topicRef = useRef(practiceTopic);
  const practiceSyncRef = useRef({
    topic: practiceTopic,
    index: practiceIndex,
    score: practiceScore,
    set: practiceSet,
    tokens: practiceTokens,
    completed: practiceCompleted,
  });
  latestSolutionRef.current = solution;
  statsRef.current = stats;
  historyRef.current = history;
  dashboardStatsRef.current = dashboardStats;
  levelRef.current = studentLevel;
  topicRef.current = practiceTopic;
  practiceSyncRef.current = {
    topic: practiceTopic,
    index: practiceIndex,
    score: practiceScore,
    set: practiceSet,
    tokens: practiceTokens,
    completed: practiceCompleted,
  };

  const examples = [
    "25 + 15",
    "50 × 12",
    "100 ÷ 4",
    "√144",
    "25% of 200",
    "x - 3 = 7",
  ];

  useEffect(() => {
    setHasMounted(true);

    const savedHistory = localStorage.getItem("easymath-history");

    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch {
        setHistory([]);
      }
    }

    const savedTheme = localStorage.getItem("easymath-theme");

    if (savedTheme === "dark") {
      setDarkMode(true);
    }

    const savedLevel = localStorage.getItem("easymath-level");

    if (savedLevel && isStudentLevel(savedLevel)) {
      setStudentLevel(savedLevel);
    }

    const savedTopic = localStorage.getItem("easymath-topic");

    if (savedTopic && isPracticeTopic(savedTopic)) {
      setPracticeTopic(savedTopic);
    }

    const savedStats = localStorage.getItem("easymath-stats");

    if (savedStats) {
      try {
        const parsed = JSON.parse(savedStats) as StudentStats;
        setStats({
          questionsSolved: Number(parsed.questionsSolved) || 0,
          practiceAttempted: Number(parsed.practiceAttempted) || 0,
          practiceCorrect: Number(parsed.practiceCorrect) || 0,
          activity: Array.isArray(parsed.activity) ? parsed.activity.slice(0, 8) : [],
        });
      } catch {
        setStats(emptyStats());
      }
    }

    try {
      const savedDashboard = localStorage.getItem("easymath-dashboard-stats");

      if (savedDashboard) {
        const next = normalizeDashboardStats(JSON.parse(savedDashboard));
        dashboardStatsRef.current = next;
        setDashboardStats(next);
      }
    } catch {
      // ignore
    }

    if (!cloudAccountsAvailable()) {
      const localUsage = getLocalUsageSnapshot();
      setDailyUsed(localUsage.used);
      setDailyLimit(localUsage.limit);
    }
  }, []);

  useEffect(() => {
    if (!cloudEnabled) {
      return;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      return;
    }

    let active = true;

    async function hydrateAuth() {
      const state = await readAuthState();

      if (!active) {
        return;
      }

      if (state.user?.email) {
        setSignedIn(true);
        setUserEmail(state.user.email);
        await loadCloudProfileAndUsage();
      } else {
        setSignedIn(false);
        setUserEmail(null);
        setUserPlan("free");
        setSolverUnlimited(false);
        cloudReadyRef.current = false;
        await loadGuestUsage();
      }
    }

    void hydrateAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) {
        return;
      }

      if (session?.user?.email) {
        setSignedIn(true);
        setUserEmail(session.user.email);
        void loadCloudProfileAndUsage();
      } else {
        setSignedIn(false);
        setUserEmail(null);
        setUserPlan("free");
        setSolverUnlimited(false);
        cloudReadyRef.current = false;
        void loadGuestUsage();
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [cloudEnabled]);

  useEffect(() => {
    if (!signedIn || !cloudReadyRef.current) {
      return;
    }

    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }

    syncTimerRef.current = setTimeout(() => {
      void pushCloudProgress();
    }, 700);

    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }
    };
  }, [
    signedIn,
    stats,
    studentLevel,
    practiceTopic,
    practiceIndex,
    practiceScore,
    practiceSet,
    practiceTokens,
    practiceCompleted,
    history,
    dashboardStats,
  ]);

  useEffect(() => {
    practiceRequestRef.current += 1;
    setPracticeAnswer("");
    setPracticeChecking(false);
    setPracticeFeedback("");
    setPracticeHint("");
    setPracticeCorrect(null);
    setPracticeWrongAttempts(0);
    setPracticeRevealing(false);
    setPracticeRevealedSolution("");
    setActivePracticeQuestion("");
    setPracticeGenerating(false);
    setPracticeSet([]);
    setPracticeTokens([]);
    setPracticeIndex(0);
    setPracticeScore(0);
    setPracticeScoredCurrent(false);
    setPracticeCountedAttempt(false);
    setPracticeCompleted(false);
  }, [solution]);

  function saveHistory(items: HistoryItem[]) {
    setHistory(items);
    localStorage.setItem("easymath-history", JSON.stringify(items));
  }

  function toggleTheme() {
    const nextTheme = !darkMode;

    setDarkMode(nextTheme);

    localStorage.setItem(
      "easymath-theme",
      nextTheme ? "dark" : "light"
    );
  }

  function selectStudentLevel(level: StudentLevel) {
    setStudentLevel(level);
    localStorage.setItem("easymath-level", level);
  }

  function selectPracticeTopic(topic: PracticeTopic) {
    setPracticeTopic(topic);
    try {
      localStorage.setItem("easymath-topic", topic);
    } catch {
      // Safari private mode may block storage.
    }
  }

  function recordActivity(
    label: string,
    extra?: {
      questionsSolvedDelta?: number;
      practiceAttemptedDelta?: number;
      practiceCorrectDelta?: number;
    }
  ) {
    setStats((prev) => {
      const next: StudentStats = {
        questionsSolved:
          prev.questionsSolved + (extra?.questionsSolvedDelta ?? 0),
        practiceAttempted:
          prev.practiceAttempted + (extra?.practiceAttemptedDelta ?? 0),
        practiceCorrect:
          prev.practiceCorrect + (extra?.practiceCorrectDelta ?? 0),
        activity: [
          { label, at: new Date().toISOString() },
          ...prev.activity,
        ].slice(0, 8),
      };

      try {
        localStorage.setItem("easymath-stats", JSON.stringify(next));
      } catch {
        // Safari private mode may block storage.
      }
      return next;
    });
  }

  function persistDashboardStats(next: CloudDashboardStats) {
    const normalized = normalizeDashboardStats(next);
    dashboardStatsRef.current = normalized;
    setDashboardStats(normalized);

    try {
      localStorage.setItem(
        "easymath-dashboard-stats",
        JSON.stringify(normalized)
      );
    } catch {
      // Safari private mode may block storage.
    }
  }

  function touchDashboardStreak() {
    persistDashboardStats(
      applyDashboardStreak(dashboardStatsRef.current, utcUsageDate())
    );
  }

  function recordPracticeDashboard(extra: {
    attemptedDelta?: number;
    correctDelta?: number;
  }) {
    persistDashboardStats(
      applyDashboardStreak(
        recordDashboardTopicAttempt(
          dashboardStatsRef.current,
          topicRef.current,
          extra
        ),
        utcUsageDate()
      )
    );
  }

  async function loadGuestUsage() {
    if (!cloudAccountsAvailable()) {
      const localUsage = getLocalUsageSnapshot();
      setDailyUsed(localUsage.used);
      setDailyLimit(localUsage.limit);
      setUserPlan("free");
      setSolverUnlimited(false);
      return;
    }

    try {
      const usageRes = await fetch("/api/usage");

      if (!usageRes.ok) {
        return;
      }

      const usage = await usageRes.json();
      setUserPlan("free");
      setSolverUnlimited(false);
      setDailyUsed(Number(usage.used) || 0);
      setDailyLimit(Number(usage.limit) || FREE_DAILY_SOLVER_LIMIT);
    } catch (error) {
      console.error("loadGuestUsage error:", error);
    }
  }

  async function loadCloudProfileAndUsage() {
    const token = await getAccessToken();

    if (!token) {
      return;
    }

    try {
      const [progressRes, usageRes] = await Promise.all([
        fetch("/api/progress", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/usage", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (progressRes.ok) {
        const data = await progressRes.json();
        const progress = data.progress;

        if (progress) {
          const cloudHistory = normalizeSolverHistory(progress.solverHistory);

          if (cloudHistory.length > 0) {
            historyRef.current = cloudHistory;
            setHistory(cloudHistory);
            try {
              localStorage.setItem(
                "easymath-history",
                JSON.stringify(cloudHistory)
              );
            } catch {
              // Safari private mode may block storage.
            }
          }

          const shouldSeedHistory =
            cloudHistory.length === 0 &&
            normalizeSolverHistory(historyRef.current).length > 0;

          const cloudDashboard = normalizeDashboardStats(
            progress.dashboardStats
          );
          const cloudEmpty =
            Number(progress.questionsSolved) === 0 &&
            Number(progress.practiceAttempted) === 0 &&
            (!Array.isArray(progress.activity) ||
              progress.activity.length === 0) &&
            isDashboardStatsEmpty(cloudDashboard);

          const local = statsRef.current;
          const localHasData =
            local.questionsSolved > 0 ||
            local.practiceAttempted > 0 ||
            local.activity.length > 0 ||
            !isDashboardStatsEmpty(dashboardStatsRef.current);

          if (cloudEmpty && localHasData) {
            cloudReadyRef.current = true;
            await pushCloudProgress();
          } else {
            if (isStudentLevel(progress.studentLevel)) {
              setStudentLevel(progress.studentLevel);
              localStorage.setItem("easymath-level", progress.studentLevel);
            }

            if (isPracticeTopic(progress.practiceTopic)) {
              setPracticeTopic(progress.practiceTopic);
              try {
                localStorage.setItem("easymath-topic", progress.practiceTopic);
              } catch {
                // ignore
              }
            }

            const nextStats: StudentStats = {
              questionsSolved: Number(progress.questionsSolved) || 0,
              practiceAttempted: Number(progress.practiceAttempted) || 0,
              practiceCorrect: Number(progress.practiceCorrect) || 0,
              activity: Array.isArray(progress.activity)
                ? progress.activity.slice(0, 8)
                : [],
            };

            setStats(nextStats);

            try {
              localStorage.setItem("easymath-stats", JSON.stringify(nextStats));
            } catch {
              // ignore
            }

            const pp = progress.practiceProgress || {};

            if (Array.isArray(pp.set) && pp.set.length > 0) {
              const restoredSet: string[] = pp.set.filter(
                (item: unknown): item is string => typeof item === "string"
              );
              const restoredTokenSource = Array.isArray(pp.tokens)
                ? pp.tokens
                : [];
              const restoredTokens: string[] = restoredSet.map(
                (_question: string, index: number) =>
                  typeof restoredTokenSource[index] === "string"
                    ? restoredTokenSource[index]
                    : ""
              );

              setPracticeSet(restoredSet);
              setPracticeTokens(restoredTokens);
              setPracticeIndex(Number(pp.index) || 0);
              setPracticeScore(Number(pp.score) || 0);
              setPracticeCompleted(Boolean(pp.completed));
            }
          }

            if (!isDashboardStatsEmpty(cloudDashboard)) {
              persistDashboardStats(cloudDashboard);
            }

            if (shouldSeedHistory && cloudEmpty && !localHasData) {
            cloudReadyRef.current = true;
            await pushCloudProgress();
          }
        }

        if (typeof data.email === "string" && data.email) {
          setUserEmail(data.email);
        }
      }

      if (usageRes.ok) {
        const usage = await usageRes.json();
        const plan = resolveUserPlan(usage.plan);
        setUserPlan(plan);

        if (usage.unlimited || usage.limit === null) {
          setSolverUnlimited(true);
          setDailyUsed(Number(usage.used) || 0);
          setDailyLimit(FREE_DAILY_SOLVER_LIMIT);
        } else {
          setSolverUnlimited(false);
          setDailyUsed(Number(usage.used) || 0);
          setDailyLimit(Number(usage.limit) || FREE_DAILY_SOLVER_LIMIT);
        }
      }

      cloudReadyRef.current = true;
    } catch (error) {
      console.error("loadCloudProfileAndUsage error:", error);
      cloudReadyRef.current = true;
    }
  }

  async function pushCloudProgress() {
    const token = await getAccessToken();

    if (!token || !cloudReadyRef.current) {
      return;
    }

    const practice = practiceSyncRef.current;

    try {
      await fetch("/api/progress", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          studentLevel: levelRef.current,
          practiceTopic: topicRef.current,
          questionsSolved: statsRef.current.questionsSolved,
          practiceAttempted: statsRef.current.practiceAttempted,
          practiceCorrect: statsRef.current.practiceCorrect,
          activity: statsRef.current.activity,
          solverHistory: normalizeSolverHistory(historyRef.current),
          dashboardStats: normalizeDashboardStats(dashboardStatsRef.current),
          practiceProgress: {
            topic: practice.topic,
            index: practice.index,
            score: practice.score,
            set: practice.set,
            tokens: practice.tokens,
            completed: practice.completed,
          },
        }),
      });
    } catch (error) {
      console.error("pushCloudProgress error:", error);
    }
  }

  async function handleAuthSubmit() {
    if (!cloudEnabled) {
      setAuthMessage(
        "Cloud accounts are not set up yet. Add your Supabase environment variables to enable sign up and login."
      );
      return;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setAuthMessage(
        "Cloud accounts are not set up yet. Add your Supabase environment variables first."
      );
      return;
    }

    const email = authEmail.trim();
    const password = authPassword;

    if (!email || !password) {
      setAuthMessage("Please enter your email and password.");
      return;
    }

    if (password.length < 6) {
      setAuthMessage("Please use a password with at least 6 characters.");
      return;
    }

    setAuthBusy(true);
    setAuthMessage("");

    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) {
          setAuthMessage(error.message);
          return;
        }

        if (data.session) {
          setAuthModalOpen(false);
          setAuthPassword("");
          setAuthMessage("");
          setAccountOpen(true);
        } else {
          setAuthMessage(
            "Account created. Check your email to confirm your address if confirmation is enabled, then log in."
          );
          setAuthMode("login");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setAuthMessage(error.message);
          return;
        }

        setAuthModalOpen(false);
        setAuthPassword("");
        setAuthMessage("");
        setAccountOpen(true);
      }
    } catch {
      setAuthMessage("Unable to reach the account service. Please try again.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleLogout() {
    const supabase = getSupabaseBrowserClient();

    if (supabase) {
      await supabase.auth.signOut();
    }

    setSignedIn(false);
    setUserEmail(null);
    setAccountOpen(false);
    setUserPlan("free");
    setSolverUnlimited(false);
    cloudReadyRef.current = false;

    void loadGuestUsage();
  }

  function applyUsageFromResponse(data: {
    usage?: { used?: number; limit?: number | null } | null;
  }) {
    if (!data.usage || typeof data.usage.used !== "number") {
      return;
    }

    if (data.usage.limit === null || solverUnlimited) {
      setSolverUnlimited(true);
      setDailyUsed(data.usage.used);
      return;
    }

    setSolverUnlimited(false);
    setDailyUsed(data.usage.used);
    setDailyLimit(Number(data.usage.limit) || FREE_DAILY_SOLVER_LIMIT);
  }

  function guardSolverQuota(): boolean {
    if (signedIn && solverUnlimited) {
      return true;
    }

    if (!signedIn && !cloudEnabled) {
      if (!canUseLocalSolver()) {
        setMessage(DAILY_LIMIT_MESSAGE);
        const snap = getLocalUsageSnapshot();
        setDailyUsed(snap.used);
        setDailyLimit(snap.limit);
        return false;
      }

      return true;
    }

    if (dailyUsed >= dailyLimit) {
      setMessage(DAILY_LIMIT_MESSAGE);
      return false;
    }

    return true;
  }

  async function solveQuestion(customQuestion?: string) {
    const finalQuestion = customQuestion ?? question;

    if (!finalQuestion.trim()) {
      setMessage("Please enter a math question.");
      return;
    }

    if (loading || imageLoading) {
      return;
    }

    if (!guardSolverQuota()) {
      return;
    }

    setQuestion(finalQuestion);
    setLoading(true);
    setSolution("");
    setSolverPracticeToken("");
    setSolverPracticeQuestion("");
    setMessage("");
    setDetectedProblem("");

    try {
      const headers = await authHeaders({
        "Content-Type": "application/json",
      });

      const response = await fetch("/api/solve", {
        method: "POST",
        headers,
        body: JSON.stringify({
          question: finalQuestion,
          level: studentLevel,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          setMessage(
            studentFriendlyError(data.error, DAILY_LIMIT_MESSAGE)
          );
          if (data.usage) {
            applyUsageFromResponse(data);
          } else {
            setDailyUsed(dailyLimit);
          }
          setSolution("");
          return;
        }

        setSolution(
          studentFriendlyError(
            data.error,
            "We couldn't solve that yet. Please try again."
          )
        );
        return;
      }

      if (signedIn || cloudEnabled) {
        applyUsageFromResponse(data);
      } else {
        const consumed = consumeLocalSolver();
        setDailyUsed(consumed.used);
        setDailyLimit(consumed.limit);
      }

      const result = data.solution || "No solution returned.";

      setSolverPracticeToken(
        typeof data.practiceToken === "string" ? data.practiceToken.trim() : ""
      );
      setSolverPracticeQuestion(
        typeof data.practiceQuestion === "string"
          ? data.practiceQuestion.trim()
          : ""
      );
      setSolution(result);

      recordActivity(`Solved: ${finalQuestion}`, {
        questionsSolvedDelta: 1,
      });
      touchDashboardStreak();

      const updatedHistory = [
        {
          question: finalQuestion,
          solution: result,
          at: new Date().toISOString(),
          source: "text" as const,
        },
        ...history.filter(
          (item) => item.question !== finalQuestion
        ),
      ].slice(0, SOLVER_HISTORY_LIMIT);

      saveHistory(updatedHistory);
    } catch {
      setSolution("We couldn't reach EasyMath AI. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (
      file.type &&
      !file.type.startsWith("image/") &&
      !file.type.toLowerCase().includes("heic") &&
      !file.type.toLowerCase().includes("heif")
    ) {
      setMessage("Please select an image file.");
      return;
    }

    const name = file.name.toLowerCase();

    if (
      !file.type &&
      !name.endsWith(".heic") &&
      !name.endsWith(".heif") &&
      !name.endsWith(".hif") &&
      !name.endsWith(".jpg") &&
      !name.endsWith(".jpeg") &&
      !name.endsWith(".png") &&
      !name.endsWith(".gif") &&
      !name.endsWith(".webp")
    ) {
      setMessage("Please select an image file.");
      return;
    }

    setImageFile(file);
    setSolution("");
    setMessage("");
    setDetectedProblem("");

    const preview = URL.createObjectURL(file);
    setImagePreview(preview);
  }

  async function solveImage() {
    if (!imageFile) {
      setMessage("Please choose a photo first.");
      return;
    }

    if (imageLoading || loading) {
      return;
    }

    if (!guardSolverQuota()) {
      return;
    }

    setImageLoading(true);
    setSolution("");
    setSolverPracticeToken("");
    setSolverPracticeQuestion("");
    setMessage("");
    setDetectedProblem("");
    setQuestion("Math problem from uploaded photo");

    try {
      const formData = new FormData();
      formData.append("image", imageFile);
      formData.append("level", studentLevel);

      const headers = await authHeaders();

      const response = await fetch("/api/solve-image", {
        method: "POST",
        headers,
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          setMessage(
            studentFriendlyError(data.error, DAILY_LIMIT_MESSAGE)
          );
          if (data.usage) {
            applyUsageFromResponse(data);
          } else {
            setDailyUsed(dailyLimit);
          }
          setSolution("");
          return;
        }

        setSolution(
          studentFriendlyError(
            data.error,
            "We couldn't read that photo. Please try a clearer picture."
          )
        );
        return;
      }

      if (signedIn || cloudEnabled) {
        applyUsageFromResponse(data);
      } else {
        const consumed = consumeLocalSolver();
        setDailyUsed(consumed.used);
        setDailyLimit(consumed.limit);
      }

      const result =
        data.solution || "No solution returned.";

      setSolverPracticeToken(
        typeof data.practiceToken === "string" ? data.practiceToken.trim() : ""
      );
      setSolverPracticeQuestion(
        typeof data.practiceQuestion === "string"
          ? data.practiceQuestion.trim()
          : ""
      );
      setSolution(result);

      const fromApi =
        typeof data.transcription === "string"
          ? data.transcription.trim()
          : "";

      setDetectedProblem(
        fromApi ||
          getSourceMathQuestion(
            "Math problem from uploaded photo",
            result
          )
      );

      recordActivity("Solved a photo problem", {
        questionsSolvedDelta: 1,
      });
      touchDashboardStreak();

      const updatedHistory = [
        {
          question: "📷 Math problem from photo",
          solution: result,
          at: new Date().toISOString(),
          source: "photo" as const,
        },
        ...history,
      ].slice(0, SOLVER_HISTORY_LIMIT);

      saveHistory(updatedHistory);
    } catch {
      setSolution(
        "We couldn't reach the photo solver. Please check your connection and try again."
      );
    } finally {
      setImageLoading(false);
    }
  }

  async function checkPracticeAnswer() {
    if (!practiceQuestion.trim() || practiceChecking) {
      return;
    }

    if (practiceGenerating || practiceRevealing) {
      return;
    }

    if (!practiceAnswer.trim()) {
      setPracticeCorrect(null);
      setPracticeHint("");
      setPracticeFeedback("Please enter an answer to check.");
      return;
    }

    if (practiceRevealing) {
      return;
    }

    setPracticeChecking(true);
    setPracticeFeedback("");
    setPracticeHint("");
    setPracticeCorrect(null);

    const solutionWhenChecked = solution;
    const practiceWhenChecked = practiceQuestion;

    try {
      const response = await fetch("/api/check-practice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          practiceQuestion,
          studentAnswer: practiceAnswer,
          level: studentLevel,
        }),
      });

      const data = await response.json();

      if (
        latestSolutionRef.current !== solutionWhenChecked ||
        latestPracticeQuestionRef.current !== practiceWhenChecked
      ) {
        return;
      }

      if (!response.ok) {
        setPracticeCorrect(null);
        setPracticeHint("");
        setPracticeFeedback(
          studentFriendlyError(
            data.error,
            "We couldn't check that answer. Please try again."
          )
        );
        return;
      }

      const isCorrect = Boolean(data.correct);

      setPracticeCorrect(isCorrect);
      setPracticeFeedback(
        typeof data.feedback === "string"
          ? data.feedback
          : isCorrect
            ? "Yes — that's right."
            : "Not quite."
      );
      setPracticeHint(
        isCorrect ? "" : typeof data.hint === "string" ? data.hint : ""
      );

      if (isCorrect) {
        setPracticeWrongAttempts(0);

        if (!practiceCountedAttempt) {
          setPracticeCountedAttempt(true);
        }

        if (!practiceScoredCurrent) {
          setPracticeScoredCurrent(true);
          setPracticeScore((score) => score + 1);
          recordActivity("Practice answer correct", {
            practiceAttemptedDelta: practiceCountedAttempt ? 0 : 1,
            practiceCorrectDelta: 1,
          });
          recordPracticeDashboard({
            attemptedDelta: practiceCountedAttempt ? 0 : 1,
            correctDelta: 1,
          });
        }
      } else {
        setPracticeWrongAttempts((count) => count + 1);

        if (!practiceCountedAttempt) {
          setPracticeCountedAttempt(true);
          recordActivity("Practice answer incorrect", {
            practiceAttemptedDelta: 1,
          });
          recordPracticeDashboard({
            attemptedDelta: 1,
          });
        }
      }
    } catch {
      if (
        latestSolutionRef.current !== solutionWhenChecked ||
        latestPracticeQuestionRef.current !== practiceWhenChecked
      ) {
        return;
      }

      setPracticeCorrect(null);
      setPracticeHint("");
      setPracticeFeedback(
        "We couldn't check that answer. Please try again."
      );
    } finally {
      if (
        latestSolutionRef.current === solutionWhenChecked &&
        latestPracticeQuestionRef.current === practiceWhenChecked
      ) {
        setPracticeChecking(false);
      }
    }
  }

  function formatPracticeSolution(raw: string): string {
    const parsed = parseSolution(raw);
    const finalAnswer = parsed["FINAL ANSWER"]
      ? parsed["FINAL ANSWER"].replace(/Great job![\s\S]*$/, "").trim()
      : "";
    const steps = parsed["STEP-BY-STEP EXPLANATION"]
      ? parsed["STEP-BY-STEP EXPLANATION"]
          .replace(/Great job![\s\S]*$/, "")
          .trim()
      : "";

    if (finalAnswer && steps) {
      return `Final answer:\n${finalAnswer}\n\nStep-by-step:\n${steps}`;
    }

    return raw.trim();
  }

  async function showPracticeSolution() {
    if (
      !practiceQuestion.trim() ||
      practiceRevealing ||
      practiceChecking ||
      practiceGenerating
    ) {
      return;
    }

    setPracticeRevealing(true);

    const solutionWhenRevealed = solution;
    const practiceWhenRevealed = practiceQuestion;
    const practiceToken = practiceTokens[practiceIndex] || "";

    if (!practiceToken) {
      setPracticeFeedback(
        "Generate a practice question first, then try Show Solution."
      );
      setPracticeRevealing(false);
      return;
    }

    try {
      const headers = await authHeaders({
        "Content-Type": "application/json",
      });

      const response = await fetch("/api/practice-solution", {
        method: "POST",
        headers,
        body: JSON.stringify({
          question: practiceQuestion,
          level: studentLevel,
          practiceToken,
        }),
      });

      const data = await response.json();

      if (
        latestSolutionRef.current !== solutionWhenRevealed ||
        latestPracticeQuestionRef.current !== practiceWhenRevealed
      ) {
        return;
      }

      if (!response.ok) {
        setPracticeFeedback(
          studentFriendlyError(
            data.error,
            "We couldn't show the solution. Please try again."
          )
        );
        return;
      }

      const raw = data.solution || "";

      if (!raw.trim()) {
        setPracticeFeedback("We couldn't show the solution. Please try again.");
        return;
      }

      setPracticeRevealedSolution(formatPracticeSolution(raw));
    } catch {
      if (
        latestSolutionRef.current !== solutionWhenRevealed ||
        latestPracticeQuestionRef.current !== practiceWhenRevealed
      ) {
        return;
      }

      setPracticeFeedback("We couldn't show the solution. Please try again.");
    } finally {
      if (
        latestSolutionRef.current === solutionWhenRevealed &&
        latestPracticeQuestionRef.current === practiceWhenRevealed
      ) {
        setPracticeRevealing(false);
      }
    }
  }

  async function createRelatedPracticeQuestion() {
    if (
      practiceGenerating ||
      practiceChecking ||
      practiceRevealing ||
      loading ||
      imageLoading
    ) {
      return;
    }

    const sourceQuestion = getSourceMathQuestion(question, solution);
    const currentPractice = practiceQuestion;

    if (!sourceQuestion && !currentPractice) {
      return;
    }

    const requestId = practiceRequestRef.current + 1;
    practiceRequestRef.current = requestId;
    setPracticeGenerating(true);

    try {
      const headers = await authHeaders({
        "Content-Type": "application/json",
      });

      const response = await fetch("/api/generate-practice", {
        method: "POST",
        headers,
        body: JSON.stringify({
          originalQuestion: sourceQuestion || currentPractice,
          previousPracticeQuestion: currentPractice,
          previousQuestions: practiceSet,
          level: studentLevel,
          topic: practiceTopic,
          count: 1,
        }),
      });

      const data = await response.json();

      if (practiceRequestRef.current !== requestId) {
        return;
      }

      if (!response.ok) {
        setPracticeCorrect(null);
        setPracticeHint("");
        setPracticeFeedback(
          data.error || "We couldn't create a new question. Please try again."
        );
        return;
      }

      const nextQuestion =
        typeof data.practiceQuestion === "string"
          ? data.practiceQuestion.trim()
          : "";
      const nextToken =
        typeof data.practiceToken === "string" ? data.practiceToken.trim() : "";

      if (!nextQuestion) {
        setPracticeCorrect(null);
        setPracticeHint("");
        setPracticeFeedback(
          "We couldn't create a new question. Please try again."
        );
        return;
      }

      resetPracticeState();
      setPracticeScoredCurrent(false);
      setPracticeCountedAttempt(false);
      setActivePracticeQuestion(nextQuestion);
      setPracticeSet((current) => {
        if (current.length === 0) {
          return [nextQuestion];
        }

        const updated = [...current];
        updated[practiceIndex] = nextQuestion;
        return updated;
      });
      setPracticeTokens((current) => {
        if (current.length === 0) {
          return [nextToken];
        }

        const updated = [...current];
        updated[practiceIndex] = nextToken;
        return updated;
      });
    } catch {
      if (practiceRequestRef.current !== requestId) {
        return;
      }

      setPracticeCorrect(null);
      setPracticeHint("");
      setPracticeFeedback(
        "We couldn't create a new question. Please try again."
      );
    } finally {
      if (practiceRequestRef.current === requestId) {
        setPracticeGenerating(false);
      }
    }
  }

  async function generatePracticeQuestions(
    count: number,
    previousQuestions: string[]
  ): Promise<{ questions: string[]; tokens: string[] }> {
    const sourceQuestion = getSourceMathQuestion(question, solution);
    const originalQuestion =
      sourceQuestion &&
      sourceQuestion !== "Math problem from uploaded photo"
        ? sourceQuestion
        : detectedProblem || "";

    const headers = await authHeaders({
      "Content-Type": "application/json",
    });

    const response = await fetch("/api/generate-practice", {
      method: "POST",
      headers,
      body: JSON.stringify({
        originalQuestion,
        previousQuestions,
        previousPracticeQuestion: previousQuestions[previousQuestions.length - 1] || "",
        level: studentLevel,
        topic: practiceTopic,
        count,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        studentFriendlyError(
          data.error,
          "We couldn't create practice questions. Please try again."
        )
      );
    }

    const fromList = Array.isArray(data.practiceQuestions)
      ? data.practiceQuestions.filter(
          (item: unknown): item is string =>
            typeof item === "string" && item.trim().length > 0
        )
      : [];

    const questions =
      fromList.length > 0
        ? fromList.map((item: string) => item.trim())
        : typeof data.practiceQuestion === "string" && data.practiceQuestion.trim()
          ? [data.practiceQuestion.trim()]
          : [];

    if (questions.length === 0) {
      throw new Error("We couldn't create practice questions. Please try again.");
    }

    const tokenList: unknown[] = Array.isArray(data.practiceTokens)
      ? data.practiceTokens
      : [];
    const tokens: string[] = questions.map((_question: string, index: number) => {
      const listed = tokenList[index];

      if (typeof listed === "string") {
        return listed;
      }

      if (index === 0 && typeof data.practiceToken === "string") {
        return data.practiceToken;
      }

      return "";
    });

    if (tokens.some((item: string) => !item)) {
      throw new Error("We couldn't create practice questions. Please try again.");
    }

    return { questions, tokens };
  }

  async function startPracticeSet() {
    if (
      practiceGenerating ||
      practiceChecking ||
      practiceRevealing ||
      loading ||
      imageLoading
    ) {
      return;
    }

    const requestId = practiceRequestRef.current + 1;
    practiceRequestRef.current = requestId;
    setPracticeGenerating(true);
    setPracticeCompleted(false);
    setPracticeFeedback("");
    setPracticeHint("");
    setPracticeCorrect(null);

    try {
      const generated = await generatePracticeQuestions(PRACTICE_SET_SIZE, []);
      const questions = generated.questions.slice(0, PRACTICE_SET_SIZE);
      const tokens = generated.tokens.slice(0, PRACTICE_SET_SIZE);

      if (practiceRequestRef.current !== requestId) {
        return;
      }

      resetPracticeState();
      setPracticeSet(questions);
      setPracticeTokens(tokens);
      setPracticeIndex(0);
      setPracticeScore(0);
      setPracticeScoredCurrent(false);
      setPracticeCountedAttempt(false);
      setPracticeCompleted(false);
      setActivePracticeQuestion(questions[0] || "");
      recordActivity(
        `Started ${PRACTICE_TOPICS.find((item) => item.id === practiceTopic)?.label || "practice"} set`
      );
    } catch (error) {
      if (practiceRequestRef.current !== requestId) {
        return;
      }

      setPracticeCorrect(null);
      setPracticeHint("");
      setPracticeFeedback(
        error instanceof Error
          ? error.message
          : "We couldn't start practice. Please try again."
      );
    } finally {
      if (practiceRequestRef.current === requestId) {
        setPracticeGenerating(false);
      }
    }
  }

  async function goToNextPracticeQuestion() {
    if (
      practiceGenerating ||
      practiceChecking ||
      practiceRevealing ||
      loading ||
      imageLoading ||
      practiceCompleted
    ) {
      return;
    }

    const currentList =
      practiceSet.length > 0
        ? practiceSet
        : practiceQuestion
          ? [practiceQuestion]
          : [];

    if (currentList.length === 0) {
      return;
    }

    const nextIndex = practiceIndex + 1;

    if (nextIndex < currentList.length) {
      resetPracticeState();
      setPracticeIndex(nextIndex);
      setPracticeScoredCurrent(false);
      setPracticeCountedAttempt(false);
      setActivePracticeQuestion(currentList[nextIndex] || "");
      return;
    }

    if (currentList.length >= PRACTICE_SET_SIZE) {
      setPracticeCompleted(true);
      recordActivity(
        `Finished practice: ${practiceScore}/${PRACTICE_SET_SIZE}`
      );
      return;
    }

    const requestId = practiceRequestRef.current + 1;
    practiceRequestRef.current = requestId;
    setPracticeGenerating(true);

    try {
      const generated = await generatePracticeQuestions(1, currentList);

      if (practiceRequestRef.current !== requestId) {
        return;
      }

      const nextQuestion = generated.questions[0];
      const nextToken = generated.tokens[0] || "";

      if (!nextQuestion) {
        setPracticeFeedback(
          "We couldn't create the next question. Please try again."
        );
        return;
      }

      const updated = [...currentList, nextQuestion];
      const currentTokens =
        practiceTokens.length === currentList.length
          ? practiceTokens
          : currentList.map((_, index) => practiceTokens[index] || "");
      resetPracticeState();
      setPracticeSet(updated);
      setPracticeTokens([...currentTokens, nextToken]);
      setPracticeIndex(updated.length - 1);
      setPracticeScoredCurrent(false);
      setPracticeCountedAttempt(false);
      setActivePracticeQuestion(nextQuestion);
    } catch (error) {
      if (practiceRequestRef.current !== requestId) {
        return;
      }

      setPracticeFeedback(
        error instanceof Error
          ? error.message
          : "We couldn't create the next question. Please try again."
      );
    } finally {
      if (practiceRequestRef.current === requestId) {
        setPracticeGenerating(false);
      }
    }
  }

  function restartCurrentPracticeSet() {
    if (practiceSet.length === 0) {
      return;
    }

    resetPracticeState();
    setPracticeIndex(0);
    setPracticeScore(0);
    setPracticeScoredCurrent(false);
    setPracticeCountedAttempt(false);
    setPracticeCompleted(false);
    setActivePracticeQuestion(practiceSet[0] || "");
  }

  function resetPracticeState() {
    setPracticeAnswer("");
    setPracticeChecking(false);
    setPracticeFeedback("");
    setPracticeHint("");
    setPracticeCorrect(null);
    setPracticeWrongAttempts(0);
    setPracticeRevealing(false);
    setPracticeRevealedSolution("");
  }

  function removeImage() {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    setImageFile(null);
    setImagePreview("");
    setDetectedProblem("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function clearEverything() {
    setQuestion("");
    setSolution("");
    setMessage("");
    removeImage();
  }

  function clearHistory() {
    setHistory([]);
    localStorage.removeItem("easymath-history");
  }

  const parts = solution ? parseSolution(solution) : {};

  const parsedPracticeQuestion = parts["PRACTICE QUESTION"]
    ? parts["PRACTICE QUESTION"]
        .replace(/Great job![\s\S]*$/, "")
        .trim()
    : "";

  const practiceQuestion =
    (practiceSet[practiceIndex] || "").trim() ||
    activePracticeQuestion.trim() ||
    parsedPracticeQuestion;

  latestPracticeQuestionRef.current = practiceQuestion;

  const practiceAccuracy =
    stats.practiceAttempted > 0
      ? Math.round((stats.practiceCorrect / stats.practiceAttempted) * 100)
      : null;

  const practiceProgressLabel = practiceCompleted
    ? `Set complete · ${practiceScore}/${PRACTICE_SET_SIZE}`
    : practiceQuestion
      ? `Question ${practiceIndex + 1} of ${PRACTICE_SET_SIZE}`
      : "No practice in progress";

  const topicRanks = rankDashboardTopics(dashboardStats);
  const strongestTopicLabel = topicRanks.strongest
    ? PRACTICE_TOPICS.find((topic) => topic.id === topicRanks.strongest)
        ?.label || "—"
    : "—";
  const weakestTopicLabel = topicRanks.weakest
    ? PRACTICE_TOPICS.find((topic) => topic.id === topicRanks.weakest)?.label ||
      "—"
    : "—";
  const streakLabel =
    dashboardStats.streakCount > 0
      ? dashboardStats.streakCount === 1
        ? "1 day"
        : `${dashboardStats.streakCount} days`
      : "—";

  const solverLimitReached =
    !solverUnlimited && dailyUsed >= dailyLimit;
  const planLabel = signedIn
    ? getPlanDisplayName(userPlan)
    : FREE_PLAN_NAME;
  const usageLabel = solverUnlimited
    ? "Unlimited solver questions"
    : `${dailyUsed} of ${dailyLimit} questions used today`;

  useEffect(() => {
    const seedQuestion = solverPracticeQuestion || parsedPracticeQuestion;

    if (!seedQuestion || practiceCompleted) {
      return;
    }

    if (practiceSet.length > 0) {
      return;
    }

    setPracticeSet([seedQuestion]);
    setPracticeTokens(solverPracticeToken ? [solverPracticeToken] : []);
    setPracticeIndex(0);
  }, [
    parsedPracticeQuestion,
    practiceCompleted,
    practiceSet.length,
    solverPracticeToken,
    solverPracticeQuestion,
  ]);

  const theme = useMemo(
    () => ({
      page: darkMode ? "#0f172a" : "#f8fafc",

      panel: darkMode
        ? "rgba(15,23,42,0.94)"
        : "rgba(255,255,255,0.92)",

      panelSoft: darkMode ? "#111827" : "#ffffff",

      text: darkMode ? "#e5e7eb" : "#0f172a",

      muted: darkMode ? "#94a3b8" : "#64748b",

      border: darkMode ? "#334155" : "#e2e8f0",

      input: darkMode ? "#0b1220" : "#f8fafc",

      buttonSoft: darkMode ? "#1e293b" : "#ffffff",

      shadow: darkMode
        ? "0 18px 50px rgba(0,0,0,0.28)"
        : "0 18px 50px rgba(15,23,42,0.08)",

      shadowSoft: darkMode
        ? "0 8px 24px rgba(0,0,0,0.18)"
        : "0 8px 24px rgba(15,23,42,0.05)",
    }),
    [darkMode]
  );

  return (
    <main
      className="easymath-app"
      style={{
        minHeight: "100vh",

        background: darkMode
          ? "radial-gradient(circle at top left, #1e3a8a 0%, transparent 28%), radial-gradient(circle at bottom right, #14532d 0%, transparent 28%), #0f172a"
          : "radial-gradient(circle at top left, #dbeafe 0%, transparent 32%), radial-gradient(circle at bottom right, #dcfce7 0%, transparent 32%), #f8fafc",

        padding: "22px 16px 36px",

        fontFamily:
          "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",

        color: theme.text,
        letterSpacing: "-0.011em",
      }}
    >
      <style>{`
        .easymath-app, .easymath-app * { box-sizing: border-box; }
        .easymath-app button,
        .easymath-app textarea,
        .easymath-app input {
          font-family: inherit;
        }
        .easymath-app textarea,
        .easymath-app input {
          line-height: 1.55;
        }
        .easymath-app textarea:focus,
        .easymath-app input:focus {
          outline: 2px solid #2563eb;
          outline-offset: 1px;
          border-color: #2563eb !important;
        }
        .easymath-app button:focus-visible {
          outline: 2px solid #2563eb;
          outline-offset: 2px;
        }
        .easymath-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.7fr) minmax(280px, 0.8fr);
          gap: 22px;
          align-items: start;
        }
        @media (max-width: 900px) {
          .easymath-layout {
            grid-template-columns: 1fr;
          }
          .easymath-title {
            font-size: 26px !important;
          }
          .easymath-h2 {
            font-size: 24px !important;
          }
        }
        @keyframes easymath-spin {
          to { transform: rotate(360deg); }
        }
        .easymath-spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(37, 99, 235, 0.22);
          border-top-color: #2563eb;
          border-radius: 50%;
          animation: easymath-spin 0.7s linear infinite;
          display: inline-block;
          flex-shrink: 0;
        }
        .easymath-app button:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }
        .easymath-pricing-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-top: 18px;
        }
        @media (max-width: 700px) {
          .easymath-pricing-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
      <div
        style={{
          maxWidth: "1180px",
          margin: "0 auto",
        }}
      >
        <header
          style={{
            background: theme.panel,
            border: `1px solid ${theme.border}`,
            borderRadius: "22px",
            padding: "16px 20px",
            boxShadow: theme.shadowSoft,
            marginBottom: "20px",
            backdropFilter: "blur(16px)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "18px",
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "14px",
              }}
            >
              <div
                style={{
                  width: "52px",
                  height: "52px",
                  borderRadius: "16px",
                  display: "grid",
                  placeItems: "center",

                  background:
                    "linear-gradient(135deg, #2563eb, #16a34a)",

                  color: "white",
                  fontSize: "26px",
                  fontWeight: 900,
                  boxShadow: "0 8px 18px rgba(37,99,235,0.28)",
                }}
              >
                ∑
              </div>

              <div>
                <h1
                  className="easymath-title"
                  style={{
                    margin: 0,
                    fontSize: "30px",
                    fontWeight: 900,
                    letterSpacing: "-0.03em",
                    lineHeight: 1.1,
                  }}
                >
                  EasyMath AI
                </h1>

                <p
                  style={{
                    margin: "5px 0 0",
                    color: theme.muted,
                    fontWeight: 600,
                    fontSize: "14px",
                  }}
                >
                  Your Personal AI Math Tutor
                </p>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: "10px",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  padding: "8px 13px",
                  borderRadius: "999px",
                  background: darkMode ? "#14532d" : "#ecfdf5",
                  color: darkMode ? "#86efac" : "#15803d",
                  fontWeight: 800,
                  fontSize: "12px",
                  border: `1px solid ${darkMode ? "#166534" : "#bbf7d0"}`,
                }}
              >
                {usageLabel}
              </div>

              {signedIn ? (
                <button
                  type="button"
                  onClick={() => setAccountOpen(true)}
                  style={{
                    border: `1px solid ${theme.border}`,
                    background: theme.buttonSoft,
                    color: theme.text,
                    padding: "9px 14px",
                    borderRadius: "999px",
                    fontWeight: 800,
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  Account
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("login");
                    setAuthMessage(
                      cloudEnabled
                        ? ""
                        : "Cloud accounts need Supabase setup. You can still use EasyMath with the Free local limit."
                    );
                    setAuthModalOpen(true);
                  }}
                  style={{
                    border: "none",
                    background: "linear-gradient(135deg,#2563eb,#1d4ed8)",
                    color: "white",
                    padding: "9px 14px",
                    borderRadius: "999px",
                    fontWeight: 800,
                    fontSize: "13px",
                    cursor: "pointer",
                    boxShadow: "0 8px 16px rgba(37,99,235,0.25)",
                  }}
                >
                  Log in
                </button>
              )}

              <button
                onClick={toggleTheme}
                style={{
                  border: `1px solid ${theme.border}`,
                  background: theme.buttonSoft,
                  width: "44px",
                  height: "44px",
                  borderRadius: "14px",
                  cursor: "pointer",
                  fontSize: "18px",
                  boxShadow: theme.shadowSoft,
                }}
              >
                {darkMode ? "☀️" : "🌙"}
              </button>
            </div>
          </div>
        </header>

        <div
          className="easymath-layout"
        >
          <section
            style={{
              background: theme.panel,
              border: `1px solid ${theme.border}`,
              borderRadius: "24px",
              padding: "26px 24px",
              boxShadow: theme.shadow,
              backdropFilter: "blur(16px)",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                padding: "7px 12px",
                borderRadius: "999px",

                background: darkMode
                  ? "#172554"
                  : "#eef4ff",

                color: darkMode
                  ? "#bfdbfe"
                  : "#2563eb",

                fontWeight: 900,
                fontSize: "11px",
                letterSpacing: "0.08em",
                border: `1px solid ${darkMode ? "#1e3a8a" : "#dbeafe"}`,
              }}
            >
              ✨ ASK EASYMATH
            </div>

            <h2
              className="easymath-h2"
              style={{
                margin: "16px 0 8px",
                fontSize: "30px",
                fontWeight: 900,
                letterSpacing: "-0.03em",
                lineHeight: 1.15,
              }}
            >
              What math problem can I help you solve?
            </h2>

            <p
              style={{
                color: theme.muted,
                lineHeight: 1.6,
              }}
            >
              Type your question or upload a photo of
              homework, a worksheet, or handwritten math.
            </p>

            <div
              style={{
                marginTop: "16px",
                padding: "14px 16px",
                borderRadius: "14px",
                border: `1px solid ${
                  solverLimitReached
                    ? darkMode
                      ? "#9f1239"
                      : "#fecdd3"
                    : darkMode
                      ? "#1e3a8a"
                      : "#bfdbfe"
                }`,
                background: solverLimitReached
                  ? darkMode
                    ? "linear-gradient(135deg,#4c0519,#3b0764)"
                    : "linear-gradient(135deg,#fff1f2,#faf5ff)"
                  : darkMode
                    ? "#172554"
                    : "#eff6ff",
                fontWeight: 700,
                fontSize: "14px",
                lineHeight: 1.55,
              }}
            >
              {solverLimitReached ? (
                <div>
                  <div style={{ whiteSpace: "pre-line" }}>
                    {DAILY_LIMIT_MESSAGE}
                  </div>
                  <div
                    style={{
                      marginTop: "8px",
                      fontWeight: 600,
                      color: theme.muted,
                      fontSize: "13px",
                    }}
                  >
                    Practice Mode stays available and does not use this limit.
                  </div>
                  <button
                    type="button"
                    onClick={() => setPricingOpen(true)}
                    style={{
                      marginTop: "12px",
                      border: "none",
                      background: "linear-gradient(135deg,#7c3aed,#6d28d9)",
                      color: "white",
                      padding: "10px 16px",
                      borderRadius: "11px",
                      fontWeight: 900,
                      cursor: "pointer",
                      boxShadow: "0 8px 16px rgba(124,58,237,0.28)",
                    }}
                  >
                    Upgrade
                  </button>
                </div>
              ) : (
                <>
                  {solverUnlimited
                    ? "Pro plan: unlimited solver questions. Practice Mode stays available."
                    : `Free plan: ${dailyUsed} of ${dailyLimit} solver questions used today. Practice questions do not use this limit.`}
                </>
              )}
            </div>

            <div
              style={{
                marginTop: "20px",
                padding: "16px",
                borderRadius: "18px",
                border: `1px solid ${theme.border}`,
                background: darkMode ? "#0b1220" : "#f8fafc",
              }}
            >
              <div
                style={{
                  fontWeight: 900,
                  fontSize: "13px",
                  marginBottom: "6px",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: theme.muted,
                }}
              >
                Student Level
              </div>

              <div
                style={{
                  color: theme.muted,
                  fontSize: "14px",
                  marginBottom: "14px",
                  lineHeight: 1.5,
                }}
              >
                Same correct answer. Clearer explanation for your level.
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  flexWrap: "wrap",
                }}
              >
                {STUDENT_LEVELS.map((level) => {
                  const selected = studentLevel === level.id;

                  return (
                    <button
                      key={level.id}
                      type="button"
                      onClick={() => selectStudentLevel(level.id)}
                      style={{
                        border: selected
                          ? "1px solid #2563eb"
                          : `1px solid ${theme.border}`,
                        background: selected
                          ? darkMode
                            ? "linear-gradient(135deg,#1d4ed8,#2563eb)"
                            : "linear-gradient(135deg,#2563eb,#1d4ed8)"
                          : theme.buttonSoft,
                        color: selected
                          ? "#ffffff"
                          : theme.text,
                        padding: "9px 14px",
                        borderRadius: "999px",
                        fontWeight: 800,
                        fontSize: "13px",
                        cursor: "pointer",
                        boxShadow: selected
                          ? "0 8px 16px rgba(37,99,235,0.25)"
                          : "none",
                      }}
                    >
                      {level.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                marginTop: "16px",
                padding: "16px",
                borderRadius: "18px",
                border: `1px solid ${theme.border}`,
                background: darkMode ? "#0b1220" : "#f8fafc",
              }}
            >
              <div
                style={{
                  fontWeight: 900,
                  fontSize: "13px",
                  marginBottom: "6px",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: theme.muted,
                }}
              >
                Practice Topic
              </div>

              <div
                style={{
                  color: theme.muted,
                  fontSize: "14px",
                  marginBottom: "14px",
                  lineHeight: 1.5,
                }}
              >
                Choose a topic, then start a short 5-question practice set.
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  flexWrap: "wrap",
                }}
              >
                {PRACTICE_TOPICS.map((topic) => {
                  const selected = practiceTopic === topic.id;

                  return (
                    <button
                      key={topic.id}
                      type="button"
                      onClick={() => selectPracticeTopic(topic.id)}
                      disabled={
                        practiceGenerating ||
                        practiceChecking ||
                        practiceRevealing
                      }
                      style={{
                        border: selected
                          ? "1px solid #16a34a"
                          : `1px solid ${theme.border}`,
                        background: selected
                          ? darkMode
                            ? "linear-gradient(135deg,#15803d,#16a34a)"
                            : "linear-gradient(135deg,#16a34a,#15803d)"
                          : theme.buttonSoft,
                        color: selected ? "#ffffff" : theme.text,
                        padding: "9px 14px",
                        borderRadius: "999px",
                        fontWeight: 800,
                        fontSize: "13px",
                        cursor: "pointer",
                        boxShadow: selected
                          ? "0 8px 16px rgba(22,163,74,0.25)"
                          : "none",
                      }}
                    >
                      {topic.label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={startPracticeSet}
                disabled={
                  practiceGenerating ||
                  practiceChecking ||
                  practiceRevealing ||
                  loading ||
                  imageLoading
                }
                style={{
                  marginTop: "14px",
                  border: "none",
                  background: practiceGenerating
                    ? "#86efac"
                    : "linear-gradient(135deg,#16a34a,#15803d)",
                  color: "white",
                  padding: "11px 16px",
                  borderRadius: "12px",
                  fontWeight: 800,
                  cursor: practiceGenerating ? "wait" : "pointer",
                  boxShadow: "0 8px 16px rgba(22,163,74,0.22)",
                }}
              >
                {practiceGenerating
                  ? "Creating practice set..."
                  : "Start 5-Question Practice"}
              </button>
            </div>

            <textarea
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value);
                setMessage("");
              }}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey
                ) {
                  e.preventDefault();
                  if (!loading && !imageLoading && !solverLimitReached) {
                    solveQuestion();
                  }
                }
              }}
              placeholder="Example: Solve x + 8 = 31"
              style={{
                width: "100%",
                minHeight: "150px",
                marginTop: "20px",
                padding: "16px 18px",
                boxSizing: "border-box",
                borderRadius: "16px",
                border: `1px solid ${theme.border}`,
                background: theme.input,
                color: theme.text,
                fontSize: "17px",
                resize: "vertical",
                boxShadow: darkMode
                  ? "inset 0 1px 0 rgba(255,255,255,0.03)"
                  : "inset 0 1px 2px rgba(15,23,42,0.04)",
              }}
            />

            <div
              style={{
                marginTop: "18px",
                display: "flex",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              {examples.map((example) => (
                <button
                  key={example}
                  onClick={() =>
                    solveQuestion(example)
                  }
                  disabled={
                    loading || imageLoading || solverLimitReached
                  }
                  style={{
                    border: `1px solid ${theme.border}`,
                    background:
                      theme.buttonSoft,

                    color: theme.text,

                    padding: "8px 13px",
                    borderRadius: "999px",

                    fontWeight: 700,
                    fontSize: "13px",
                    cursor: solverLimitReached ? "not-allowed" : "pointer",
                  }}
                >
                  {example}
                </button>
              ))}
            </div>

            <div
              style={{
                marginTop: "22px",
                padding: "18px",

                border: `1px solid ${theme.border}`,

                borderRadius: "18px",
                background: darkMode
                  ? "#0b1220"
                  : "#f8fafc",
              }}
            >
              <div
                style={{
                  fontWeight: 900,
                  fontSize: "13px",
                  marginBottom: "6px",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: theme.muted,
                }}
              >
                📷 Photo Solver
              </div>

              <div
                style={{
                  color: theme.muted,
                  fontSize: "14px",
                  marginBottom: "14px",
                }}
              >
                Upload a photo of a math question and
                EasyMath AI will read and solve it.
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.heic,.heif,.hif"
                onChange={handleImage}
                style={{
                  display: "none",
                }}
              />

              {!imagePreview && (
                <button
                  onClick={() =>
                    fileInputRef.current?.click()
                  }
                  disabled={loading || imageLoading || solverLimitReached}
                  style={{
                    border: `1px solid ${theme.border}`,

                    background:
                      theme.buttonSoft,

                    color: theme.text,

                    padding: "11px 16px",
                    borderRadius: "12px",
                    cursor: solverLimitReached ? "not-allowed" : "pointer",
                    fontWeight: 800,
                  }}
                >
                  📷 Choose Photo
                </button>
              )}

              {imagePreview && (
                <div>
                  <img
                    src={imagePreview}
                    alt="Math problem preview"
                    style={{
                      maxWidth: "100%",
                      maxHeight: "350px",
                      objectFit: "contain",
                      borderRadius: "14px",
                      border: `1px solid ${theme.border}`,
                    }}
                  />

                  <div
                    style={{
                      display: "flex",
                      gap: "10px",
                      flexWrap: "wrap",
                      marginTop: "14px",
                    }}
                  >
                    <button
                      onClick={solveImage}
                      disabled={
                        imageLoading || loading || solverLimitReached
                      }
                      style={{
                        border: "none",

                        background: solverLimitReached
                          ? "#86efac"
                          : "linear-gradient(135deg,#16a34a,#15803d)",

                        color: "white",

                        padding: "13px 18px",
                        borderRadius: "12px",

                        fontWeight: 900,
                        cursor: solverLimitReached
                          ? "not-allowed"
                          : "pointer",
                        boxShadow: solverLimitReached
                          ? "none"
                          : "0 8px 18px rgba(22,163,74,0.28)",
                      }}
                    >
                      {imageLoading ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <span className="easymath-spinner" aria-hidden="true" />
                          Reading your math...
                        </span>
                      ) : solverLimitReached ? (
                        "Daily limit reached"
                      ) : (
                        "✨ Solve Photo"
                      )}
                    </button>

                    <button
                      onClick={removeImage}
                      disabled={imageLoading}
                      style={{
                        border: `1px solid ${theme.border}`,

                        background:
                          theme.buttonSoft,

                        color: theme.text,

                        padding: "13px 18px",

                        borderRadius: "12px",

                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>

            {message && (
              <div
                style={{
                  marginTop: "12px",
                  color: "#f59e0b",
                  fontWeight: 700,
                  whiteSpace: "pre-line",
                  lineHeight: 1.5,
                }}
              >
                {message}
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: "12px",
                marginTop: "22px",
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={() =>
                  solveQuestion()
                }
                disabled={
                  loading || imageLoading || solverLimitReached
                }
                style={{
                  border: "none",

                  background: solverLimitReached
                    ? "#93c5fd"
                    : "linear-gradient(135deg,#2563eb,#1d4ed8)",

                  color: "white",

                  padding: "14px 24px",

                  borderRadius: "14px",

                  fontWeight: 900,
                  fontSize: "15px",

                  cursor: solverLimitReached
                    ? "not-allowed"
                    : "pointer",
                  boxShadow: solverLimitReached
                    ? "none"
                    : "0 10px 22px rgba(37,99,235,0.28)",
                }}
              >
                {loading ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <span className="easymath-spinner" aria-hidden="true" />
                    Solving...
                  </span>
                ) : solverLimitReached ? (
                  "Daily limit reached"
                ) : (
                  "✨ Solve Now"
                )}
              </button>

              <button
                onClick={clearEverything}
                style={{
                  border: `1px solid ${theme.border}`,

                  background:
                    theme.buttonSoft,

                  color: theme.text,

                  padding: "15px 22px",

                  borderRadius: "14px",

                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Clear
              </button>
            </div>

            {(loading || imageLoading) && (
              <div
                style={{
                  marginTop: "22px",
                  padding: "14px 16px",
                  borderRadius: "14px",
                  border: `1px solid ${darkMode ? "#1e3a8a" : "#bfdbfe"}`,
                  background: darkMode
                    ? "#172554"
                    : "#eff6ff",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                <span className="easymath-spinner" aria-hidden="true" />
                <strong>
                  {imageLoading
                    ? "Reading your math problem…"
                    : "Solving your question…"}
                </strong>
              </div>
            )}

            {solution &&
              !loading &&
              !imageLoading && (
                <div
                  style={{
                    marginTop: "28px",
                    display: "grid",
                    gap: "14px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent:
                        "space-between",
                      gap: "15px",
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          color: "#2563eb",
                          fontWeight: 900,
                          fontSize: "11px",
                          letterSpacing: "0.08em",
                        }}
                      >
                        EASYMATH AI SOLUTION
                      </div>

                      <div
                        style={{
                          marginTop: "6px",
                          fontWeight: 800,
                          fontSize: "16px",
                          lineHeight: 1.4,
                        }}
                      >
                        {detectedProblem || question}
                      </div>

                      {detectedProblem && (
                        <div
                          style={{
                            marginTop: "8px",
                            color: theme.muted,
                            fontSize: "13px",
                            fontWeight: 700,
                          }}
                        >
                          Detected problem from your photo
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() =>
                        navigator.clipboard.writeText(
                          solution
                        )
                      }
                      style={{
                        border: `1px solid ${theme.border}`,

                        background:
                          theme.buttonSoft,

                        color: theme.text,

                        borderRadius: "12px",
                        padding: "9px 14px",

                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      Copy
                    </button>
                  </div>

                  {parts["FINAL ANSWER"] && (
                    <div
                      style={{
                        padding: "20px 22px",

                        borderRadius: "18px",

                        background: darkMode
                          ? "#14532d"
                          : "#ecfdf5",

                        border:
                          "1px solid #22c55e",
                        boxShadow: theme.shadowSoft,
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 900,
                          fontSize: "12px",
                          letterSpacing: "0.06em",
                          color: darkMode
                            ? "#86efac"
                            : "#15803d",
                        }}
                      >
                        ✅ FINAL ANSWER
                      </div>

                      <div
                        style={{
                          fontSize: "28px",
                          fontWeight: 900,
                          marginTop: "10px",
                          letterSpacing: "-0.03em",
                          lineHeight: 1.25,
                        }}
                      >
                        {
                          parts[
                            "FINAL ANSWER"
                          ]
                        }
                      </div>
                    </div>
                  )}

                  {parts[
                    "STEP-BY-STEP EXPLANATION"
                  ] && (
                    <div
                      style={{
                        padding: "20px 22px",
                        borderRadius: "18px",

                        background: darkMode
                          ? "#172554"
                          : "#eff6ff",

                        border:
                          "1px solid #3b82f6",
                        boxShadow: theme.shadowSoft,
                      }}
                    >
                      <strong>
                        📘 STEP-BY-STEP
                      </strong>

                      <div
                        style={{
                          whiteSpace:
                            "pre-wrap",

                          marginTop: "12px",

                          lineHeight: 1.85,
                        }}
                      >
                        {
                          parts[
                            "STEP-BY-STEP EXPLANATION"
                          ]
                        }
                      </div>
                    </div>
                  )}

                  {parts["WHY IT WORKS"] && (
                    <div
                      style={{
                        padding: "20px 22px",
                        borderRadius: "18px",

                        background: darkMode
                          ? "#422006"
                          : "#fffbeb",

                        border:
                          "1px solid #f59e0b",
                        boxShadow: theme.shadowSoft,
                      }}
                    >
                      <strong>
                        💡 WHY IT WORKS
                      </strong>

                      <div
                        style={{
                          whiteSpace:
                            "pre-wrap",

                          marginTop: "10px",

                          lineHeight: 1.7,
                        }}
                      >
                        {
                          parts[
                            "WHY IT WORKS"
                          ]
                        }
                      </div>
                    </div>
                  )}

                  {parts[
                    "COMMON MISTAKE"
                  ] && (
                    <div
                      style={{
                        padding: "20px 22px",
                        borderRadius: "18px",

                        background: darkMode
                          ? "#4c0519"
                          : "#fff1f2",

                        border:
                          "1px solid #fb7185",
                        boxShadow: theme.shadowSoft,
                      }}
                    >
                      <strong>
                        ⚠️ COMMON MISTAKE
                      </strong>

                      <div
                        style={{
                          whiteSpace:
                            "pre-wrap",

                          marginTop: "10px",

                          lineHeight: 1.7,
                        }}
                      >
                        {
                          parts[
                            "COMMON MISTAKE"
                          ]
                        }
                      </div>
                    </div>
                  )}

                  {!parts["FINAL ANSWER"] &&
                    !parts["STEP-BY-STEP EXPLANATION"] &&
                    !parts["WHY IT WORKS"] &&
                    !parts["COMMON MISTAKE"] &&
                    !practiceQuestion && (
                      <div
                        style={{
                          padding: "20px 22px",
                          borderRadius: "18px",
                          background: darkMode
                            ? "#172554"
                            : "#eff6ff",
                          border: "1px solid #3b82f6",
                          whiteSpace: "pre-wrap",
                          lineHeight: 1.85,
                          boxShadow: theme.shadowSoft,
                        }}
                      >
                        {solution}
                      </div>
                    )}
                </div>
              )}

            {!loading &&
              !imageLoading &&
              (practiceCompleted ||
                practiceQuestion ||
                practiceGenerating) && (
                <div
                  style={{
                    marginTop: "22px",
                    padding: "20px 22px",
                    borderRadius: "18px",
                    background: darkMode ? "#2e1065" : "#faf5ff",
                    border: "1px solid #8b5cf6",
                    boxShadow: theme.shadowSoft,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "12px",
                      flexWrap: "wrap",
                    }}
                  >
                    <strong>🎯 YOUR TURN</strong>
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: "13px",
                        color: darkMode ? "#ddd6fe" : "#6d28d9",
                      }}
                    >
                      {practiceCompleted
                        ? "Practice complete"
                        : `Question ${practiceIndex + 1} of ${PRACTICE_SET_SIZE} · Score ${practiceScore}/${PRACTICE_SET_SIZE}`}
                    </div>
                  </div>

                  {practiceCompleted ? (
                    <div>
                      <div
                        style={{
                          fontSize: "22px",
                          fontWeight: 900,
                          marginTop: "14px",
                        }}
                      >
                        You scored {practiceScore}/{PRACTICE_SET_SIZE}
                      </div>
                      <div
                        style={{
                          marginTop: "8px",
                          color: theme.muted,
                          fontWeight: 700,
                          lineHeight: 1.6,
                        }}
                      >
                        {practiceScore === PRACTICE_SET_SIZE
                          ? "Perfect set — excellent work."
                          : practiceScore >= 3
                            ? "Nice progress. Try another set to keep building."
                            : "Keep practising — the method gets easier with each try."}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: "10px",
                          flexWrap: "wrap",
                          marginTop: "16px",
                        }}
                      >
                        <button
                          type="button"
                          onClick={restartCurrentPracticeSet}
                          style={{
                            border: "none",
                            background:
                              "linear-gradient(135deg,#7c3aed,#6d28d9)",
                            color: "white",
                            padding: "11px 17px",
                            borderRadius: "11px",
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                        >
                          Practice Again
                        </button>
                        <button
                          type="button"
                          onClick={startPracticeSet}
                          disabled={practiceGenerating}
                          style={{
                            border: `1px solid ${theme.border}`,
                            background: theme.buttonSoft,
                            color: theme.text,
                            padding: "11px 17px",
                            borderRadius: "11px",
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                        >
                          New Practice Set
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {practiceGenerating && !practiceQuestion && (
                        <div
                          style={{
                            marginTop: "14px",
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            fontWeight: 700,
                          }}
                        >
                          <span className="easymath-spinner" aria-hidden="true" />
                          Creating your practice questions…
                        </div>
                      )}

                      {practiceQuestion && (
                        <>
                          <div
                            style={{
                              fontSize: "20px",
                              fontWeight: 800,
                              marginTop: "12px",
                            }}
                          >
                            {practiceQuestion}
                          </div>

                          <input
                            value={practiceAnswer}
                            onChange={(e) => {
                              setPracticeAnswer(e.target.value);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                if (
                                  !practiceChecking &&
                                  !practiceRevealing &&
                                  !practiceGenerating
                                ) {
                                  checkPracticeAnswer();
                                }
                              }
                            }}
                            placeholder="Type your answer"
                            disabled={
                              practiceChecking ||
                              practiceRevealing ||
                              practiceGenerating
                            }
                            style={{
                              width: "100%",
                              marginTop: "16px",
                              padding: "13px 16px",
                              boxSizing: "border-box",
                              borderRadius: "14px",
                              border: `1px solid ${
                                darkMode ? "#6d28d9" : "#c4b5fd"
                              }`,
                              background: darkMode ? "#1e1b4b" : "#ffffff",
                              color: theme.text,
                              fontSize: "16px",
                              fontWeight: 700,
                            }}
                          />

                          <button
                            type="button"
                            onClick={checkPracticeAnswer}
                            disabled={
                              practiceChecking ||
                              practiceRevealing ||
                              practiceGenerating
                            }
                            style={{
                              marginTop: "12px",
                              border: "none",
                              background: practiceChecking
                                ? "#a78bfa"
                                : "linear-gradient(135deg,#7c3aed,#6d28d9)",
                              color: "white",
                              padding: "11px 17px",
                              borderRadius: "12px",
                              fontWeight: 800,
                              cursor: practiceChecking ? "wait" : "pointer",
                            }}
                          >
                            {practiceChecking ? (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "8px",
                                }}
                              >
                                <span className="easymath-spinner" aria-hidden="true" />
                                Checking...
                              </span>
                            ) : (
                              "Check Answer"
                            )}
                          </button>

                          {practiceFeedback && (
                            <div
                              style={{
                                marginTop: "14px",
                                padding: "14px 16px",
                                borderRadius: "12px",
                                background:
                                  practiceCorrect === true
                                    ? darkMode
                                      ? "#14532d"
                                      : "#dcfce7"
                                    : practiceCorrect === false
                                      ? darkMode
                                        ? "#4c0519"
                                        : "#ffe4e6"
                                      : darkMode
                                        ? "#3b0764"
                                        : "#ede9fe",
                                border:
                                  practiceCorrect === true
                                    ? "1px solid #22c55e"
                                    : practiceCorrect === false
                                      ? "1px solid #fb7185"
                                      : "1px solid #8b5cf6",
                                fontWeight: 700,
                                lineHeight: 1.6,
                              }}
                            >
                              {practiceFeedback}
                              {practiceCorrect === false && practiceHint ? (
                                <div
                                  style={{
                                    marginTop: "8px",
                                    fontWeight: 600,
                                  }}
                                >
                                  Hint: {practiceHint}
                                </div>
                              ) : null}
                            </div>
                          )}

                          {practiceWrongAttempts >= 2 &&
                            !practiceRevealedSolution && (
                              <button
                                type="button"
                                onClick={showPracticeSolution}
                                disabled={
                                  practiceRevealing ||
                                  practiceChecking ||
                                  practiceGenerating
                                }
                                style={{
                                  marginTop: "12px",
                                  border: "none",
                                  background: practiceRevealing
                                    ? "#a78bfa"
                                    : "#6d28d9",
                                  color: "white",
                                  padding: "11px 17px",
                                  borderRadius: "11px",
                                  fontWeight: 800,
                                  cursor:
                                    practiceRevealing || practiceChecking
                                      ? "wait"
                                      : "pointer",
                                }}
                              >
                                {practiceRevealing
                                  ? "Showing solution..."
                                  : "Show Solution"}
                              </button>
                            )}

                          {practiceRevealedSolution && (
                            <div
                              style={{
                                marginTop: "14px",
                                padding: "14px 16px",
                                borderRadius: "12px",
                                background: darkMode ? "#1e1b4b" : "#ffffff",
                                border: "1px solid #8b5cf6",
                                fontWeight: 600,
                                lineHeight: 1.7,
                                whiteSpace: "pre-wrap",
                              }}
                            >
                              {practiceRevealedSolution}
                            </div>
                          )}

                          <div
                            style={{
                              display: "flex",
                              gap: "10px",
                              flexWrap: "wrap",
                              marginTop: "16px",
                            }}
                          >
                            <button
                              type="button"
                              onClick={goToNextPracticeQuestion}
                              disabled={
                                practiceGenerating ||
                                practiceChecking ||
                                practiceRevealing ||
                                loading ||
                                imageLoading
                              }
                              style={{
                                border: "none",
                                background: practiceGenerating
                                  ? "#86efac"
                                  : "linear-gradient(135deg,#16a34a,#15803d)",
                                color: "white",
                                padding: "11px 17px",
                                borderRadius: "11px",
                                fontWeight: 800,
                                cursor: practiceGenerating ? "wait" : "pointer",
                              }}
                            >
                              {practiceGenerating
                                ? "Creating question..."
                                : practiceIndex + 1 >= PRACTICE_SET_SIZE
                                  ? "See Results"
                                  : "Next Question →"}
                            </button>

                            <button
                              type="button"
                              onClick={createRelatedPracticeQuestion}
                              disabled={
                                practiceGenerating ||
                                practiceChecking ||
                                practiceRevealing ||
                                loading ||
                                imageLoading
                              }
                              style={{
                                border: "none",
                                background: practiceGenerating
                                  ? "#a78bfa"
                                  : "#7c3aed",
                                color: "white",
                                padding: "11px 17px",
                                borderRadius: "11px",
                                fontWeight: 800,
                                cursor: practiceGenerating ? "wait" : "pointer",
                              }}
                            >
                              {practiceGenerating
                                ? "Creating question..."
                                : "Try This Question →"}
                            </button>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
          </section>

          <aside
            style={{
              background: theme.panel,

              border: `1px solid ${theme.border}`,

              borderRadius: "24px",

              padding: "22px",

              boxShadow: theme.shadow,
              backdropFilter: "blur(16px)",
            }}
          >
            <div
              style={{
                display: "flex",

                justifyContent:
                  "space-between",

                alignItems: "center",
                gap: "12px",
                flexWrap: "wrap",
                marginBottom: "14px",
              }}
            >
              <div>
                <div
                  style={{
                    color: "#16a34a",

                    fontSize: "11px",

                    fontWeight: 900,
                    letterSpacing: "0.08em",
                  }}
                >
                  YOUR DASHBOARD
                </div>

                <h3
                  style={{
                    margin: "6px 0 0",
                    fontSize: "22px",
                    fontWeight: 900,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Student Progress
                </h3>
              </div>
            </div>

            <div
              style={{
                marginBottom: "16px",
                padding: "14px 15px",
                borderRadius: "16px",
                border: `1px solid ${theme.border}`,
                background: darkMode ? "#0b1220" : "#f8fafc",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 900,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: theme.muted,
                }}
              >
                Account
              </div>
              <div
                style={{
                  marginTop: "8px",
                  fontWeight: 800,
                  fontSize: "14px",
                  lineHeight: 1.45,
                }}
              >
                {signedIn && userEmail ? userEmail : "Guest (local progress)"}
              </div>
              <div
                style={{
                  marginTop: "6px",
                  color: theme.muted,
                  fontWeight: 700,
                  fontSize: "13px",
                }}
              >
                Plan: {planLabel}
                {solverUnlimited
                  ? " · Unlimited"
                  : ` · ${dailyUsed}/${dailyLimit} today`}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (signedIn) {
                    setAccountOpen(true);
                  } else {
                    setAuthMode("login");
                    setAuthModalOpen(true);
                  }
                }}
                style={{
                  marginTop: "12px",
                  border: "none",
                  background: "linear-gradient(135deg,#2563eb,#1d4ed8)",
                  color: "white",
                  padding: "9px 13px",
                  borderRadius: "11px",
                  fontWeight: 800,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                {signedIn ? "Open account" : "Log in / Sign up"}
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px",
                marginBottom: "16px",
              }}
            >
              {[
                {
                  label: "Questions Solved",
                  value: String(stats.questionsSolved),
                },
                {
                  label: "Practice Accuracy",
                  value:
                    practiceAccuracy === null
                      ? "—"
                      : `${practiceAccuracy}%`,
                },
                {
                  label: "Practice Score",
                  value: `${stats.practiceCorrect}/${stats.practiceAttempted || 0}`,
                },
                {
                  label: "Current Progress",
                  value: practiceProgressLabel,
                },
                {
                  label: "Daily Streak",
                  value: streakLabel,
                },
                {
                  label: "Strongest Topic",
                  value: strongestTopicLabel,
                },
                {
                  label: "Weakest Topic",
                  value: weakestTopicLabel,
                },
              ].map((card) => (
                <div
                  key={card.label}
                  style={{
                    padding: "12px 13px",
                    borderRadius: "14px",
                    border: `1px solid ${theme.border}`,
                    background: theme.buttonSoft,
                  }}
                >
                  <div
                    style={{
                      fontSize: "11px",
                      fontWeight: 800,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: theme.muted,
                    }}
                  >
                    {card.label}
                  </div>
                  <div
                    style={{
                      marginTop: "6px",
                      fontWeight: 900,
                      fontSize: "16px",
                      lineHeight: 1.3,
                    }}
                  >
                    {card.value}
                  </div>
                </div>
              ))}
            </div>

            {stats.activity.length > 0 && (
              <div
                style={{
                  marginBottom: "18px",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 900,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: theme.muted,
                    marginBottom: "8px",
                  }}
                >
                  Recent activity
                </div>
                <div
                  style={{
                    display: "grid",
                    gap: "8px",
                  }}
                >
                  {stats.activity.map((item, index) => (
                    <div
                      key={`${item.at}-${index}`}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "12px",
                        border: `1px solid ${theme.border}`,
                        background: darkMode ? "#0b1220" : "#f8fafc",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: "13px",
                          lineHeight: 1.4,
                        }}
                      >
                        {item.label}
                      </div>
                      <div
                        style={{
                          marginTop: "4px",
                          color: theme.muted,
                          fontSize: "12px",
                          fontWeight: 600,
                        }}
                      >
                        {hasMounted ? formatActivityTime(item.at) : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div
              style={{
                display: "flex",

                justifyContent:
                  "space-between",

                alignItems: "center",
                gap: "12px",
                flexWrap: "wrap",
                marginBottom: "14px",
              }}
            >
              <div>
                <div
                  style={{
                    color: "#16a34a",

                    fontSize: "11px",

                    fontWeight: 900,
                    letterSpacing: "0.08em",
                  }}
                >
                  YOUR WORK
                </div>

                <h3
                  style={{
                    margin: "6px 0 0",
                    fontSize: "22px",
                    fontWeight: 900,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Recent Questions
                </h3>
              </div>

              {history.length > 0 && (
                <button
                  onClick={clearHistory}
                  style={{
                    border: "none",

                    background:
                      "transparent",

                    color: theme.muted,

                    fontWeight: 800,

                    cursor: "pointer",
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gap: "10px",
              }}
            >
              {history.map(
                (item, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setQuestion(
                        item.question
                      );

                      setSolution(
                        item.solution
                      );
                    }}
                    style={{
                      width: "100%",

                      textAlign: "left",

                      padding: "13px 14px",

                      border: `1px solid ${theme.border}`,

                      borderRadius: "14px",

                      background:
                        theme.buttonSoft,

                      color: theme.text,

                      fontWeight: 700,
                      fontSize: "14px",
                      lineHeight: 1.4,

                      cursor: "pointer",
                    }}
                  >
                    {item.question}
                  </button>
                )
              )}
            </div>

            <div
              style={{
                marginTop: "20px",

                padding: "16px 18px",

                borderRadius: "16px",
                border: `1px solid ${darkMode ? "#1e3a8a" : "#dbeafe"}`,

                background: darkMode
                  ? "linear-gradient(135deg,#172554,#14532d)"
                  : "linear-gradient(135deg,#eff6ff,#f0fdf4)",
              }}
            >
              <strong>
                Student Tip
              </strong>

              <div
                style={{
                  marginTop: "7px",

                  color: theme.muted,

                  fontSize: "14px",

                  lineHeight: 1.6,
                }}
              >
                Take a clear photo with the full math
                question visible for the best result.
              </div>
            </div>
          </aside>
        </div>

        <p
          style={{
            textAlign: "center",

            color: theme.muted,

            marginTop: "24px",

            fontSize: "13px",

            fontWeight: 600,
          }}
        >
          EasyMath AI • Learn the method, not just the
          answer.
        </p>
      </div>

      {authModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(15,23,42,0.55)",
            display: "grid",
            placeItems: "center",
            padding: "18px",
          }}
          onClick={() => {
            if (!authBusy) {
              setAuthModalOpen(false);
            }
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "420px",
              background: theme.panelSoft,
              color: theme.text,
              border: `1px solid ${theme.border}`,
              borderRadius: "22px",
              padding: "22px",
              boxShadow: theme.shadow,
            }}
          >
            <div
              style={{
                fontWeight: 900,
                fontSize: "22px",
                letterSpacing: "-0.02em",
              }}
            >
              {authMode === "login" ? "Welcome back" : "Create your account"}
            </div>
            <div
              style={{
                marginTop: "8px",
                color: theme.muted,
                fontWeight: 600,
                fontSize: "14px",
                lineHeight: 1.5,
              }}
            >
              Save your progress in the cloud and keep your Free plan usage
              across devices.
            </div>

            <label
              style={{
                display: "block",
                marginTop: "18px",
                fontWeight: 800,
                fontSize: "13px",
              }}
            >
              Email
              <input
                type="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                autoComplete="email"
                style={{
                  width: "100%",
                  marginTop: "8px",
                  padding: "12px 14px",
                  borderRadius: "12px",
                  border: `1px solid ${theme.border}`,
                  background: theme.input,
                  color: theme.text,
                  fontWeight: 600,
                }}
              />
            </label>

            <label
              style={{
                display: "block",
                marginTop: "14px",
                fontWeight: 800,
                fontSize: "13px",
              }}
            >
              Password
              <input
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                autoComplete={
                  authMode === "login" ? "current-password" : "new-password"
                }
                style={{
                  width: "100%",
                  marginTop: "8px",
                  padding: "12px 14px",
                  borderRadius: "12px",
                  border: `1px solid ${theme.border}`,
                  background: theme.input,
                  color: theme.text,
                  fontWeight: 600,
                }}
              />
            </label>

            {authMessage && (
              <div
                style={{
                  marginTop: "14px",
                  padding: "12px 13px",
                  borderRadius: "12px",
                  background: darkMode ? "#422006" : "#fffbeb",
                  border: "1px solid #f59e0b",
                  fontWeight: 700,
                  fontSize: "13px",
                  lineHeight: 1.5,
                }}
              >
                {authMessage}
              </div>
            )}

            <button
              type="button"
              onClick={handleAuthSubmit}
              disabled={authBusy}
              style={{
                width: "100%",
                marginTop: "16px",
                border: "none",
                background: "linear-gradient(135deg,#2563eb,#1d4ed8)",
                color: "white",
                padding: "13px 16px",
                borderRadius: "12px",
                fontWeight: 900,
                cursor: authBusy ? "wait" : "pointer",
              }}
            >
              {authBusy
                ? "Please wait..."
                : authMode === "login"
                  ? "Log in"
                  : "Sign up"}
            </button>

            <button
              type="button"
              onClick={() => {
                setAuthMode(authMode === "login" ? "signup" : "login");
                setAuthMessage("");
              }}
              style={{
                width: "100%",
                marginTop: "10px",
                border: "none",
                background: "transparent",
                color: theme.muted,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {authMode === "login"
                ? "Need an account? Sign up"
                : "Already have an account? Log in"}
            </button>
          </div>
        </div>
      )}

      {accountOpen && signedIn && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(15,23,42,0.55)",
            display: "grid",
            placeItems: "center",
            padding: "18px",
          }}
          onClick={() => setAccountOpen(false)}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "460px",
              background: theme.panelSoft,
              color: theme.text,
              border: `1px solid ${theme.border}`,
              borderRadius: "22px",
              padding: "22px",
              boxShadow: theme.shadow,
            }}
          >
            <div
              style={{
                fontWeight: 900,
                fontSize: "22px",
                letterSpacing: "-0.02em",
              }}
            >
              Your account
            </div>

            <div
              style={{
                marginTop: "16px",
                display: "grid",
                gap: "10px",
              }}
            >
              {[
                { label: "Email", value: userEmail || "—" },
                { label: "Plan", value: planLabel },
                {
                  label: "Daily usage",
                  value: usageLabel,
                },
                {
                  label: "Questions solved",
                  value: String(stats.questionsSolved),
                },
                {
                  label: "Practice score",
                  value: `${stats.practiceCorrect}/${stats.practiceAttempted || 0}`,
                },
                {
                  label: "Accuracy",
                  value:
                    practiceAccuracy === null ? "—" : `${practiceAccuracy}%`,
                },
                { label: "Student level", value: studentLevel },
                { label: "Practice topic", value: practiceTopic },
              ].map((row) => (
                <div
                  key={row.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "12px",
                    padding: "11px 12px",
                    borderRadius: "12px",
                    border: `1px solid ${theme.border}`,
                    background: darkMode ? "#0b1220" : "#f8fafc",
                  }}
                >
                  <span
                    style={{
                      color: theme.muted,
                      fontWeight: 800,
                      fontSize: "13px",
                    }}
                  >
                    {row.label}
                  </span>
                  <span
                    style={{
                      fontWeight: 800,
                      fontSize: "13px",
                      textAlign: "right",
                    }}
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleLogout}
              style={{
                width: "100%",
                marginTop: "16px",
                border: "none",
                background: "linear-gradient(135deg,#dc2626,#b91c1c)",
                color: "white",
                padding: "13px 16px",
                borderRadius: "12px",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Log out
            </button>

            <button
              type="button"
              onClick={() => setAccountOpen(false)}
              style={{
                width: "100%",
                marginTop: "10px",
                border: `1px solid ${theme.border}`,
                background: theme.buttonSoft,
                color: theme.text,
                padding: "12px 16px",
                borderRadius: "12px",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {pricingOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="EasyMath AI plans"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(15,23,42,0.58)",
            display: "grid",
            placeItems: "center",
            padding: "18px",
            overflowY: "auto",
          }}
          onClick={() => setPricingOpen(false)}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "760px",
              margin: "auto",
              background: theme.panelSoft,
              color: theme.text,
              border: `1px solid ${theme.border}`,
              borderRadius: "24px",
              padding: "22px",
              boxShadow: theme.shadow,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <div>
                <div
                  style={{
                    color: "#7c3aed",
                    fontSize: "11px",
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                  }}
                >
                  UPGRADE
                </div>
                <div
                  style={{
                    marginTop: "6px",
                    fontWeight: 900,
                    fontSize: "24px",
                    letterSpacing: "-0.03em",
                  }}
                >
                  Choose your EasyMath AI plan
                </div>
                <div
                  style={{
                    marginTop: "8px",
                    color: theme.muted,
                    fontWeight: 600,
                    fontSize: "14px",
                    lineHeight: 1.55,
                    maxWidth: "520px",
                  }}
                >
                  Keep practising on Free, or get ready for Pro unlimited solving
                  when it launches.
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPricingOpen(false)}
                style={{
                  border: `1px solid ${theme.border}`,
                  background: theme.buttonSoft,
                  color: theme.text,
                  padding: "10px 14px",
                  borderRadius: "12px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>

            <div className="easymath-pricing-grid">
              <div
                style={{
                  padding: "18px",
                  borderRadius: "18px",
                  border: `1px solid ${theme.border}`,
                  background: darkMode ? "#0b1220" : "#f8fafc",
                }}
              >
                <div
                  style={{
                    fontWeight: 900,
                    fontSize: "12px",
                    letterSpacing: "0.06em",
                    color: theme.muted,
                  }}
                >
                  FREE
                </div>
                <div
                  style={{
                    marginTop: "10px",
                    fontWeight: 900,
                    fontSize: "32px",
                    letterSpacing: "-0.03em",
                  }}
                >
                  AED 0
                </div>
                <div
                  style={{
                    marginTop: "4px",
                    color: theme.muted,
                    fontWeight: 700,
                    fontSize: "13px",
                  }}
                >
                  Your current plan
                </div>
                <ul
                  style={{
                    margin: "16px 0 0",
                    padding: "0 0 0 18px",
                    display: "grid",
                    gap: "9px",
                    fontWeight: 600,
                    fontSize: "14px",
                    lineHeight: 1.45,
                    color: theme.text,
                  }}
                >
                  <li>10 AI solver questions per day</li>
                  <li>Photo Solver included within the daily solver limit</li>
                  <li>Practice Mode</li>
                  <li>Step-by-step explanations</li>
                  <li>Student level selection</li>
                  <li>Progress tracking</li>
                </ul>
                <button
                  type="button"
                  onClick={() => setPricingOpen(false)}
                  style={{
                    width: "100%",
                    marginTop: "18px",
                    border: `1px solid ${theme.border}`,
                    background: theme.buttonSoft,
                    color: theme.text,
                    padding: "12px 16px",
                    borderRadius: "12px",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Continue with Free
                </button>
              </div>

              <div
                style={{
                  padding: "18px",
                  borderRadius: "18px",
                  border: "1px solid #8b5cf6",
                  background: darkMode
                    ? "linear-gradient(160deg,#2e1065 0%,#172554 55%,#0b1220 100%)"
                    : "linear-gradient(160deg,#faf5ff 0%,#eff6ff 55%,#ffffff 100%)",
                  boxShadow: darkMode
                    ? "0 16px 36px rgba(124,58,237,0.28)"
                    : "0 16px 36px rgba(124,58,237,0.16)",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: "14px",
                    right: "14px",
                    padding: "5px 10px",
                    borderRadius: "999px",
                    background: "linear-gradient(135deg,#7c3aed,#2563eb)",
                    color: "white",
                    fontWeight: 900,
                    fontSize: "11px",
                    letterSpacing: "0.04em",
                  }}
                >
                  RECOMMENDED
                </div>
                <div
                  style={{
                    fontWeight: 900,
                    fontSize: "12px",
                    letterSpacing: "0.06em",
                    color: darkMode ? "#c4b5fd" : "#6d28d9",
                  }}
                >
                  PRO
                </div>
                <div
                  style={{
                    marginTop: "10px",
                    fontWeight: 900,
                    fontSize: "32px",
                    letterSpacing: "-0.03em",
                  }}
                >
                  Coming Soon
                </div>
                <div
                  style={{
                    marginTop: "4px",
                    color: theme.muted,
                    fontWeight: 700,
                    fontSize: "13px",
                  }}
                >
                  Unlimited solving when Pro launches
                </div>
                <ul
                  style={{
                    margin: "16px 0 0",
                    padding: "0 0 0 18px",
                    display: "grid",
                    gap: "9px",
                    fontWeight: 600,
                    fontSize: "14px",
                    lineHeight: 1.45,
                    color: theme.text,
                  }}
                >
                  <li>Unlimited AI solver questions</li>
                  <li>Unlimited Photo Solver</li>
                  <li>Practice Mode</li>
                  <li>Step-by-step explanations</li>
                  <li>Student level selection</li>
                  <li>Progress tracking</li>
                  <li>Priority access to future features</li>
                </ul>
                <button
                  type="button"
                  disabled
                  style={{
                    width: "100%",
                    marginTop: "18px",
                    border: "none",
                    background: "linear-gradient(135deg,#7c3aed,#6d28d9)",
                    color: "white",
                    padding: "12px 16px",
                    borderRadius: "12px",
                    fontWeight: 900,
                    cursor: "not-allowed",
                    opacity: 0.85,
                  }}
                >
                  Coming Soon
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setPricingOpen(false)}
              style={{
                width: "100%",
                marginTop: "16px",
                border: "none",
                background: "transparent",
                color: theme.muted,
                padding: "10px",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              ← Back to solver
            </button>
          </div>
        </div>
      )}
    </main>
  );
}