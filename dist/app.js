import {
  RETENTION_DAYS, STORAGE_KEY, closedUntil, dayStart, newClass, openSlots, parseNames,
  setRoster, startBoard, transition, trimHistory, weekStart,
} from './model.js';

const byId = id => document.getElementById(id);
const dialog = byId('dialog');
const search = byId('search');
const formatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const dayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
let board = load();
let undo = null;
let undoDeadline = 0;
let boardDay = +dayStart();
let storageAvailable = true;
let activeClosure;
let statWeek = 0;
let statStudent = '';
let modalTrigger;

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.classes?.some(room => room.id === saved.active)) return trimHistory(saved);
  } catch {}
  return startBoard();
}

const room = () => board.classes.find(item => item.id === board.active);
const escape = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
const initials = name => Array.from(name.trim().split(/\s+/).slice(0, 2), part => [...part][0]).join('').toUpperCase();
const nameFor = (name, current = room()) => escape(current.initialsOnly ? initials(name) : name);

function save(message) {
  trimHistory(board);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
  if (message) byId('announcement').textContent = message;
  draw();
}

function update(message, change, canUndo = true) {
  const previous = JSON.stringify(board);
  change();
  if (previous === JSON.stringify(board)) return;
  undo = canUndo ? previous : null;
  undoDeadline = Date.now() + 30_000;
  save(message);
}

function selectClass(id) {
  search.value = '';
  board.active = id;
  undo = null;
  save();
}

function draw() {
  const current = room();
  const focused = document.activeElement?.dataset;
  byId('classes').innerHTML = board.classes.map(item =>
    `<button class="button class-button" data-class="${item.id}" aria-current="${item.id === current.id}">${escape(item.name)}</button>`,
  ).join('');
  byId('subtitle').textContent = board.demo && board.classes[0].id === current.id
    ? `${current.name} · Sample roster`
    : current.name;
  byId('roster-count').textContent = current.roster.length;
  byId('storage-note').textContent = storageAvailable
    ? `Saved in this browser · Completed trips kept for ${RETENTION_DAYS} days`
    : 'Browser storage is unavailable. Changes last until the page closes.';
  byId('undo').hidden = !undo;
  drawActivity();
  drawRoster();
  if (!dialog.open && focused?.class) {
    byId('classes').querySelector(`[data-class="${focused.class}"]`)?.focus();
  } else if (!dialog.open && focused?.student) {
    byId('roster').querySelector(`[data-student="${focused.student}"]`)?.focus();
  }
}

function drawRoster() {
  const current = room();
  const trips = new Set(current.trips.filter(trip => trip.back === null).map(trip => trip.studentId));
  const waiting = new Set(current.queue.map(item => item.studentId));
  const query = search.value.trim().toLocaleLowerCase();
  byId('roster').innerHTML = current.roster.map((student, index) => {
    const name = current.initialsOnly ? initials(student.name) : student.name;
    if (!name.toLocaleLowerCase().includes(query)) return '';
    const status = trips.has(student.id) ? 'Out' : waiting.has(student.id) ? 'In line' : '';
    return `<button class="student" data-student="${student.id}">
      <span class="avatar" data-color="${index % 6}" aria-hidden="true">${escape(initials(student.name))}</span>
      <span class="name">${escape(name)}</span>
      ${status ? `<span class="tag">${status}</span>` : '<span class="arrow" aria-hidden="true">›</span>'}
    </button>`;
  }).join('') || `<p class="empty">${query ? 'No matching students.' : 'Add names in Settings to start issuing passes.'}</p>`;
}

function clockText(time) {
  const [hour, minute] = time.split(':').map(Number);
  return timeFormatter.format(new Date(2000, 0, 1, hour, minute));
}

