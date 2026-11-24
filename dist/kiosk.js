import { LOCK_KEY, deriveKey } from './kiosk-lock.js';
import { STORAGE_KEY, closedUntil, openSlots, transition, trimHistory } from './model.js';

const el = id => document.getElementById(id);
const entry = el('entry');
const input = el('credential');
let mode;
let idleTimer;
let feedbackTimer;

function state() {
  const lock = JSON.parse(localStorage.getItem(LOCK_KEY));
  if (!lock) {
    location.replace('./');
    return {};
  }
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
  const board = stored && trimHistory(stored);
  return { lock, board, room: board?.classes.find(item => item.id === lock.classId) };
}

function refresh() {
  const { room } = state();
  const closed = room && closedUntil(room);
  const slots = room ? openSlots(room).length : 0;
  const canIssue = slots && !room?.queue.length;
  el('class-name').textContent = room?.name || 'Student kiosk';
  el('availability').textContent = !room ? 'Class unavailable. Ask your teacher for help.' : closed ?
    'Passes reopen at ' + closed : slots ? slots + (slots === 1 ? ' pass available' : ' passes available') : 'All passes are in use';
  el('request').querySelector('strong').textContent = canIssue && !closed ? 'Request a pass' : 'Join the line';
  el('request').disabled = el('return').disabled = !room;
}

function clearLater() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => entry.close(), 30000);
}
function begin(action) {
  mode = action;
  el('feedback').textContent = el('error').textContent = input.value = '';
  el('entry-title').textContent = action === 'unlock' ? 'Teacher access' : el(action).querySelector('strong').textContent;
  el('prompt').textContent = action === 'unlock' ? 'Teacher exit passphrase' : 'Enter your student code';
  entry.showModal();
  input.focus();
  clearLater();
}

for (const action of ['request', 'return', 'unlock']) el(action).onclick = () => begin(action);
input.oninput = clearLater;
el('cancel').onclick = () => entry.close();
entry.onclose = () => {
  clearTimeout(idleTimer);
  input.value = el('error').textContent = '';
};
el('entry-form').onsubmit = async event => {
  event.preventDefault();
  const { lock, room, board } = state();
  if (!lock) return;
  try {
    let result;
    if (mode === 'unlock') {
      const verifier = await deriveKey(input.value, lock.salt);
      if (!entry.open || mode !== 'unlock') return;
      if (verifier !== lock.verifier) throw new Error('Check the teacher passphrase and try again.');
      localStorage.removeItem(LOCK_KEY);
      location.replace('./');
      return;
    }
    if (!room) throw new Error('Class unavailable. Ask your teacher for help.');
    const id = lock.codes[input.value.trim().toLowerCase()];
    if (!room.roster.some(student => student.id === id)) throw new Error('Check your student code and try again.');
    const active = room.trips.some(trip => trip.studentId === id && trip.back === null);
    const position = room.queue.findIndex(item => item.studentId === id);
    if (mode === 'return') {
      if (!active) throw new Error('You have no pass to return.');
      transition(room, 'return', id);
      result = 'Pass returned. Welcome back!';
    } else if (active) {
      result = 'You already have a pass.';
    } else if (position >= 0) {
      result = 'Your place in line: ' + (position + 1) + '.';
    } else if (!openSlots(room).length || room.queue.length || closedUntil(room)) {
      transition(room, 'queue', id);
      result = 'You joined the line. Your place: ' + room.queue.length + '.';
    } else {
      transition(room, 'send', id);
      result = 'Pass issued. Please return it here when you get back.';
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
    entry.close();
    refresh();
    el('feedback').textContent = result;
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => { el('feedback').textContent = ''; }, 6000);
  } catch (error) {
    el('error').textContent = error instanceof DOMException ? 'Unable to save. Ask your teacher for help.' : error.message;
    input.select();
  }
};
refresh();
window.addEventListener('storage', refresh);
window.addEventListener('pageshow', refresh);
setInterval(refresh, 15000);
