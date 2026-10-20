// Mirrors the password rules set in Supabase Auth (minimum length, letters and digits),
// so the form rejects a weak password before the server does.
export const MIN_PASSWORD = 10;

export function strongPassword(password: string): boolean {
  return (
    password.length >= MIN_PASSWORD &&
    /[a-zA-Z]/.test(password) &&
    /\d/.test(password)
  );
}
