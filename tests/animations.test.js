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
        assert.ok(pose.sx >= 0.97 && pose.sx <= 1.035, 'Quiet squash remains restrained');
        assert.ok(pose.sy >= 0.97 && pose.sy <= 1.035, 'Quiet stretch preserves the silhouette');
        assert.ok(Math.abs(pose.bob) <= 6, 'Quiet standing reactions stay small');
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


test('playful original-art motion stays continuous, silent and within controlled squash/bounce limits', async () => {
  const {Player,NEUTRAL} = await load();
  for (const name of ['stand','focus','idleWave','idleSway','idlePreen','idleStretch',
    'idleBreathe','idleListen','idleYawn','idleBounce','listen','think','talk']) {
    const player=new Player(name,{at:0});
    const duration=player.total*1000/(player.act.fps||12);
    let previous=null;
    for(let now=0;now<duration*(player.act.loop?2:1);now++) {
      const sample=player.sample(now),pose={...NEUTRAL,...player.resolve(sample.pose,1)};
      assert.equal(sample.cue,undefined,'Routine charm remains silent');
      assert.ok(pose.sx>=.94&&pose.sx<=1.04&&pose.sy>=.94&&pose.sy<=1.04,'No excessive deformation');
      assert.ok(Math.abs(pose.bob)<=10,'No large displacement during quiet desktop motion');
      if(previous) for(const key of ['armL','armR','head','hair','bob','sx','sy','tilt'])
        assert.ok(Math.abs(pose[key]-previous[key])<.15,`${name} ${key} discontinuity at ${now}ms`);
      previous=pose;
    }
  }
  const bounce=new Player('idleBounce',{at:0});let highest=0,lowest=0,minScale=1;
  for(let now=0;now<bounce.total*1000/12;now++) {
    const pose=bounce.sample(now).pose;
    highest=Math.min(highest,pose.bob);lowest=Math.max(lowest,pose.bob);minScale=Math.min(minScale,pose.sy);
  }
  assert.ok(highest<=-8&&lowest>=1.5&&minScale<.96,'A visible anticipation, lift and compression remain');
});
