'use strict';

/**
 * Injects the filler into a tab and runs a command in every frame we have access to.
 * Shared by the side panel and the background service worker (globalThis.BFSRunner).
 */
(function (root) {
  const FILES = ['lib/checksums.js', 'lib/generators.js', 'lib/classifier.js', 'content/filler.js'];

  function explain(error) {
    const msg = String((error && error.message) || error);
    if (/chrome:\/\/|chrome-extension:\/\/|extensions gallery|webstore|cannot be scripted/i.test(msg)) {
      return { code: 'restricted', message: 'Chrome does not allow extensions on this page.' };
    }
    if (/permission|cannot access/i.test(msg)) {
      return { code: 'no-permission', message: 'The extension does not have access to this site yet.' };
    }
    return { code: 'error', message: msg };
  }

  async function runInTab(tabId, command) {
    try {
      await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: FILES });
      const results = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: (cmd) => globalThis.BFSFiller.run(cmd),
        args: [command],
      });
      const frames = results.filter((r) => r && r.result).map((r) => Object.assign({ frameId: r.frameId }, r.result));
      return { ok: true, frames, fields: frames.flatMap((f) => f.fields) };
    } catch (error) {
      return Object.assign({ ok: false, frames: [], fields: [] }, explain(error));
    }
  }

  const DEFAULT_SETTINGS = { region: 'US', profile: 'valid', seedLocked: false, seed: null };

  async function getSettings() {
    const { settings } = await chrome.storage.local.get('settings');
    return Object.assign({}, DEFAULT_SETTINGS, settings);
  }

  async function saveSettings(patch) {
    const next = Object.assign(await getSettings(), patch);
    await chrome.storage.local.set({ settings: next });
    return next;
  }

  root.BFSRunner = { FILES, runInTab, getSettings, saveSettings, explain };
})(globalThis);
