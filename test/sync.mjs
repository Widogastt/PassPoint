// Run against the local test identity. Data is confined to a new fictional class.
import assert from 'node:assert/strict';
import { newClass } from '../dist/model.js';
const origin = 'http://127.0.0.1:8787';
async function post(path, body, cookie) {
  return fetch(origin + '/api/' + path, { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) },
    body: JSON.stringify(body) });
}
const state = () => fetch(origin + '/api/teacher/state').then(r => r.json());
const initial = await state();
const room = newClass('Concurrency test', ['First', 'Second']);
room.passes = 1;
initial.board.classes.push(room);
assert.equal((await post('teacher/edit', { version: initial.version, board: initial.board })).status, 200);
assert.equal((await post('teacher/edit', { version: initial.version, board: initial.board })).status, 409);
const pair = await (await post('teacher/pair', { version: (await state()).version, room: room.id })).json();
const pairPath = 'kiosk/pair?board=' + pair.board;
const paired = await post(pairPath, { code: pair.code });
assert.equal(paired.status, 200);
const cookie = paired.headers.get('Set-Cookie').split(';')[0];
assert.equal((await post(pairPath, { code: pair.code })).status, 401);
const results = await Promise.all(room.roster.map(s => post('kiosk/action',
  { action: 'request', code: s.id.replaceAll('-', '').slice(0, 10) }, cookie)));
assert.ok(results.every(r => r.status === 200));
const latest = await state();
const updated = latest.board.classes.find(c => c.id === room.id);
assert.equal(updated.trips.length, 1);
assert.equal(updated.queue.length, 1);
assert.notEqual(updated.trips[0].studentId, updated.queue[0].studentId);
const limited = await fetch(origin + '/api/kiosk/state', { headers: { Cookie: cookie } }).then(r => r.json());
assert.deepEqual(Object.keys(limited).sort(), ['available', 'closed', 'name', 'waiting'].filter(k => k !== 'closed' || limited.closed !== undefined));
assert.equal((await post('teacher/unpair', { room: room.id, version: latest.version })).status, 200);
assert.equal((await fetch(origin + '/api/kiosk/state', { headers: { Cookie: cookie } })).status, 401);
latest.board.classes = latest.board.classes.filter(c => c.id !== room.id);
assert.equal((await post('teacher/edit', latest)).status, 200);
console.log('Passed concurrent requests, stale edits, one-time pairing, limited kiosk data and revocation.');
