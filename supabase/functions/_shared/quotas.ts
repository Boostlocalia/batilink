// Limits of the services BatiNode depends on, compared with what is used, so the
// team hears about a limit well before it blocks anything. Import-free: tested in the app.

export type Level = 'ok' | 'warn' | 'critical';

export type Usage = {
  service: 'emails' | 'database' | 'files' | 'accounts' | 'ai' | 'jobs';
  used: number;
  limit: number;
  /** Shown in the alert: what the number means and what to do. */
  note: string;
};

/** Alerts at 70 % of a limit, and again, louder, at 90 %. */
export function levelOf(u: Usage): Level {
  if (u.limit <= 0) return 'ok';
  const share = u.used / u.limit;
  return share >= 0.9 ? 'critical' : share >= 0.7 ? 'warn' : 'ok';
}

/** Plan limits, overridable without a deploy when a plan changes (QUOTA_* secrets). */
export function planLimits(env: (k: string) => string | undefined) {
  const n = (k: string, d: number) => {
    const v = Number(env(k));
    return Number.isFinite(v) && v > 0 ? v : d;
  };
  return {
    // Brevo free plan: 300 e-mails a day.
    emailsPerDay: n('QUOTA_EMAILS_PER_DAY', 300),
    // Supabase free plan: 500 MB database, 1 GB files, 50,000 monthly active users.
    dbBytes: n('QUOTA_DB_BYTES', 500 * 1024 ** 2),
    storageBytes: n('QUOTA_STORAGE_BYTES', 1024 ** 3),
    users: n('QUOTA_USERS', 50_000),
  };
}

const MB = 1024 ** 2;
export const fmtMb = (bytes: number) => `${Math.round(bytes / MB)} Mo`;
