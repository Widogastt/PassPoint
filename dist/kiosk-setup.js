import { deriveKey, LOCK_KEY } from './kiosk-lock.js';

export function configureKiosk(button, room, show, escape) {
  button.onclick = () => {
    const current = room();
    if (!current.roster.length) {
      show('Student kiosk', '<p>Add students in Settings before starting the kiosk.</p>');
      return;
    }
    // Use the shortest unique prefix of the existing student identifiers within this class.
    let length = 6;
    const ids = current.roster.map(student => student.id.replaceAll('-', ''));
    while (new Set(ids.map(id => id.slice(0, length))).size < ids.length) length++;
    const codes = Object.fromEntries(current.roster.map((student, i) => [ids[i].slice(0, length), student.id]));
    show('Set up student kiosk', `
      <p>Give each student their code privately. This Chromebook will open the kiosk for <b>${escape(current.name)}</b>.</p>
      <details class="code-list"><summary>View student codes</summary><dl>${current.roster.map((student, i) =>
        `<div><dt>${escape(student.name)}</dt><dd><code>${ids[i].slice(0, length).toUpperCase()}</code></dd></div>`).join('')}</dl></details>
      <form id="lock-form"><label>Teacher exit passphrase<input name="passphrase" type="password" required minlength="8" autocomplete="new-password" placeholder="At least 8 characters"></label>
      <p class="settings-note">Use this passphrase to reopen the teacher board on this Chromebook.</p>
      <p role="alert" id="lock-error"></p><button class="button primary">Start kiosk</button></form>`);
    document.querySelector('#lock-form').onsubmit = async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const submit = form.querySelector('button');
      submit.disabled = true;
      try {
        const salt = crypto.randomUUID();
        const verifier = await deriveKey(form.elements.passphrase.value, salt);
        if (!form.closest('dialog')?.open) return;
        localStorage.setItem(LOCK_KEY, JSON.stringify({ classId: current.id, codes, salt, verifier }));
        location.replace('./kiosk.html');
      } catch {
        document.querySelector('#lock-error').textContent = 'Kiosk setup needs secure browser storage. Try localhost or HTTPS.';
      } finally {
        submit.disabled = false;
      }
    };
  };
}
