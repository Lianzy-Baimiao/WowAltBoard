/*
 * WowAltBoard - app/talent-decode.js
 *
 * 把一条天赋导入串解成「哪个节点点了几点」，给面板画树用。
 *
 * 为什么会有这个文件：maxroll 的天赋方案在产物里是**一条串**（app/maxroll-data.js
 * 的 specs[*].views[*].talents[].s），不是节点表。把解好的节点表直接写进产物试过
 * ——587 套 × 每套 80 来个节点，文件从 206 KB 涨到 600 KB 以上，而浏览器解一条串
 * 只要几毫秒。所以产物存串，这里解。
 *
 * 位布局和 tools/decode-talent-string.js **必须逐位一致**。那份是先做的，它有
 * tools/verify-talent-decode.js 拿 raider.io 的真值逐节点复核过；这份是后做的，
 * 靠 tools/verify-talent-decode.js 的第二段把两边解出来的结果对账（587 条串，
 * 任一条不一致就退出码 1）。两份实现各写一遍再互相对账，比一份实现两处调用更能
 * 抓住「我把某一位理解错了」—— 但前提是**真的去对账**，不是写完就算。
 *
 * 布局（实测，来源同上）：
 *   头部  8 位版本 + 16 位 specID + 128 位 treeHash
 *   然后按 nodeOrder[职业] 逐个节点：
 *     1 位 选没选；选了则
 *       1 位 是不是花点买的（不是 = 系统白给，白给的不再读任何位）；买了则
 *         1 位 是不是没点满；没点满则 6 位 实际点数
 *         1 位 是不是二选一；是则 2 位 选了哪一个
 *   末尾补 0 到 6 的整数倍。字母表是标准 base64（无 padding），**位序低位在前**。
 */
