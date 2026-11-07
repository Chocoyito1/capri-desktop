'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const moduleSource = fs.readFileSync(path.join(__dirname, '../src/renderer/js/acting.js'));
const load = () => import(`data:text/javascript;base64,${moduleSource.toString('base64')}`);
const additions = ['idleWave', 'idleSway', 'idlePreen', 'idleStretch', 'listen', 'think', 'read', 'search', 'type', 'gameReady'];

test('new acting sheets finish, hold finite poses and stay silent in both directions', async () => {
  const { ACTS, NEUTRAL, Player } = await load();
  for (const name of additions) {
    const sheet = ACTS[name];
    for (const facing of [-1, 1]) for (const dir of [-1, 1]) {
      const player = new Player(name, { at: 0, dir });
      const frameMs = 1000 / (sheet.fps || 12);
      for (let frame = 0; frame < player.total; frame++) {
        const drawing = player.sample((frame + 0.1) * frameMs);
        assert.ok(drawing, `${name} must hold every drawing`);
        assert.equal(drawing.cue, undefined, 'No flashes or sounds during quiet reactions');
        const pose = { ...NEUTRAL, ...player.resolve(drawing.pose, facing) };
        for (const value of Object.values(pose).flat()) assert.ok(Number.isFinite(value));
        assert.equal(pose.sx, 1, 'New quiet acts preserve body proportions');
        assert.equal(pose.sy, 1);
        assert.ok(Math.abs(pose.bob) <= 3, 'Acts must also work on a window ledge');
      }
      assert.equal(player.sample((player.total + 1) * frameMs), null);
    }
    if (name === 'gameReady') assert.ok(ACTS[name].keys.reduce((n, [hold]) => n + hold, 0) / 24 < 1);
  }
});

test('observed tool names select the corresponding action; unknown tools think quietly', async () => {
  const { actionForTool } = await load();
  for (const [tool, expected] of [['Read', 'read'], ['view_image', 'read'], ['WebSearch', 'search'],
    ['Grep', 'search'], ['apply_patch', 'type'], ['Edit', 'type'], ['Bash', 'think'], ['', 'think']]) {
    assert.equal(actionForTool(tool), expected);
  }
});

test('drag and fall interpolate continuously through frame and loop boundaries', async () => {
  const { Player } = await load();
  for (const name of ['drag', 'fall']) {
    const player = new Player(name, { at: 0 });
    const duration = player.total * 1000 / player.act.fps;
    let previous = player.sample(0).pose;
    const arms = [], legs = [];
    for (let now = 1; now < duration * 2; now++) {
      const pose = player.sample(now).pose;
      for (const key of ['armL', 'armR', 'kickL', 'kickR', 'head', 'hair']) {
        assert.ok(Math.abs(pose[key] - previous[key]) < 0.08, `${name} ${key} jumps at ${now} ms`);
      }
      arms.push(pose.armL); legs.push(pose.kickL); previous = pose;
    }
    assert.ok(Math.max(...arms) - Math.min(...arms) > 0.3);
    assert.ok(Math.max(...legs) - Math.min(...legs) > 0.3);
    assert.notEqual(player.sample(1).pose.armL, player.sample(2).pose.armL, 'Motion is not held on discrete frames');
  }
  for (const name of ['dropLand', 'dropPlop']) {
    const player = new Player(name, {at: 0});
    assert.equal(player.sample(player.total * 1000 / player.act.fps + 1), null);
  }
});
