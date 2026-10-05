/**
 * A readable message from whatever a catch block receives (it is `unknown` under strict mode):
 * an Error's message, a thrown string, or the value as text.
 */
export function errorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') return err.message;
    return String(err);
}
