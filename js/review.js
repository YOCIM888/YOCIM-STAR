/* ============================================================
 * YOCIM-STAR · review.js
 * 终局复盘：每个角色基于本局真实进程撰写 800 字内推理报告
 * - AI 托管角色：用其自己的会话服务商生成（终局揭晓信息为合法材料）
 * - 其余角色：由本地引擎依据真实事件生成结构化报告
 * 生成过程串行，逐份展示，避免并发轰炸 API
 * ============================================================ */

const Review = {
  running: false,
  bound: false,
  overlay: null, bodyEl: null, progressEl: null,

  init() {
    if (this.bound) return;
    this.overlay = document.getElementById('review-overlay');
    this.bodyEl = document.getElementById('review-body');
    this.progressEl = document.getElementById('review-progress');
    const close = document.getElementById('review-close');
    if (close) close.addEventListener('click', () => this.hide());
    if (this.overlay) this.overlay.addEventListener('click', e => {
      if (e.target === this.overlay) this.hide();
    });
    this.bound = true;
  },

  show() { this.init(); if (this.overlay) this.overlay.classList.add('show'); },
  hide() { this.init(); if (this.overlay) this.overlay.classList.remove('show'); },

  setProgress(text) {
    if (this.progressEl) this.progressEl.textContent = text;
  },

  /* ---------- 入口 ---------- */
  async run() {
    if (this.running) return;
    const st = Game.state;
    if (!st || !st.over) return;
    this.init();
    if (st.reviews && st.reviews.length) {
      this.renderAll(st.reviews);
      this.setProgress(`◈ 共 ${st.reviews.length} 份复盘报告 · 点击右上角关闭`);
      this.show();
      return;
    }
    this.running = true;
    this.show();
    this.setProgress('◈ 正在梳理全场记录…');
    this.bodyEl.innerHTML = '<div class="review-empty">每个角色正在根据真实局势撰写复盘报告，请稍候…（AI 托管角色按座位依次生成）</div>';

    const order = [Game.human()].concat(st.players.filter(p => !p.isHuman));
    const results = [];
    for (let i = 0; i < order.length; i++) {
      const p = order[i];
      this.setProgress(`◈ 生成中 ${i + 1}/${order.length} · ${p.name}`);
      let rec;
      try { rec = await this.one(p, st); }
      catch (e) { rec = this.makeRecord(p, this.local(p, st), '内置复盘'); }
      results.push(rec);
      this.append(rec);
      await new Promise(r => setTimeout(r, 24)); // 让浏览器有机会重绘
    }
    st.reviews = results;
    this.setProgress(`◈ 完成 · 共 ${results.length} 份报告（每份 800 字内）`);
    this.running = false;
  },

  async one(p, st) {
    let session = (!p.isHuman && typeof SessionManager !== 'undefined')
      ? SessionManager.get(p.roleId) : null;
    // 玩家角色在对局中绝不托管；终局复盘时若有可用服务商，则用临时会话生成一份报告
    // 临时会话不进入 SessionManager，不污染"玩家不托管"的对局规则
    if (!session && p.isHuman && typeof LLMSession !== 'undefined'
        && Settings.data.providers && Settings.data.providers.length) {
      session = new LLMSession(p.roleId, Settings.data.providers[0]);
    }
    if (session) {
      try {
        const text = await session.generateReview(this.brief(p, st, session), p.name, st.round);
        return this.makeRecord(p, this.limit(text), (session.provider && session.provider.name) || 'AI 托管');
      } catch (e) {
        // 单角色失败不影响整体，降级为本地复盘
      }
    }
    return this.makeRecord(p, this.local(p, st), '内置复盘');
  },

  makeRecord(p, text, by) {
    const role = Game.role(p);
    return {
      name: p.name, roleName: role.name, star: role.star,
      camp: p.camp, isHuman: p.isHuman, by, text
    };
  },

  /* ---------- 给 LLM 的全场揭晓简报 ---------- */
  brief(p, st, session) {
    const win = st.winner;
    const deaths = st.log.filter(e => e.type === 'death');
    const votes = st.log.filter(e => e.type === 'vote').slice(-24);
    const history = (st.speechHistory || []).slice(-4);

    const roster = st.players.map(x => {
      const r = Game.role(x);
      const end = x.alive ? '存活' : '出局（' + this.causeName(x.deathBy) + '）';
      return `${x.name} = ${r.name}/${CAMPS[x.camp].short} · ${end}`;
    }).join('\n');

    const mySpeeches = [];
    history.forEach(h => h.speeches.forEach(s => {
      if (s.name === p.name) mySpeeches.push(`第${h.round}回合：${s.text}`);
    }));
    const myVotes = votes.filter(v => v.voterId === p.id)
      .map(v => `${this.nameOf(st, v.targetId)}`).join('、') || '无公开记录';

    const thoughts = session && session.thoughts.length
      ? session.thoughts.slice(-12).map(t => `第${t.round}回合[${t.action}]：${t.text}`).join('\n')
      : '（你是人类玩家，无 AI 思考记录）';

    const allSpeeches = history.map(h =>
      `第${h.round}回合：` + h.speeches.map(s => `${s.name}:${s.text}`).join(' / ')
    ).join('\n') || '无';

    return [
      `【对局结果】${win.type === 'draw' ? '平局' : win.name + ' 获胜'}；共 ${st.count} 人，进行 ${st.round} 回合。${win.desc}`,
      `【全场身份揭晓 · 游戏结束后才公开】\n${roster}`,
      `【出局时间线】\n${deaths.map(d => d.text).join('\n') || '无'}`,
      `【公开票型（近期）】${votes.map(v => v.text).join('；') || '无'}；其中你的投票对象：${myVotes}`,
      `【你的公开发言】\n${mySpeeches.join('\n') || '无'}`,
      `【你的私密情报】\n${p.privateNotes.join('\n') || '本局未获得私密情报'}`,
      `【你在游戏中的真实思考】\n${thoughts}`,
      `【全员发言记录（近 4 轮）】\n${allSpeeches}`
    ].join('\n\n');
  },

  /* ---------- 本地复盘（无 AI 托管时使用） ---------- */
  local(p, st) {
    const role = Game.role(p), camp = CAMPS[p.camp], win = st.winner;
    const deaths = st.log.filter(e => e.type === 'death');
    const votes = st.log.filter(e => e.type === 'vote');
    const myVotes = votes.filter(v => v.voterId === p.id);
    const mySpeeches = [];
    (st.speechHistory || []).forEach(h => h.speeches.forEach(s => {
      if (s.name === p.name) mySpeeches.push(s.text);
    }));

    const result = win.type === 'draw' ? '平局'
      : (win.ids.includes(p.id) || (win.type !== 'neutral' && p.camp === win.type)) ? '我方获胜' : '我方落败';
    const end = p.alive ? '你存活到了终局' : `你在对局中出局（${this.causeName(p.deathBy)}）`;
    const keyDeaths = deaths.slice(0, 8).map(d => d.text.replace(/（[^）]*）/g, '')).join('、') || '无人出局';
    const speechSample = mySpeeches.length ? mySpeeches.slice(-2).join(' / ') : '你几乎没有公开发言';
    const voteText = myVotes.length
      ? myVotes.map(v => `投给 ${this.nameOf(st, v.targetId)}`).join('，')
      : '你多次选择弃票';
    const notes = p.privateNotes.length ? p.privateNotes.join('；') : '本局未获得私密情报';
    const dist = this.distribution(st);

    const text = [
      `①身份与目标\n我是${camp.short}阵营的${role.name}（${role.star}），技能【${role.skill.name}】：${role.skill.desc}本局结果：${result}；${end}。`,
      `②关键局势回顾\n全场 ${st.count} 人、${st.round} 回合，先后出局：${keyDeaths}。我的公开发言倾向：${speechSample}。我的投票记录：${voteText}。`,
      `③判断得失\n我掌握的情报：${notes}。全场最终构成为${dist}。${p.alive ? '能活到终局，说明站队与表态相对稳妥。' : '中途出局，意味着立场暴露或被重点怀疑。'}若能更早把私密情报转化为公开逻辑，局势或许不同。`,
      `④重来一局的策略\n下一局我会更早表态，用技能情报交叉验证发言矛盾，并在投票阶段结合票型追踪立场摇摆者；同时隐藏技能节奏，避免成为优先目标。`
    ].join('\n\n');
    return this.limit(text);
  },

  distribution(st) {
    const c = { good: 0, evil: 0, neutral: 0 };
    st.players.forEach(p => c[p.camp]++);
    return `好人 ${c.good}／坏人 ${c.evil}／中立 ${c.neutral}`;
  },

  nameOf(st, id) {
    const p = st.players[id];
    return p ? p.name : '未知玩家';
  },

  causeName(c) {
    return ({ attack: '暗杀', exile: '放逐', poison: '毒发', judge: '审判', bet: '替死', deathChain: '爆破' })[c] || '未知';
  },

  limit(s) {
    let out = String(s || '').replace(/\r/g, '').trim();
    if (out.length > 800) {
      out = out.slice(0, 800);
      const cut = out.lastIndexOf('\n');
      if (cut > 620) out = out.slice(0, cut);
    }
    return out;
  },

  /* ---------- 渲染 ---------- */
  renderAll(list) {
    if (!this.bodyEl) return;
    this.bodyEl.innerHTML = '';
    list.forEach(r => this.append(r));
  },

  append(rec) {
    if (!this.bodyEl) return;
    const empty = this.bodyEl.querySelector('.review-empty');
    if (empty) empty.remove();
    const div = document.createElement('div');
    div.className = 'review-card ' + rec.camp;
    const camp = CAMPS[rec.camp];
    const esc = typeof Settings !== 'undefined' ? Settings.esc : (s => String(s));
    div.innerHTML = `
      <div class="rv-head">
        <b>${esc(rec.name)}${rec.isHuman ? '<span class="rv-me">你</span>' : ''}</b>
        <span>${esc(rec.roleName)}·${esc(rec.star)} / ${camp.short}</span>
        <em>${esc(rec.by)}</em>
      </div>
      <div class="rv-text">${esc(rec.text).replace(/\n/g, '<br>')}</div>`;
    this.bodyEl.appendChild(div);
    this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
  }
};
