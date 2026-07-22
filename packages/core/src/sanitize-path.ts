// Mask username in file paths for logging.
// Only the username segment is replaced with "***", the rest of the path is preserved.
// e.g. C:\Users\LongyuC\project\config.json -> C:\Users\***\project\config.json
export function sanitizePath(p: string | undefined): string {
  if (!p) {
    return String(p);
  }
  return p.replace(/([/\\]Users[/\\])[^\\/]+/g, '$1***')
    .replace(/([/\\]home[/\\])[^\\/]+/g, '$1***');
}

// Hash userId with SHA-256 for logging. Returns hex string.
export async function hashUserId(userId: string): Promise<string> {
  const data = new TextEncoder().encode(userId);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
