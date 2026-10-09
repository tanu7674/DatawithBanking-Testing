'use strict';

document.getElementById('open-panel').addEventListener('click', async () => {
  const win = await chrome.windows.getCurrent();
  await chrome.sidePanel.open({ windowId: win.id });
});