function timerText(start, now = Date.now()) {
  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function drawActivity() {
  const current = room();
  const trips = current.trips.filter(trip => trip.back === null);
  const available = openSlots(current).length;
  activeClosure = closedUntil(current);
  byId('pass-summary').textContent = activeClosure
    ? `Closed until ${clockText(activeClosure)}`
    : `${available} of ${current.passes} available`;
  byId('pass-list').innerHTML = Array.from({ length: current.passes }, (_, index) => {
    const slot = index + 1;
    const trip = trips.find(item => item.slot === slot);
    return trip ? `<div class="pass-row">
      <span class="slot" aria-label="Pass ${slot}">${slot}</span>
      <div class="slot-text"><strong>${nameFor(trip.name)}</strong><small data-timer="${trip.out}" data-limit="${current.overdue}"></small></div>
      <button class="button outline" data-return="${trip.studentId}">Return</button>
    </div>` : `<div class="pass-row"><span class="slot available" aria-hidden="true">${slot}</span>
      <div class="slot-text"><strong>Pass ${slot}</strong><small>Ready to use</small></div></div>`;
  }).join('');
  byId('queue-count').textContent = current.queue.length;
  byId('queue-list').innerHTML = current.queue.map((item, index) => {
    const student = current.roster.find(candidate => candidate.id === item.studentId);
    if (!student) return '';
    return `<div class="queue-row"><span class="slot">${index + 1}</span>
      <div class="slot-text"><strong>${nameFor(student.name)}</strong><small data-timer="${item.time}" data-prefix="Waiting "></small></div>
      ${index === 0 ? `<button class="button outline" data-send="${student.id}" ${available ? '' : 'disabled'}>Send</button>` : ''}
    </div>`;
  }).join('') || '<p class="empty">No one is waiting.</p>';
  updateTimers();
}

function updateTimers() {
  const now = Date.now();
  const today = +dayStart(now);
  if (today !== boardDay) {
    boardDay = today;
    undo = null;
    save();
    return;
  }
  if (undo && now >= undoDeadline) {
    undo = null;
    byId('undo').hidden = true;
  }
  if (activeClosure !== closedUntil(room(), now)) {
    drawActivity();
    return;
  }
  document.querySelectorAll('[data-timer]').forEach(element => {
    const start = Number(element.dataset.timer);
    const limit = Number(element.dataset.limit);
    const overdue = limit > 0 && now - start >= limit * 60_000;
    element.textContent = `${element.dataset.prefix ?? ''}${timerText(start, now)}${overdue ? ' · Over limit' : ''}`;
    element.classList.toggle('overdue', overdue);
  });
}

function passAction(action, student, override = false) {
  const before = JSON.stringify(board);
  const message = transition(room(), action, student, Date.now(), override);
  if (!message) return;
  undo = before;
  undoDeadline = Date.now() + 30_000;
  save(message);
}

function show(title, content) {
  byId('dialog-body').innerHTML = `<div class="dialog-head">
    <h2 id="dialog-title">${escape(title)}</h2><button type="button" class="button plain" data-close aria-label="Close">✕</button></div>${content}`;
  if (!dialog.open) {
    modalTrigger = document.activeElement;
    dialog.showModal();
  }
}

function confirmAction(title, message, label, action) {
  show(title, `<p>${escape(message)}</p><div class="actions"><button class="button outline" data-close>Cancel</button>
    <button class="button primary" id="confirm-action">${escape(label)}</button></div>`);
  byId('confirm-action').onclick = () => {
    dialog.close();
    action();
  };
}

function openNewClass() {
  show('Add class', `<form id="class-form">
    <label>Class name<input name="name" required maxlength="60" placeholder="Period 2"></label>
    <label class="settings-section">Class roster<textarea name="names" rows="5" placeholder="One student per line"></textarea></label>
    <div class="actions"><button class="button primary">Create class</button></div>
  </form>`);
  byId('class-form').onsubmit = event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = data.get('name').trim();
    if (!name) return;
    const next = newClass(name, parseNames(data.get('names')));
    dialog.close();
    update('Class created.', () => {
      board.classes.push(next);
      board.active = next.id;
      search.value = '';
    });
  };
}