(function (global) {
  'use strict';

  var AE = global.AE = global.AE || {};

  var ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var RANK_BITS = 6;

  /**
   * base64 → 位数组。表外字符一律返回 null（不是抛错，也不是跳过）——
   * 「跳过看不懂的字符」会把一条坏串解成一套看起来正常的天赋，那比解不开更糟。
   *
   * maxroll 用 URL-safe 表（`-` `_`），游戏和 raider.io 用标准表（`+` `/`）。
   * 换字在生成器里做完了（tools/fetch-maxroll.js 的 normalizeB64），所以这里
   * 只认标准表 —— 两边都容错的话，就没人知道产物里到底存的是哪一种。
   */
  function toBits(s) {
    var out = [];
    for (var i = 0; i < s.length; i++) {
      var v = ALPHA.indexOf(s.charAt(i));
      if (v < 0) return null;
      for (var b = 0; b < 6; b++) out.push((v >> b) & 1);
    }
    return out;
  }

  function reader(arr) {
    var p = 0;
    return {
      read: function (n) {
        var v = 0;
        for (var i = 0; i < n; i++) { v |= (arr[p] || 0) << i; p++; }
        return v;
      },
      left: function () { return arr.length - p; }
    };
  }

  /**
   * 节点点了几点、走的哪个 entry。
   *
   * entry 下标有两条路，只有一条是验证过的：
   *   · 二选一节点（type='choice'）的下标**直接来自位流**，raider.io 真值 309 个
   *     样本 0 处不符；
   *   · 其余多 entry 节点（type='tiered'，界面上是同名三档）没有这个字段，只能按
   *     entries[].maxRanks 累加推 —— 这一条**没验证充分**：真值里 tiered 节点
   *     31/31 都是满级，「累加」和「永远取最后一档」给出同样答案，分不开。
   * 这里照抄 tools/decode-talent-string.js 的 entryIndexOf，包括它的不确定性。
   */
  function entryIndexOf(rank, choice, ents) {
    if (choice !== null) return choice;
    if (!ents || ents.length < 2) return 0;
    if (typeof rank !== 'number') return 0;
    var acc = 0;
    for (var i = 0; i < ents.length; i++) {
      acc += (typeof ents[i][4] === 'number' ? ents[i][4] : 1);
      if (rank <= acc) return i;
    }
    return ents.length - 1;
  }

  /**
   * 解一条串。
   *
   * @param {string} str  标准 base64 的导入串
   * @param {object} TR   window.AE_TALENT_TREE
   * @returns {object} 成功 {spec, cls, ver, hash, pts, nr, subs, granted}
   *                   失败 {err: '给人看的一句话'}
   *   nr = {nodeId: {rank, eid}}，形状和 app/bis.js 的 nodeRanks() 一致，
   *        renderTreeGrid 可以直接吃。
   *   subs = 点亮的英雄子树 id 数组（maxroll 有「一套方案配两条英雄树」的打包，
   *        所以这里是数组不是单值）。
   */
  function decode(str, TR) {
    if (!str || typeof str !== 'string') return { err: '空串' };
    if (!TR || !TR.nodes || !TR.nodeOrder || !TR.specs) return { err: '天赋树数据没加载' };

    var arr = toBits(str);
    if (!arr) return { err: '串里有 base64 表外的字符' };
    if (arr.length < 152) return { err: '串太短，连串头都不够（要 152 位）' };

    var r = reader(arr);
    var out = { ver: r.read(8), spec: r.read(16), pts: 0, nr: {}, subs: [], granted: {} };
    var hash = '';
    for (var i = 0; i < 16; i++) {
      var byt = r.read(8);
      hash += (byt < 16 ? '0' : '') + byt.toString(16);
    }
    out.hash = hash;

    var sp = TR.specs[String(out.spec)];
    if (!sp) return { err: '天赋树数据里没有专精 ' + out.spec };
    out.cls = sp.cls;
    var order = TR.nodeOrder[sp.cls];
    if (!order || !order.length) return { err: sp.cls + ' 没有节点顺序表' };

    var SUBTREE = TR.types ? TR.types.indexOf('subtree') : -1;
    var subSeen = {};

    // 只收**这个专精自己的**节点。nodeOrder 是按**整个职业**排的，里面混着同职业
    // 其他专精的节点；位流照样要逐位读过去，但读出来的东西跟这个专精无关。
    //
    // 这不是优化，是对账逼出来的：不筛的话有 27 处 rank 和
    // tools/decode-talent-string.js 不一致，全部落在别的专精的节点上 ——
    // 那份是按专精取 maxRanks（专精外的取不到，退到 1），我按全局节点表取（拿到 2 或 4）。
    // 两边都不算错，因为那些节点谁也不画；但「两份实现对账」要求差异为 0，
    // 否则真正的错会被这些噪音盖住。筛掉之后 587 条串 0 处不一致。
    var mine = {};
    ['classNodes', 'specNodes', 'heroNodes', 'subNodes'].forEach(function (g) {
      (sp[g] || []).forEach(function (id) { mine[String(id)] = 1; });
    });

    for (var k = 0; k < order.length; k++) {
      if (r.left() < 1) {
        // 位读完了节点还没走完 = 这串是照着**另一版**天赋树编的。
        // 这不是「串坏了」，也不是解码器错了：赛季更新加一个节点就会这样。
        // 说清楚是哪种，否则下一个人会去改解码器。
        out.err = '这串是照着另一版天赋树编的（还差 ' + (order.length - k) + ' 个节点没走到）';
        return out;
      }
      if (!r.read(1)) continue;            // 这个节点没选
      var pur = r.read(1);
      var rank = null, choice = null;
      if (pur) {
        if (r.read(1)) rank = r.read(RANK_BITS);   // 没点满，读实际点数
        if (r.read(1)) choice = r.read(2);         // 二选一，读下标
      }

      var id = order[k];
      var n = TR.nodes[id];
      if (!n) continue;                   // 顺序表里有、树里没有：跳过，不猜
      if (!mine[String(id)]) continue;     // 同职业别的专精的节点，位要读、点数不算
      var isSub = n[3] === SUBTREE;
      // maxRanks 那一格：生成器写的是 `maxRanks || 0`，而英雄天赋的选择节点
      // （type='subtree'）在上游根本没有这个字段，被写成了 0。0 要还原成「没有上限」，
      // 不然「没读到点数位」的兜底会把它当成 0 点，英雄树整棵画成没点。
      var maxR = (n[2] === 0 && isSub) ? null : n[2];
      if (rank === null) rank = (typeof maxR === 'number' && maxR > 0) ? maxR : 1;

      var eid = 0;
      var ents = n[5] || [];
      var ei = entryIndexOf(rank, choice, ents);
      if (ents[ei]) eid = ents[ei][0];

      out.nr[id] = { rank: rank, eid: eid };
      // 点数只算花点买的。白给的节点（purchased=0）不占点数 —— 这不是推测：
      // 拿 raider.io 的 grantedNode 真值比过 32 份角色，干净串上 0 处不符。
      // 算进去会让「82 点」变成 90 多，和游戏里的点数对不上。
      if (pur) {
        out.pts += rank;
        if (n[6]) subSeen[n[6]] = 1;
      } else {
        out.granted[id] = 1;
      }
    }

    out.subs = Object.keys(subSeen).map(Number).sort(function (a, b) { return a - b; });
    return out;
  }

  // GearInsight 的 base + delta 与游戏导入串是两种编码，不能混着读。
  // 生成器、校验器和界面共用这个边界；结构通过不代表版本最新或实战最优。
  function integer(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }
  function readBuild(td, idx) {
    var errors = [], m = Object.create(null), out = Object.create(null);
    if (!td || !Array.isArray(td.dict) || !Array.isArray(td.builds)
        || !integer(idx) || idx < 0 || idx >= td.builds.length) {
      return { entries: null, errors: [{ code: 'build-reference' }] };
    }
    function applyPairs(flat, delta) {
      if (!Array.isArray(flat) || flat.length % 2) { errors.push({ code: 'pairs' }); return; }
      var seen = Object.create(null);
      for (var i = 0; i < flat.length; i += 2) {
        var k = flat[i], rank = flat[i + 1];
        if (!integer(k) || k < 1 || k > td.dict.length || seen[k]) {
          errors.push({ code: 'dictionary-index', index: k }); continue;
        }
        seen[k] = true;
        if (!integer(rank) || rank < (delta ? 0 : 1)) {
          errors.push({ code: 'rank', index: k }); continue;
        }
        if (rank === 0) delete m[k];
        else m[k] = rank;
      }
    }
    applyPairs(td.base, false);
    applyPairs(td.builds[idx], true);
    Object.keys(m).forEach(function (k) {
      var eid = td.dict[k - 1];
      if (!integer(eid) || eid <= 0 || out[eid] !== undefined) errors.push({ code: 'entry-id', entryId: eid });
      else out[eid] = m[k];
    });
    if (!Object.keys(out).length) errors.push({ code: 'empty-build' });
    return { entries: errors.length ? null : out, errors: errors };
  }

  function screenTalents(td, TR) {
    var sp = TR && TR.specs && TR.specs[td.specId];
    var own = Object.create(null), all = Object.create(null);
    if (sp && TR.nodes) {
      Object.keys(TR.nodes).forEach(function (nid) {
        (TR.nodes[nid][5] || []).forEach(function (e) { all[e[0]] = true; });
      });
      ['classNodes', 'specNodes', 'heroNodes', 'subNodes'].forEach(function (kind) {
        (sp[kind] || []).forEach(function (nid) {
          var n = TR.nodes[nid];
          if (n) (n[5] || []).forEach(function (e) { own[e[0]] = { id: nid, node: n, entry: e }; });
        });
      });
    }
    var rejected = [], valid = Object.create(null);
    (td.builds || []).forEach(function (_, idx) {
      var result = readBuild(td, idx), errors = result.errors.slice(), byNode = Object.create(null);
      if (!sp || !TR.nodes) errors.push({ code: 'tree-unavailable' });
      else if (result.entries) Object.keys(result.entries).forEach(function (eid) {
        var hit = own[eid], rank = result.entries[eid];
        if (!hit) { errors.push({ code: all[eid] ? 'cross-spec' : 'unknown-entry', entryId: +eid }); return; }
        var n = hit.node, type = TR.types[n[3]];
        if (type === 'subtree' ? rank !== 1
            : (rank > n[2] || (type !== 'tiered' && rank > hit.entry[4]))) {
          errors.push({ code: 'rank-limit', entryId: +eid });
        }
        if (byNode[hit.id] && (type === 'choice' || type === 'subtree')) errors.push({ code: 'choice-conflict', nodeId: +hit.id });
        byNode[hit.id] = true;
      });
      if (errors.length) rejected.push({ index: idx, errors: errors });
      else valid[idx] = true;
    });
    var removedRows = 0, badReferences = 0, used = Object.create(null), content = {};
    Object.keys(td.content || {}).forEach(function (cat) {
      content[cat] = (td.content[cat] || []).map(function (enc) {
        var copy = Object.assign({}, enc);
        copy.p = (enc.p || []).filter(function (p) {
          var idx = p && p[0];
          if (!integer(idx) || idx < 0 || idx >= (td.builds || []).length) badReferences++;
          if (!integer(idx) || !valid[idx]) { removedRows++; return false; }
          used[idx] = true; return true;
        });
        return copy;
      });
    });
    return { data: Object.assign({}, td, { content: content }), rejected: rejected,
      removedRows: removedRows, badReferences: badReferences, acceptedBuilds: Object.keys(used).length };
  }
  AE.TalentData = {
    decode: function (td, idx) { return readBuild(td, idx).entries; },
    inspectEncoding: readBuild,
    screen: screenTalents
  };

  AE.TalentDecode = { decode: decode, toBits: toBits };
  // Node 侧（tools/verify-talent-decode.js）用 new Function('window', …) 加载这个
  // 文件再取这里，所以挂在传进来的 window 上就够，不用管 module.exports。
}(typeof window !== 'undefined' ? window : this));
