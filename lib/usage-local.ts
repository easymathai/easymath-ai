import { FREE_DAILY_SOLVER_LIMIT, utcUsageDate } from "./constants";

export const LOCAL_USAGE_KEY = "easymath-daily-usage";

export type LocalDailyUsage = {
  date: string;
  count: number;
};

export function readLocalDailyUsage(): LocalDailyUsage {
  if (typeof window === "undefined") {
    return { date: utcUsageDate(), count: 0 };
  }

  try {
    const raw = localStorage.getItem(LOCAL_USAGE_KEY);

    if (!raw) {
      return { date: utcUsageDate(), count: 0 };
    }

    const parsed = JSON.parse(raw) as LocalDailyUsage;
    const today = utcUsageDate();

    if (parsed.date !== today) {
      return { date: today, count: 0 };
    }

    return {
      date: today,
      count: Math.max(0, Number(parsed.count) || 0),
    };
  } catch {
    return { date: utcUsageDate(), count: 0 };
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
} {
  const usage = readLocalDailyUsage();
  const used = Math.min(usage.count, FREE_DAILY_SOLVER_LIMIT);
  return {
    used,
    limit: FREE_DAILY_SOLVER_LIMIT,
    remaining: Math.max(0, FREE_DAILY_SOLVER_LIMIT - used),
  };
}

export function canUseLocalSolver(): boolean {
  return getLocalUsageSnapshot().remaining > 0;
}

export function consumeLocalSolver(): {
  used: number;
  limit: number;
  allowed: boolean;
} {
  const today = utcUsageDate();
  const current = readLocalDailyUsage();
  const count = current.date === today ? current.count : 0;

  if (count >= FREE_DAILY_SOLVER_LIMIT) {
    return {
      allowed: false,
      used: FREE_DAILY_SOLVER_LIMIT,
      limit: FREE_DAILY_SOLVER_LIMIT,
    };
  }

  const next = { date: today, count: count + 1 };
  writeLocalDailyUsage(next);

  return {
    allowed: true,
    used: next.count,
    limit: FREE_DAILY_SOLVER_LIMIT,
  };
}