function openSettings() {
  const current = room();
  const highestSlot = Math.max(1, ...current.trips.filter(trip => trip.back === null).map(trip => trip.slot));
  const options = (values, selected, label) => values.map(value =>
    `<option value="${value}" ${value === selected ? 'selected' : ''}>${label(value)}</option>`,
  ).join('');

  show('Class settings', `
    <form id="room-form">
      <label>Class name<input name="name" required maxlength="60" value="${escape(current.name)}"></label>
      <div class="form-grid">
        <label>Room passes<select name="passes">${options(Array.from({ length: 7 - highestSlot }, (_, index) => index + highestSlot), current.passes, n => n)}</select></label>
        <label>Flag trips after<select name="overdue">${options([0, 3, 5, 7, 10, 15], current.overdue, n => n ? `${n} minutes` : 'Never')}</select></label>
      </div>
      <label><input type="checkbox" name="initials" ${current.initialsOnly ? 'checked' : ''}>Show initials on the board</label>
      <div class="settings-section">
        <h3>Closed times</h3><p class="settings-note">These hours repeat on school days (Monday to Friday).</p>
        <div id="closed-list"></div>
        <div class="actions"><button type="button" class="button outline" id="add-closed">＋ Add closed time</button></div>
        <p class="message" id="settings-error" role="alert"></p>
      </div>
      <div class="actions"><button class="button primary">Save settings</button></div>
    </form>
    <section class="settings-section">
      <h3>Class roster</h3>
      <label>Paste names<textarea id="names" rows="3" placeholder="One student per line"></textarea></label>
      <div class="actions"><button class="button outline" id="add-names">Add names</button>
        <button class="button outline" id="replace-names">Replace roster</button></div>
      <div class="settings-roster" id="settings-roster"></div>
    </section>
    <section class="settings-section">
      <h3>Class data</h3>
      <div class="actions">
        ${board.demo && board.classes[0].id === current.id ? '<button class="button outline" id="clear-demo">Clear sample data</button>' : ''}
        <button class="button plain danger" id="clear-history">Delete trip history</button>
        <button class="button plain danger" id="delete-class">Delete class</button>
        <button class="button plain danger" id="clear-all">Clear all classes</button>
      </div>
    </section>`);
  const closedList = byId('closed-list');
  function appendClosed({ start = '', end = '' } = {}) {
    const row = document.createElement('div');
    row.className = 'closed-row';
    row.innerHTML = `<label>From<input type="time" class="start" value="${escape(start)}" required></label>
      <label>Until<input type="time" class="end" value="${escape(end)}" required></label>
      <button type="button" class="button plain" aria-label="Remove closed time">✕</button>`;
    row.querySelector('button').onclick = () => row.remove();
    closedList.append(row);
  }
  current.closed.forEach(appendClosed);
  byId('add-closed').onclick = () => appendClosed();
  byId('room-form').onsubmit = event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = data.get('name').trim();
    const closed = Array.from(closedList.children, row => ({
      start: row.querySelector('.start').value, end: row.querySelector('.end').value,
    }));
    if (!name || closed.some(range => range.start >= range.end)) {
      byId('settings-error').textContent = !name ? 'Enter a class name.' : 'The start time must be before the end time.';
      return;
    }
    dialog.close();
    update('Settings saved.', () => Object.assign(current, {
      name, closed, passes: Number(data.get('passes')), overdue: Number(data.get('overdue')), initialsOnly: data.has('initials'),
    }));
  };
  function drawSettingsRoster() {
    byId('settings-roster').innerHTML = current.roster.map(student =>
      `<button class="button outline" data-remove="${student.id}" aria-label="Remove ${escape(student.name)}">${escape(student.name)} ×</button>`,
    ).join('');
  }
  drawSettingsRoster();
  byId('settings-roster').onclick = event => {
    const id = event.target.closest('[data-remove]')?.dataset.remove;
    if (!id) return;
    update('Student removed.', () => {
      current.roster = current.roster.filter(student => student.id !== id);
      current.queue = current.queue.filter(item => item.studentId !== id);
    });
    drawSettingsRoster();
  };
  function writeNames(replace) {
    const names = parseNames(byId('names').value);
    if (!names.length) {
      byId('names').focus();
      return;
    }
    const apply = () => update('Roster saved.', () => {
      setRoster(current, names, replace);
      if (replace && board.demo && board.classes[0].id === current.id) {
        current.trips = [];
        board.demo = false;
      }
    });
    if (replace) {
      const detail = board.demo && board.classes[0].id === current.id
        ? 'The pasted list will replace the sample roster and clear its trip history.'
        : 'The pasted list will become the class roster. Existing trip records stay with the class.';
      confirmAction('Replace roster?', detail, 'Replace roster', apply);
    }
    else {
      apply();
      byId('names').value = '';
      drawSettingsRoster();
    }
  }
  byId('add-names').onclick = () => writeNames(false);
  byId('replace-names').onclick = () => writeNames(true);
  byId('clear-history').onclick = () => confirmAction('Delete trip history?', 'Completed trips for this class will be removed. Passes currently out can still be returned.', 'Delete history', () => {
    update('Trip history deleted.', () => { current.trips = current.trips.filter(trip => trip.back === null); }, false);
  });
  byId('delete-class').onclick = () => confirmAction('Delete class?', `Delete ${current.name}, its roster, and its trip history?`, 'Delete class', () => {
    update('Class deleted.', () => {
      if (board.classes[0].id === current.id) board.demo = false;
      board.classes = board.classes.filter(item => item.id !== current.id);
      if (!board.classes.length) board.classes.push(newClass('Period 1'));
      board.active = board.classes[0].id;
      search.value = '';
    }, false);
  });
  byId('clear-all').onclick = () => confirmAction('Clear all classes?', 'This removes every roster, waiting line, and trip on this browser.', 'Clear all classes', () => {
    const first = newClass('Period 1');
    update('All classroom data cleared.', () => {
      board = { active: first.id, classes: [first], demo: false };
      search.value = '';
    }, false);
  });
  if (byId('clear-demo')) {
    byId('clear-demo').onclick = () => confirmAction('Clear sample data?', 'This empties the sample classroom so you can add your own roster.', 'Clear sample data', () => {
      update('Sample data cleared.', () => {
        current.roster = [];
        current.trips = [];
        current.queue = [];
        board.demo = false;
        search.value = '';
      });
    });
  }
}

