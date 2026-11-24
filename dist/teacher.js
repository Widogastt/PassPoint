import { LOCK_KEY } from './kiosk-lock.js';

function checkLock() {
  if (location.pathname === '/teacher' || !localStorage.getItem(LOCK_KEY)) return false;
  document.body.hidden = true;
  location.replace('./kiosk.html');
  return true;
}
window.addEventListener('pageshow', checkLock);
window.addEventListener('storage', checkLock);
if (location.pathname === '/teacher' || !checkLock()) {
  await import('./app.js');
  document.body.hidden = false;
}
