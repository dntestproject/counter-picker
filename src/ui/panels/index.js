// Right-panel dispatcher — mirrors the original renderRightPanel switch.
import { getUI } from '../../engine/engine.js';
import { renderCounterPicks } from './counter.js';
import { renderBanTab } from './ban.js';
import { renderMatrixTab } from './matrix.js';
import { renderSleeperTab } from './sleeper.js';
import { renderMyPickTab } from './mypick.js';

export function renderRightPanel() {
  const { activeTab } = getUI();
  if (activeTab === 'counter') renderCounterPicks();
  else if (activeTab === 'ban') renderBanTab();
  else if (activeTab === 'matrix') renderMatrixTab();
  else if (activeTab === 'sleeper') renderSleeperTab();
  else if (activeTab === 'mypick') renderMyPickTab();
}