function openStats(focusId) {
  const current = room();
  const start = weekStart(new Date(), statWeek);
  const next = weekStart(new Date(), statWeek + 1);
  const end = new Date(next);
  end.setDate(end.getDate() - 1);
  const trips = current.trips.filter(trip => trip.out >= +start && trip.out < +next);
  const students = new Map([...current.roster.map(student => [student.id, student.name]), ...trips.map(trip => [trip.studentId, trip.name])]);
  const visible = trips.filter(trip => !statStudent || trip.studentId === statStudent).sort((a, b) => b.out - a.out);
  const total = Math.floor(visible.reduce((sum, trip) => sum + (trip.back === null ? 0 : trip.back - trip.out), 0) / 60_000);
  show('Class stats', `
    <p>${escape(current.name)} · ${formatter.format(start)} – ${formatter.format(end)}</p>
    <div class="week-nav"><button class="button outline" id="prev-week">‹ Previous week</button>
      <button class="button outline" id="next-week" ${statWeek >= 0 ? 'disabled' : ''}>Next week ›</button></div>
    <label class="settings-section">Student<select id="stat-student"><option value="">All students</option>
      ${[...students].map(([id, name]) => `<option value="${id}" ${id === statStudent ? 'selected' : ''}>${nameFor(name)}</option>`).join('')}
    </select></label>
    <div class="settings-section"><h3>${visible.length} ${visible.length === 1 ? 'trip' : 'trips'} · ${total} min completed</h3>
    ${visible.map(trip => `<div class="visit"><div><strong>${nameFor(trip.name)}</strong><br>
      <small>${dayFormatter.format(trip.out)} · ${timeFormatter.format(trip.out)}${trip.back === null || trip.noReturn ? '' : ` – ${timeFormatter.format(trip.back)}`}</small>
      </div><span>${trip.noReturn ? 'No return recorded' : trip.back === null ? 'Still out' : timerText(trip.out, trip.back)}</span></div>`).join('') || '<p class="empty">No trips this week.</p>'}
    </div>`);
  byId('prev-week').onclick = () => { statWeek--; statStudent = ''; openStats('prev-week'); };
  byId('next-week').onclick = () => { statWeek++; statStudent = ''; openStats(statWeek === 0 ? 'prev-week' : 'next-week'); };
  byId('stat-student').onchange = event => { statStudent = event.target.value; openStats('stat-student'); };
  if (focusId) byId(focusId).focus();
}

