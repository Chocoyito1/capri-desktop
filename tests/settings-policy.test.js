'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { settingsPatch } = require('../src/main/settings-policy');

test('settings accept displayed preferences and reject hidden agent/action switches and invalid values', () => {
  assert.deepEqual(settingsPatch({ dailyReviewEnabled: true, dailyReviewNotify: false }), { dailyReviewEnabled: true, dailyReviewNotify: false });
  assert.throws(() => settingsPatch({ dailyReviewNotify: 'false' }));
  assert.deepEqual(settingsPatch({privacy:{memoryConfirmChanges:false}}),{privacy:{memoryConfirmChanges:false}});
  assert.throws(()=>settingsPatch({privacy:{memoryConfirmChanges:'false'}}));
  assert.deepEqual(settingsPatch({ scale:0.8, volume:0.5, displayId:42, privacy:{memoryEnabled:true,retentionDays:30} },[{id:42}]),
    { scale:0.8, volume:0.5, displayId:42, privacy:{memoryEnabled:true,retentionDays:30} });
  for (const input of [{agentEnabled:false},{desktopActions:false},{chatModel:'remote-cloud'},{scale:10},{volume:-1},{displayId:999},{privacy:{allApps:false}},{privacy:{retentionDays:-1}},{privacy:[]},[]]) assert.throws(() => settingsPatch(input));
});

test('control room migration selects Qwen and enables built-in agent/actions without changing appearance or gaming pause', () => {
  const { migrateControlRoom } = require('../src/main/settings-migration');
  const old = { chatModel:'llama3.2:3b', agentEnabled:false, desktopActions:false, gamingMode:true, scale:0.45, privacy:{allApps:false,memoryEnabled:false} };
  const updated = migrateControlRoom(old);
  assert.equal(updated.chatModel,'qwen3.5:9b'); assert.equal(updated.agentEnabled,true); assert.equal(updated.desktopActions,true);
  assert.equal(updated.gamingMode,true); assert.equal(updated.scale,0.45); assert.equal(updated.privacy.memoryEnabled,false); assert.equal(updated.privacy.allApps,true);
  assert.equal(migrateControlRoom(updated),updated);
  assert.equal(old.agentEnabled,false);
});
