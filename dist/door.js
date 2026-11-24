import { api, subscribe } from './live.js';
const el = id => document.getElementById(id);
const choices = document.querySelector('.choices');
const entry = el('entry');
const input = el('credential');
let action;
let idle;
let clearFeedback;
let online = false;
let subscribed = false;
let generation = 0;
function connected(value) {
  online = value;
  choices.inert = entry.inert = !value;
  if (!value && el('pair').hidden) el('availability').textContent = 'Reconnecting · changes paused';
}
function pairing() {
  choices.hidden = true;
  if (entry.open) entry.close();
  el('pair').hidden = false;
  el('availability').textContent = 'Use the pairing link and code from your teacher.';
}
async function refresh() {
  const request = ++generation;
  let state;
  try { state = await api('kiosk', 'state'); }
  catch (error) { if (error.status === 401) pairing(); throw error; }
  if (request !== generation) return;
  el('pair').hidden = true;
  choices.hidden = false;
  el('class-name').textContent = state.name;
  el('availability').textContent = state.closed ? 'Passes reopen at ' + state.closed :
    state.available ? state.available + (state.available === 1 ? ' pass available' : ' passes available') : 'All passes are in use';
  el('request').querySelector('strong').textContent = state.closed || state.waiting || !state.available ? 'Join the line' : 'Request a pass';
}
async function start() {
  try {
    await refresh();
    if (!subscribed) {
      subscribed = true;
      subscribe('kiosk', refresh, connected);
    }
  } catch (error) {
    if (error.status !== 401) {
      connected(false);
      setTimeout(start, 2000);
    }
  }
}
el('pair').onsubmit = async event => {
  event.preventDefault();
  try {
    await api('kiosk', 'pair?board=' + encodeURIComponent(location.hash.slice(1)), { code: el('pair-code').value.toLowerCase().trim() });
    el('pair-code').value = '';
    history.replaceState(null, '', location.pathname);
    el('feedback').textContent = '';
    await start();
  } catch (error) { el('feedback').textContent = error.message; }
};
function arm() {
  clearTimeout(idle);
  idle = setTimeout(() => entry.close(), 30000);
}
for (const name of ['request', 'return']) el(name).onclick = () => {
  if (!online) return;
  action = name;
  el('entry-title').textContent = el(name).querySelector('strong').textContent;
  el('prompt').textContent = 'Enter your student code';
  el('error').textContent = el('feedback').textContent = input.value = '';
  entry.showModal();
  input.focus();
  arm();
};
input.oninput = arm;
el('cancel').onclick = () => entry.close();
entry.onclose = () => { clearTimeout(idle); input.value = el('error').textContent = ''; };
el('entry-form').onsubmit = async event => {
  event.preventDefault();
  if (!online || el('submit').disabled) return;
  el('submit').disabled = true;
  try {
    const result = await api('kiosk', 'action', { action, code: input.value.trim().toLowerCase() });
    entry.close();
    el('feedback').textContent = result.message;
    clearTimeout(clearFeedback);
    clearFeedback = setTimeout(() => { el('feedback').textContent = ''; }, 6000);
    await refresh();
  } catch (error) { el('error').textContent = error.message; input.select(); }
  finally { el('submit').disabled = false; }
};
start();
