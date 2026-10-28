'use strict';
// Synthetic board data for the theme / contrast checks (tools/check-light-theme.cjs).
// Fictional characters only: one per class (all 13 class colours), every item quality
// 0-7 in the gear, both keystone colours AlterEgo writes (epic purple, legendary orange),
// one vault reward, two accounts and two weekly snapshots for the trend panel.
// No personal data and nothing read from data/.
const fs = require('node:fs/promises');
const path = require('node:path');

const NOW = 1791417600;           // fixed scan time, so snapshots and labels are stable
const DUNGEONS = [588, 587, 586, 584, 585, 249, 250, 399];
const CLASSES = [
  ['DEATHKNIGHT', '死亡骑士', '板甲'], ['DEMONHUNTER', '恶魔猎手', '皮甲'], ['DRUID', '德鲁伊', '皮甲'],
  ['EVOKER', '唤魔师', '锁甲'], ['HUNTER', '猎人', '锁甲'], ['MAGE', '法师', '布甲'],
  ['MONK', '武僧', '皮甲'], ['PALADIN', '圣骑士', '板甲'], ['PRIEST', '牧师', '布甲'],
  ['ROGUE', '潜行者', '皮甲'], ['SHAMAN', '萨满祭司', '锁甲'], ['WARLOCK', '术士', '布甲'],
  ['WARRIOR', '战士', '板甲']];
const NAMES = ['霜刃夜歌', '暗影追猎', '林间晚风', '星火龙裔', '逐风游侠', '星河法师', '清风拳师',
  '曦光骑士', '月白祈愿', '暮影行者', '雷鸣旅者', '幽焰术士', '铁壁战歌'];
const SLOTS = ['HEADSLOT', 'NECKSLOT', 'SHOULDERSLOT', 'BACKSLOT', 'CHESTSLOT', 'WRISTSLOT', 'HANDSSLOT',
  'WAISTSLOT', 'LEGSSLOT', 'FEETSLOT', 'FINGER0SLOT', 'FINGER1SLOT', 'TRINKET0SLOT', 'TRINKET1SLOT',
  'MAINHANDSLOT', 'SECONDARYHANDSLOT'];
const QUALITY_CYCLE = [4, 3, 2, 5, 6, 7, 1, 0, 4, 4, 3, 4, 5, 2, 4, 3];

// AlterEgo-shaped Lua: arrays become positional entries, objects ["key"]=value.
function lua(v) {
  if (Array.isArray(v)) return '{' + v.map(lua).join(',') + '}';
  if (v && typeof v === 'object') return '{' + Object.entries(v).map(([k, x]) => '["' + k + '"]=' + lua(x)).join(',') + '}';
  if (typeof v === 'string') return '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  return String(v);
}

function character(i, weekShift) {
  const [file, cls, armor] = CLASSES[i];
  const rating = 3300 - i * 140 - weekShift * 60;
  const level = 16 - Math.floor(i / 2);
  return {
    enabled: true, order: i, lastUpdate: NOW - i * 900 - weekShift * 604800, currentSeason: 17,
    info: {name: NAMES[i], realm: i % 2 ? '星语谷（演示）' : '晨曦港（演示）', level: 90,
      class: {file, name: cls}, race: {name: '演示种族'}, ilvl: {level: 330 - i, equipped: 330 - i}},
    money: (1200 - i * 50) * 10000 * 10000,
    mythicplus: {rating, bestSeasonScore: rating,
      keystone: {challengeModeID: DUNGEONS[i % 8], level, color: level >= 15 ? 'ffff8000' : 'ffa335ee'},
      numCompletedDungeonRuns: {mythicPlus: 8 - (i % 9)},
      dungeons: DUNGEONS.map((id, k) => ({challengeModeID: id, level: level - (k % 3), rating: 380 + k * 3 - i,
        finishedSuccess: (i + k) % 5 !== 0, bestOverAllScore: 400}))},
    vault: {hasAvailableRewards: i === 1,
      slots: [1, 3, 6].flatMap(type => [1, 2, 3].map(index => ({type, index, threshold: type === 3 ? index * 2 : [1, 4, 8][index - 1],
        progress: (i + type + index) % 9, level: type === 3 ? 15 : 12}))),
      worldActivityProgress: [{difficulty: 8, numPoints: 8, activityTierID: 1}]},
    currencies: [{id: 999001, currencyType: 'delveMap', name: '藏宝图', bagCount: i % 3, questCompleted: i % 2 === 0},
      {id: 999002, name: '纹章（演示）', currencyType: 'crest', quantity: 45 + i, maxQuantity: 90}],
    equipment: SLOTS.map((slot, k) => {
      const q = QUALITY_CYCLE[(k + i) % QUALITY_CYCLE.length];
      return {itemSlotName: slot, itemName: '演示装备' + (k + 1), itemQuality: q, itemLevel: 320 + ((k + i) % 12),
        itemLink: '|cnIQ' + q + ':|Hitem:1000' + k + '::::::::90:::::|h[演示装备' + (k + 1) + ']|h|r',
        itemType: '护甲', itemSubType: armor, itemUpgradeTrack: '英雄', itemUpgradeLevel: 4, itemUpgradeMax: 6};
    })
  };
}

function db(indices, weekShift) {
  const characters = {};
  indices.forEach(i => { characters['Demo-' + i] = character(i, weekShift); });
  return 'AlterEgoDB=' + lua({global: {dbVersion: 38, characters}});
}

/** Write data/{data,settings,manifest,bagsync}.js and two history snapshots into dir. */
async function writeFixture(dir) {
  const data = path.join(dir, 'data');
  await fs.mkdir(path.join(data, 'history'), {recursive: true});
  const accounts = [[0, 2, 4, 6, 8, 10, 12], [1, 3, 5, 7, 9, 11]];
  // Account 2 was last written 60 days before the scan, so the stale warnings (banner,
  // data-source badge) are part of every run.
  const sources = (shift) => accounts.map((idx, a) => ({id: 'demo-' + a, account: '演示账号 ' + (a + 1),
    displayName: '演示账号 ' + (a + 1), flavor: 'retail', mtime: NOW - shift * 604800 - (a ? 60 * 86400 : 0), lua: db(idx, shift)}));
  await fs.writeFile(path.join(data, 'data.js'), 'window.AE_DATA=' + JSON.stringify({scannedAt: NOW, sources: sources(0)}) + ';');
  const weeks = [[NOW - 604800, '2026-10-27'], [NOW, '2026-11-03']];
  for (const [n, [week]] of weeks.entries()) {
    await fs.writeFile(path.join(data, 'history', week + '.js'), 'window.AE_HISTORY = window.AE_HISTORY || [];\nwindow.AE_HISTORY.push(' +
      JSON.stringify({week, capturedAt: week, sources: sources(1 - n).map(s => ({id: s.id, displayName: s.displayName, lua: s.lua}))}) + ');\n');
  }
  await fs.writeFile(path.join(data, 'manifest.js'), 'window.AE_MANIFEST = { history: ' +
    JSON.stringify(weeks.map(([week, label]) => ({week, file: 'history/' + week + '.js', label, size: 1}))) + ' };\n');
  for (const f of ['settings', 'bagsync']) await fs.writeFile(path.join(data, f + '.js'), '/* fixture */');
}

module.exports = {writeFixture, CLASSES, NAMES};
