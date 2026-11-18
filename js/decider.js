/* ============================================================
 * YOCIM-STAR · decider.js
 * 信息过滤 ContextBuilder + 可插拔决策器（Local / LLM）
 * 关键：模型永远只收到过滤后的上下文，拿不到完整 state
 * 决策器统一返回结构化结果，本地/LLM 两条路径对引擎透明
 * ============================================================ */

const ContextBuilder = {
  /* 从完整 state 中，为指定角色提取「可见信息」快照。
     绝不注入：他人身份/私密状态、完整角色表、源代码、secret 事件、队友身份。 */
  build(st, player) {
    const role = ROLE_MAP[player.roleId];
    const self = {
      name: player.name,
      star: role.star,
      campName: CAMPS[player.camp].short,
      skillName: role.skill.name,
      skillDesc: role.skill.desc,
      usesLeft: this.usesText(player),
      win: role.skill.win || ''
    };

    // 公开信息：只从公开类型的日志提取，过滤 secret / 私密事件
    const deaths = [], systemEvents = [], speeches = [], votes = [];
    st.log.forEach(e => {
      if (e.type === 'death' && e.text) deaths.push(e.text);
      else if (e.type === 'system' && !e.secret && e.text) systemEvents.push(e.text);
      else if (e.type === 'speech' && e.text) speeches.push({ name: this.speakerName(st, e.speakerId), text: this.speechText(e) });
      else if (e.type === 'vote' && e.text) votes.push(e.text);
    });

    return {
      self,
      privateNotes: player.privateNotes.slice(),
      public: {
        round: st.round,
        aliveCount: st.players.filter(p => p.alive).length,
        deaths: deaths.slice(-12),
        systemEvents: systemEvents.slice(-12),
        speeches: speeches.slice(-24),
        votes: votes.slice(-16)
      }
    };
  },

  usesText(player) {
    const sk = ROLE_MAP[player.roleId].skill;
    if (sk.freq === 'passive') return '被动技能';
    if (sk.freq === 'perRound') return '每回合可用';
    return `本局剩余 ${player.uses[sk.id] || 0} 次`;
  },
  speakerName(st, id) { const p = st.players[id]; return p ? p.name : '未知'; },
  speechText(e) {
    const m = e.text.match(/^(.+?)：([\s\S]*)$/);
    return m ? m[2] : e.text;
  }
};

const ACTION_PROMPT = {
  speech: '现在是白天讨论环节，请生成你的发言。',
  night: '现在是夜晚行动阶段。请使用你的技能，只输出你要指定的目标玩家名字（必须是公开局势中出现过的存活玩家）；若不想使用则输出「跳过」。判官输出格式为「玩家名字 阵营」（阵营为好人/坏人/中立）；流焰输出格式为「玩家名字：改写后的发言」。',
  vote: '现在是投票阶段，请输出你要投票放逐的玩家名字（必须是存活玩家），或输出「弃票」。',
  voidVote: '你是君主，拥有作废本场投票的能力。请输出「是」表示作废本场投票，或「否」表示正常投票。',
  deathChain: '你是狂人，死亡时将带走一人。请输出你要带走的目标玩家名字。',
  revive: '你是牧师，请输出你要复活的已死亡玩家名字。'
};

const DecisionParser = {
  findPlayer(text, st, excludeId = null) {
    if (!text) return null;
    const pool = st.players.filter(p => p.alive && p.id !== excludeId);
    const dead = st.players.filter(p => !p.alive && p.id !== excludeId);
    for (const p of pool) if (text.includes(p.name)) return p;
    for (const p of dead) if (text.includes(p.name)) return p;
    return null;
  },
  camp(text) {
    if (/好人/.test(text)) return 'good';
    if (/坏人/.test(text)) return 'evil';
    if (/中立/.test(text)) return 'neutral';
    return null;
  },
  isSkip(text) { return /^(跳过|弃票|不用|放弃|不发动|否)/.test((text || '').trim()) || /^(跳过|弃票)$/.test((text || '').trim()); }
};

/* ---------- 可插拔决策器 ---------- */
const Decider = {
  degraded: [], // 本局降级记录 [{name, reason}]

  reset() { this.degraded = []; },

  // 统一入口：本地 AI 与 LLM 托管共用，返回结构化结果
  async decide(player, actionType, st) {
    const visible = ContextBuilder.build(st, player);
    if (SessionManager.has(player.roleId)) {
      const prompt = ACTION_PROMPT[actionType] || '请做出你的决策。';
      try {
        const speak = await SessionManager.get(player.roleId).decide(prompt, visible, actionType);
        return this.parseLLM(player, actionType, speak, st);
      } catch (e) {
        // 失败降级：该角色本次由内置 AI 接管，不中断游戏
        this.degraded.push({ name: player.name, reason: e.message || '连接失败' });
        return this.local(player, actionType, st);
      }
    }
    return this.local(player, actionType, st);
  },

  parseLLM(player, actionType, text, st) {
    const selfId = player.id;
    switch (actionType) {
      case 'speech': return clampText(text, 100) || '……（沉默）';
      case 'night': {
        if (DecisionParser.isSkip(text)) return null;
        const skillId = ROLE_MAP[player.roleId].skill.id;
        const target = DecisionParser.findPlayer(text, st, selfId);
        if (!target) return null;
        const extra = {};
        if (skillId === 'judge') extra.camp = DecisionParser.camp(text);
        if (skillId === 'rewrite') {
          const m = text.match(/^(.+?)[：:]\s*([\s\S]+)$/);
          extra.text = m ? clampText(m[2], 100) : clampText(text, 100);
        }
        return { skillId, targetId: target.id, extra };
      }
      case 'vote': {
        if (/弃票|跳过/.test(text || '')) return null;
        const t = DecisionParser.findPlayer(text, st, selfId);
        return t ? t.id : null;
      }
      case 'voidVote': return /^(是|作废|yes|true)/i.test((text || '').trim());
      case 'deathChain':
      case 'revive': {
        const t = DecisionParser.findPlayer(text, st, selfId);
        return t ? t.id : null;
      }
      default: return null;
    }
  },

  // 本地启发式：调用现有 AI 模块，返回结构化结果
  local(player, actionType, st) {
    try {
      switch (actionType) {
        case 'speech': return AI.makeSpeech(st, player);
        case 'night': return AI.pickNightAction(st, player, ROLE_MAP[player.roleId].skill.id);
        case 'vote': return AI.pickVoteTarget(st, player);
        case 'voidVote': return AI.decideVoidVote(st, player);
        case 'deathChain': { const t = AI.pickDeathChainTarget(st, player); return t ? t.id : null; }
        case 'revive': { const t = AI.pickReviveTarget(st, player); return t ? t.id : null; }
        default: return null;
      }
    } catch (e) { console.warn('本地AI决策异常', e); return null; }
  }
};
