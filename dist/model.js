export const DAY = 86_400_000;
export const RETENTION_DAYS = 90;
export const STORAGE_KEY = 'passage.board.v1';

export function newClass(name, names = []) {
  return {
    id: crypto.randomUUID(), name,
    roster: names.map(name => ({ id: crypto.randomUUID(), name })),
    trips: [], queue: [], passes: 2, overdue: 5, initialsOnly: false, closed: [],
  };
}

export function startBoard(now = Date.now()) {
  const sample = newClass('Period 1', [
    'Amelia B.', 'Benjamin C.', 'Chloe D.', 'Daniel F.', 'Elena G.', 'Ethan H.',
    'Isabella J.', 'Jack K.', 'Mia L.', 'Noah M.', 'Olivia R.', 'Sofia T.',
  ]);
  const today = +dayStart(now);
  sample.trips.push({ name: sample.roster[2].name, studentId: sample.roster[2].id, id: crypto.randomUUID(), slot: 1, out: Math.max(today, now - 112000), back: null });
  sample.queue.push({ studentId: sample.roster[7].id, time: Math.max(today, now - 54000) });
  return { active: sample.id, classes: [sample], demo: true };
}

export function trimHistory(board, now = Date.now(), zone) {
  const today = +dayStart(now);
  const calendar = zone && new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const date = calendar && calendar.format(now);
  const previousDay = timestamp => calendar ? timestamp < now && calendar.format(timestamp) !== date : timestamp < today;
  for (const room of board.classes) {
    room.queue = room.queue.filter(entry => !previousDay(entry.time));
    room.trips = room.trips.filter(trip => trip.out >= now - RETENTION_DAYS * DAY).map(trip =>
      trip.back === null && previousDay(trip.out) ? { ...trip, back: trip.out, noReturn: true } : trip,
    );
  }
  return board;
}

export function openSlots(room) {
  const taken = new Set(room.trips.filter(trip => trip.back === null).map(trip => trip.slot));
  return Array.from({ length: room.passes }, (_, index) => index + 1).filter(slot => !taken.has(slot));
}

export function closedUntil(room, now = Date.now(), zone) {
  if (zone) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: zone, hourCycle: 'h23',
      weekday: 'short', hour: '2-digit', minute: '2-digit' }).formatToParts(now).map(p => [p.type, p.value]));
    if (['Sat', 'Sun'].includes(parts.weekday)) return undefined;
    return closureAt(room, parts.hour + ':' + parts.minute);
  }
  const current = new Date(now);
  if (current.getDay() === 0 || current.getDay() === 6) return undefined;
  const time = [current.getHours(), current.getMinutes()].map(value => String(value).padStart(2, '0')).join(':');
  return closureAt(room, time);
}

function closureAt(room, time) {
  return room.closed.filter(range => range.start <= time && time < range.end).map(range => range.end).sort().at(-1);
}

export function transition(room, action, studentId, now = Date.now(), override = false, zone) {
  const trip = room.trips.find(item => item.back === null && item.studentId === studentId);
  const queued = room.queue.some(item => item.studentId === studentId);
  const student = room.roster.find(item => item.id === studentId);
  const slot = openSlots(room)[0];

  if (action === 'tap') {
    if (trip) action = 'return';
    else if (queued) action = 'leave';
    else if (slot && !room.queue.length && !closedUntil(room, now, zone)) action = 'send';
    else action = 'queue';
  }
  if (action === 'return' && trip) {
    trip.back = now;
    return `${trip.name} returned the pass.`;
  }
  if (action === 'leave' && queued) {
    room.queue = room.queue.filter(item => item.studentId !== studentId);
    return `${student?.name ?? 'Student'} left the waiting line.`;
  }
  if (!student || trip) return '';
  if (action === 'queue' && !queued) {
    room.queue.push({ studentId, time: now });
    return `${student.name} joined the waiting line.`;
  }
  if (action === 'send' && slot && (override || !closedUntil(room, now, zone))) {
    if (room.queue.length && room.queue[0].studentId !== studentId) return '';
    room.queue = room.queue.filter(item => item.studentId !== studentId);
    room.trips.push({ id: crypto.randomUUID(), studentId, name: student.name, slot, out: now, back: null });
    return `${student.name} took pass ${slot}.`;
  }
  return '';
}

export function parseNames(input) {
  return [...new Set(input.split(/\r?\n/).map(name => name.trim()).filter(Boolean))];
}

export function setRoster(room, names, replace = false) {
  const byName = new Map(room.roster.map(student => [student.name, student]));
  const next = replace ? names : [...new Set([...byName.keys(), ...names])];
  room.roster = next.map(name => byName.get(name) ?? { id: crypto.randomUUID(), name });
  const ids = new Set(room.roster.map(student => student.id));
  room.queue = room.queue.filter(item => ids.has(item.studentId));
}

export function dayStart(date = Date.now()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function weekStart(date = new Date(), offset = 0) {
  const start = dayStart(date);
  start.setDate(start.getDate() - (start.getDay() + 6) % 7 + offset * 7);
  return start;
}
