'use strict';
/*
 * WowAltBoard - tools/check-simc-parse.js
 *
 * 回归：tools/fetch-simc.js 怎么读 SimC 配置（不联网，不碰 app/simc-data.js）。
 *   1. 部位名 → INVSLOT；注释和动作列表不当成装备；
 *   2. 装等优先级：ilevel= 压过 bonus_id（SimC 的规矩，实测 6 行两者不一致时都按 ilevel）；
 *      没写 ilevel 才查表；查到两档不挑、查不到留空 —— 都不猜；
 *   3. 附魔：enchant_id 优先；只有 enchant= 标识时原样留标识；DB2 名字里的品质图标和
 *      $ 模板占位剥掉，品质档单独记；
 *   4. crafted_stats 的 ITEM_MOD 编号 → 属性名，不认识的编号要报出来；
 *   5. 装等对照表能从 RewardPreview.lua 的写法里读出来。
 */
var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var F = require('./fetch-simc.js');

function pad(s) { return (s + '　　　　　　').slice(0, 12); }
var n = 0;
function check(cond, msg) { n++; assert.ok(cond, msg); }
function same(a, b, msg) { n++; assert.deepStrictEqual(a, b, msg); }

var PROFILE = [
  'deathknight="MID2_Death_Knight_Blood_San\'layn"',
  'source=default',
  'spec=blood',
  'talents=CoPAAAA',
  '# head=commented_out,id=1',
  'actions.precombat=flask',
  'head=baleful_graveknights_casque,id=271474,bonus_id=13750,ilevel=334,gem_id=240983,enchant_id=7991',
  'neck=aqirbane_reliquary,id=268265,bonus_id=13335/13708/13848,gem_id=240908/240908',
  'chest=baleful_graveknights_breastplate,id=271477,ilevel=344,enchant=mark_of_the_worldsoul_2',
  'wrists=spellbreakers_bracers,id=237834,bonus_id=8960/13454,embellishment=stabilizing_gemstone_bandolier,crafted_stats=40/49',
  'main_hand=mazeroa_warlords_fury,id=268213,bonus_id=12854,ilevel=344,enchant_id=6241',
  'off_hand=two_tracks,id=5,bonus_id=12854/13848',
  'feet=crafted_boots,id=6,bonus_id=8960,crafted_stats=32/99'
].join('\r\n');
var BONUS = { 12841: 305, 12849: 318, 12854: 334, 13848: 344 };

function row(slot) { return F.slotRow(F.parseProfile(PROFILE).gear[slot], BONUS); }

function main() {
  var p = F.parseProfile(PROFILE);
  same([p.cls, p.name, p.spec, p.talents], ['deathknight', "MID2_Death_Knight_Blood_San'layn", 'blood', 'CoPAAAA'],
    '职业 / 配置名 / 专精 / 天赋串没读对');
  same(Object.keys(p.gear).sort(), ['chest', 'feet', 'head', 'main_hand', 'neck', 'off_hand', 'wrists'],
    '注释行或动作列表被当成了装备，或者漏了部位');
  same(Object.keys(p.gear).map(function (k) { return F.SLOT_MAP[k]; }).sort(function (a, b) { return a - b; }),
    [1, 2, 5, 8, 9, 16, 17], '部位名 → INVSLOT 映射不对');

  same(row('head').row, { i: 271474, v: 334, s: 'c', e: 7991, g: [240983] }, '写了 ilevel 的部位');
  same(row('neck').row, { i: 268265, v: 344, s: 'b', b: 13848, g: [240908, 240908] },
    '没写 ilevel 时要按 bonus_id 查表，并记下是哪个编号');
  same(row('main_hand').row, { i: 268213, v: 344, s: 'c', e: 6241 },
    'ilevel= 必须压过 bonus_id（这件的 bonus 查表是 334）');
  var two = row('off_hand');
  check(!two.row.v && !two.row.s, 'bonus_id 里有两档装等时不许挑一个');
  check(/两档装等/.test(two.warn.join()), '两档装等要报出来');
  same(row('chest').row, { i: 271477, v: 344, s: 'c', t: 'mark_of_the_worldsoul_2' },
    '只有 enchant= 标识时原样留标识，不编附魔 ID');
  same(row('wrists').row, { i: 237834, m: 'stabilizing_gemstone_bandolier', c: ['versatility', 'mastery'] },
    '查不到装等的制造装备要留空；装饰标识和制造副属性要留下');
  var feet = row('feet');
  same(feet.row.c, ['crit'], 'crafted_stats 认得的编号要换成属性名');
  check(/不认识的属性编号 99/.test(feet.warn.join()), 'crafted_stats 里不认识的编号要报出来');

  same(F.cleanEnchant('附魔戒指 - 鹰眼神视|A:Professions-ChatIcon-Quality-12-Tier2:20:20|a'),
    { n: '附魔戒指 - 鹰眼神视', q: 2 }, '品质图标要剥掉、品质档要单独记');
  same(F.cleanEnchant('+$k2 敏捷/力量 &+$k1 耐力|A:Professions-ChatIcon-Quality-12-Tier2:20:20|a'),
    { n: '+敏捷/力量，+耐力', q: 2 }, '$k 占位要删掉，不编数字');
  same(F.cleanEnchant('+智力和+$457616s1% 法力值'), { n: '+智力和+法力值', q: 0 }, '$<法术>s1% 占位也要删掉');
  same(F.cleanEnchant('鲜红符文'), { n: '鲜红符文', q: 0 }, '普通名字原样');

  var tmp = path.join(os.tmpdir(), 'wab-simc-bonus-' + process.pid + '.lua');
  fs.writeFileSync(tmp, 'local IL = {\n    [305] = 12841,\n    [318] = 12849,\n    [334] = 12854,\n    [344] = 13848,\n}\n');
  try { same(F.loadBonusMap(tmp), { 12841: 305, 12849: 318, 12854: 334, 13848: 344 }, '对照表读法不对'); }
  finally { fs.unlinkSync(tmp); }
  same(F.loadBonusMap(tmp), {}, '对照表文件不在时要得到空表（生成器会提示），不能抛错');
}

try {
  main();
} catch (e) {
  console.log(pad('SimC 解析') + '不通过');
  console.log('  · ' + String((e && e.message) || e).split(/\r?\n/)[0]);
  process.exit(1);
}
console.log(pad('SimC 解析') + '通过（' + n + ' 项：部位映射、ilevel 压过 bonus_id、两档不挑、附魔标识与模板占位、制造副属性、对照表读法）');
