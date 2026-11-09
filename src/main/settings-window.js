'use strict';
const path = require('node:path');
const { BrowserWindow, ipcMain, screen } = require('electron');
const { settingsPatch } = require('./settings-policy');

function createSettingsWindow({ state, patch, action }) {
  let window;
  const trusted = event => window && !window.isDestroyed() && event.sender === window.webContents;
  ipcMain.handle('settings:state', event => { if (!trusted(event)) throw Error('Settings window required.'); return state(); });
  ipcMain.handle('settings:patch', async (event, input) => {
    if (!trusted(event)) throw Error('Settings window required.');
    patch(settingsPatch(input, screen.getAllDisplays())); return state();
  });
  ipcMain.handle('settings:action', async (event, name, value) => {
    if (!trusted(event)) throw Error('Settings window required.');
    if (name === 'close') { window.hide(); return; }
    if (!['gaming', 'visibility', 'startup', 'sounds-folder', 'voice-preview', 'memory-export', 'memory-delete', 'memory-open', 'interests-open', 'reviews-open', 'curiosity-open', 'routines-open', 'project-choose', 'project-off', 'refresh', 'restart', 'quit'].includes(name)) throw Error('Unknown action.');
    if (['gaming', 'startup'].includes(name) && typeof value !== 'boolean') throw Error('Invalid switch.');
    const result = await action(name, value);
    if (['memory-open', 'interests-open', 'reviews-open', 'curiosity-open', 'routines-open'].includes(name)) window.hide();
    return { state: state(), message: typeof result === 'string' ? result : '' };
  });
  return {
    open() {
      if (!window || window.isDestroyed()) {
        const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
        window = new BrowserWindow({ width: Math.min(840, area.width), height: Math.min(690, area.height),
          minWidth: Math.min(640, area.width), minHeight: Math.min(530, area.height),
          x: area.x + Math.max(0, Math.round((area.width - 840) / 2)), y: area.y + Math.max(0, Math.round((area.height - 690) / 2)),
          title: 'Capri — Control room', frame: false, backgroundColor: '#130e1d',
          autoHideMenuBar: true, show: false, icon: path.resolve(__dirname, '../../assets/icons/capri.ico'),
          webPreferences: { preload: path.resolve(__dirname, '../settings-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
        });
        window.setMenu(null);
        window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        window.webContents.on('will-navigate', e => e.preventDefault());
        window.loadURL('capri://app/src/renderer/settings.html');
        window.once('ready-to-show', () => { window?.show(); });
        window.on('closed', () => { window = null; });
      } else { window.show(); window.focus(); this.update(); }
    },
    update() { if (window && !window.isDestroyed()) window.webContents.send('settings:updated', state()); },
  };
}
module.exports = { createSettingsWindow };
