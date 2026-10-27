/** The user's own Anthropic API key, kept only in this browser and only if they ask. */
const KEY = "grade-maxxer:anthropic-api-key";

export function loadApiKey(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveApiKey(key: string | null) {
  try {
    if (key) localStorage.setItem(KEY, key);
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: key just isn't remembered */
  }
}
