// BOOTSTRAP — wires the engine's UI bindings (update + toast), attaches every
// listener, fires the first render. Nothing else lives here.
import { bindUI } from './engine/engine.js';
import { update, wireUI, initKeyboard } from './ui/shell.js';
import { showToast } from './ui/toast.js';

bindUI({ update, showToast });
wireUI();
initKeyboard();
update();
