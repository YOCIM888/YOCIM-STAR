/* ============================================================
 * YOCIM-STAR · main.js
 * 主流程控制器：夜晚 → 白天发言 → 投票 → 循环 / 结算
 * ============================================================ */

const Main = {
  /* ---------- 夜晚流程 ---------- */
  async beginNight() {
    const st = Game.state;
    if (st.over) return this.finish();

    UI.setPhase('night');
    UI.clearStage();
    UI.renderPlayers();
    UI.updateHUD();

    const me = Game.human();
    const canAct = Game.needsNightAction();
    const sk = Game.skill(me);

    if (canAct && me.alive) {
      // 玩家狂人：被动技能，夜晚设置死亡连锁目标
      if (me.roleId === 'madman') {
        UI.setBanner(`你的身份是【狂人】，死亡后可带走一人。设置连锁目标（可选）：`);
        const targets = Game.alive().filter(p => p.id !== me.id);
        const r = await UI.askTarget({
          title: '【爆破狂人】死亡连锁预设',
          desc: '若你今夜或之后死亡，将带走选中的玩家。一局仅触发一次。可跳过。',
          targets, allowSkip: true
        });
        if (r && r.targetId != null) Game.setDeathChainPreset(r.targetId);
      } else {
        // 主动技能：让玩家选择目标
        UI.setBanner(`夜晚行动 · 请使用你的技能【${sk.name}】`);
        const r = await this.askSkill(me, sk);
        Game.setNightAction(r ? { skillId: sk.id, targetId: r.targetId, extra: { camp: r.camp, text: r.text } } : null);
      }
    } else if (!me.alive) {
      UI.setBanner('你已出局，正在旁观夜晚的行动……');
      await UI.wait(700);
    } else {
      UI.setBanner(me.roleId === 'poet' || me.roleId === 'spy'
        ? '你的技能为被动触发，今夜无需操作。'
        : '你暂无可用技能，静待天明……');
      await UI.wait(700);
    }

    // 执行夜晚结算
    const events = await Game.resolveNight();
    // 若有 AI 连接降级，追加提示事件
    if (typeof Decider !== 'undefined' && Decider.degraded.length) {
      const names = [...new Set(Decider.degraded.map(d => d.name))].join('、');
      events.push({ type: 'system', text: `⚠ ${names} 的 AI 连接异常，已由内置 AI 临时接管。` });
      Decider.degraded = [];
    }
    await UI.playEvents(events, 380);
    UI.renderPlayers();
    UI.updateHUD();

    if (st.over) return this.finish();

    await UI.wait(500);
    this.beginDay();
  },

  /* ---------- 根据技能构造交互 ---------- */
  async askSkill(me, sk) {
    let targets = null;
    if (sk.target === 'single') targets = Game.alive().filter(p => p.id !== me.id);
    else if (sk.target === 'dead') targets = Game.dead();

    const needCamp = sk.id === 'judge';
    const needText = sk.id === 'rewrite';
    const extraDesc = {
      investigate: '查验一名玩家的阵营（好人/坏人/中立），结果仅你可见。',
      protect: '指定一名玩家，使其本夜不受任何伤害。',
      judge: '指定一名玩家并指认其阵营。指认成功，对方直接出局；失败则本局技能失效。',
      revive: '复活一名已死亡的玩家。',
      attack: '指定攻击一名玩家。成功则下回合冷却，失败无冷却。',
      poison: '标记一名玩家，3 回合后毒发死亡。',
      bet: '绑定一名玩家，其死亡时你将代替其死亡。',
      voteRedirect: '指定一名玩家，下一回合投给你的票将转移到他身上。',
      silence: '使用后全场禁言一回合，有播报。',
      rewrite: '改写一名玩家的发言，被改写者会收到私密通知。'
    }[sk.id] || sk.desc;

    return UI.askTarget({
      title: `【${sk.name}】`,
      desc: extraDesc,
      targets,
      allowSkip: true,
      needCamp,
      needText
    });
  },

  /* ---------- 白天流程 ---------- */
  async beginDay() {
    const st = Game.state;
    UI.setPhase('day');
    UI.clearStage();

    if (st.flags.nextDaySilenced) {
      UI.setBanner('寒霜发动【缄默不语】，今日全场禁言，无法发言！');
      await UI.playEvents([{ type: 'system', text: '频道已被冻结，所有发言通道关闭。' }], 600);
    } else if (!Game.human().alive) {
      UI.setBanner('你已出局，正在旁观白天的讨论……');
      const speeches = await Game.collectSpeeches('');
      await UI.showSpeeches(speeches);
      await UI.wait(300);
    } else {
      UI.setBanner('白天讨论 · 每人发言 100 字以内');
      const text = await UI.askSpeech();
      const speeches = await Game.collectSpeeches(text);
      await UI.showSpeeches(speeches);
      await UI.wait(400);
    }

    this.beginVote();
  },

  /* ---------- 投票流程 ---------- */
  async beginVote() {
    const st = Game.state;
    UI.setPhase('vote');
    UI.clearStage();
    const me = Game.human();

    if (!me.alive) {
      UI.setBanner('你已出局，正在旁观投票……');
      await UI.wait(600);
      const events = await Game.resolveVote();
      await UI.playEvents(events, 340);
      return this.afterRound();
    }

    UI.setBanner('投票阶段 · 选择本回合放逐对象');

    // 君主：可选择作废投票
    if (me.roleId === 'monarch' && (me.uses.voidVote || 0) > 0) {
      const use = await UI.modal({
        title: '【独断专行】君主专属',
        body: `你拥有 ${me.uses.voidVote} 次作废投票机会。是否现在作废本场投票？作废后本回合无人被放逐。`,
        buttons: [
          { label: '作废本场投票', style: 'danger', value: true },
          { label: '正常投票', value: false }
        ]
      });
      Game.setVoidVote(use);
      if (use) {
        const events = await Game.resolveVote();
        await UI.playEvents(events, 340);
        return this.afterRound();
      }
    }

    // 选择投票目标
    const targets = Game.alive().filter(p => p.id !== me.id);
    const r = await UI.askTarget({
      title: '投票 · 选择放逐对象',
      desc: '得票最高者将被放逐。平票则无人出局。也可选择弃票。',
      targets,
      allowSkip: true,
      allowAbstain: true
    });
    Game.setVote(r && r.targetId != null ? r.targetId : null);

    const events = await Game.resolveVote();
    await UI.playEvents(events, 340);
    this.afterRound();
  },

  /* ---------- 回合结束 ---------- */
  async afterRound() {
    const st = Game.state;
    UI.renderPlayers();
    UI.updateHUD();
    if (st.over) return this.finish();
    await UI.wait(700);
    this.beginNight();
  },

  /* ---------- 结算 ---------- */
  async finish() {
    await UI.wait(400);
    UI.renderEnd();
  }
};

/* ---------- 启动 ---------- */
document.addEventListener('DOMContentLoaded', () => {
  UI.initSetup();
});
