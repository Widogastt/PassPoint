import { newClass, openSlots, transition, trimHistory, closedUntil } from '../dist/model.js';

const reply = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const reject = (message, status = 400) => reply({ error: message }, status);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const code = () => crypto.randomUUID().replaceAll('-', '').slice(0, 10);
const text = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;
function validBoard(b) {
  return b && Array.isArray(b.classes) && b.classes.length <= 100 && b.classes.some(c => c.id === b.active) &&
    b.classes.every(c => uuid.test(c.id) && text(c.name, 60) && Number.isInteger(c.passes) && c.passes >= 1 && c.passes <= 6 &&
      Number.isFinite(c.overdue) && Array.isArray(c.closed) && c.closed.every(t => /^\d\d:\d\d$/.test(t.start) && /^\d\d:\d\d$/.test(t.end)) &&
      Array.isArray(c.roster) && c.roster.length <= 2000 && c.roster.every(s => uuid.test(s.id) && text(s.name, 500)) &&
      Array.isArray(c.trips) && c.trips.every(t => uuid.test(t.studentId) && text(t.name, 500) && Number.isFinite(t.out) &&
        (t.back === null || Number.isFinite(t.back)) && Number.isInteger(t.slot)) &&
      Array.isArray(c.queue) && c.queue.every(q => uuid.test(q.studentId) && Number.isFinite(q.time)));
}

export class ClassroomBoard {
  constructor(ctx) {
    this.ctx = ctx;
    this.store = ctx.storage.kv;
  }
  notify() {
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send('refresh'); } catch { socket.close(); }
    }
  }
  webSocketMessage(ws) { ws.close(1000); }
  webSocketClose(ws, code, reason) { ws.close(code, reason); }

  async fetch(req) {
    const path = new URL(req.url).pathname;
    const staff = path.startsWith('/api/teacher/');
    const action = path.split('/').pop();
    let input = {};
    if (req.method === 'POST') {
      const raw = await req.text();
      if (raw.length > 1800000) return reject('Board exceeds the size limit.', 413);
      try { input = JSON.parse(raw); } catch { return reject('Expected JSON.'); }
      if (!input || typeof input !== 'object') return reject('Expected an object.');
    }
    // Synchronous SQLite-backed reads and writes keep each read/check/update in one turn.
    const initial = () => {
      const room = newClass('Period 1');
      let zone = new URL(req.url).searchParams.get('zone') || 'UTC';
      try { new Intl.DateTimeFormat('en', { timeZone: zone }); } catch { zone = 'UTC'; }
      return { version: 1, zone, board: { active: room.id, classes: [room], demo: false } };
    };
    let record = this.store.get('record');
    if (!record && staff) { record = initial(); this.store.put('record', record); }
    if (!record) return reject('Pairing expired.', 401);
    const now = Date.now();
    const board = record.board;
    const persist = () => {
      record.version++;
      this.store.put('record', record);
      this.notify();
    };
    const before = JSON.stringify(board);
    trimHistory(board, now, record.zone);
    if (JSON.stringify(board) !== before) persist();
    if (!staff && action === 'pair' && req.method === 'POST') {
      const pair = this.store.get('pair');
      if (!pair || pair.until < now || pair.code !== input.code) return reject('Invalid or expired pairing code.', 401);
      const token = crypto.randomUUID();
      this.store.put('device:' + pair.room, token);
      this.store.delete('pair');
      const res = reply({ paired: true });
      res.headers.set('Set-Cookie', 'pp_device=' + this.ctx.id.toString() + '.' + token + '; HttpOnly; Secure; SameSite=Strict; Path=/api/kiosk; Max-Age=2592000');
      this.store.put('expiry:' + pair.room, now + 2592000000);
      return res;
    }
    const token = req.headers.get('Cookie')?.match(/(?:^|; )pp_device=[0-9a-f]{64}\.([a-z0-9-]{36})\b/)?.[1];
    const room = staff ? board.classes.find(c => c.id === input.room) :
      board.classes.find(c => token && this.store.get('device:' + c.id) === token && this.store.get('expiry:' + c.id) > now);
    if (!staff && !room) return reject('Pair this Chromebook with your teacher again.', 401);
    if (action === 'live' && req.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }
    const closed = room && closedUntil(room, now, record.zone);
    if (action === 'state' && req.method === 'GET') return reply(staff ? record : {
      name: room.name, available: openSlots(room).length, waiting: room.queue.length > 0, closed,
    });
    if (req.method !== 'POST') return reject('Unknown operation.', 404);
    if (staff && input.version !== record.version) return reject('The board changed. Check the latest board and retry.', 409);
    if (staff && action === 'edit') {
      if (!validBoard(input.board)) return reject('Invalid classroom data.');
      record.board = input.board;
      persist();
      return reply(record);
    }
    if (!room) return reject('Class unavailable.');
    if (staff && action === 'pair') {
      const pairing = code();
      this.store.put('pair', { room: room.id, code: pairing, until: now + 300000 });
      return reply({ board: this.ctx.id.toString(), code: pairing });
    }
    if (staff && action === 'unpair') {
      this.store.delete('device:' + room.id);
      this.store.delete('pair');
      this.notify();
      return reply({ ok: true });
    }
    if (action !== 'action') return reject('Unknown operation.', 404);
    if (staff) {
      if (!['tap', 'queue', 'return', 'send'].includes(input.action)) return reject('Unknown pass action.');
      const message = transition(room, input.action, input.student, now, input.override === true, record.zone);
      if (!message) return reject('This action is no longer available.', 409);
      persist();
      return reply({ ...record, message });
    }
    if (!['request', 'return'].includes(input.action)) return reject('Unknown pass action.');
    const attemptsKey = 'attempts:' + room.id;
    const attempts = this.store.get(attemptsKey) || [];
    const recent = attempts.filter(t => t > now - 60000);
    if (recent.length >= 8) return reject('Too many incorrect codes. Try again in a minute.', 429);
    const matches = typeof input.code === 'string' && [10, 32].includes(input.code.length)
      ? room.roster.filter(s => s.id.replaceAll('-', '').startsWith(input.code)) : [];
    const student = matches.length === 1 && matches[0];
    if (!student) {
      this.store.put(attemptsKey, [...recent, now]);
      return reject('Check your student code.');
    }
    const out = room.trips.some(t => t.studentId === student.id && t.back === null);
    const position = room.queue.findIndex(q => q.studentId === student.id);
    let message;
    if (input.action === 'return') {
      if (!out) return reject('You have no pass to return.');
      transition(room, 'return', student.id, now);
      message = 'Pass returned. Welcome back!';
    } else if (out) return reply({ message: 'You already have a pass.' });
    else if (position >= 0) return reply({ message: 'Your place in line: ' + (position + 1) + '.' });
    else if (room.queue.length || !openSlots(room).length || closed) {
      transition(room, 'queue', student.id, now);
      message = 'You joined the line. Your place: ' + room.queue.length + '.';
    } else {
      transition(room, 'send', student.id, now, false, record.zone);
      message = 'Pass issued. Please return it here when you get back.';
    }
    persist();
    return reply({ message });
  }
}
