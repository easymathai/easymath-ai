import {
  FREE_DAILY_PHOTO_SOLVE_LIMIT,
  FREE_DAILY_SOLVER_LIMIT,
  utcUsageDate,
} from "./constants";

export const LOCAL_USAGE_KEY = "easymath-daily-usage";

export type LocalDailyUsage = {
  date: string;
  count: number;
  photoCount: number;
};

export function readLocalDailyUsage(): LocalDailyUsage {
  if (typeof window === "undefined") {
    return { date: utcUsageDate(), count: 0, photoCount: 0 };
  }

  try {
    const raw = localStorage.getItem(LOCAL_USAGE_KEY);

    if (!raw) {
      return { date: utcUsageDate(), count: 0, photoCount: 0 };
    }

    const parsed = JSON.parse(raw) as Partial<LocalDailyUsage>;
    const today = utcUsageDate();

    if (parsed.date !== today) {
      return { date: today, count: 0, photoCount: 0 };
    }

    return {
      date: today,
      count: Math.max(0, Number(parsed.count) || 0),
      photoCount: Math.max(0, Number(parsed.photoCount) || 0),
    };
  } catch {
    return { date: utcUsageDate(), count: 0, photoCount: 0 };
  }
}

export function writeLocalDailyUsage(usage: LocalDailyUsage): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(LOCAL_USAGE_KEY, JSON.stringify(usage));
  } catch {
    // Safari private mode may block storage.
  }
}

export function getLocalUsageSnapshot(): {
  used: number;
  limit: number;
  remaining: number;
  photoUsed: number;
  photoLimit: number;
  photoRemaining: number;
} {
  const usage = readLocalDailyUsage();
  const used = Math.min(usage.count, FREE_DAILY_SOLVER_LIMIT);
  const photoUsed = Math.min(usage.photoCount, FREE_DAILY_PHOTO_SOLVE_LIMIT);
  return {
    used,
    limit: FREE_DAILY_SOLVER_LIMIT,
    remaining: Math.max(0, FREE_DAILY_SOLVER_LIMIT - used),
    photoUsed,
    photoLimit: FREE_DAILY_PHOTO_SOLVE_LIMIT,
    photoRemaining: Math.max(0, FREE_DAILY_PHOTO_SOLVE_LIMIT - photoUsed),
  };
}

export function canUseLocalSolver(isPhoto = false): boolean {
  const snap = getLocalUsageSnapshot();
  if (snap.remaining <= 0) {
    return false;
  }
  if (isPhoto && snap.photoRemaining <= 0) {
    return false;
  }
  return true;
}

export function consumeLocalSolver(isPhoto = false): {
  used: number;
  limit: number;
  photoUsed: number;
  photoLimit: number;
  allowed: boolean;
} {
  const today = utcUsageDate();
  const current = readLocalDailyUsage();
  const count = current.date === today ? current.count : 0;
  const photoCount = current.date === today ? current.photoCount : 0;

  if (count >= FREE_DAILY_SOLVER_LIMIT) {
    return {
      allowed: false,
      used: FREE_DAILY_SOLVER_LIMIT,
      limit: FREE_DAILY_SOLVER_LIMIT,
      photoUsed: Math.min(photoCount, FREE_DAILY_PHOTO_SOLVE_LIMIT),
      photoLimit: FREE_DAILY_PHOTO_SOLVE_LIMIT,
    };
  }

  if (isPhoto && photoCount >= FREE_DAILY_PHOTO_SOLVE_LIMIT) {
    return {
      allowed: false,
      used: count,
      limit: FREE_DAILY_SOLVER_LIMIT,
      photoUsed: FREE_DAILY_PHOTO_SOLVE_LIMIT,
      photoLimit: FREE_DAILY_PHOTO_SOLVE_LIMIT,
    };
  }

  const next = {
    date: today,
    count: count + 1,
    photoCount: photoCount + (isPhoto ? 1 : 0),
  };
  writeLocalDailyUsage(next);

  return {
    allowed: true,
    used: next.count,
    limit: FREE_DAILY_SOLVER_LIMIT,
    photoUsed: next.photoCount,
    photoLimit: FREE_DAILY_PHOTO_SOLVE_LIMIT,
  };
}
