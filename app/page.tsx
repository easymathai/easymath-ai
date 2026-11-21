"use client";

import {
  ChangeEvent,
  type ClipboardEvent,
  type CSSProperties,
  type DragEvent,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  authHeaders,
  cloudAccountsAvailable,
  getAccessToken,
  readAuthState,
} from "@/lib/client-auth";
import {
  DAILY_LIMIT_MESSAGE,
  FREE_DAILY_PHOTO_SOLVE_LIMIT,
  FREE_DAILY_SOLVER_LIMIT,
  FREE_PLAN_NAME,
  FREE_PLAN_SUMMARY,
  IMAGE_TOO_LARGE_MESSAGE,
  MAX_IMAGE_UPLOAD_BYTES,
  PHOTO_LIMIT_MESSAGE,
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
  listNamedTopicMastery,
  normalizeDashboardStats,
  normalizePracticeMistakes,
  normalizeSolverHistory,
  practiceDifficultyNudge,
  rankDashboardTopics,
  recordDashboardTopicAttempt,
  recordPracticeMistake,
  resolvePracticeMistake,
  getTopicMastery,
  SOLVER_HISTORY_LIMIT,
  TOPIC_MASTERY_LABELS,
  type CloudDashboardStats,
  type CloudPracticeMistake,
  type PracticeDifficultyNudge,
} from "@/lib/progress";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import Link from "next/link";
import Image from "next/image";
import LandingFooter from "./landing-footer";
import HowDemo from "./how-demo";
import TutorSolution from "./tutor-solution";
import {
  Faq,
  Features,
  HowItWorks,
  Plans,
  SectionHead,
  SolutionPreview,
  Subjects,
  ValueStrip,
} from "./landing-sections";
import MathText from "./math-text";
import { mathToPlainText } from "@/lib/math-format";
import BrandLogo from "./brand-logo";
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

const QUICK_START: { topic: PracticeTopic; label: string; icon: string; example: string }[] = [
  { topic: "algebra", label: "Algebra", icon: "x", example: "Simplify 3(x + 4) - 2x" },
  { topic: "equations", label: "Equations", icon: "=", example: "Solve 2x + 7 = 19" },
  { topic: "fractions", label: "Fractions", icon: "½", example: "Work out 3/4 + 5/6" },
  { topic: "geometry", label: "Geometry", icon: "△", example: "Area of a circle with radius 5 cm" },
  { topic: "percentages", label: "Percentages", icon: "%", example: "What is 15% of 240?" },
  { topic: "arithmetic", label: "Arithmetic", icon: "+", example: "Work out 486 ÷ 6" },
];

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
    "Unable to convert this iPhone photo. Please try another photo.":
      "We couldn't read that iPhone photo. Please try another picture.",
    "Unable to load your progress right now.":
      "We couldn't load your saved progress. Please try again.",
    "Unable to save your progress right now.":
      "We couldn't save your progress just now. Please try again.",
    "Something went wrong.":
      "Something went wrong. Please try again.",
    [DAILY_LIMIT_MESSAGE]: DAILY_LIMIT_MESSAGE,
    [PHOTO_LIMIT_MESSAGE]: PHOTO_LIMIT_MESSAGE,
  };

  if (known[message]) {
    return known[message];
  }

  const lower = message.toLowerCase();

  if (
    message.includes("{") ||
    message.length > 180 ||
    lower.includes("supabase") ||
    lower.includes("openai") ||
    lower.includes("api key") ||
    lower.includes("stack") ||
    lower.includes("internal server") ||
    lower.includes("jwt")
  ) {
    return fallback;
  }

  return message;
}

