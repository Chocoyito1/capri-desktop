'use strict';
// Isolated native tool check. --live also tests Codex; --launch-firefox permits
// exactly the Firefox launch probe. No changes to the running companion.
const { app, shell } = require('electron');
const path = require('node:path');
const { ActionAgent } = require('../src/main/action-agent');
const { DesktopTools } = require('../src/main/desktop-tools');
const { CodexBrain } = require('../src/main/codex-brain');
const { CodexTools } = require('../src/main/codex-tools');

app.whenReady().then(async () => {
  const settings = () => ({ agentEnabled: true, desktopActions: true, privacy: { contextProcesses: true } });
  const desktop = new DesktopTools({ openPath: file => shell.openPath(file),
    openExternal: url => shell.openExternal(url), native: require('../src/main/native-windows') });
  const actions = new ActionAgent({ settings, desktop, web: {}, browser: { stop() {} },
    models: () => { throw Error('Legacy planner must not run.'); }, infer: () => { throw Error('Legacy planner must not run.'); } });
  const bridge = new CodexTools({ settings, actions,
    confirm: () => { throw Error('This diagnostic does not accept confirmations.'); } });
  const launch = process.argv.includes('--launch-firefox');
  const tools = { instructions: () => bridge.instructions(),
    specs: () => bridge.specs().filter(row => row.name === 'capri_apps' || (launch && row.name === 'capri_desktop_step')),
    run: async (name, args, context) => {
      if (name !== 'capri_apps' && !(launch && name === 'capri_desktop_step' && args.tool === 'open_app' && args.query.toLowerCase() === 'firefox')) throw Error('Outside the diagnostic tool boundary.');
      const receipt = await bridge.run(name, args, context);
      console.log(JSON.stringify({ tool: name, completed: receipt.completed ?? true }));
      return receipt;
    }, cancel: () => actions.cancel(), endTurn: () => bridge.endTurn() };
  if (process.argv.includes('--live')) {
    const brain = new CodexBrain({ settings, cwd: path.join(app.getPath('temp'), 'capri-tool-check'), tools });
    try {
      const answer = await brain.chat(launch ? 'Open Firefox.' : 'Use capri_apps and tell me whether Firefox has a launch entry. Do not open any app.');
      console.log(JSON.stringify({ answer, diagnostics: brain.lastDiagnostics }));
      if (!brain.lastDiagnostics.completed) throw Error('Codex did not complete a local tool call.');
    } finally { brain.cancel(); }
  } else if (launch) {
    const result = await tools.run('capri_desktop_step', { tool: 'open_app', query: 'Firefox', index: 0, browser: 'default' },
      { text: 'open firefox', signal: new AbortController().signal, check() {} });
    if (!result.completed) throw Error(result.text);
    console.log(JSON.stringify({ completed: result.completed, result: result.text }));
  } else {
    console.log(JSON.stringify({ firefoxLaunchEntry: Boolean(desktop.matchName('Firefox')), availableToolCount: tools.specs().length }));
  }
  app.quit();
}).catch(error => { console.error(error.message); app.exit(1); });
