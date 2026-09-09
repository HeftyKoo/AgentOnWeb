function show(enabled) {
  document.body.classList.toggle('state-on', enabled === true);
  document.body.classList.toggle('state-off', enabled === false);
}
function showError(message) { document.querySelector('#status').textContent = message; }
document.querySelector('.open-preferences').addEventListener('click', () => webkit.messageHandlers.controller.postMessage('open-preferences'));
document.querySelectorAll('[data-link]').forEach(button => button.addEventListener('click', () => webkit.messageHandlers.controller.postMessage(button.dataset.link)));