function friendlyAuthError(message: unknown, fallback: string): string {
  if (typeof message !== "string" || !message.trim()) {
    return fallback;
  }

  const lower = message.toLowerCase();

  if (lower.includes("invalid login") || lower.includes("invalid credentials")) {
    return "That email or password doesn't look right. Please try again.";
  }

  if (
    lower.includes("already registered") ||
    lower.includes("already been registered")
  ) {
    return "That email already has an account. Try logging in.";
  }

  if (lower.includes("rate") || lower.includes("too many")) {
    return "Too many attempts. Please wait a moment and try again.";
  }

  return studentFriendlyError(
    message,
    fallback
  );
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
  // Photo scan: the free "read" step result the student can confirm or edit
  // before spending a daily solve. null = nothing read yet.
  const [scanDraft, setScanDraft] = useState<string | null>(null);
  const [lastSolveSource, setLastSolveSource] = useState<"text" | "photo">("text");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("wrong_answer");
  const [reportComment, setReportComment] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportStatus, setReportStatus] = useState<"" | "sent" | "error">("");
  const [reportMessage, setReportMessage] = useState("");
  const [stats, setStats] = useState<StudentStats>(emptyStats);
  const [hasMounted, setHasMounted] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [dailyUsed, setDailyUsed] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(FREE_DAILY_SOLVER_LIMIT);
  const [dailyPhotoUsed, setDailyPhotoUsed] = useState(0);
  const [dailyPhotoLimit, setDailyPhotoLimit] = useState(
    FREE_DAILY_PHOTO_SOLVE_LIMIT
  );
  const [userPlan, setUserPlan] = useState<UserPlan>("free");
  const [solverUnlimited, setSolverUnlimited] = useState(false);
  const [cloudEnabled] = useState(() => cloudAccountsAvailable());
  const [pricingOpen, setPricingOpen] = useState(false);
  const [practiceSource, setPracticeSource] = useState<
    "recommended" | "manual" | null
  >(null);
  const [practiceLaunchError, setPracticeLaunchError] = useState("");
  const [practiceMistakes, setPracticeMistakes] = useState<
    CloudPracticeMistake[]
  >([]);
  const [reviewActive, setReviewActive] = useState(false);
  const [reviewQueue, setReviewQueue] = useState<CloudPracticeMistake[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewAnswer, setReviewAnswer] = useState("");
  const [reviewChecking, setReviewChecking] = useState(false);
  const [reviewFeedback, setReviewFeedback] = useState("");
  const [reviewHint, setReviewHint] = useState("");
  const [reviewCorrect, setReviewCorrect] = useState<boolean | null>(null);
  const [reviewCompleted, setReviewCompleted] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [followUp, setFollowUp] = useState("");
  const [voiceListening, setVoiceListening] = useState(false);
  const voiceRef = useRef<{ stop: () => void } | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const lastScrolledSolutionRef = useRef("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const practicePanelRef = useRef<HTMLDivElement>(null);
  const reviewPanelRef = useRef<HTMLDivElement>(null);
  const latestSolutionRef = useRef(solution);
  const latestPracticeQuestionRef = useRef("");
  const practiceRequestRef = useRef(0);
  const solverBusyRef = useRef(false);
  const practiceLaunchBusyRef = useRef(false);
  const practiceCheckBusyRef = useRef(false);
  const practiceNavBusyRef = useRef(false);
  const reviewCheckBusyRef = useRef(false);
  const authBusyRef = useRef(false);
  const deleteBusyRef = useRef(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloudReadyRef = useRef(false);
  const statsRef = useRef(stats);
  const historyRef = useRef(history);
  const dashboardStatsRef = useRef(dashboardStats);
  const practiceMistakesRef = useRef(practiceMistakes);
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
  practiceMistakesRef.current = practiceMistakes;
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
    // Hydrate saved preferences from localStorage after mount. This must run
    // after hydration (localStorage is not available during SSR), so it is a
    // deliberate one-time sync from an external store.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

    try {
      const savedMistakes = localStorage.getItem("easymath-practice-mistakes");

      if (savedMistakes) {
        const next = normalizePracticeMistakes(JSON.parse(savedMistakes));
        practiceMistakesRef.current = next;
        setPracticeMistakes(next);
      }
    } catch {
      // ignore
    }

    if (!cloudAccountsAvailable()) {
      const localUsage = getLocalUsageSnapshot();
      setDailyUsed(localUsage.used);
      setDailyLimit(localUsage.limit);
      setDailyPhotoUsed(localUsage.photoUsed);
      setDailyPhotoLimit(localUsage.photoLimit);
    }
  }, []);

  // Effect events always call the latest loaders without re-subscribing to
  // Supabase auth changes on every render.
  const onAuthSignedIn = useEffectEvent(() => loadCloudProfileAndUsage());
  const onAuthSignedOut = useEffectEvent(() => loadGuestUsage());

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
        await onAuthSignedIn();
      } else {
        setSignedIn(false);
        setUserEmail(null);
        setUserPlan("free");
        setSolverUnlimited(false);
        cloudReadyRef.current = false;
        await onAuthSignedOut();
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
        void onAuthSignedIn();
      } else {
        setSignedIn(false);
        setUserEmail(null);
        setUserPlan("free");
        setSolverUnlimited(false);
        cloudReadyRef.current = false;
        void onAuthSignedOut();
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
    practiceMistakes,
  ]);

  // Reset practice state whenever the solver result changes. Done during
  // render (React's "adjust state when a value changes" pattern) instead of
  // inside an effect, which avoided an extra cascading render.
  const [practiceStateSolution, setPracticeStateSolution] = useState(solution);

  if (practiceStateSolution !== solution) {
    setPracticeStateSolution(solution);
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
    setPracticeSource(null);
    setPracticeLaunchError("");
  }

  useEffect(() => {
    // Invalidate any in-flight practice request from the previous solution.
    practiceRequestRef.current += 1;
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

  function persistPracticeMistakes(next: CloudPracticeMistake[]) {
    const normalized = normalizePracticeMistakes(next);
    practiceMistakesRef.current = normalized;
    setPracticeMistakes(normalized);

    try {
      localStorage.setItem(
        "easymath-practice-mistakes",
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
      setDailyPhotoUsed(localUsage.photoUsed);
      setDailyPhotoLimit(localUsage.photoLimit);
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
      setDailyPhotoUsed(Number(usage.photoUsed) || 0);
      setDailyPhotoLimit(Number(usage.photoLimit) || FREE_DAILY_PHOTO_SOLVE_LIMIT);
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
          const cloudMistakes = normalizePracticeMistakes(
            progress.practiceMistakes ?? progress.practiceProgress?.mistakes
          );
          const cloudEmpty =
            Number(progress.questionsSolved) === 0 &&
            Number(progress.practiceAttempted) === 0 &&
            (!Array.isArray(progress.activity) ||
              progress.activity.length === 0) &&
            isDashboardStatsEmpty(cloudDashboard) &&
            cloudMistakes.length === 0;

          const local = statsRef.current;
          const localHasData =
            local.questionsSolved > 0 ||
            local.practiceAttempted > 0 ||
            local.activity.length > 0 ||
            !isDashboardStatsEmpty(dashboardStatsRef.current) ||
            practiceMistakesRef.current.length > 0;

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

            persistPracticeMistakes(cloudMistakes);
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
          setDailyPhotoUsed(0);
          setDailyPhotoLimit(FREE_DAILY_PHOTO_SOLVE_LIMIT);
        } else {
          setSolverUnlimited(false);
          setDailyUsed(Number(usage.used) || 0);
          setDailyLimit(Number(usage.limit) || FREE_DAILY_SOLVER_LIMIT);
          setDailyPhotoUsed(Number(usage.photoUsed) || 0);
          setDailyPhotoLimit(
            Number(usage.photoLimit) || FREE_DAILY_PHOTO_SOLVE_LIMIT
          );
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
            mistakes: practiceMistakesRef.current,
          },
        }),
      });
    } catch (error) {
      console.error("pushCloudProgress error:", error);
    }
  }

  async function handleAuthSubmit() {
    if (authBusyRef.current || authBusy) {
      return;
    }

    if (!cloudEnabled) {
      setAuthMessage(
        "Cloud accounts aren't available yet. You can still use EasyMath on this device."
      );
      return;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setAuthMessage(
        "Cloud accounts aren't available yet. You can still use EasyMath on this device."
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

    authBusyRef.current = true;
    setAuthBusy(true);
    setAuthMessage("");

    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) {
          setAuthMessage(
            friendlyAuthError(
              error.message,
              "We couldn't create that account. Please try again."
            )
          );
          return;
        }

        if (data.session) {
          setAuthModalOpen(false);
          setAuthPassword("");
          setAuthMessage("");
          setAccountOpen(true);
        } else {
          setAuthMessage(
            "Account created. Check your email if you need to confirm it, then log in."
          );
          setAuthMode("login");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setAuthMessage(
            friendlyAuthError(
              error.message,
              "We couldn't log you in. Please try again."
            )
          );
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
      authBusyRef.current = false;
      setAuthBusy(false);
    }
  }

  async function handleForgotPassword() {
    if (authBusyRef.current) {
      return;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setAuthMessage(
        "Cloud accounts aren't available yet. You can still use EasyMath on this device."
      );
      return;
    }

    const email = authEmail.trim();

    if (!email || !email.includes("@")) {
      setAuthMessage("Enter your account email above, then tap Forgot password? again.");
      return;
    }

    authBusyRef.current = true;
    setAuthBusy(true);
    setAuthMessage("");

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        const lower = error.message.toLowerCase();

        if (lower.includes("rate") || lower.includes("too many") || lower.includes("seconds")) {
          setAuthMessage("Too many reset requests. Please wait a minute and try again.");
          return;
        }

        setAuthMessage("We couldn't send a reset email right now. Please try again.");
        return;
      }

      // Same message whether or not the account exists (no account enumeration).
      setAuthMessage(
        "If an account exists for that email, we've sent a password reset link. Check your inbox (and spam folder)."
      );
    } catch {
      setAuthMessage("Unable to reach the account service. Please try again.");
    } finally {
      authBusyRef.current = false;
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
    setDeleteConfirmOpen(false);
    setDeleteConfirmText("");
    setDeleteError("");

    void loadGuestUsage();
  }

  function clearSignedInLocalProgress() {
    try {
      localStorage.removeItem("easymath-history");
      localStorage.removeItem("easymath-level");
      localStorage.removeItem("easymath-topic");
      localStorage.removeItem("easymath-stats");
      localStorage.removeItem("easymath-dashboard-stats");
      localStorage.removeItem("easymath-practice-mistakes");
    } catch {
      // Safari private mode may block storage.
    }

    setHistory([]);
    setStats(emptyStats());
    setDashboardStats(emptyDashboardStats());
    setPracticeMistakes([]);
    setStudentLevel("middle");
    setPracticeTopic("mixed");
    setPracticeSet([]);
    setPracticeTokens([]);
    setPracticeIndex(0);
    setPracticeScore(0);
    setPracticeCompleted(false);
    setPracticeSource(null);
    setPracticeLaunchError("");
    setReviewActive(false);
    setReviewQueue([]);
    setReviewIndex(0);
  }

  async function handleDeleteAccount() {
    if (
      deleteBusyRef.current ||
      deleteBusy ||
      deleteConfirmText !== "DELETE"
    ) {
      return;
    }

    deleteBusyRef.current = true;
    setDeleteBusy(true);
    setDeleteError("");

    try {
      const headers = await authHeaders();
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers,
      });

      let payload: { error?: string; ok?: boolean } = {};
      try {
        payload = (await response.json()) as { error?: string; ok?: boolean };
      } catch {
        payload = {};
      }

      if (!response.ok || !payload.ok) {
        setDeleteError(
          studentFriendlyError(
            payload.error,
            "We couldn't delete your account. Please try again."
          )
        );
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (supabase) {
        await supabase.auth.signOut();
      }

      clearSignedInLocalProgress();
      setSignedIn(false);
      setUserEmail(null);
      setAccountOpen(false);
      setDeleteConfirmOpen(false);
      setDeleteConfirmText("");
      setUserPlan("free");
      setSolverUnlimited(false);
      cloudReadyRef.current = false;
      setMessage("Your EasyMath account and saved progress were deleted.");
      void loadGuestUsage();
    } catch {
      setDeleteError("We couldn't delete your account. Please try again.");
    } finally {
      deleteBusyRef.current = false;
      setDeleteBusy(false);
    }
  }

  function applyUsageFromResponse(data: {
    usage?: {
      used?: number;
      limit?: number | null;
      photoUsed?: number;
      photoLimit?: number | null;
    } | null;
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
    if (typeof data.usage.photoUsed === "number") {
      setDailyPhotoUsed(data.usage.photoUsed);
    }
    if (typeof data.usage.photoLimit === "number") {
      setDailyPhotoLimit(data.usage.photoLimit);
    }
  }

  function guardSolverQuota(isPhoto = false): boolean {
    if (signedIn && solverUnlimited) {
      return true;
    }

    if (!signedIn && !cloudEnabled) {
      if (!canUseLocalSolver(isPhoto)) {
        const snap = getLocalUsageSnapshot();
        setMessage(
          isPhoto && snap.photoRemaining <= 0 && snap.remaining > 0
            ? PHOTO_LIMIT_MESSAGE
            : DAILY_LIMIT_MESSAGE
        );
        setDailyUsed(snap.used);
        setDailyLimit(snap.limit);
        setDailyPhotoUsed(snap.photoUsed);
        setDailyPhotoLimit(snap.photoLimit);
        return false;
      }

      return true;
    }

    if (dailyUsed >= dailyLimit) {
      setMessage(DAILY_LIMIT_MESSAGE);
      return false;
    }

    if (isPhoto && dailyPhotoUsed >= dailyPhotoLimit) {
      setMessage(PHOTO_LIMIT_MESSAGE);
      return false;
    }

    return true;
  }

  async function solveQuestion(
    customQuestion?: string,
    options: { source?: "text" | "photo"; level?: StudentLevel } = {}
  ) {
    const finalQuestion = customQuestion ?? question;
    const solveSource = options.source ?? "text";

    if (!finalQuestion.trim()) {
      setMessage("Please enter a math question.");
      return;
    }

    if (solverBusyRef.current || loading || imageLoading) {
      return;
    }

    if (!guardSolverQuota(solveSource === "photo")) {
      return;
    }

    solverBusyRef.current = true;
    setQuestion(finalQuestion);
    setLoading(true);
    setSolution("");
    setSolverPracticeToken("");
    setSolverPracticeQuestion("");
    setMessage("");
    setDetectedProblem(solveSource === "photo" ? finalQuestion : "");
    setLastSolveSource(solveSource);
    resetReport();

    try {
      const headers = await authHeaders({
        "Content-Type": "application/json",
      });

      const response = await fetch("/api/solve", {
        method: "POST",
        headers,
        body: JSON.stringify({
          question: finalQuestion,
          level: options.level ?? studentLevel,
          mathFormat: "latex",
          source: solveSource,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          setMessage(
            studentFriendlyError(
              data.error,
              data.code === "PHOTO_LIMIT_REACHED"
                ? PHOTO_LIMIT_MESSAGE
                : DAILY_LIMIT_MESSAGE
            )
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
        const consumed = consumeLocalSolver(solveSource === "photo");
        setDailyUsed(consumed.used);
        setDailyLimit(consumed.limit);
        setDailyPhotoUsed(consumed.photoUsed);
        setDailyPhotoLimit(consumed.photoLimit);
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

      if (solveSource === "photo") {
        setScanDraft(null);
      }

      recordActivity(
        solveSource === "photo"
          ? "Solved a photo problem"
          : `Solved: ${mathToPlainText(finalQuestion)}`,
        {
          questionsSolvedDelta: 1,
        }
      );
      touchDashboardStreak();

      const updatedHistory = [
        {
          question:
            solveSource === "photo" ? `📷 ${finalQuestion}` : finalQuestion,
          solution: result,
          at: new Date().toISOString(),
          source: solveSource,
        },
        ...history.filter(
          (item) => item.question !== finalQuestion
        ),
      ].slice(0, SOLVER_HISTORY_LIMIT);

      saveHistory(updatedHistory);
    } catch {
      setSolution("We couldn't reach EasyMath Ai. Please check your connection and try again.");
    } finally {
      solverBusyRef.current = false;
      setLoading(false);
    }
  }

  function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!acceptImageFile(file)) {
      event.target.value = "";
    }
  }

  /** Validates and selects a photo from the file picker, drag & drop or paste. */
  function acceptImageFile(file: File): boolean {

    if (
      file.type &&
      !file.type.startsWith("image/") &&
      !file.type.toLowerCase().includes("heic") &&
      !file.type.toLowerCase().includes("heif")
    ) {
      setMessage("Please select an image file.");
      return false;
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
      return false;
    }

    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      setMessage(IMAGE_TOO_LARGE_MESSAGE);
      return false;
    }

    setImageFile(file);
    setSolution("");
    setMessage("");
    setDetectedProblem("");
    setScanDraft(null);

    const preview = URL.createObjectURL(file);
    setImagePreview(preview);
    return true;
  }

  /**
   * Step 1 of the photo solver: read the problem from the photo (free — never
   * uses a daily solve). The student then confirms or fixes the text, and
   * step 2 (solveQuestion with source "photo") spends one solve.
   */
  async function readImage() {
    if (!imageFile) {
      setMessage("Please choose a photo first.");
      return;
    }

    if (solverBusyRef.current || imageLoading || loading) {
      return;
    }

    if (!guardSolverQuota(true)) {
      return;
    }

    solverBusyRef.current = true;
    setImageLoading(true);
    setSolution("");
    setSolverPracticeToken("");
    setSolverPracticeQuestion("");
    setMessage("");
    setDetectedProblem("");
    setScanDraft(null);

    try {
      const formData = new FormData();
      formData.append("image", imageFile);
      formData.append("level", studentLevel);
      formData.append("mode", "read");

      const headers = await authHeaders();

      const response = await fetch("/api/solve-image", {
        method: "POST",
        headers,
        body: formData,
      });

      if (response.status === 413) {
        // The hosting platform may reject large bodies with a non-JSON page.
        setMessage(IMAGE_TOO_LARGE_MESSAGE);
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          setMessage(
            studentFriendlyError(
              data.error,
              data.code === "PHOTO_LIMIT_REACHED"
                ? PHOTO_LIMIT_MESSAGE
                : DAILY_LIMIT_MESSAGE
            )
          );
          if (data.usage) {
            applyUsageFromResponse(data);
          } else {
            setDailyUsed(dailyLimit);
          }
          return;
        }

        setMessage(
          response.status === 422
            ? "We couldn't read the math in this photo. Try a clearer, closer picture — this didn't use a solve."
            : studentFriendlyError(
                data.error,
                "We couldn't read that photo. Please try a clearer picture. This didn't use a solve."
              )
        );
        return;
      }

      const read =
        typeof data.transcription === "string" ? data.transcription.trim() : "";

      if (!read) {
        setMessage(
          "We couldn't read the math in this photo. Try a clearer, closer picture — this didn't use a solve."
        );
        return;
      }

      setScanDraft(read);
    } catch {
      setMessage(
        "We couldn't reach the photo solver. Please check your connection and try again."
      );
    } finally {
      solverBusyRef.current = false;
      setImageLoading(false);
    }
  }

  async function solveConfirmedScan() {
    const confirmed = (scanDraft ?? "").trim();

    if (!confirmed) {
      setMessage("Please type the math problem from your photo.");
      return;
    }

    await solveQuestion(confirmed, { source: "photo" });
  }

  function resetReport() {
    setReportOpen(false);
    setReportReason("wrong_answer");
    setReportComment("");
    setReportBusy(false);
    setReportStatus("");
    setReportMessage("");
  }

  async function submitReport() {
    if (reportBusy || !solution.trim()) {
      return;
    }

    setReportBusy(true);
    setReportStatus("");
    setReportMessage("");

    try {
      const headers = await authHeaders({
        "Content-Type": "application/json",
      });

      const response = await fetch("/api/feedback", {
        method: "POST",
        headers,
        body: JSON.stringify({
          question: (detectedProblem || question || "").slice(0, 2000),
          solution: solution.slice(0, 20000),
          reason: reportReason,
          comment: reportComment.trim().slice(0, 1000),
          source: lastSolveSource,
          level: studentLevel,
          platform: "web",
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setReportStatus("error");
        setReportMessage(
          studentFriendlyError(
            data.error,
            "We couldn't send that report. Please try again."
          )
        );
        return;
      }

      setReportStatus("sent");
      setReportMessage("Thanks! Our team will check this solution.");
      setReportOpen(false);
    } catch {
      setReportStatus("error");
      setReportMessage("We couldn't send that report. Please try again.");
    } finally {
      setReportBusy(false);
    }
  }

  async function checkPracticeAnswer() {
    if (!practiceQuestion.trim() || practiceChecking || practiceCheckBusyRef.current) {
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

    practiceCheckBusyRef.current = true;
    setPracticeChecking(true);
    setPracticeFeedback("");
    setPracticeHint("");
    setPracticeCorrect(null);

    const solutionWhenChecked = solution;
    const practiceWhenChecked = practiceQuestion;

    try {
      const headers = await authHeaders({
        "Content-Type": "application/json",
      });
      // Only send the signed token when it belongs to the question on screen.
      const practiceToken =
        (practiceSet[practiceIndex] || "").trim() === practiceQuestion.trim()
          ? practiceTokens[practiceIndex] || ""
          : "";

      const response = await fetch("/api/check-practice", {
        method: "POST",
        headers,
        body: JSON.stringify({
          practiceQuestion,
          studentAnswer: practiceAnswer,
          level: studentLevel,
          ...(practiceToken ? { practiceToken } : {}),
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
          persistPracticeMistakes(
            recordPracticeMistake(practiceMistakesRef.current, {
              topic: topicRef.current,
              question: practiceWhenChecked,
              studentAnswer: practiceAnswer,
            })
          );
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
      practiceCheckBusyRef.current = false;
      if (
        latestSolutionRef.current === solutionWhenChecked &&
        latestPracticeQuestionRef.current === practiceWhenChecked
      ) {
        setPracticeChecking(false);
      }
    }
  }

  function resetReviewQuestionState() {
    setReviewAnswer("");
    setReviewChecking(false);
    setReviewFeedback("");
    setReviewHint("");
    setReviewCorrect(null);
  }

  function startMistakeReview() {
    const queue = normalizePracticeMistakes(practiceMistakesRef.current);

    if (queue.length === 0) {
      return;
    }

    setReviewQueue(queue);
    setReviewIndex(0);
    setReviewCompleted(false);
    setReviewActive(true);
    resetReviewQuestionState();

    window.setTimeout(() => {
      reviewPanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
  }

  function closeMistakeReview() {
    setReviewActive(false);
    setReviewQueue([]);
    setReviewIndex(0);
    setReviewCompleted(false);
    resetReviewQuestionState();
  }

  function goToNextReviewMistake() {
    if (reviewChecking) {
      return;
    }

    const nextIndex = reviewIndex + 1;

    if (nextIndex >= reviewQueue.length) {
      setReviewCompleted(true);
      resetReviewQuestionState();
      return;
    }

    setReviewIndex(nextIndex);
    resetReviewQuestionState();
  }

  async function checkReviewAnswer() {
    const current = reviewQueue[reviewIndex];

    if (
      !current ||
      reviewChecking ||
      reviewCheckBusyRef.current ||
      reviewCompleted ||
      practiceGenerating ||
      loading ||
      imageLoading
    ) {
      return;
    }

    if (!reviewAnswer.trim()) {
      setReviewCorrect(null);
      setReviewHint("");
      setReviewFeedback("Please enter an answer to check.");
      return;
    }

    setReviewChecking(true);
    setReviewFeedback("");
    setReviewHint("");
    setReviewCorrect(null);

    const questionWhenChecked = current.question;
    const mistakeId = current.id;

    reviewCheckBusyRef.current = true;

    try {
      const headers = await authHeaders({
        "Content-Type": "application/json",
      });

      const response = await fetch("/api/check-practice", {
        method: "POST",
        headers,
        body: JSON.stringify({
          practiceQuestion: current.question,
          studentAnswer: reviewAnswer,
          level: studentLevel,
        }),
      });

      const data = await response.json();

      if (reviewQueue[reviewIndex]?.id !== mistakeId) {
        return;
      }

      if (!response.ok) {
        setReviewCorrect(null);
        setReviewHint("");
        setReviewFeedback(
          studentFriendlyError(
            data.error,
            "We couldn't check that answer. Please try again."
          )
        );
        return;
      }

      const isCorrect = Boolean(data.correct);

      setReviewCorrect(isCorrect);
      setReviewFeedback(
        typeof data.feedback === "string"
          ? data.feedback
          : isCorrect
            ? "Yes — that's right."
            : "Not quite."
      );
      setReviewHint(
        isCorrect ? "" : typeof data.hint === "string" ? data.hint : ""
      );

      if (isCorrect) {
        persistPracticeMistakes(
          resolvePracticeMistake(practiceMistakesRef.current, mistakeId)
        );
      }
    } catch {
      if (reviewQueue[reviewIndex]?.id !== mistakeId) {
        return;
      }

      setReviewCorrect(null);
      setReviewHint("");
      setReviewFeedback("We couldn't check that answer. Please try again.");
    } finally {
      reviewCheckBusyRef.current = false;
      if (questionWhenChecked === reviewQueue[reviewIndex]?.question) {
        setReviewChecking(false);
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
          mathFormat: "latex",
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
          originalQuestion:
            practiceSource === "recommended"
              ? currentPractice
              : sourceQuestion || currentPractice,
          previousPracticeQuestion: currentPractice,
          previousQuestions: practiceSet,
          level: studentLevel,
          topic: practiceTopic,
          count: 1,
          ease: practiceDifficultyNudge(
            dashboardStatsRef.current,
            practiceTopic
          ),
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
    previousQuestions: string[],
    options?: {
      topic?: PracticeTopic;
      ease?: PracticeDifficultyNudge;
      topicFocused?: boolean;
    }
  ): Promise<{ questions: string[]; tokens: string[] }> {
    const sourceQuestion = getSourceMathQuestion(question, solution);
    const originalQuestion = options?.topicFocused
      ? ""
      : sourceQuestion &&
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
        topic: options?.topic ?? practiceTopic,
        count,
        ...(options?.ease !== undefined ? { ease: options.ease } : {}),
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

  function scrollToPracticePanel() {
    practicePanelRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  async function startPracticeSet(
    topicOverride?: PracticeTopic,
    fromRecommendation = false
  ) {
    if (
      practiceLaunchBusyRef.current ||
      practiceGenerating ||
      practiceChecking ||
      practiceRevealing ||
      loading ||
      imageLoading
    ) {
      return;
    }

    practiceLaunchBusyRef.current = true;

    const topicForSet = topicOverride ?? practiceTopic;

    if (topicOverride) {
      selectPracticeTopic(topicOverride);
    }

    const ease = practiceDifficultyNudge(
      dashboardStatsRef.current,
      topicForSet
    );

    const requestId = practiceRequestRef.current + 1;
    practiceRequestRef.current = requestId;
    setPracticeSource(fromRecommendation ? "recommended" : "manual");
    setPracticeLaunchError("");
    resetPracticeState();
    setPracticeSet([]);
    setPracticeTokens([]);
    setPracticeIndex(0);
    setPracticeScore(0);
    setPracticeScoredCurrent(false);
    setPracticeCountedAttempt(false);
    setPracticeCompleted(false);
    setActivePracticeQuestion("");
    setPracticeGenerating(true);
    scrollToPracticePanel();

    try {
      const generated = await generatePracticeQuestions(PRACTICE_SET_SIZE, [], {
        topic: topicForSet,
        ease,
        ...(fromRecommendation ? { topicFocused: true } : {}),
      });
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
        `Started ${PRACTICE_TOPICS.find((item) => item.id === topicForSet)?.label || "practice"} set`
      );
      scrollToPracticePanel();
    } catch (error) {
      if (practiceRequestRef.current !== requestId) {
        return;
      }

      const launchError =
        error instanceof Error
          ? error.message
          : "We couldn't start practice. Please try again.";

      setPracticeCorrect(null);
      setPracticeHint("");
      setPracticeFeedback(launchError);
      setPracticeLaunchError(launchError);
    } finally {
      practiceLaunchBusyRef.current = false;
      if (practiceRequestRef.current === requestId) {
        setPracticeGenerating(false);
      }
    }
  }

  async function goToNextPracticeQuestion() {
    if (
      practiceNavBusyRef.current ||
      practiceGenerating ||
      practiceChecking ||
      practiceRevealing ||
      loading ||
      imageLoading ||
      practiceCompleted
    ) {
      return;
    }

    practiceNavBusyRef.current = true;

    try {
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
      const generated = await generatePracticeQuestions(1, currentList, {
        topic: practiceTopic,
        ease: practiceDifficultyNudge(dashboardStatsRef.current, practiceTopic),
        ...(practiceSource === "recommended" ? { topicFocused: true } : {}),
      });

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
    } finally {
      practiceNavBusyRef.current = false;
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

  function openAuth(mode: "login" | "signup") {
    setNavOpen(false);
    setAuthMode(mode);
    setAuthMessage(
      cloudEnabled
        ? ""
        : "Cloud accounts aren't available yet. You can still use EasyMath with the Free local limit."
    );
    setAuthModalOpen(true);
  }

  const voiceSupported =
    hasMounted &&
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  function toggleVoiceInput() {
    if (voiceListening) {
      voiceRef.current?.stop();
      return;
    }

    type Recognition = {
      lang: string;
      interimResults: boolean;
      maxAlternatives: number;
      onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
      onend: (() => void) | null;
      onerror: (() => void) | null;
      start: () => void;
      stop: () => void;
    };
    const speechWindow = window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const Ctor = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;

    if (!Ctor) {
      return;
    }

    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();

      if (transcript) {
        setQuestion((current) => (current.trim() ? `${current.trim()} ${transcript}` : transcript));
        setMessage("");
      }
    };
    recognition.onend = () => {
      setVoiceListening(false);
      voiceRef.current = null;
    };
    recognition.onerror = () => {
      setVoiceListening(false);
      voiceRef.current = null;
    };
    voiceRef.current = recognition;
    setVoiceListening(true);

    try {
      recognition.start();
    } catch {
      setVoiceListening(false);
      voiceRef.current = null;
    }
  }

  function explainSimpler() {
    const order: StudentLevel[] = ["primary", "middle", "high", "advanced"];
    const index = order.indexOf(studentLevel);
    const simpler = order[Math.max(0, index - 1)];

    if (simpler !== studentLevel) {
      selectStudentLevel(simpler);
    }

    void solveQuestion(getSourceMathQuestion(detectedProblem || question, solution), {
      source: lastSolveSource,
      level: simpler,
    });
  }

  function askFollowUp() {
    const text = followUp.trim();

    if (!text || loading || imageLoading) {
      return;
    }

    const base = getSourceMathQuestion(detectedProblem || question, solution);
    setFollowUp("");
    void solveQuestion(`${base}\n\nFollow-up: ${text}`.slice(0, 1900));
  }

  function tryExample(example: string) {
    setQuestion(example);
    setMessage("");
    document
      .querySelector<HTMLTextAreaElement>("#solver textarea")
      ?.focus({ preventScroll: true });
  }

  function practiceQuickTopic(topic: PracticeTopic) {
    selectPracticeTopic(topic);
    document.getElementById("practice")?.scrollIntoView({ behavior: "smooth", block: "start" });
    void startPracticeSet(topic);
  }

  function closeWelcome(tryProblem = false) {
    setWelcomeOpen(false);

    try {
      localStorage.setItem("easymath-welcome-v1", "seen");
    } catch {
      // Storage can be blocked (private mode); the modal just closes.
    }

    if (tryProblem) {
      tryExample("Solve 2x + 7 = 19");
    }
  }

  function focusSolver() {
    setNavOpen(false);
    document.getElementById("solver")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      document
        .querySelector<HTMLTextAreaElement>("#solver textarea")
        ?.focus({ preventScroll: true });
    }, 450);
  }

  function selectDroppedOrPastedImage(file: File) {
    if (loading || imageLoading) {
      return;
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    acceptImageFile(file);
  }

  function handleSolverDrop(event: DragEvent<HTMLDivElement>) {
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];

    if (!file) {
      return;
    }

    event.preventDefault();
    selectDroppedOrPastedImage(file);
  }

  function handleSolverPaste(event: ClipboardEvent<HTMLDivElement>) {
    const file = Array.from(event.clipboardData.files || []).find((item) =>
      item.type.startsWith("image/")
    );

    if (!file) {
      return;
    }

    event.preventDefault();
    selectDroppedOrPastedImage(file);
  }

  function removeImage() {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    setImageFile(null);
    setImagePreview("");
    setDetectedProblem("");
    setScanDraft(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function clearEverything() {
    setQuestion("");
    setSolution("");
    setMessage("");
    resetReport();
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
    (practiceGenerating || practiceLaunchError ? "" : parsedPracticeQuestion);

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
  const recommendedTopic =
    topicRanks.weakest && topicRanks.weakest !== "mixed"
      ? topicRanks.weakest
      : null;
  const recommendedTopicLabel = recommendedTopic
    ? PRACTICE_TOPICS.find((topic) => topic.id === recommendedTopic)?.label || ""
    : "";
  const currentPracticeTopicLabel =
    PRACTICE_TOPICS.find((topic) => topic.id === practiceTopic)?.label ||
    "this topic";
  const recommendedBusy =
    practiceGenerating && practiceSource === "recommended";
  const strongestTopicLabel = topicRanks.strongest
    ? PRACTICE_TOPICS.find((topic) => topic.id === topicRanks.strongest)
        ?.label || "—"
    : "—";
  const weakestTopicLabel = topicRanks.weakest
    ? PRACTICE_TOPICS.find((topic) => topic.id === topicRanks.weakest)?.label ||
      "—"
    : "—";
  const namedTopicProgress = listNamedTopicMastery(dashboardStats);
  const recommendedMastery = recommendedTopic
    ? getTopicMastery(dashboardStats, recommendedTopic)
    : null;
  const recommendedExplanation =
    recommendedMastery && recommendedTopicLabel
      ? `${recommendedTopicLabel} • ${recommendedMastery.correct} of ${recommendedMastery.attempted} correct • ${TOPIC_MASTERY_LABELS[recommendedMastery.status]}`
      : "";
  const streakLabel =
    dashboardStats.streakCount > 0
      ? dashboardStats.streakCount === 1
        ? "1 day"
        : `${dashboardStats.streakCount} days`
      : "—";
  const unresolvedMistakeCount = practiceMistakes.length;
  const currentReviewMistake = reviewQueue[reviewIndex] || null;
  const currentReviewTopicLabel = currentReviewMistake
    ? PRACTICE_TOPICS.find((topic) => topic.id === currentReviewMistake.topic)
        ?.label || "Practice"
    : "Practice";

  const solverLimitReached =
    !solverUnlimited && dailyUsed >= dailyLimit;
  const planLabel = signedIn
    ? getPlanDisplayName(userPlan)
    : FREE_PLAN_NAME;
  const usageLabel = solverUnlimited
    ? "Unlimited solver questions"
    : dailyPhotoUsed >= dailyPhotoLimit
      ? `${dailyUsed} of ${dailyLimit} questions used today · photo used`
      : `${dailyUsed} of ${dailyLimit} questions used today`;

  // Seed the practice set with the solver's practice question. Adjusted during
  // render rather than in an effect (no cascading render); converges because
  // practiceSet becomes non-empty.
  const seedPracticeQuestion = solverPracticeQuestion || parsedPracticeQuestion;

  if (
    seedPracticeQuestion &&
    !practiceCompleted &&
    !practiceGenerating &&
    !practiceLaunchError &&
    practiceSet.length === 0
  ) {
    setPracticeSet([seedPracticeQuestion]);
    setPracticeTokens(solverPracticeToken ? [solverPracticeToken] : []);
    setPracticeIndex(0);
  }

  useEffect(() => {
    if (practiceSource !== "recommended") {
      return;
    }

    if (practiceGenerating || practiceLaunchError) {
      practicePanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [practiceGenerating, practiceLaunchError, practiceSource]);

  const practicePanelVisible =
    !loading &&
    !imageLoading &&
    (practiceCompleted ||
      Boolean(practiceQuestion) ||
      practiceGenerating ||
      Boolean(practiceLaunchError));

  // Bring the solution panel into view when a solve starts and when a new
  // solution (or a saved one from Recent Questions) appears.
  useEffect(() => {
    if (loading) {
      workspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [loading]);

  useEffect(() => {
    if (solution && !loading && solution !== lastScrolledSolutionRef.current) {
      lastScrolledSolutionRef.current = solution;
      workspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [solution, loading]);

  useEffect(() => {
    let seen = true;

    try {
      seen = localStorage.getItem("easymath-welcome-v1") === "seen";
    } catch {
      seen = true;
    }

    if (!seen) {
      const timer = window.setTimeout(() => setWelcomeOpen(true), 600);
      return () => window.clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (!welcomeOpen) {
      return;
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeWelcome();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!navOpen) {
      return;
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setNavOpen(false);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

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

  const cardStyle: CSSProperties = {
    background: theme.panel,
    border: `1px solid ${theme.border}`,
    boxShadow: theme.shadow,
    backdropFilter: "blur(16px)",
  };

  return (
    <main
      className="easymath-app"
      style={{
        minHeight: "100vh",
        background: darkMode ? "#0b1220" : "#ffffff",
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
        .easymath-stat-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-bottom: 16px;
        }
        .easymath-actions {
          display: flex;
          gap: 12px;
          margin-top: 22px;
          flex-wrap: wrap;
        }
        .easymath-break {
          overflow-wrap: anywhere;
          word-break: break-word;
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
        @media (max-width: 520px) {
          .easymath-stat-grid {
            grid-template-columns: 1fr;
          }
          .easymath-actions {
            flex-direction: column;
          }
          .easymath-actions > button {
            width: 100%;
          }
          .easymath-app textarea {
            min-height: 120px !important;
          }
        }
        /* ---------- Desktop-first landing + solver layout ---------- */
        .easymath-app { overflow-x: clip; }
        html { scroll-behavior: smooth; }
        .easymath-app section[id], .easymath-app div[id="solver"] { scroll-margin-top: 16px; }
        .em-container { width: 100%; max-width: 1280px; margin: 0 auto; padding: 0 32px; }
        .em-nav { position: sticky; top: 0; z-index: 50; backdrop-filter: saturate(160%) blur(16px); -webkit-backdrop-filter: saturate(160%) blur(16px); }
        .em-nav-inner { display: flex; align-items: center; gap: 28px; height: 72px; }
        .em-nav-logo { display: inline-flex; align-items: center; flex-shrink: 0; }
        .em-nav-links { display: flex; align-items: center; gap: 4px; flex: 1; }
        .em-nav-link { padding: 8px 12px; border-radius: 10px; font-weight: 700; font-size: 15px; text-decoration: none; opacity: 0.86; }
        .em-nav-link:hover { opacity: 1; background: rgba(124,58,237,0.08); }
        .em-nav-menu-cta { display: none !important; }
        .em-nav-actions { display: flex; align-items: center; gap: 10px; margin-left: auto; }
        .em-usage-pill { padding: 7px 12px; border-radius: 999px; font-weight: 800; font-size: 12px; white-space: nowrap; }
        .em-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 12px; padding: 12px 20px; font-weight: 800; font-size: 15px; cursor: pointer; border: 1px solid transparent; text-decoration: none; transition: transform .15s ease, box-shadow .15s ease; }
        .em-btn:hover { transform: translateY(-1px); }
        .em-btn-sm { padding: 9px 15px; font-size: 14px; border-radius: 11px; }
        .em-btn-primary { background: linear-gradient(135deg,#7C3AED 0%,#2563EB 100%); color: #fff; box-shadow: 0 10px 24px rgba(91,59,232,0.28); }
        .em-btn-ghost { background: transparent; border: 1px solid; }
        .em-btn-light { background: #fff; color: #1d2b6b; box-shadow: 0 10px 24px rgba(0,0,0,0.18); }
        .em-icon-btn { width: 42px; height: 42px; border-radius: 12px; border: 1px solid; cursor: pointer; font-size: 17px; display: inline-grid; place-items: center; flex-shrink: 0; }
        .em-menu-btn { display: none; }
        .em-hero { padding: 64px 0 72px; }
        .em-hero-grid { display: grid; grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr); gap: 56px; align-items: start; }
        .em-hero-copy { padding-top: 28px; }
        .em-hero-pill { display: inline-flex; padding: 8px 14px; border-radius: 999px; font-weight: 800; font-size: 14px; }
        .em-hero-title { margin: 20px 0 0; font-size: 58px; line-height: 1.04; font-weight: 900; letter-spacing: -0.035em; }
        .em-gradient-text { background: linear-gradient(135deg,#7C3AED 0%,#2563EB 70%); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .em-hero-lead { margin: 20px 0 0; font-size: 19px; line-height: 1.6; max-width: 540px; }
        .em-trust { list-style: none; padding: 0; margin: 24px 0 0; display: flex; flex-wrap: wrap; gap: 10px 22px; font-weight: 700; font-size: 15px; }
        .em-trust li::before { content: "✓"; color: #10B981; font-weight: 900; margin-right: 8px; }
        .em-hero-proof { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 34px; max-width: 560px; }
        .em-hero-proof > div { border-radius: 16px; padding: 14px 16px; display: grid; gap: 2px; }
        .em-hero-proof strong { font-size: 26px; font-weight: 900; }
        .em-hero-proof span { font-size: 13px; font-weight: 600; line-height: 1.35; }
        .em-solver-card { border-radius: 28px; padding: 28px; backdrop-filter: blur(16px); }
        .em-dropzone { margin-top: 0; border: 2px dashed transparent; border-radius: 20px; transition: border-color .15s ease, background .15s ease; }
        .em-dropzone.is-active { background: rgba(124,58,237,0.07); }
        .em-drop-hint { font-size: 13px; font-weight: 600; margin: 8px 4px 0; }
        .em-section { padding: 88px 0; }
        .em-workspace-section { padding: 48px 0 88px; }
        .em-section-head { max-width: 760px; margin-bottom: 44px; }
        .em-h2 { margin: 16px 0 0; font-size: 42px; line-height: 1.1; font-weight: 900; letter-spacing: -0.03em; }
        .em-h3 { margin: 18px 0 8px; font-size: 20px; font-weight: 900; letter-spacing: -0.02em; }
        .em-lead { margin: 14px 0 0; font-size: 18px; line-height: 1.6; }
        .em-card { border-radius: 24px; padding: 26px; }
        .em-workspace { display: grid; grid-template-columns: 360px minmax(0, 1fr); gap: 24px; align-items: start; }
        .em-workspace-side { position: sticky; top: 96px; display: grid; gap: 0; }
        .em-workspace-main { min-height: 420px; }
        .em-practice-grid { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 24px; align-items: start; }
        .em-progress-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; align-items: start; }
        .em-grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px; }
        .em-grid-4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; }
        .em-value { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 40px; padding: 52px; align-items: center; }
        .em-value-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-top: 30px; }
        .em-compare { padding: 8px 22px; }
        .em-compare-row { display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: 14px; padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,0.14); font-size: 14px; line-height: 1.4; }
        .em-compare-row:last-child { border-bottom: none; }
        .em-compare-head { font-weight: 900; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: #c7d2fe; }
        .em-plans { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; max-width: 920px; margin: 0 auto; }
        .em-checklist { list-style: none; padding: 0; margin: 22px 0 26px; display: grid; gap: 10px; font-weight: 600; }
        .em-checklist li::before { content: "✓"; color: #10B981; font-weight: 900; margin-right: 10px; }
        .em-faq-wrap { display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); gap: 48px; align-items: start; }
        .em-faq summary { cursor: pointer; font-weight: 800; font-size: 16.5px; list-style: none; display: flex; justify-content: space-between; gap: 16px; }
        .em-faq summary::-webkit-details-marker { display: none; }
        .em-faq summary::after { content: "+"; font-size: 22px; line-height: 1; color: #7C3AED; font-weight: 700; }
        .em-faq[open] summary::after { content: "–"; }
        .em-footer-grid { display: grid; grid-template-columns: 1.6fr 1fr 1fr 1fr; gap: 32px; padding-top: 56px; padding-bottom: 40px; }
        .em-footer-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
        .em-footer-bottom { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding-top: 20px; padding-bottom: 24px; font-size: 13px; }
        .em-tutor { display: grid; gap: 16px; }
        .em-tutor-photo { display: inline-flex; align-items: center; gap: 12px; border: 1px solid; border-radius: 14px; padding: 8px 14px 8px 8px; width: fit-content; font-weight: 700; font-size: 13px; }
        .em-tutor-photo img { width: 64px; height: 48px; object-fit: cover; border-radius: 10px; }
        .em-tutor-answer { border-radius: 20px; padding: 18px 22px; }
        .em-tutor-kicker { font-size: 11px; font-weight: 900; letter-spacing: 0.1em; margin-bottom: 6px; }
        .em-tutor-steps ol { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 10px; }
        .em-tutor-step { display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: 12px; padding: 14px 16px; border: 1px solid; border-radius: 16px; animation: em-step-in .25s ease; }
        @keyframes em-step-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .em-tutor-num { width: 30px; height: 30px; border-radius: 10px; display: grid; place-items: center; font-weight: 900; color: #fff; background: linear-gradient(135deg,#7C3AED,#2563EB); }
        .em-tutor-why { margin-top: 6px; font-size: 14px; line-height: 1.55; }
        .em-tutor-reveal { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
        .em-tutor-notes { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .em-tutor-notes > div { border: 1px solid; border-radius: 16px; padding: 14px 16px; }
        .em-tutor-chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .em-followup { position: sticky; bottom: 14px; z-index: 5; display: flex; gap: 8px; align-items: center; margin-top: 18px; padding: 8px 8px 8px 16px; border-radius: 16px; box-shadow: 0 12px 30px rgba(15,23,42,0.16); backdrop-filter: blur(12px); }
        .em-followup input { flex: 1; min-width: 0; border: none !important; outline: none !important; background: transparent; font-size: 15px; font-weight: 600; }
        @media (max-width: 680px) { .em-tutor-notes { grid-template-columns: 1fr; } }
        /* ---------- v2 app shell ---------- */
        .em-shell { display: grid; grid-template-columns: 252px minmax(0, 1fr); min-height: 100vh; }
        .em-shell.is-collapsed { grid-template-columns: 76px minmax(0, 1fr); }
        .em-sidebar { position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; padding: 18px 14px; gap: 18px; z-index: 60; overflow-y: auto; }
        .em-sidebar-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 42px; }
        .em-sidebar-logo { display: inline-flex; align-items: center; padding-left: 6px; }
        .em-collapse-btn { width: 32px; height: 32px; font-size: 15px; }
        .em-side-nav { display: grid; gap: 4px; }
        .em-side-link { display: flex; align-items: center; gap: 12px; padding: 11px 12px; border-radius: 12px; font-weight: 800; font-size: 15px; text-decoration: none; }
        .em-side-link:hover { background: rgba(124,58,237,0.1); }
        .em-side-link-sm { font-size: 14px; font-weight: 700; padding: 9px 12px; }
        .em-side-icon { width: 24px; text-align: center; font-size: 18px; flex-shrink: 0; }
        .em-side-divider { height: 1px; margin: 10px 6px; }
        .em-sidebar-bottom { margin-top: auto; display: grid; gap: 10px; }
        .em-usage-card { border-radius: 16px; padding: 12px 14px; }
        .em-side-btn { width: 100%; }
        .em-side-row { display: flex; align-items: center; gap: 10px; }
        .em-credit { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; }
        .em-shell.is-collapsed .em-label, .em-shell.is-collapsed .em-label-block { display: none !important; }
        .em-shell.is-collapsed .em-sidebar-top { flex-direction: column; }
        .em-shell.is-collapsed .em-side-link { justify-content: center; padding: 11px 0; }
        .em-shell.is-collapsed .em-side-row { flex-direction: column; }
        .em-topbar { display: none; }
        .em-drawer-backdrop { display: none; }
        .em-hero-center { max-width: 920px; text-align: center; }
        .em-hero-center .em-hero-copy { padding-top: 8px; }
        .em-hero-center .em-hero-lead { margin-left: auto; margin-right: auto; }
        .em-hero-center .em-hero-title { font-size: 46px; }
        .em-hero-center .em-solver-card { text-align: left; margin-top: 30px; }
        .em-photo-hidden { display: none; }
        .em-prompt-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 14px; padding-top: 14px; }
        .em-tool-btn { display: inline-flex; align-items: center; gap: 6px; border: 1px solid; border-radius: 11px; padding: 9px 13px; font-weight: 800; font-size: 14px; cursor: pointer; }
        .em-tool-btn.is-live { box-shadow: 0 0 0 4px rgba(124,58,237,0.18); }
        .em-level-select { display: inline-flex; align-items: center; gap: 8px; font-weight: 800; font-size: 13px; }
        .em-level-select select { border: 1px solid; border-radius: 11px; padding: 9px 10px; font-weight: 800; font-size: 14px; cursor: pointer; }
        .em-quick { margin-top: 30px; text-align: left; }
        .em-quick-head { font-weight: 800; font-size: 14px; margin-bottom: 12px; }
        .em-quick-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
        .em-quick-card { border-radius: 18px; padding: 16px; display: grid; gap: 8px; transition: transform .15s ease; }
        .em-quick-card:hover { transform: translateY(-2px); }
        .em-quick-icon { width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center; background: linear-gradient(135deg,#7C3AED,#2563EB); color: #fff; font-weight: 900; font-size: 17px; }
        .em-quick-example { font-size: 14px; font-weight: 600; }
        .em-quick-actions { display: flex; gap: 14px; }
        .em-quick-actions button { background: none; border: none; padding: 0; font-weight: 800; font-size: 13.5px; cursor: pointer; }
        .em-demo-wrap { margin-top: 30px; text-align: left; }
        .em-welcome-backdrop { position: fixed; inset: 0; z-index: 200; background: rgba(2,6,23,0.6); display: grid; place-items: center; padding: 16px; backdrop-filter: blur(4px); }
        .em-welcome { position: relative; width: min(640px, 100%); border-radius: 26px; overflow: hidden; box-shadow: 0 40px 100px rgba(0,0,0,0.4); }
        .em-welcome-close { position: absolute; top: 12px; right: 14px; z-index: 2; background: none; border: none; font-size: 20px; cursor: pointer; }
        @media (max-width: 1024px) {
          .em-shell, .em-shell.is-collapsed { grid-template-columns: 1fr; }
          .em-sidebar { position: fixed; left: 0; top: 0; bottom: 0; width: 280px; transform: translateX(-105%); transition: transform .2s ease; box-shadow: 0 20px 60px rgba(0,0,0,.3); }
          .em-sidebar.is-open { transform: none; }
          .em-shell.is-collapsed .em-label, .em-shell.is-collapsed .em-label-block { display: revert !important; }
          .em-collapse-btn { display: none; }
          .em-drawer-backdrop { display: block; position: fixed; inset: 0; z-index: 55; background: rgba(2,6,23,.5); border: none; }
          .em-topbar { display: flex; align-items: center; gap: 12px; position: sticky; top: 0; z-index: 40; height: 60px; padding: 0 16px; backdrop-filter: blur(14px); }
          .easymath-app section[id] { scroll-margin-top: 68px; }
          .em-quick-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 680px) {
          .em-hero-center .em-hero-title { font-size: 32px; }
          .em-quick-grid { gap: 10px; }
          .em-quick-card { padding: 12px; }
          .em-tool-label { display: none; }
          .em-level-select .em-tool-label { display: none; }
        }
        @media (max-width: 1180px) {
          .em-usage-pill { display: none; }
          .em-hero-title { font-size: 50px; }
          .em-progress-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .em-progress-grid > :last-child { grid-column: 1 / -1; }
          .em-grid-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 1024px) {
          .em-nav-links { display: none; position: absolute; top: 72px; left: 0; right: 0; flex-direction: column; align-items: stretch; padding: 12px 20px 20px; border-bottom: 1px solid; box-shadow: 0 20px 40px rgba(15,23,42,0.18); }
          .em-nav-links.is-open { display: flex; }
          .em-nav-link { padding: 14px 12px; font-size: 17px; }
          .em-nav-menu-cta { display: inline-flex !important; margin-top: 10px; }
          .em-menu-btn { display: inline-grid; }
          .em-hero-grid { grid-template-columns: 1fr; gap: 32px; }
          .em-hero-copy { padding-top: 0; text-align: center; }
          .em-hero-lead { margin-left: auto; margin-right: auto; }
          .em-trust { justify-content: center; }
          .em-hero-proof { margin-left: auto; margin-right: auto; }
          .em-workspace { grid-template-columns: 1fr; }
          .em-workspace-side { position: static; order: 2; }
          .em-workspace-main { order: 1; min-height: 0; }
          .em-practice-grid { grid-template-columns: 1fr; }
          .em-grid-3 { grid-template-columns: 1fr 1fr; }
          .em-value { grid-template-columns: 1fr; padding: 36px; }
          .em-faq-wrap { grid-template-columns: 1fr; gap: 8px; }
          .em-footer-grid { grid-template-columns: 1fr 1fr 1fr; }
          .em-footer-grid > :first-child { grid-column: 1 / -1; }
        }
        @media (max-width: 680px) {
          .em-container { padding: 0 16px; }
          .em-nav-inner { height: 64px; gap: 12px; }
          .em-nav-links { top: 64px; }
          .em-hide-sm { display: none !important; }
          .em-hero { padding: 28px 0 36px; }
          .em-hero-title { font-size: 34px; margin-top: 14px; }
          .em-hero-lead { font-size: 16px; margin-top: 12px; }
          .em-trust { font-size: 13.5px; gap: 6px 14px; margin-top: 16px; }
          .em-hero-proof { display: none; }
          .em-solver-card { padding: 18px 16px; border-radius: 22px; }
          .em-drop-hint { display: none; }
          .em-section { padding: 56px 0; }
          .em-workspace-section { padding: 8px 0 56px; }
          .em-section-head { margin-bottom: 28px; }
          .em-h2 { font-size: 30px; }
          .em-lead { font-size: 16px; }
          .em-card { padding: 18px 16px; border-radius: 20px; }
          .em-progress-grid { grid-template-columns: 1fr; }
          .em-grid-3, .em-grid-4 { grid-template-columns: 1fr; }
          .em-value { padding: 26px 20px; gap: 24px; }
          .em-value-stats { grid-template-columns: 1fr 1fr; }
          .em-compare { padding: 4px 14px; }
          .em-compare-row { grid-template-columns: 1fr 1fr; font-size: 13px; }
          .em-compare-row > :first-child { grid-column: 1 / -1; }
          .em-compare-head > :first-child { display: none; }
          .em-plans { grid-template-columns: 1fr; }
          .em-footer-grid { grid-template-columns: 1fr 1fr; padding-top: 40px; }
          .em-icon-btn { width: 40px; height: 40px; }
        }
      `}</style>
      <div className={`em-shell${sidebarCollapsed ? " is-collapsed" : ""}`}>
        {navOpen && (
          <button
            type="button"
            aria-label="Close menu"
            className="em-drawer-backdrop"
            onClick={() => setNavOpen(false)}
          />
        )}
        <aside
          id="em-main-nav"
          className={`em-sidebar${navOpen ? " is-open" : ""}`}
          aria-label="Main"
          style={{
            background: darkMode ? "#0a1020" : "#ffffff",
            borderRight: `1px solid ${theme.border}`,
          }}
        >
          <div className="em-sidebar-top">
            <a href="#top" className="em-sidebar-logo" aria-label="EasyMath Ai home" onClick={() => setNavOpen(false)}>
              {sidebarCollapsed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/favicon.svg" alt="EasyMath Ai" width={34} height={34} />
              ) : (
                <BrandLogo variant={darkMode ? "dark" : "light"} size="sm" />
              )}
            </a>
            <button
              type="button"
              className="em-icon-btn em-collapse-btn"
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => setSidebarCollapsed((value) => !value)}
              style={{ borderColor: theme.border, background: theme.buttonSoft, color: theme.text }}
            >
              {sidebarCollapsed ? "»" : "«"}
            </button>
          </div>

          <nav className="em-side-nav">
            {[
              { href: "#top", icon: "✨", label: "Solve" },
              { href: "#practice", icon: "📝", label: "Practice" },
              { href: "#workspace", icon: "🕘", label: "History" },
              { href: "#progress", icon: "📈", label: "Progress" },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="em-side-link"
                title={item.label}
                style={{ color: theme.text }}
                onClick={() => setNavOpen(false)}
              >
                <span className="em-side-icon" aria-hidden="true">{item.icon}</span>
                <span className="em-label">{item.label}</span>
              </a>
            ))}
            <div className="em-side-divider" style={{ background: theme.border }} />
            <a href="#plans" className="em-side-link em-side-link-sm" title="Plans" style={{ color: theme.muted }} onClick={() => setNavOpen(false)}>
              <span className="em-side-icon" aria-hidden="true">💎</span>
              <span className="em-label">Plans</span>
            </a>
            <Link href="/support" className="em-side-link em-side-link-sm" title="Support" style={{ color: theme.muted }}>
              <span className="em-side-icon" aria-hidden="true">💬</span>
              <span className="em-label">Support</span>
            </Link>
          </nav>

          <div className="em-sidebar-bottom">
            <div
              className="em-usage-card em-label-block"
              style={{
                background: darkMode ? "rgba(124,58,237,0.12)" : "#f5f3ff",
                border: `1px solid ${darkMode ? "rgba(124,58,237,0.35)" : "#e4dbff"}`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: "13px" }}>
                <span>{planLabel} plan</span>
                <span style={{ color: darkMode ? "#86EFAC" : "#059669" }}>
                  {solverUnlimited ? "∞" : `${Math.max(0, dailyLimit - dailyUsed)} left`}
                </span>
              </div>
              {!solverUnlimited && (
                <div style={{ marginTop: "8px", height: "6px", borderRadius: "999px", background: darkMode ? "#1e293b" : "#e9e5ff", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${Math.min(100, (dailyUsed / Math.max(1, dailyLimit)) * 100)}%`,
                      height: "100%",
                      background: "linear-gradient(90deg,#7C3AED,#2563EB)",
                    }}
                  />
                </div>
              )}
              <div style={{ marginTop: "8px", color: theme.muted, fontSize: "12px", fontWeight: 600 }}>
                {usageLabel}
              </div>
            </div>

            {signedIn ? (
              <button type="button" onClick={() => setAccountOpen(true)} className="em-btn em-btn-ghost em-btn-sm em-side-btn" style={{ color: theme.text, borderColor: theme.border, background: theme.buttonSoft }} title="Account">
                <span aria-hidden="true">👤</span>
                <span className="em-label">Account</span>
              </button>
            ) : (
              <>
                <button type="button" onClick={() => openAuth("signup")} className="em-btn em-btn-primary em-btn-sm em-side-btn em-label-block">
                  Get started free
                </button>
                <button type="button" onClick={() => openAuth("login")} className="em-btn em-btn-ghost em-btn-sm em-side-btn" style={{ color: theme.text, borderColor: theme.border, background: theme.buttonSoft }} title="Log in">
                  <span aria-hidden="true">→</span>
                  <span className="em-label">Log in</span>
                </button>
              </>
            )}

            <div className="em-side-row">
              <button
                type="button"
                aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
                onClick={toggleTheme}
                className="em-icon-btn"
                style={{ borderColor: theme.border, background: theme.buttonSoft }}
              >
                {darkMode ? "☀️" : "🌙"}
              </button>
              <span className="em-label em-credit" style={{ color: theme.muted }}>
                <Image src="/branding/zayir-ai-logo-purple-dark.png" alt="zayir.ai" width={18} height={18} style={{ borderRadius: 4 }} />
                by zayir.ai
              </span>
            </div>
          </div>
        </aside>

        <div className="em-shell-main">
          <div
            className="em-topbar"
            style={{
              background: darkMode ? "rgba(11,18,32,0.9)" : "rgba(255,255,255,0.9)",
              borderBottom: `1px solid ${theme.border}`,
            }}
          >
            <button
              type="button"
              className="em-icon-btn"
              aria-label={navOpen ? "Close menu" : "Open menu"}
              aria-expanded={navOpen}
              aria-controls="em-main-nav"
              onClick={() => setNavOpen((open) => !open)}
              style={{ borderColor: theme.border, background: theme.buttonSoft, color: theme.text }}
            >
              ☰
            </button>
            <BrandLogo variant={darkMode ? "dark" : "light"} size="sm" />
            {signedIn ? (
              <button type="button" onClick={() => setAccountOpen(true)} className="em-btn em-btn-ghost em-btn-sm" style={{ color: theme.text, borderColor: theme.border, background: theme.buttonSoft, marginLeft: "auto" }}>
                Account
              </button>
            ) : (
              <button type="button" onClick={() => openAuth("login")} className="em-btn em-btn-ghost em-btn-sm" style={{ color: theme.text, borderColor: theme.border, background: theme.buttonSoft, marginLeft: "auto" }}>
                Log in
              </button>
            )}
          </div>


      <section
        id="top"
        className="em-hero"
        style={{
          background: darkMode
            ? "radial-gradient(900px 520px at 8% -10%, rgba(124,58,237,0.38), transparent 60%), radial-gradient(800px 520px at 100% 10%, rgba(37,99,235,0.32), transparent 60%), radial-gradient(700px 400px at 60% 110%, rgba(16,185,129,0.14), transparent 60%), #0b1220"
            : "radial-gradient(900px 520px at 8% -10%, rgba(124,58,237,0.16), transparent 60%), radial-gradient(800px 520px at 100% 10%, rgba(37,99,235,0.16), transparent 60%), radial-gradient(700px 400px at 60% 110%, rgba(16,185,129,0.12), transparent 60%), #f8fafc",
        }}
      >
        <div className="em-container em-hero-center">
          <div className="em-hero-copy">
            <div
              className="em-hero-pill"
              style={{
                background: darkMode ? "rgba(134,239,172,0.1)" : "#ecfdf5",
                color: darkMode ? "#86EFAC" : "#047857",
                border: `1px solid ${darkMode ? "rgba(134,239,172,0.3)" : "#a7f3d0"}`,
              }}
            >
              ✨ Your Personal Ai Math Tutor
            </div>
            <h1 className="em-hero-title" style={{ color: theme.text }}>
              What can I help you <span className="em-gradient-text">solve</span> today?
            </h1>
            <p className="em-hero-lead" style={{ color: theme.muted }}>
              Type it, snap it or say it. Get every step explained at your level — 10 free solves a day, no ads.
            </p>
          </div>

          <div
            id="solver"
            className="em-solver-card"
            onPaste={handleSolverPaste}
            style={{
              background: theme.panel,
              border: `1px solid ${theme.border}`,
              boxShadow: darkMode
                ? "0 30px 80px rgba(0,0,0,0.45), 0 0 0 1px rgba(124,58,237,0.15)"
                : "0 30px 80px rgba(37,99,235,0.14), 0 0 0 1px rgba(124,58,237,0.06)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontWeight: 800, fontSize: "14px" }}>Ask EasyMath</span>
              <span style={{ color: theme.muted, fontSize: "13px", fontWeight: 700 }}>
                {usageLabel}
              </span>
            </div>

            {solverLimitReached && (
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
                    : signedIn
                      ? `Free plan: ${dailyUsed} of ${dailyLimit} solver questions used today, including 1 photo. Practice does not use this limit.`
                      : `Free plan: ${dailyUsed} of ${dailyLimit} solver questions used today, including 1 photo. Practice does not use this limit. Log in to keep progress across devices.`}
                </>
              )}
            </div>
            )}


            <div style={{ marginTop: "16px" }}>
            <textarea
              value={question}
              aria-label="Math question"
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
            </div>

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
                  type="button"
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
              className={`em-dropzone${dragActive ? " is-active" : ""}`}
              onDragOver={(event) => {
                if (Array.from(event.dataTransfer.types).includes("Files")) {
                  event.preventDefault();
                  setDragActive(true);
                }
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setDragActive(false);
                }
              }}
              onDrop={handleSolverDrop}
              style={{ borderColor: dragActive ? "#7C3AED" : "transparent" }}
            >
            <div className={imagePreview ? "" : "em-photo-hidden"}>
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
                Printed or handwritten is fine. Keep the full question visible and well lit.
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.heic,.heif,.hif"
                aria-label="Upload a photo of a math problem"
                onChange={handleImage}
                style={{
                  display: "none",
                }}
              />

              {!imagePreview && (
                <button
                  type="button"
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
                  {/* Local blob: preview of the chosen photo; next/image can't optimize object URLs. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
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
                    {scanDraft === null && (
                    <button
                      type="button"
                      onClick={readImage}
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
                        "🔍 Read Photo"
                      )}
                    </button>
                    )}

                    <button
                      type="button"
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

                  {scanDraft === null && !imageLoading && (
                    <div
                      style={{
                        marginTop: "10px",
                        color: theme.muted,
                        fontSize: "13px",
                        fontWeight: 600,
                      }}
                    >
                      Reading the photo is free. You can check and fix it before it uses a solve.
                    </div>
                  )}

                  {scanDraft !== null && (
                    <div
                      style={{
                        marginTop: "16px",
                        padding: "16px 18px",
                        borderRadius: "16px",
                        border: "1px solid #22c55e",
                        background: darkMode ? "#052e16" : "#f0fdf4",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 900,
                          fontSize: "12px",
                          letterSpacing: "0.06em",
                          color: darkMode ? "#86efac" : "#15803d",
                        }}
                      >
                        ✅ WE READ THIS FROM YOUR PHOTO
                      </div>
                      <div
                        style={{
                          marginTop: "6px",
                          color: theme.muted,
                          fontSize: "13px",
                          fontWeight: 600,
                        }}
                      >
                        Check it matches your question. Fix anything that&apos;s wrong, then solve.
                      </div>
                      <textarea
                        value={scanDraft}
                        aria-label="Problem read from your photo"
                        onChange={(event) => setScanDraft(event.target.value)}
                        rows={Math.min(6, Math.max(2, scanDraft.split("\n").length + 1))}
                        disabled={loading}
                        style={{
                          width: "100%",
                          marginTop: "12px",
                          padding: "12px 14px",
                          borderRadius: "12px",
                          border: `1px solid ${theme.border}`,
                          background: theme.input,
                          color: theme.text,
                          fontSize: "18px",
                          fontWeight: 700,
                          fontFamily: "inherit",
                          resize: "vertical",
                          boxSizing: "border-box",
                        }}
                      />
                      <div
                        style={{
                          display: "flex",
                          gap: "10px",
                          flexWrap: "wrap",
                          marginTop: "12px",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => void solveConfirmedScan()}
                          disabled={loading || imageLoading || solverLimitReached || !scanDraft.trim()}
                          style={{
                            border: "none",
                            background: solverLimitReached
                              ? "#86efac"
                              : "linear-gradient(135deg,#16a34a,#15803d)",
                            color: "white",
                            padding: "13px 18px",
                            borderRadius: "12px",
                            fontWeight: 900,
                            cursor: solverLimitReached ? "not-allowed" : "pointer",
                            boxShadow: solverLimitReached
                              ? "none"
                              : "0 8px 18px rgba(22,163,74,0.28)",
                          }}
                        >
                          {loading ? "Solving..." : solverLimitReached ? "Daily limit reached" : "✨ Solve This"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void readImage()}
                          disabled={loading || imageLoading}
                          style={{
                            border: `1px solid ${theme.border}`,
                            background: theme.buttonSoft,
                            color: theme.text,
                            padding: "13px 18px",
                            borderRadius: "12px",
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                        >
                          Read Again
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            </div>
              {!imagePreview && (
                <div className="em-drop-hint" style={{ color: theme.muted, display: "none" }}>
                  or drag &amp; drop a photo here · paste a screenshot with Ctrl/⌘ + V
                </div>
              )}
            </div>

            {message && (
              <div
                role="status"
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

            <div className="em-prompt-toolbar" style={{ borderTop: `1px solid ${theme.border}` }}>
              <button
                type="button"
                className="em-tool-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading || imageLoading || solverLimitReached}
                title="Upload a photo"
                style={{ color: theme.text, borderColor: theme.border, background: theme.buttonSoft }}
              >
                📷 <span className="em-tool-label">Photo</span>
              </button>
              {voiceSupported && (
                <button
                  type="button"
                  className={`em-tool-btn${voiceListening ? " is-live" : ""}`}
                  onClick={toggleVoiceInput}
                  disabled={loading || imageLoading}
                  aria-pressed={voiceListening}
                  title={voiceListening ? "Stop listening" : "Say your question"}
                  style={{ color: theme.text, borderColor: voiceListening ? "#7C3AED" : theme.border, background: theme.buttonSoft }}
                >
                  🎤 <span className="em-tool-label">{voiceListening ? "Listening…" : "Voice"}</span>
                </button>
              )}
              <label className="em-level-select" style={{ color: theme.muted }}>
                <span className="em-tool-label">Level</span>
                <select
                  value={studentLevel}
                  onChange={(event) => {
                    if (isStudentLevel(event.target.value)) {
                      selectStudentLevel(event.target.value);
                    }
                  }}
                  aria-label="Student level"
                  style={{ color: theme.text, borderColor: theme.border, background: theme.buttonSoft }}
                >
                  {STUDENT_LEVELS.map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.label}
                    </option>
                  ))}
                </select>
              </label>
              <div style={{ flex: 1 }} />
              {(question || solution || imagePreview) && (
                <button
                  type="button"
                  className="em-tool-btn"
                  onClick={clearEverything}
                  disabled={loading || imageLoading}
                  style={{ color: theme.muted, borderColor: "transparent", background: "transparent" }}
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                className="em-btn em-btn-primary"
                onClick={() => solveQuestion()}
                disabled={loading || imageLoading || solverLimitReached}
              >
                {loading ? (
                  <>
                    <span className="easymath-spinner" style={{ borderColor: "rgba(255,255,255,0.35)", borderTopColor: "#fff" }} />
                    Solving…
                  </>
                ) : solverLimitReached ? (
                  "Daily limit reached"
                ) : (
                  "Solve →"
                )}
              </button>
            </div>
          </div>
          <div className="em-quick">
            <div className="em-quick-head" style={{ color: theme.muted }}>
              Quick start — try an example or practice a topic
            </div>
            <div className="em-quick-grid">
              {QUICK_START.map((item) => (
                <div
                  key={item.topic}
                  className="em-quick-card"
                  style={{ background: theme.panel, border: `1px solid ${theme.border}`, boxShadow: theme.shadowSoft }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span className="em-quick-icon" aria-hidden="true">{item.icon}</span>
                    <strong style={{ fontSize: "16px" }}>{item.label}</strong>
                  </div>
                  <div className="em-quick-example" style={{ color: theme.muted }}>
                    {item.example}
                  </div>
                  <div className="em-quick-actions">
                    <button
                      type="button"
                      onClick={() => tryExample(item.example)}
                      style={{ color: "#7C3AED" }}
                    >
                      Try example
                    </button>
                    <button
                      type="button"
                      onClick={() => practiceQuickTopic(item.topic)}
                      style={{ color: darkMode ? "#86EFAC" : "#059669" }}
                    >
                      Practice →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="em-demo-wrap">
            <HowDemo dark={darkMode} />
          </div>
        </div>
      </section>

      <section id="workspace" className="em-section em-workspace-section">
        <div className="em-container">
          <div className="em-workspace">
            <aside className="em-workspace-side">
              <div className="em-card" style={cardStyle}>
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

                {history.length === 0 && (
                  <p style={{ margin: "4px 0 0", color: theme.muted, lineHeight: 1.6 }}>
                    Your solved questions will appear here so you can jump back to any of them.
                  </p>
                )}

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
                    {mathToPlainText(item.question)}
                  </button>
                )
              )}
            </div>

                <button
                  type="button"
                  onClick={focusSolver}
                  className="em-btn em-btn-ghost"
                  style={{ width: "100%", marginTop: "16px", color: theme.text, borderColor: theme.border, background: theme.buttonSoft }}
                >
                  ＋ Ask a new question
                </button>
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

            <div ref={workspaceRef} className="em-workspace-main em-card" style={cardStyle}>
              {!solution && (
                <div
                  style={{
                    color: "#7C3AED",
                    fontWeight: 900,
                    fontSize: "11px",
                    letterSpacing: "0.1em",
                    marginBottom: "4px",
                  }}
                >
                  SOLVER WORKSPACE
                </div>
              )}
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
                    marginTop: "12px",
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
                        className="easymath-break"
                        style={{
                          marginTop: "6px",
                          fontWeight: 800,
                          fontSize: "16px",
                          lineHeight: 1.4,
                        }}
                      >
                        <MathText text={detectedProblem || question} block={false} />
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
                          From your photo (checked by you)
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        navigator.clipboard.writeText(
                          mathToPlainText(solution)
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

                  <TutorSolution
                    key={solution}
                    finalAnswer={parts["FINAL ANSWER"]}
                    stepsText={parts["STEP-BY-STEP EXPLANATION"]}
                    whyItWorks={parts["WHY IT WORKS"]}
                    commonMistake={parts["COMMON MISTAKE"]}
                    imageSrc={lastSolveSource === "photo" && imagePreview ? imagePreview : undefined}
                    dark={darkMode}
                    theme={theme}
                    busy={loading || imageLoading || practiceGenerating}
                    onExplainSimpler={explainSimpler}
                    onSimilar={() => practiceQuickTopic(practiceTopic)}
                    onReport={() => {
                      setReportOpen(true);
                      window.setTimeout(() => {
                        document
                          .querySelector("[aria-label='Optional report details']")
                          ?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }, 50);
                    }}
                  />

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
                        <MathText text={solution} />
                      </div>
                    )}

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      flexWrap: "wrap",
                    }}
                  >
                    {reportStatus === "sent" ? (
                      <span
                        role="status"
                        style={{
                          color: darkMode ? "#86efac" : "#15803d",
                          fontWeight: 800,
                          fontSize: "14px",
                        }}
                      >
                        ✅ {reportMessage}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setReportOpen((open) => !open)}
                        aria-expanded={reportOpen}
                        style={{
                          border: `1px solid ${theme.border}`,
                          background: "transparent",
                          color: theme.muted,
                          borderRadius: "999px",
                          padding: "8px 14px",
                          fontWeight: 800,
                          fontSize: "13px",
                          cursor: "pointer",
                        }}
                      >
                        🚩 Report wrong answer
                      </button>
                    )}
                  </div>

                  {reportOpen && reportStatus !== "sent" && (
                    <div
                      style={{
                        padding: "16px 18px",
                        borderRadius: "16px",
                        border: `1px solid ${theme.border}`,
                        background: theme.buttonSoft,
                        display: "grid",
                        gap: "10px",
                      }}
                    >
                      <strong>What looks wrong?</strong>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {(
                          [
                            ["wrong_answer", "Wrong answer"],
                            ["wrong_steps", "Wrong steps"],
                            ...(lastSolveSource === "photo"
                              ? ([["misread_photo", "Misread my photo"]] as const)
                              : []),
                            ["unclear", "Hard to understand"],
                            ["other", "Something else"],
                          ] as const
                        ).map(([id, label]) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setReportReason(id)}
                            aria-pressed={reportReason === id}
                            style={{
                              border: `1px solid ${reportReason === id ? "#7c3aed" : theme.border}`,
                              background: reportReason === id ? "#7c3aed" : "transparent",
                              color: reportReason === id ? "white" : theme.text,
                              borderRadius: "999px",
                              padding: "8px 12px",
                              fontWeight: 700,
                              fontSize: "13px",
                              cursor: "pointer",
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={reportComment}
                        onChange={(event) => setReportComment(event.target.value.slice(0, 1000))}
                        placeholder="Optional: what should the answer be?"
                        aria-label="Optional report details"
                        rows={2}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "12px",
                          border: `1px solid ${theme.border}`,
                          background: "transparent",
                          color: theme.text,
                          fontFamily: "inherit",
                          fontSize: "14px",
                          boxSizing: "border-box",
                        }}
                      />
                      {reportStatus === "error" && (
                        <div role="status" style={{ color: "#f87171", fontWeight: 700, fontSize: "13px" }}>
                          {reportMessage}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => void submitReport()}
                          disabled={reportBusy}
                          style={{
                            border: "none",
                            background: "linear-gradient(135deg,#7c3aed,#2563eb)",
                            color: "white",
                            padding: "10px 16px",
                            borderRadius: "12px",
                            fontWeight: 900,
                            cursor: reportBusy ? "wait" : "pointer",
                          }}
                        >
                          {reportBusy ? "Sending..." : "Send report"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setReportOpen(false)}
                          style={{
                            border: `1px solid ${theme.border}`,
                            background: "transparent",
                            color: theme.text,
                            padding: "10px 16px",
                            borderRadius: "12px",
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {solution && !loading && !imageLoading && (
                <form
                  className="em-followup"
                  onSubmit={(event) => {
                    event.preventDefault();
                    askFollowUp();
                  }}
                  style={{
                    background: darkMode ? "rgba(15,23,42,0.96)" : "rgba(255,255,255,0.96)",
                    border: `1px solid ${theme.border}`,
                  }}
                >
                  <input
                    value={followUp}
                    onChange={(event) => setFollowUp(event.target.value.slice(0, 300))}
                    placeholder="Stuck on a step? Ask your tutor a follow-up…"
                    aria-label="Follow-up question"
                    style={{ color: theme.text }}
                  />
                  <button type="submit" className="em-btn em-btn-primary em-btn-sm" disabled={!followUp.trim() || solverLimitReached}>
                    Ask
                  </button>
                </form>
              )}

              {!solution && !loading && !imageLoading && (
                <div style={{ marginTop: "14px" }}>
                  <SolutionPreview dark={darkMode} theme={theme} />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section
        id="practice"
        className="em-section"
        style={{ background: darkMode ? "#0d1628" : "#f4f6fb" }}
      >
        <div className="em-container">
          <SectionHead
            dark={darkMode}
            theme={theme}
            eyebrow="PRACTICE MODE"
            title="Practice that never uses your daily solves"
            subtitle="Pick a topic, answer 5 questions, get hints when you're stuck and review every mistake."
          />
          <div className="em-practice-grid">
            <div className="em-card" style={cardStyle}>
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
                Choose a topic, then start a 5-question set. Check each answer — practice does not use your solver limit.
              </div>

              <div
                role="group"
                aria-label="Practice Topic"
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
                      aria-pressed={selected}
                      onClick={() => selectPracticeTopic(topic.id)}
                      disabled={
                        practiceGenerating ||
                        practiceChecking ||
                        practiceRevealing ||
                        (practiceSource === "recommended" &&
                          Boolean(practiceQuestion) &&
                          !practiceCompleted)
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

              {recommendedTopic && recommendedTopicLabel ? (
                <div
                  style={{
                    marginTop: "12px",
                  }}
                >
                  <div
                    style={{
                      color: theme.muted,
                      fontSize: "13px",
                      fontWeight: 700,
                      marginBottom: "8px",
                    }}
                  >
                    Recommended for you
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        recommendedBusy ||
                        practiceGenerating ||
                        practiceChecking ||
                        practiceRevealing ||
                        loading ||
                        imageLoading
                      ) {
                        return;
                      }

                      if (
                        recommendedTopic &&
                        isPracticeTopic(recommendedTopic)
                      ) {
                        void startPracticeSet(recommendedTopic, true);
                      }
                    }}
                    disabled={
                      practiceGenerating ||
                      practiceChecking ||
                      practiceRevealing ||
                      loading ||
                      imageLoading
                    }
                    style={{
                      width: "100%",
                      border: "none",
                      background: recommendedBusy
                        ? "#86efac"
                        : "linear-gradient(135deg,#16a34a,#15803d)",
                      color: "white",
                      padding: "11px 16px",
                      borderRadius: "12px",
                      fontWeight: 800,
                      fontSize: "14px",
                      cursor: recommendedBusy ? "wait" : "pointer",
                      boxShadow: "0 8px 16px rgba(22,163,74,0.22)",
                    }}
                  >
                    {recommendedBusy
                      ? "Creating your practice..."
                      : `Practice ${recommendedTopicLabel}`}
                  </button>
                  {recommendedExplanation ? (
                    <div
                      style={{
                        marginTop: "8px",
                        color: theme.muted,
                        fontSize: "12px",
                        fontWeight: 700,
                        lineHeight: 1.45,
                      }}
                    >
                      {recommendedExplanation}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void startPracticeSet()}
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
            </div>
            <div className="em-card" style={cardStyle}>
            {!loading &&
              !imageLoading &&
              (practiceCompleted ||
                practiceQuestion ||
                practiceGenerating ||
                Boolean(practiceLaunchError)) && (
                <div
                  ref={practicePanelRef}
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
                    <strong>
                      {practiceSource === "recommended"
                        ? `🎯 YOUR TURN · ${currentPracticeTopicLabel}`
                        : "🎯 YOUR TURN"}
                    </strong>
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: "13px",
                        color: darkMode ? "#ddd6fe" : "#6d28d9",
                      }}
                    >
                      {practiceCompleted
                        ? "Practice complete"
                        : practiceLaunchError && !practiceQuestion
                          ? "Couldn't start yet"
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
                        {practiceSource === "recommended"
                          ? `Keep practising ${currentPracticeTopicLabel} with another set.`
                          : practiceScore === PRACTICE_SET_SIZE
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
                        {practiceSource === "recommended" ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                practiceGenerating ||
                                practiceChecking ||
                                practiceRevealing ||
                                loading ||
                                imageLoading
                              ) {
                                return;
                              }

                              void startPracticeSet(practiceTopic, true);
                            }}
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
                              ? "Creating your practice..."
                              : `Practice ${currentPracticeTopicLabel}`}
                          </button>
                        ) : (
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
                        )}
                        <button
                          type="button"
                          onClick={restartCurrentPracticeSet}
                          style={{
                            border: `1px solid ${theme.border}`,
                            background: theme.buttonSoft,
                            color: theme.text,
                            padding: "11px 17px",
                            borderRadius: "11px",
                            fontWeight: 800,
                            cursor: "pointer",
                            display:
                              practiceSource === "recommended"
                                ? "inline-flex"
                                : "none",
                          }}
                        >
                          Retry this set
                        </button>
                        <button
                          type="button"
                          onClick={() => void startPracticeSet()}
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
                          {practiceSource === "recommended"
                            ? "Creating your recommended practice…"
                            : "Creating your practice questions…"}
                        </div>
                      )}

                      {practiceLaunchError &&
                        !practiceQuestion &&
                        !practiceGenerating && (
                          <div
                            style={{
                              marginTop: "14px",
                            }}
                          >
                            <div
                              style={{
                                padding: "14px 16px",
                                borderRadius: "12px",
                                background: darkMode ? "#4c0519" : "#ffe4e6",
                                border: "1px solid #fb7185",
                                fontWeight: 700,
                                lineHeight: 1.6,
                              }}
                            >
                              {practiceLaunchError}
                            </div>
                            {practiceSource === "recommended" &&
                            recommendedTopic &&
                            recommendedTopicLabel ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (
                                    practiceGenerating ||
                                    practiceChecking ||
                                    practiceRevealing ||
                                    loading ||
                                    imageLoading
                                  ) {
                                    return;
                                  }

                                  if (isPracticeTopic(recommendedTopic)) {
                                    void startPracticeSet(
                                      recommendedTopic,
                                      true
                                    );
                                  }
                                }}
                                disabled={
                                  practiceGenerating ||
                                  practiceChecking ||
                                  practiceRevealing ||
                                  loading ||
                                  imageLoading
                                }
                                style={{
                                  marginTop: "12px",
                                  border: "none",
                                  background: practiceGenerating
                                    ? "#86efac"
                                    : "linear-gradient(135deg,#16a34a,#15803d)",
                                  color: "white",
                                  padding: "11px 17px",
                                  borderRadius: "11px",
                                  fontWeight: 800,
                                  cursor: practiceGenerating
                                    ? "wait"
                                    : "pointer",
                                }}
                              >
                                {practiceGenerating
                                  ? "Creating your practice..."
                                  : `Practice ${recommendedTopicLabel}`}
                              </button>
                            ) : null}
                          </div>
                        )}

                      {practiceQuestion && (
                        <>
                          <div
                            className="easymath-break"
                            style={{
                              fontSize: "20px",
                              fontWeight: 800,
                              marginTop: "12px",
                            }}
                          >
                            <MathText text={practiceQuestion} block={false} />
                          </div>

                          <input
                            value={practiceAnswer}
                            aria-label="Practice answer"
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
                              <MathText text={practiceRevealedSolution} />
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

            {reviewActive ? (
              <div
                ref={reviewPanelRef}
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
                  <strong>🔁 MISTAKES TO REVIEW</strong>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: "13px",
                      color: darkMode ? "#ddd6fe" : "#6d28d9",
                    }}
                  >
                    {reviewCompleted
                      ? "Review complete"
                      : `Mistake ${reviewIndex + 1} of ${reviewQueue.length}`}
                  </div>
                </div>

                {reviewCompleted ? (
                  <div>
                    <div
                      style={{
                        fontSize: "22px",
                        fontWeight: 900,
                        marginTop: "14px",
                      }}
                    >
                      You&apos;re all caught up
                    </div>
                    <div
                      style={{
                        marginTop: "8px",
                        color: theme.muted,
                        fontWeight: 700,
                        lineHeight: 1.6,
                      }}
                    >
                      Correctly reviewed mistakes are cleared from this list.
                    </div>
                    <button
                      type="button"
                      onClick={closeMistakeReview}
                      style={{
                        marginTop: "16px",
                        border: `1px solid ${theme.border}`,
                        background: theme.buttonSoft,
                        color: theme.text,
                        padding: "11px 17px",
                        borderRadius: "11px",
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      Close Review
                    </button>
                  </div>
                ) : currentReviewMistake ? (
                  <>
                    <div
                      style={{
                        marginTop: "10px",
                        color: theme.muted,
                        fontWeight: 700,
                        fontSize: "13px",
                      }}
                    >
                      {currentReviewTopicLabel}
                    </div>
                    <div
                      className="easymath-break"
                      style={{
                        fontSize: "20px",
                        fontWeight: 800,
                        marginTop: "8px",
                      }}
                    >
                      <MathText text={currentReviewMistake.question} block={false} />
                    </div>
                    <div
                      style={{
                        marginTop: "8px",
                        color: theme.muted,
                        fontWeight: 600,
                        fontSize: "13px",
                        lineHeight: 1.5,
                      }}
                    >
                      Last answer: {currentReviewMistake.studentAnswer}
                    </div>
                    <input
                      value={reviewAnswer}
                      aria-label="Review answer"
                      onChange={(e) => {
                        setReviewAnswer(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (!reviewChecking && reviewCorrect !== true) {
                            void checkReviewAnswer();
                          }
                        }
                      }}
                      placeholder="Type a new answer"
                      disabled={reviewChecking || reviewCorrect === true}
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
                      onClick={() => void checkReviewAnswer()}
                      disabled={reviewChecking || reviewCorrect === true}
                      style={{
                        marginTop: "12px",
                        border: "none",
                        background:
                          reviewChecking || reviewCorrect === true
                            ? "#86efac"
                            : "linear-gradient(135deg,#16a34a,#15803d)",
                        color: "white",
                        padding: "11px 17px",
                        borderRadius: "11px",
                        fontWeight: 800,
                        cursor:
                          reviewChecking || reviewCorrect === true
                            ? "default"
                            : "pointer",
                      }}
                    >
                      {reviewChecking ? (
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
                    {reviewFeedback ? (
                      <div
                        style={{
                          marginTop: "14px",
                          padding: "14px 16px",
                          borderRadius: "12px",
                          background:
                            reviewCorrect === true
                              ? darkMode
                                ? "#14532d"
                                : "#dcfce7"
                              : reviewCorrect === false
                                ? darkMode
                                  ? "#4c0519"
                                  : "#ffe4e6"
                                : darkMode
                                  ? "#3b0764"
                                  : "#ede9fe",
                          border:
                            reviewCorrect === true
                              ? "1px solid #22c55e"
                              : reviewCorrect === false
                                ? "1px solid #fb7185"
                                : "1px solid #8b5cf6",
                          fontWeight: 700,
                          lineHeight: 1.6,
                        }}
                      >
                        {reviewFeedback}
                        {reviewCorrect === false && reviewHint ? (
                          <div
                            style={{
                              marginTop: "8px",
                              fontWeight: 600,
                            }}
                          >
                            Hint: {reviewHint}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {reviewCorrect === true ? (
                      <button
                        type="button"
                        onClick={goToNextReviewMistake}
                        style={{
                          marginTop: "16px",
                          border: "none",
                          background: "linear-gradient(135deg,#7c3aed,#6d28d9)",
                          color: "white",
                          padding: "11px 17px",
                          borderRadius: "11px",
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        {reviewIndex + 1 >= reviewQueue.length
                          ? "Finish Review"
                          : "Next Mistake →"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={closeMistakeReview}
                        style={{
                          marginTop: "16px",
                          border: `1px solid ${theme.border}`,
                          background: theme.buttonSoft,
                          color: theme.text,
                          padding: "11px 17px",
                          borderRadius: "11px",
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        Close Review
                      </button>
                    )}
                  </>
                ) : (
                  <div
                    style={{
                      marginTop: "14px",
                      fontWeight: 700,
                      color: theme.muted,
                    }}
                  >
                    No mistakes left to review.
                    <div>
                      <button
                        type="button"
                        onClick={closeMistakeReview}
                        style={{
                          marginTop: "16px",
                          border: `1px solid ${theme.border}`,
                          background: theme.buttonSoft,
                          color: theme.text,
                          padding: "11px 17px",
                          borderRadius: "11px",
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        Close Review
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

              {!practicePanelVisible && !reviewActive && (
                <div style={{ textAlign: "center", padding: "36px 12px" }}>
                  <div aria-hidden="true" style={{ fontSize: "40px" }}>📝</div>
                  <div style={{ fontWeight: 900, fontSize: "19px", marginTop: "10px" }}>
                    No practice in progress
                  </div>
                  <p style={{ color: theme.muted, lineHeight: 1.6, margin: "8px auto 0", maxWidth: "420px" }}>
                    Choose a topic and start a 5-question set. Every solve also gives you a
                    practice question to try here.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section id="progress" className="em-section">
        <div className="em-container">
          <SectionHead
            dark={darkMode}
            theme={theme}
            eyebrow="YOUR DASHBOARD"
            title="Student progress"
            subtitle={
              signedIn
                ? "Your solves, accuracy, streaks and topics — synced to your account."
                : "Track solves, accuracy, streaks and topics. Log in to keep progress across devices."
            }
          />
          <div className="em-progress-grid">
            <div className="em-card" style={cardStyle}>
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

            <div className="easymath-stat-grid">
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
            </div>
            <div className="em-card" style={cardStyle}>
            {namedTopicProgress.length > 0 ? (
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
                    marginBottom: "8px",
                  }}
                >
                  Topic Progress
                </div>
                <div
                  style={{
                    display: "grid",
                    gap: "6px",
                  }}
                >
                  {namedTopicProgress.map((item) => {
                    const label =
                      PRACTICE_TOPICS.find((topic) => topic.id === item.topic)
                        ?.label || item.topic;
                    const accuracyPct =
                      item.accuracy === null
                        ? "—"
                        : `${Math.round(item.accuracy * 100)}%`;
                    const statusColor =
                      item.status === "strong"
                        ? darkMode
                          ? "#86efac"
                          : "#15803d"
                        : item.status === "needs_practice"
                          ? darkMode
                            ? "#fda4af"
                            : "#be123c"
                          : theme.muted;

                    return (
                      <div
                        key={item.topic}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          gap: "8px",
                          fontSize: "13px",
                          lineHeight: 1.35,
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 800,
                            minWidth: 0,
                          }}
                        >
                          {label}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            flexWrap: "wrap",
                            justifyContent: "flex-end",
                            color: theme.muted,
                            fontWeight: 700,
                            fontSize: "12px",
                            textAlign: "right",
                          }}
                        >
                          <span>
                            {item.attempted} checked · {accuracyPct}
                          </span>
                          <span
                            style={{
                              color: statusColor,
                              fontWeight: 800,
                            }}
                          >
                            {TOPIC_MASTERY_LABELS[item.status]}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

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
                Mistakes to Review
              </div>
              {unresolvedMistakeCount > 0 ? (
                <>
                  <div
                    style={{
                      marginTop: "8px",
                      fontWeight: 900,
                      fontSize: "16px",
                      lineHeight: 1.3,
                    }}
                  >
                    {unresolvedMistakeCount === 1
                      ? "1 mistake ready to review"
                      : `${unresolvedMistakeCount} mistakes ready to review`}
                  </div>
                  <button
                    type="button"
                    onClick={startMistakeReview}
                    disabled={
                      reviewChecking ||
                      practiceChecking ||
                      practiceGenerating ||
                      loading ||
                      imageLoading
                    }
                    style={{
                      marginTop: "12px",
                      width: "100%",
                      border: "none",
                      background:
                        reviewChecking ||
                        practiceChecking ||
                        practiceGenerating ||
                        loading ||
                        imageLoading
                          ? "#86efac"
                          : "linear-gradient(135deg,#16a34a,#15803d)",
                      color: "white",
                      padding: "10px 14px",
                      borderRadius: "11px",
                      fontWeight: 800,
                      fontSize: "13px",
                      cursor:
                        reviewChecking ||
                        practiceChecking ||
                        practiceGenerating ||
                        loading ||
                        imageLoading
                          ? "wait"
                          : "pointer",
                    }}
                  >
                    Review Mistakes
                  </button>
                </>
              ) : (
                <div
                  style={{
                    marginTop: "8px",
                    fontWeight: 700,
                    fontSize: "14px",
                    lineHeight: 1.5,
                    color: theme.text,
                  }}
                >
                  You&apos;re all caught up. Checked mistakes from practice will
                  appear here.
                </div>
              )}
            </div>
            </div>
            <div className="em-card" style={cardStyle}>
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
              {stats.activity.length === 0 && (
                <div>
                  <div style={{ fontWeight: 900, fontSize: "17px" }}>Recent activity</div>
                  <p style={{ color: theme.muted, lineHeight: 1.6, margin: "8px 0 0" }}>
                    Solves and practice answers show up here as you go.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <HowItWorks dark={darkMode} theme={theme} />
      <Features dark={darkMode} theme={theme} />
      <Subjects dark={darkMode} theme={theme} />
      <ValueStrip dark={darkMode} theme={theme} onStart={focusSolver} />
      <Plans
        dark={darkMode}
        theme={theme}
        onStart={focusSolver}
        onDetails={() => setPricingOpen(true)}
      />
      <Faq dark={darkMode} theme={theme} />

      <LandingFooter
        dark={darkMode}
        muted={theme.muted}
        text={theme.text}
        border={theme.border}
      />
        </div>
      </div>


      {welcomeOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="easymath-welcome-title"
          className="em-welcome-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeWelcome();
            }
          }}
        >
          <div
            className="em-welcome"
            style={{ background: darkMode ? "#0f172a" : "#ffffff", color: theme.text, border: `1px solid ${theme.border}` }}
          >
            <button
              type="button"
              aria-label="Close"
              className="em-welcome-close"
              onClick={() => closeWelcome()}
              style={{ color: theme.muted }}
            >
              ✕
            </button>
            <HowDemo dark={darkMode} compact />
            <div style={{ padding: "22px 28px 28px" }}>
              <h2 id="easymath-welcome-title" style={{ margin: 0, fontSize: "26px", fontWeight: 900, letterSpacing: "-0.02em" }}>
                Welcome to EasyMath Ai 👋
              </h2>
              <p style={{ margin: "10px 0 0", color: theme.muted, lineHeight: 1.6 }}>
                Snap or type any math problem. We read it, you check it, and your
                personal Ai tutor explains every step. 10 free solves a day — no ads, no sign-up.
              </p>
              <div style={{ display: "flex", gap: "10px", marginTop: "20px", flexWrap: "wrap" }}>
                <button type="button" className="em-btn em-btn-primary" onClick={() => closeWelcome(true)}>
                  Try a problem
                </button>
                <button
                  type="button"
                  className="em-btn em-btn-ghost"
                  onClick={() => closeWelcome()}
                  style={{ color: theme.text, borderColor: theme.border }}
                >
                  Maybe later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {authModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="easymath-auth-title"
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
              id="easymath-auth-title"
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
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleAuthSubmit();
                  }
                }}
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

            {authMode === "login" && (
              <div style={{ marginTop: "8px", textAlign: "right" }}>
                <button
                  type="button"
                  onClick={() => void handleForgotPassword()}
                  disabled={authBusy}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: darkMode ? "#93c5fd" : "#1d4ed8",
                    fontWeight: 800,
                    fontSize: "13px",
                    cursor: authBusy ? "wait" : "pointer",
                    padding: 0,
                  }}
                >
                  Forgot password?
                </button>
              </div>
            )}

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
          aria-label="Your account"
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
            if (!deleteBusy) {
              setAccountOpen(false);
            }
          }}
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
                border: `1px solid ${theme.border}`,
                background: theme.buttonSoft,
                color: theme.text,
                padding: "13px 16px",
                borderRadius: "12px",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Log out
            </button>

            <div
              style={{
                marginTop: "18px",
                padding: "14px",
                borderRadius: "14px",
                border: "1px solid rgba(220,38,38,0.45)",
                background: darkMode ? "rgba(127,29,29,0.22)" : "#fef2f2",
              }}
            >
              <div
                style={{
                  fontWeight: 900,
                  fontSize: "13px",
                  letterSpacing: "0.06em",
                  color: "#f87171",
                  textTransform: "uppercase",
                }}
              >
                Danger Zone
              </div>
              <p
                style={{
                  margin: "8px 0 0",
                  color: theme.muted,
                  fontSize: "13px",
                  fontWeight: 600,
                  lineHeight: 1.5,
                }}
              >
                Permanently deletes your EasyMath account and saved progress.
                This cannot be undone.
              </p>

              {!deleteConfirmOpen ? (
                <button
                  type="button"
                  onClick={() => {
                    setDeleteConfirmOpen(true);
                    setDeleteConfirmText("");
                    setDeleteError("");
                  }}
                  style={{
                    width: "100%",
                    marginTop: "12px",
                    border: "none",
                    background: "linear-gradient(135deg,#dc2626,#b91c1c)",
                    color: "white",
                    padding: "12px 16px",
                    borderRadius: "12px",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Delete account
                </button>
              ) : (
                <div style={{ marginTop: "12px", display: "grid", gap: "10px" }}>
                  <label
                    style={{
                      display: "grid",
                      gap: "6px",
                      fontSize: "12px",
                      fontWeight: 800,
                      color: theme.muted,
                    }}
                  >
                    Type DELETE to confirm
                    <input
                      value={deleteConfirmText}
                      aria-label="Type DELETE to confirm account deletion"
                      onChange={(event) =>
                        setDeleteConfirmText(event.target.value)
                      }
                      autoComplete="off"
                      spellCheck={false}
                      disabled={deleteBusy}
                      style={{
                        width: "100%",
                        borderRadius: "10px",
                        border: `1px solid ${theme.border}`,
                        background: darkMode ? "#0b1220" : "#fff",
                        color: theme.text,
                        padding: "11px 12px",
                        fontWeight: 700,
                        fontSize: "14px",
                      }}
                    />
                  </label>
                  {deleteError ? (
                    <div
                      style={{
                        color: "#fca5a5",
                        fontSize: "13px",
                        fontWeight: 700,
                      }}
                    >
                      {deleteError}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void handleDeleteAccount()}
                    disabled={deleteBusy || deleteConfirmText !== "DELETE"}
                    style={{
                      width: "100%",
                      border: "none",
                      background:
                        deleteBusy || deleteConfirmText !== "DELETE"
                          ? "#7f1d1d"
                          : "linear-gradient(135deg,#dc2626,#991b1b)",
                      color: "white",
                      padding: "12px 16px",
                      borderRadius: "12px",
                      fontWeight: 900,
                      cursor:
                        deleteBusy || deleteConfirmText !== "DELETE"
                          ? "not-allowed"
                          : "pointer",
                      opacity:
                        deleteBusy || deleteConfirmText !== "DELETE" ? 0.55 : 1,
                    }}
                  >
                    {deleteBusy ? "Deleting…" : "Permanently delete account"}
                  </button>
                  <button
                    type="button"
                    disabled={deleteBusy}
                    onClick={() => {
                      setDeleteConfirmOpen(false);
                      setDeleteConfirmText("");
                      setDeleteError("");
                    }}
                    style={{
                      width: "100%",
                      border: `1px solid ${theme.border}`,
                      background: "transparent",
                      color: theme.muted,
                      padding: "10px 16px",
                      borderRadius: "12px",
                      fontWeight: 800,
                      cursor: deleteBusy ? "not-allowed" : "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={deleteBusy}
              onClick={() => {
                setAccountOpen(false);
                setDeleteConfirmOpen(false);
                setDeleteConfirmText("");
                setDeleteError("");
              }}
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
          aria-label="EasyMath Ai plans"
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
                  Choose your EasyMath Ai plan
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
                  <div style={{ fontWeight: 600, marginTop: 2 }}>
                    {FREE_PLAN_SUMMARY}
                  </div>
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
                  <li>5 AI solver questions per day, including 1 photo</li>
                  <li>Free photo read check before you solve</li>
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
