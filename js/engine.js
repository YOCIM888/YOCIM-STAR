/* ============================================================
 * YOCIM-STAR · engine.js
 * 游戏状态机 / 回合流程 / 技能结算 / 胜负判定
 * ============================================================ */

const Game = {
  state: null,

  /* ---------------- 初始化 ---------------- */
  init(count) {
    const setup = SETUPS[count];
    const draws = {
      good:    shuffle(ROLES.filter(r => r.camp === 'good')).slice(0, setup.good),
      evil:    shuffle(ROLES.filter(r => r.camp === 'evil')).slice(0, setup.evil),
      neutral: shuffle(ROLES.filter(r => r.camp === 'neutral')).slice(0, setup.neutral)
    };
    const roleList = shuffle([...draws.good, ...draws.evil, ...draws.neutral]);
    const names = shuffle(NAME_POOL).slice(0, count);

    const players = roleList.map((role, i) => ({
      id: i,
      name: names[i] || ('玩家' + (i + 1)),
      roleId: role.id,
      camp: role.camp,
      isHuman: i === 0,
      alive: true,
      uses: role.skill.phase === 'passive' ? {} : { [role.skill.id]: role.skill.uses },
      skipRound: null,          // 刺客冷却：该回合不可行动
      protected: false,         // 本夜被骑士保护
      poisonedRound: null,      // 被标记的回合
      betTarget: null,          // 赌徒绑定目标
      redirectTarget: null,     // 魅影票数转移目标（本回合）
      rewriteText: null,        // 被流焰改写的文本
      rewriteBy: null,
      rewriteCount: 0,          // 流焰成功改写次数
      silenceCount: 0,          // 寒霜成功禁言次数
      spyImmuneLeft: 1,         // 间谍免疫刺客次数
      spyDisguiseLeft: 1,       //  spy 查验伪装次数
      transferLeft: 2,          // 诗人伤害转移次数
      deathChainUsed: false,    // 狂人是否已触发
      judgeFailed: false,
      privateNotes: [],         // 私密信息
      deathChainPreset: null,   // 玩家狂人预设的连锁目标
      deathBy: null
    }));

    this.state = {
      count, round: 1, phase: 'night', players,
      log: [], winner: null, over: false,
      tieCount: 0,              // 仅剩 2 人时的无人出局（平票/作废）累计次数，达 3 次判平局
      reviews: [],              // 终局复盘报告（点击复盘按钮后生成）
      speechHistory: [],        // 历史发言 [{round, speeches:[{name,text}]}]
      todaySpeeches: [],        // 本轮已发言（供后续角色参考）
      flags: { nextDaySilenced: false, voteVoided: false },
      playerNightAction: null,  // { skillId, targetId, extra:{camp,text} }
      playerVote: null,
      playerVoidVote: false,
      deathChainPreset: null
    };
    // 每局彻底重建 AI 会话（真正清零，不留跨局记忆）+ 清理降级记录
    if (typeof SessionManager !== 'undefined') SessionManager.reset(this.state);
    if (typeof Decider !== 'undefined') Decider.reset();
    return this.state;
  },

  /* ---------------- 工具 ---------------- */
  role(p)         { return ROLE_MAP[p.roleId]; },
  skill(p)        { return ROLE_MAP[p.roleId].skill; },
  alive()         { return this.state.players.filter(p => p.alive); },
  dead()          { return this.state.players.filter(p => !p.alive); },
  byId(id)        { return this.state.players[id]; },
  human()         { return this.state.players[0]; },
  campName(c)     { return CAMPS[c].short; },

  emit(list, type, text, extra = {}) {
    const ev = Object.assign({ type, text }, extra);
    list.push(ev);
    this.state.log.push(ev);
    return ev;
  },

  // 夜晚主动技能是否可用
  canNightAct(p) {
    if (!p.alive) return false;
    const sk = this.skill(p);
    if (sk.phase !== 'night') return false;
    if (p.skipRound === this.state.round) return false;
    return (p.uses[sk.id] || 0) > 0;
  },

  // 玩家当前是否需要提供夜晚行动（供 UI 判断）
  needsNightAction() {
    const me = this.human();
    return this.canNightAct(me);
  },

  setNightAction(action) { this.state.playerNightAction = action; },
  setDeathChainPreset(id) { this.state.deathChainPreset = id; },
  setVote(id) { this.state.playerVote = id; },
  setVoidVote(v) { this.state.playerVoidVote = !!v; },

  /* ---------------- 夜晚结算 ---------------- */
  async resolveNight() {
    const st = this.state;
    const ev = [];
    this.emit(ev, 'phase', `第 ${st.round} 夜 · 星空协议启动`, { round: st.round, sub: 'night' });

    st.players.forEach(p => { p.protected = false; });

    // 收集行动：玩家 + AI（串行请求，等上一个角色决策完成再发下一个，降低连接失败率）
    const actions = [];
    const me = this.human();
    if (me.isHuman && this.canNightAct(me) && st.playerNightAction) {
      actions.push(Object.assign({ player: me }, st.playerNightAction));
    }
    const aiActors = st.players.filter(p => !p.isHuman && p.alive && this.canNightAct(p));
    for (const p of aiActors) {
      const act = await Decider.decide(p, 'night', st);
      if (act) actions.push(Object.assign({ player: p }, act));
    }

    const order = ['silence', 'rewrite', 'voteRedirect', 'investigate', 'protect', 'judge', 'bet', 'attack', 'poison'];
    actions.sort((a, b) => order.indexOf(a.skillId) - order.indexOf(b.skillId));

    const pendingJudge = [], pendingAttack = [];
    const assassin = st.players.find(p => p.roleId === 'assassin');

    // 逐个执行设置类技能
    actions.forEach(a => {
      const p = a.player, t = a.targetId != null ? this.byId(a.targetId) : null;
      switch (a.skillId) {
        case 'silence': {
          p.uses.silence--;
          p.silenceCount++;
          st.flags.nextDaySilenced = true;
          this.emit(ev, 'system', '寒霜发动【缄默不语】，整个频道陷入死寂……', { secret: true, actor: p.id });
          break;
        }
        case 'rewrite': {
          p.uses.rewrite--;
          p.rewriteCount++;
          if (t) {
            t.rewriteText = clampText(a.extra && a.extra.text || AI.makeRewriteText(st, p, t), 100);
            t.rewriteBy = p.id;
            this.emit(ev, 'notice', '你察觉到自己的言语被人篡改了……', { privateTo: t.id, secret: true });
          }
          break;
        }
        case 'voteRedirect': {
          if (t) {
            p.uses.voteRedirect--;
            p.redirectTarget = t.id;
            this.emit(ev, 'system', '魅影在暗处牵动了一根看不见的线。', { secret: true, actor: p.id });
          }
          break;
        }
        case 'investigate': {
          if (t) {
            let result = t.camp;
            if (t.roleId === 'spy' && t.spyDisguiseLeft > 0) {
              t.spyDisguiseLeft--;
              result = 'good';
            }
            const text = `【蛛丝马迹】${t.name} 的身份信号：${this.campName(result)}`;
            p.privateNotes.push(text);
            this.emit(ev, 'notice', text, { privateTo: p.id });
          }
          break;
        }
        case 'protect': {
          if (t) {
            p.uses.protect--;
            t.protected = true;
            this.emit(ev, 'system', '骑士升起了一面无形护盾。', { secret: true, actor: p.id });
          }
          break;
        }
        case 'judge': {
          if (t) {
            const guess = a.extra && a.extra.camp;
            if (guess === t.camp) {
              p.uses.judge = 0;
              pendingJudge.push(t);
              this.emit(ev, 'system', '判官敲下法槌——审判已然降临。', { secret: true, actor: p.id });
            } else {
              p.uses.judge = 0;
              p.judgeFailed = true;
              this.emit(ev, 'system', '判官的指认落空，法槌声戛然而止。', { secret: true, actor: p.id });
            }
          }
          break;
        }
        case 'bet': {
          if (t) {
            p.uses.bet--;
            p.betTarget = t.id;
            this.emit(ev, 'system', '一纸生死契约在暗网上悄然签署。', { secret: true, actor: p.id });
          }
          break;
        }
        case 'attack': {
          if (t) pendingAttack.push(t);
          break;
        }
        case 'poison': {
          if (t) {
            p.uses.poison--;
            t.poisonedRound = st.round;
            this.emit(ev, 'system', '一种慢性毒素被注入了数据流。', { secret: true, actor: p.id });
          }
          break;
        }
      }
    });

    // ---- 伤害结算：判官直接出局 ----
    for (const t of pendingJudge) {
      if (t.alive) await this.applyDeath(t, 'judge', ev, '审判之槌');
    }

    // ---- 伤害结算：刺客攻击 ----
    for (const t of pendingAttack) {
      if (!t.alive) continue;
      if (t.protected) {
        this.emit(ev, 'system', `${t.name} 被护盾庇护，暗杀落空。`);
        continue;
      }
      if (t.roleId === 'spy' && t.spyImmuneLeft > 0) {
        t.spyImmuneLeft--;
        this.emit(ev, 'system', '利刃穿过幻影——刺杀似乎落空了。', { secret: true });
        continue;
      }
      if (assassin) assassin.skipRound = st.round + 1;
      this.emit(ev, 'system', '夜色中传来一声闷响，有人倒下了。');
      await this.applyDamage(t, 'attack', ev, '暗杀');
    }

    // ---- 毒发结算（标记 3 回合后）----
    for (const p of st.players) {
      if (p.alive && p.poisonedRound != null && st.round - p.poisonedRound >= 3) {
        p.poisonedRound = null;
        this.emit(ev, 'system', FLAVOR.poisoned(p.name));
        await this.applyDamage(p, 'poison', ev, '毒发');
      }
    }

    // ---- 复活结算 ----
    const priest = st.players.find(p => p.roleId === 'priest' && p.alive && (p.uses.revive || 0) > 0);
    if (priest && this.dead().length) {
      let target = null;
      if (priest.isHuman && st.playerNightAction && st.playerNightAction.skillId === 'revive') {
        target = this.byId(st.playerNightAction.targetId);
      } else {
        const reviveId = await Decider.decide(priest, 'revive', st);
        target = reviveId != null ? this.byId(reviveId) : null;
      }
      if (target && !target.alive) {
        priest.uses.revive--;
        target.alive = true;
        target.deathBy = null;
        this.emit(ev, 'system', FLAVOR.revived(target.name));
      }
    }

    // ---- 天亮播报 ----
    this.emit(ev, 'phase', pick(FLAVOR.dawn), { sub: 'dawn' });
    const deaths = ev.filter(e => e.type === 'death');
    if (!deaths.length) this.emit(ev, 'system', pick(FLAVOR.noDeath));

    st.playerNightAction = null;
    st.flags.voteVoided = false;

    // 注意：redirectTarget / rewriteText 保留到白天阶段使用，发言与投票结算后再清理

    this.checkWin(ev);
    return ev;
  },

  /* ---------------- 伤害与死亡 ---------------- */
  async applyDamage(target, cause, ev, label) {
    // 诗人被动：50% 转移伤害
    if (target.roleId === 'poet' && target.transferLeft > 0 && Math.random() < 0.5) {
      target.transferLeft--;
      const others = this.alive().filter(p => p.id !== target.id);
      if (others.length) {
        const redirected = others[Math.floor(Math.random() * others.length)];
        this.emit(ev, 'system', '诗人轻声吟唱，死亡的箭头偏转了方向……');
        return await this.applyDamage(redirected, cause, ev, '转移');
      }
    }
    // 赌徒替死：目标是某存活赌徒的绑定对象
    const gambler = this.state.players.find(p =>
      p.alive && p.roleId === 'gambler' && p.betTarget === target.id);
    if (gambler) {
      this.emit(ev, 'system', '赌徒发动【生命赌注】，替他人挡下了死亡！', { secret: true });
      return await this.applyDeath(gambler, 'bet', ev, '替死');
    }
    return await this.applyDeath(target, cause, ev, label);
  },

  async applyDeath(player, cause, ev, label) {
    if (!player.alive) return;
    player.alive = false;
    player.deathBy = cause;
    this.emit(ev, 'death', `${player.name} 的生命信号中断。（${this.role(player).name}·${this.campName(player.camp)}）`,
      { playerId: player.id, cause, roleId: player.roleId, camp: player.camp });

    // 狂人被动：死亡后带走一人
    if (player.roleId === 'madman' && !player.deathChainUsed) {
      player.deathChainUsed = true;
      let victim = null;
      if (player.isHuman && this.state.deathChainPreset != null) {
        victim = this.byId(this.state.deathChainPreset);
      } else {
        const victimId = await Decider.decide(player, 'deathChain', this.state);
        victim = victimId != null ? this.byId(victimId) : null;
      }
      if (victim && victim.alive) {
        this.emit(ev, 'system', '狂人启动了爆破协议，连锁反应席卷全场！');
        await this.applyDamage(victim, 'deathChain', ev, '爆破');
      }
    }
  },

  /* ---------------- 白天 · 发言 ---------------- */
  async collectSpeeches(playerText, onSpeech = null) {
    const st = this.state;
    const list = [];
    const order = this.alive().map(p => p.id).sort((a, b) => a - b); // 按座位顺序依次发言
    st.todaySpeeches = [];

    for (const id of order) {
      const p = this.byId(id);
      let text;
      if (p.isHuman) {
        text = clampText(playerText || '……（沉默）', 100);
      } else {
        const decided = await Decider.decide(p, 'speech', st);
        text = clampText(decided || '……（沉默）', 100);
      }
      // 流焰改写应用
      if (p.rewriteText && p.rewriteBy != null) {
        text = p.rewriteText;
      }
      const s = { speakerId: id, name: p.name, text, camp: p.camp, isHuman: p.isHuman, round: st.round };
      list.push(s);
      // 立刻写入公开信息：后续发言者可参考本轮前面的发言
      st.todaySpeeches.push({ name: s.name, text: s.text });
      st.log.push({ type: 'speech', text: `${s.name}：${s.text}`, speakerId: s.speakerId });
      // 逐条展示（打字机），展示完再进入下一个角色
      if (onSpeech) await onSpeech(s);
    }

    // 本轮全员发言写入历史，供后续回合参考
    st.speechHistory.push({
      round: st.round,
      speeches: list.map(s => ({ name: s.name, text: s.text }))
    });
    if (st.speechHistory.length > 20) st.speechHistory.shift();
    st.todaySpeeches = [];
    st.players.forEach(p => { p.rewriteText = null; p.rewriteBy = null; });
    return list;
  },

  /* ---------------- 白天 · 投票 ---------------- */
  async resolveVote() {
    const st = this.state;
    const ev = [];
    this.emit(ev, 'phase', '投票通道开启 · 请选择放逐对象', { sub: 'vote' });

    // 君主作废投票（玩家 + AI）
    let voidBy = null;
    if (st.playerVoidVote) {
      const me = this.human();
      if (me.alive && me.roleId === 'monarch' && (me.uses.voidVote || 0) > 0) voidBy = me;
    }
    if (!voidBy) {
      const aiMonarch = st.players.find(p => p.roleId === 'monarch' && p.alive && !p.isHuman && (p.uses.voidVote || 0) > 0);
      if (aiMonarch) {
        const useVoid = await Decider.decide(aiMonarch, 'voidVote', st);
        if (useVoid) voidBy = aiMonarch;
      }
    }
    if (voidBy) {
      voidBy.uses.voidVote--;
      this.emit(ev, 'system', FLAVOR.voided);
      this.emit(ev, 'system', FLAVOR.tied);
      st.flags.voteVoided = true;
      this.countStalemate(ev);
      this.afterVote(ev);
      return ev;
    }

    // 收集投票（串行请求，降低并发连接失败率）
    const voters = this.alive();
    const votes = {};
    for (const voter of voters) {
      let targetId;
      if (voter.isHuman) targetId = st.playerVote;
      else targetId = await Decider.decide(voter, 'vote', st);
      if (targetId != null && this.byId(targetId) && this.byId(targetId).alive && targetId !== voter.id) {
        votes[voter.id] = targetId;
      }
    }

    // 魅影票数转移：投给魅影的票转到其指定目标
    const enchantress = st.players.find(p => p.roleId === 'enchantress' && p.alive && p.redirectTarget != null);
    if (enchantress) {
      Object.keys(votes).forEach(voterId => {
        if (votes[voterId] === enchantress.id) votes[voterId] = enchantress.redirectTarget;
      });
      enchantress.uses.voteRedirect = Math.max(0, (enchantress.uses.voteRedirect || 0) - 1);
      this.emit(ev, 'system', '选票的流向被暗中改写了……', { secret: true });
    }

    // 唱票
    Object.keys(votes).forEach(voterId => {
      this.emit(ev, 'vote', `${this.byId(voterId).name} → ${this.byId(votes[voterId]).name}`,
        { voterId: +voterId, targetId: votes[voterId] });
    });

    const tally = {};
    Object.values(votes).forEach(t => { tally[t] = (tally[t] || 0) + 1; });
    const max = Math.max(0, ...Object.values(tally));
    const top = Object.keys(tally).filter(k => tally[k] === max).map(Number);

    if (!top.length || top.length > 1) {
      this.emit(ev, 'system', FLAVOR.tied);
      this.countStalemate(ev);
    } else {
      const exiled = this.byId(top[0]);
      this.emit(ev, 'system', FLAVOR.exile(exiled.name));
      st.tieCount = 0; // 有人出局，僵局计数清零
      await this.applyDeath(exiled, 'exile', ev, '放逐');
    }

    this.afterVote(ev);
    return ev;
  },

  // 仅剩 2 人时，任何"本轮无人出局"（平票/全弃票/作废）都累计一次僵持
  countStalemate(ev) {
    const st = this.state;
    if (this.alive().length !== 2) return;
    st.tieCount = (st.tieCount || 0) + 1;
    this.emit(ev, 'system', `终局僵持 ${st.tieCount}/3 · 若连续三次无人出局，本局将判定平局。`);
  },

  afterVote(ev) {
    const st = this.state;
    // 进入下一回合
    this.checkWin(ev);
    if (!st.over) {
      st.round++;
      st.phase = 'night';
    }
    st.playerVote = null;
    st.playerVoidVote = false;
    st.flags.nextDaySilenced = false;
    // 魅影票数转移效果仅持续一回合，投票后清理
    st.players.forEach(p => { p.redirectTarget = null; });
  },

  /* ---------------- 胜负判定 ---------------- */
  checkWin(ev) {
    const st = this.state;
    const alive = this.alive();
    const good = alive.filter(p => p.camp === 'good');
    const evil = alive.filter(p => p.camp === 'evil');
    const flame = st.players.find(p => p.roleId === 'flame');
    const frost = st.players.find(p => p.roleId === 'frost');

    let win = null;
    // 终局平局：仅剩 2 人且连续 3 次投票无人出局，打破互相平票死循环
    if (alive.length === 2 && (st.tieCount || 0) >= 3) {
      win = { type: 'draw', name: '平 局', ids: [],
              desc: '终局连续三次平票，双方僵持不下，星空协议判定本局为平局。' };
    }
    // 僵局兜底：场上只剩中立（无好人无坏人）→ 中立获胜
    if (!good.length && !evil.length && alive.length > 0) {
      win = { type: 'neutral', roleId: alive[0].roleId, name: CAMPS[alive[0].camp].short,
              desc: '最后的幸存者独自站立于星空之巅。', ids: alive.map(p => p.id) };
    }
    // 中立胜利需"熬到残局"：好人、坏人两方中至少有一方已全灭，或场上仅剩两方且人数稀少
    const oneSideGone = false; // 一方全灭后继续对抗，不立即判中立胜
    const endgame = alive.length <= 2;
    // 流焰：改写≥3次、存活，且进入终局
    if (!win && flame && flame.alive && flame.rewriteCount >= 3 && (oneSideGone || endgame)) {
      win = { type: 'neutral', roleId: 'flame', name: '流焰·熠阳', desc: '言论操纵达成，流焰独自窃取了胜利。', ids: [flame.id] };
    }
    // 寒霜：禁言成功、存活，且进入残局
    if (!win && frost && frost.alive && frost.silenceCount >= 1 && (oneSideGone || endgame)) {
      win = { type: 'neutral', roleId: 'frost', name: '寒霜·曦月', desc: '缄默笼罩全场，寒霜独自赢得了终局。', ids: [frost.id] };
    }
    // 阵营胜负：好人全灭则坏人胜；坏人全灭则好人胜
    if (!win && evil.length === 0 && good.length > 0) {
      win = { type: 'good', name: '蓝色星空', desc: '所有敌人已被肃清，好人阵营获胜。', ids: good.map(p => p.id) };
    } else if (!win && good.length === 0 && evil.length > 0) {
      win = { type: 'evil', name: '红色星空', desc: '光明彻底熄灭，坏人阵营获胜。', ids: evil.map(p => p.id) };
    }

    // 超时裁决：18 回合后仍僵持，按存活人数判定最大阵营
    if (!win && st.round >= 18) {
      if (good.length >= evil.length && good.length > 0) {
        win = { type: 'good', name: '蓝色星空', desc: '超时裁决：好人阵营以人数优势险胜。', ids: good.map(p => p.id) };
      } else if (evil.length > 0) {
        win = { type: 'evil', name: '红色星空', desc: '超时裁决：坏人阵营以人数优势胜出。', ids: evil.map(p => p.id) };
      }
    }

    if (win) {
      st.over = true;
      st.winner = win;
      const me = this.human();
      const playerWon = win.type === 'draw' ? null
        : (win.ids.includes(me.id) || (win.type !== 'neutral' && me.camp === win.type));
      const tag = win.type === 'draw' ? '【平局】' : (playerWon ? '【胜利】' : '【失败】');
      const headline = win.type === 'draw' ? `本局结束 · ${win.name}！` : `${win.name} 获胜！`;
      this.emit(ev, 'win', headline + tag, { winner: win, playerWon });
    }
    return win;
  }
};
