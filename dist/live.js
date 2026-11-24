export async function api(role, path, data) {
  const options = { cache: 'no-store' };
  if (data !== undefined) Object.assign(options, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const response = await fetch('/api/' + role + '/' + path, options);
  const value = await response.json().catch(() => ({}));
  if (!response.ok || !response.headers.get('Content-Type')?.includes('application/json')) {
    const error = new Error(value.error || 'Connection unavailable. Reload to sign in again.');
    error.status = response.status;
    throw error;
  }
  return value;
}

// Events carry no classroom data. Every refresh gets a fresh authorization check.
export function subscribe(role, refresh, status) {
  let socket;
  let retry;
  let sequence = 0;
  function connect() {
    clearTimeout(retry);
    const current = ++sequence;
    socket?.close();
    status(false);
    if (!navigator.onLine) return;
    socket = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/' + role + '/live');
    async function sync() {
      try {
        await refresh();
        if (current === sequence && socket.readyState === WebSocket.OPEN) status(true);
      } catch { if (current === sequence) socket.close(); }
    }
    socket.onopen = socket.onmessage = sync;
    socket.onclose = () => {
      if (current !== sequence) return;
      status(false);
      retry = setTimeout(connect, 2000);
    };
  }
  window.addEventListener('online', connect);
  window.addEventListener('offline', connect);
  window.addEventListener('pageshow', event => { if (event.persisted) connect(); });
  // Recover missed events and refresh time-based closures even on a quiet board.
  setInterval(() => {
    if (!document.hidden && navigator.onLine && socket?.readyState === WebSocket.OPEN) {
      refresh().then(() => status(true)).catch(() => socket.close());
    }
  }, 30000);
  connect();
}
