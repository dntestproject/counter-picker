// Bottom toast — same message strings, same 1800ms dwell as the original.
let toastTimer = null;

export function showToast(msg) {
  const t = document.getElementById('undoToast');
  document.getElementById('undoMsg').textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}
