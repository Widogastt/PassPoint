import { api } from './live.js';

export function setupPairing(room, version, show, escape) {
  const current = room();
  const codes = current.roster.map(s => {
    const full = s.id.replaceAll('-', '');
    const prefix = full.slice(0, 10);
    const unique = current.roster.filter(item => item.id.replaceAll('-', '').startsWith(prefix)).length === 1;
    return `<div><dt>${escape(s.name)}</dt><dd><code>${unique ? prefix : full}</code></dd></div>`;
  }).join('');
  show('Pair classroom Chromebook', `
    <p>Pair the door Chromebook with ${escape(current.name)}. Pairing replaces the previous device for this class.</p>
    <details class="code-list"><summary>View student codes</summary><dl>${codes}</dl></details>
    <div class="actions"><button id="make-code" class="button primary">Create pairing code</button>
    <button id="unpair" class="button outline">Disconnect kiosk</button></div><p id="pair-status" role="status"></p>`);
  const result = document.getElementById('pair-status');
  document.getElementById('make-code').onclick = async () => {
    try {
      const pair = await api('teacher', 'pair', { room: current.id, version: version() });
      const link = new URL('/door', location.origin);
      link.hash = pair.board;
      result.innerHTML = `Open <a href="${link.href}" target="_blank" rel="noopener">${link.href}</a> on the Chromebook. Enter <b>${pair.code}</b> within 5 minutes.`;
    } catch (error) { result.textContent = error.message; }
  };
  document.getElementById('unpair').onclick = async () => {
    try {
      await api('teacher', 'unpair', { room: current.id, version: version() });
      result.textContent = 'Chromebook disconnected.';
    } catch (error) { result.textContent = error.message; }
  };
}
