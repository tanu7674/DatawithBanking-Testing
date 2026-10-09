'use strict';

importScripts('lib/runner.js');

const MENU_ITEMS = [
  ['fill-valid', 'Fill page with valid data'],
  ['fill-boundary', 'Fill page with boundary data'],
  ['fill-invalid', 'Fill page with invalid data'],
  ['clear', 'Restore original values'],
];

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'bfs', title: 'BFS Test Data Filler', contexts: ['page', 'editable', 'frame'] });
    for (const [id, title] of MENU_ITEMS) chrome.contextMenus.create({ id, parentId: 'bfs', title, contexts: ['page', 'editable', 'frame'] });
  });
  if (reason === 'install') chrome.tabs.create({ url: 'welcome/welcome.html' });
});

/** Context menu and keyboard shortcut fills. Both grant activeTab, so they work on any site. */
async function quickRun(tab, action, profile) {
  if (!tab || tab.id === undefined) return;
  const settings = await BFSRunner.getSettings();
  const seed = settings.seedLocked && settings.seed !== null ? settings.seed : Math.floor(Math.random() * 1e9);
  const result = await BFSRunner.runInTab(tab.id, { action, profile, region: settings.region, seed });
  const filled = result.fields.filter((f) => f.status === 'filled').length;
  chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: result.ok ? '#0f766e' : '#b91c1c' });
  chrome.action.setBadgeText({ tabId: tab.id, text: result.ok ? (action === 'fill' ? String(filled) : '') : '!' });
  chrome.runtime.sendMessage({ type: 'bfs:ran', tabId: tab.id, action, profile, seed, result }).catch(() => {});
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'clear') quickRun(tab, 'clear');
  else if (String(info.menuItemId).startsWith('fill-')) quickRun(tab, 'fill', String(info.menuItemId).slice(5));
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'fill-valid') return;
  const target = tab || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  quickRun(target, 'fill', 'valid');
});
