export async function fetchJson<T = unknown>(url: string, timeoutMs = 15000): Promise<T> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: "application/json" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}