function tapStudent(id) {
  const current = room();
  const until = closedUntil(current);
  const alreadyOut = current.trips.some(trip => trip.studentId === id && trip.back === null);
  const alreadyWaiting = current.queue.some(item => item.studentId === id);
  if (until && !alreadyOut && !alreadyWaiting && !current.queue.length && openSlots(current).length) {
    show('Passes are closed', `<p>Passes reopen at ${clockText(until)}.</p><div class="actions">
      <button class="button outline" data-close>Cancel</button><button class="button outline" id="join-line">Join line</button>
      <button class="button primary" id="send-anyway">Send anyway</button></div>`);
    byId('join-line').onclick = () => { dialog.close(); passAction('queue', id); };
    byId('send-anyway').onclick = () => { dialog.close(); passAction('send', id, true); };
    return;
  }
  passAction('tap', id);
}

byId('classes').onclick = event => {
  const id = event.target.closest('[data-class]')?.dataset.class;
  if (id) selectClass(id);
};
byId('roster').onclick = event => {
  const id = event.target.closest('[data-student]')?.dataset.student;
  if (id) tapStudent(id);
};
byId('pass-list').onclick = event => {
  const id = event.target.closest('[data-return]')?.dataset.return;
  if (id) passAction('return', id);
};
byId('queue-list').onclick = event => {
  const id = event.target.closest('[data-send]')?.dataset.send;
  if (!id) return;
  const until = closedUntil(room());
  if (until) confirmAction('Passes are closed', `Passes reopen at ${clockText(until)}.`, 'Send anyway', () => passAction('send', id, true));
  else passAction('send', id);
};
byId('undo').onclick = () => {
  if (!undo) return;
  board = JSON.parse(undo);
  undo = null;
  save('Last action undone.');
};
byId('settings').onclick = openSettings;
byId('new-class').onclick = openNewClass;
byId('show-stats').onclick = () => { statWeek = 0; statStudent = ''; openStats(); };
search.oninput = drawRoster;
dialog.onclick = event => {
  if (event.target.closest('[data-close]')) dialog.close();
};
dialog.addEventListener('close', () => {
  if (!dialog.open && modalTrigger?.isConnected) modalTrigger.focus();
});
byId('fullscreen').hidden = !document.fullscreenEnabled;
byId('fullscreen').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    byId('announcement').textContent = 'Full screen is unavailable in this browser.';
  }
};
document.addEventListener('fullscreenchange', () => {
  byId('fullscreen-label').textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen';
});
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  if (dialog.open) dialog.close();
  board = load();
  undo = null;
  draw();
});
save();
setInterval(updateTimers, 1000);
