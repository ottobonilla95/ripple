export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { ...(options.body && typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
  });
  if (!response.ok) {
    if (response.status === 401) window.location.assign('/login');
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Could not connect. Your draft is still here.');
  }
  return response.status === 204 ? null : response.json();
}
export const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });
