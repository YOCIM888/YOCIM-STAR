/* ============================================================
 * YOCIM-STAR · ai.js
 * AI 决策：怀疑推断 / 发言 / 投票 / 技能目标
 * ============================================================ */

const AI = {
  /* ---------- 稳定伪随机：同一 witness-target-round 得到固定值 ---------- */
  hash(a, b, c) {
    let h = (a * 73856093) ^ (b * 19349663) ^ (c * 83492791);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  },

  // 侦探的私密查验结果（从 privateNotes 解析）
  knownEvil(st, observer) {
    const set = new Set();
    observer.privateNotes.forEach(n => {
      const m = n.match(/(.+?) 的身份信号：坏人/);
      if (m) set.add(m[1]);
    });
    return set;
  },
  knownGood(st, observer) {
    const set = new Set();
    observer.privateNotes.forEach(n => {
      const m = n.match(/(.+?) 的身份信号：好人/);
      if (m) set.add(m[1]);
    });
    return set;
  },

  // 已亮牌的阵营（从死亡事件中提取）
  revealed(st) {
    const map = {};
    st.log.forEach(e => {
      if (e.type === 'death' && e.roleId) {
        const p = st.players[e.playerId];
        if (p) map[e.playerId] = e.camp;
      }
    });
    return map;
  },

  /* ---------- 怀疑度：从 observer 视角给 target 打分 0-100 ---------- */
  suspicion(st, observer, target) {
    if (target.id === observer.id) return 0;
    const rev = this.revealed(st);
    if (rev[target.id] === 'good') return 2;   // 已亮牌好人基本不被怀疑
    if (rev[target.id] === 'evil') return 100; // 已亮牌坏人

    let base = 26 + Math.floor(this.hash(observer.id + 1, target.id + 3, st.round) * 46);

    // 好人视角：侦探查验结果
    if (observer.camp === 'good') {
      if (this.knownEvil(st, observer).has(target.name)) return 96;
      if (this.knownGood(st, observer).has(target.name)) return 4;
    }
    // 坏人视角：队友与已知好人
    if (observer.camp === 'evil') {
      if (target.camp === 'evil') return 0;
      if (rev[target.id] === 'good' || this.knownGood(st, observer).has(target.name)) base += 24;
    }

    // 投票行为：投过已亮牌好人的更可疑
    st.log.forEach(e => {
      if (e.type === 'vote' && e.voterId === target.id) {
        const t = st.players[e.targetId];
        if (t && rev[t.id] === 'good' && t.camp === 'good') base += 12;
      }
      if (e.type === 'speech' && e.speakerId === target.id) {
        if (/投|怀疑|问题|坏人/.test(e.text || '')) base += 3;
      }
    });
    return Math.min(100, base);
  },

  // 坏人视角：某人对坏人阵营的威胁度
  threat(st, target) {
    if (target.camp === 'evil') return 0;
    const keyRoles = ['detective', 'judge', 'priest', 'monarch'];
    let t = 30 + Math.floor(this.hash(target.id + 7, st.round, 9) * 30);
    if (keyRoles.includes(target.roleId)) t += 30;
    if (this.revealed(st)[target.id] === 'good') t += 10;
    return t;
  },

  /* ---------- 展示身份（发言时报的称号） ---------- */
  fakeRoles: ['侦探', '骑士', '牧师', '诗人'],
  displayRole(p, st) {
    if (p.camp === 'good') return this.roleName(p);
    if (p.camp === 'neutral') return '局外人';
    return this.fakeRoles[(p.id * 3 + st.round) % this.fakeRoles.length];
  },
  roleName(p) { return ROLE_MAP[p.roleId].name; },

  deathSummary(st) {
    const dead = st.players.filter(p => !p.alive);
    if (!dead.length) return '目前还没有人出局';
    return '已经有 ' + dead.length + ' 人出局，形势复杂';
  },

  /* ---------- 发言生成 ---------- */
  makeSpeech(st, player) {
    const alive = this.aliveList(st).filter(p => p.id !== player.id);
    if (!alive.length) return '……（无人可说）';

    const ranked = alive.slice().sort((a, b) =>
      this.suspicion(st, player, b) - this.suspicion(st, player, a));
    const suspect = ranked[0];
    const susName = suspect ? suspect.name : '某人';
    const rev = this.revealed(st);
    const death = this.deathSummary(st);
    const role = this.displayRole(player, st);
    const camp = CAMPS[player.camp].short;

    // 判断是否被攻击（发言里有人点名怀疑自己）
    const attacked = st.log.some(e => e.type === 'speech' && e.speakerId !== player.id &&
      (e.text || '').includes(player.name) && /怀疑|问题|投/.test(e.text || ''));

    let pool;
    const g = SPEECH[player.camp] || SPEECH.neutral;
    if (attacked && Math.random() < 0.7) pool = g.defend;
    else if (Math.random() < 0.55 && suspect) pool = g.accuse;
    else pool = g.opening;

    let tpl = pick(pool);
    const lead = pick(SPEECH.good.lead);
    tpl = tpl.replace(/\{self\}/g, player.name)
             .replace(/\{target\}/g, susName)
             .replace(/\{sus\}/g, susName)
             .replace(/\{role\}/g, role)
             .replace(/\{camp\}/g, camp)
             .replace(/\{lead\}/g, lead)
             .replace(/\{death\}/g, death)
             .replace(/\{n\}/g, String(alive.length));
    // 清理未替换占位符
    tpl = tpl.replace(/\{[^}]+\}/g, '');

    // 侦探好人偶尔公开查验结论（增加逻辑感）
    if (player.roleId === 'detective' && player.camp === 'good' && Math.random() < 0.55) {
      const known = this.knownEvil(st, player);
      if (known.size) {
        const first = [...known][0];
        tpl += ` 我查过 ${first}，是坏人。`;
      }
    }
    return clampText(tpl, 100);
  },

  aliveList(st) { return st.players.filter(p => p.alive); },

  /* ---------- 投票目标 ---------- */
  pickVoteTarget(st, player) {
    const alive = this.aliveList(st).filter(p => p.id !== player.id);
    if (!alive.length) return null;

    if (player.camp === 'evil') {
      const goods = alive.filter(p => p.camp !== 'evil');
      const pool = goods.length ? goods : alive;
      pool.sort((a, b) => this.threat(st, b) - this.threat(st, a));
      // 偶尔弃车保帅：小概率投队友以外随机目标
      if (Math.random() < 0.15) return pool[Math.floor(Math.random() * pool.length)].id;
      return pool[0].id;
    }

    const ranked = alive.slice().sort((a, b) =>
      this.suspicion(st, player, b) - this.suspicion(st, player, a));
    // 中立：更大的随机性
    if (player.camp === 'neutral' && Math.random() < 0.5) {
      return ranked[Math.floor(Math.random() * Math.min(3, ranked.length))].id;
    }
    return ranked[0].id;
  },

  /* ---------- 夜晚技能目标 ---------- */
  pickNightAction(st, player, skillId) {
    const alive = this.aliveList(st);
    const others = alive.filter(p => p.id !== player.id);
    switch (skillId) {
      case 'investigate': {
        if (!others.length) return null;
        const known = this.knownEvil(st, player);
        const fresh = others.filter(p => !known.has(p.name));
        const pool = fresh.length ? fresh : others;
        pool.sort((a, b) => this.suspicion(st, player, b) - this.suspicion(st, player, a));
        return { skillId, targetId: pool[0].id };
      }
      case 'protect': {
        // 优先保护场上威胁最大（最可能被刺杀）的好人，偶尔自保
        const goods = others.filter(p => p.camp === 'good');
        if (!goods.length) return { skillId, targetId: player.id };
        goods.sort((a, b) => this.threat(st, a) - this.threat(st, b));
        const target = Math.random() < 0.25 ? player : goods[0];
        return { skillId, targetId: target.id };
      }
      case 'judge': {
        if (!others.length) return null;
        // 有明确查验结果时果断指认
        const known = this.knownEvil(st, player);
        const confirmed = others.find(p => known.has(p.name));
        if (confirmed) return { skillId, targetId: confirmed.id, extra: { camp: 'evil' } };
        const ranked = others.slice().sort((a, b) =>
          this.suspicion(st, player, b) - this.suspicion(st, player, a));
        if (ranked[0] && this.suspicion(st, player, ranked[0]) >= 60) {
          return { skillId, targetId: ranked[0].id, extra: { camp: 'evil' } };
        }
        return null; // 证据不足则不用，留待后续
      }
      case 'attack': {
        const goods = others.filter(p => p.camp !== 'evil');
        const pool = goods.length ? goods : others;
        pool.sort((a, b) => this.threat(st, b) - this.threat(st, a));
        return { skillId, targetId: pool[0].id };
      }
      case 'poison': {
        const goods = others.filter(p => p.camp !== 'evil');
        const pool = goods.length ? goods : others;
        pool.sort((a, b) => this.threat(st, b) - this.threat(st, a));
        return { skillId, targetId: pool[0].id };
      }
      case 'bet': {
        // 赌徒替死对自身不利，优先绑定队友以保命
        const mates = others.filter(p => p.camp === 'evil');
        const pool = mates.length ? mates : others;
        return { skillId, targetId: pool[Math.floor(Math.random() * pool.length)].id };
      }
      case 'voteRedirect': {
        const goods = others.filter(p => p.camp !== 'evil');
        const pool = goods.length ? goods : others;
        pool.sort((a, b) => this.suspicion(st, player, b) - this.suspicion(st, player, a));
        return { skillId, targetId: pool[0].id };
      }
      case 'silence': {
        // 每局一次，前期使用以达成胜利条件
        if (st.round >= 2 && alive.length >= 4) return { skillId, targetId: null };
        return null;
      }
      case 'rewrite': {
        if (!others.length) return null;
        const target = others[Math.floor(Math.random() * others.length)];
        return { skillId, targetId: target.id, extra: { text: this.makeRewriteText(st, player, target) } };
      }
      default:
        return null;
    }
  },

  makeRewriteText(st, player, target) {
    const others = this.aliveList(st).filter(p => p.id !== target.id && p.id !== player.id);
    const victim = others.length ? pick(others).name : '某人';
    const lines = [
      `我仔细想了想，${victim}的说法漏洞百出，这票我投他。`,
      `别被带节奏了，${victim}才最可疑，跟紧他别跑。`,
      `我报个身份，刚才那波分析我认同${victim}，投他没问题。`,
      `说实话我信${victim}，其他人都有问题，别乱投。`
    ];
    return clampText(pick(lines), 100);
  },

  /* ---------- 其他决策 ---------- */
  decideVoidVote(st, player) {
    // 当自己被高度怀疑时，或中盘出现疑似冤案时作废投票
    const alive = this.aliveList(st);
    const ranked = alive.slice().sort((a, b) =>
      this.suspicion(st, player, b) - this.suspicion(st, player, a));
    if (ranked[0] && ranked[0].id === player.id) return true;
    return st.round >= 3 && Math.random() < 0.25;
  },

  pickDeathChainTarget(st, player) {
    const alive = this.aliveList(st).filter(p => p.id !== player.id);
    if (!alive.length) return null;
    const goods = alive.filter(p => p.camp !== 'evil');
    const pool = goods.length ? goods : alive;
    pool.sort((a, b) => this.threat(st, b) - this.threat(st, a));
    return pool[0];
  },

  pickReviveTarget(st, player) {
    const dead = st.players.filter(p => !p.alive);
    if (!dead.length) return null;
    const goodDead = dead.filter(p => p.camp === 'good');
    const pool = goodDead.length ? goodDead : dead;
    // 优先复活侦探/判官等关键角色
    const key = ['detective', 'judge', 'monarch'];
    pool.sort((a, b) => (key.indexOf(b.roleId) >= 0 ? 1 : 0) - (key.indexOf(a.roleId) >= 0 ? 1 : 0));
    return pool[0];
  }
};
