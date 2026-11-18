/* ============================================================
 * YOCIM-STAR · ui.js
 * DOM 渲染 / 事件播放 / 交互面板
 * ============================================================ */

const UI = {
  $: id => document.getElementById(id),
  selectedCount: 14,
  pendingResolve: null,

  /* ---------- 屏幕切换 ---------- */
  show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    this.$(id).classList.add('active');
  },

  /* ---------- 开局 ---------- */
  initSetup() {
    Settings.load();
    const info = this.$('setup-info');
    const counts = this.$('count-options');
    counts.addEventListener('click', e => {
      const btn = e.target.closest('.count-btn');
      if (!btn) return;
      counts.querySelectorAll('.count-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      this.selectedCount = +btn.dataset.n;
      const s = SETUPS[this.selectedCount];
      info.innerHTML = `好人 <b>${s.good}</b> · 坏人 <b>${s.evil}</b> · 中立 <b>${s.neutral}</b> ／ 共 ${this.selectedCount} 名参与者`;
    });
    info.innerHTML = '好人 <b>6</b> · 坏人 <b>6</b> · 中立 <b>2</b> ／ 共 14 名参与者';

    this.$('start-btn').addEventListener('click', () => {
      Game.init(this.selectedCount);
      this.renderReveal();
      this.show('reveal-screen');
    });
    this.$('enter-btn').addEventListener('click', () => {
      this.show('game-screen');
      this.renderStatic();
      Main.beginNight();
    });
    this.$('restart-btn').addEventListener('click', () => location.reload());

    // AI 设置入口
    this.$('settings-entry').addEventListener('click', () => Settings.openPanel());
    this.$('hud-settings').addEventListener('click', () => Settings.openPanel());
  },

  /* ---------- 身份揭示 ---------- */
  renderReveal() {
    const me = Game.human();
    const role = Game.role(me);
    const camp = CAMPS[me.camp];
    const card = this.$('reveal-card');
    card.style.borderColor = camp.color;
    card.style.boxShadow = `0 0 50px ${camp.glow}`;
    card.innerHTML = `
      <img src="${role.img}" alt="${role.name}">
      <div class="card-overlay">
        <div class="card-camp" style="color:${camp.color}">${camp.emblem} ${camp.name} · ${camp.short}</div>
        <div class="card-name">${role.name}</div>
        <div class="card-star">${role.star}</div>
        <div class="card-skill" style="border-color:${camp.color}44">
          <b style="color:${camp.color}">【${role.skill.name}】</b>
          ${role.skill.desc}
          ${role.skill.win ? '<br><span style="color:'+camp.color+'">胜利目标：'+role.skill.win+'</span>' : ''}
        </div>
      </div>`;
  },

  /* ---------- 静态渲染（身份卡、情报面板） ---------- */
  renderStatic() {
    const me = Game.human();
    const role = Game.role(me);
    const camp = CAMPS[me.camp];
    const mini = this.$('my-role-mini');
    mini.style.setProperty('--c', camp.color);
    mini.innerHTML = `
      <img src="${role.img}" alt="${role.name}">
      <div class="mini-info">
        <b>${role.name}·${role.star}</b>
        <span style="color:${camp.color}">${camp.emblem} ${camp.name}</span>
        <small>${role.skill.name} · ${this.freqText(role.skill)}</small>
      </div>`;
    this.renderPlayers();
    this.updateHUD();
    this.renderNotes();
    this.renderLog();
  },

  freqText(sk) {
    if (sk.freq === 'perRound') return '每回合一次';
    if (sk.freq === 'perGame') return `每局 ${sk.uses} 次`;
    return '被动';
  },

  /* ---------- HUD ---------- */
  updateHUD() {
    const st = Game.state;
    this.$('round-num').textContent = st.round;
    const counts = { good: 0, evil: 0, neutral: 0 };
    st.players.forEach(p => { if (p.alive) counts[p.camp]++; });
    this.$('alive-good').textContent = counts.good;
    this.$('alive-evil').textContent = counts.evil;
    this.$('alive-neutral').textContent = counts.neutral;
    this.$('player-count').textContent = `(${Game.alive().length}/${st.count})`;
  },

  setPhase(phase) {
    const badge = this.$('phase-badge');
    const desc = this.$('phase-desc');
    badge.className = 'phase-badge ' + phase;
    if (phase === 'night') { badge.textContent = '夜 晚'; desc.textContent = '星空协议启动 · 暗中行动'; }
    else if (phase === 'day') { badge.textContent = '白 天'; desc.textContent = '公开讨论 · 轮流发言'; }
    else if (phase === 'vote') { badge.textContent = '投 票'; desc.textContent = '选择放逐对象'; }
  },

  /* ---------- 玩家卡网格 ---------- */
  renderPlayers(selectableIds = null, selectedIds = [], revealAll = false) {
    const grid = this.$('player-grid');
    const st = Game.state;
    grid.innerHTML = '';
    st.players.forEach(p => {
      const role = Game.role(p);
      const camp = CAMPS[p.camp];
      const card = document.createElement('div');
      card.className = `player-card ${p.camp} ${p.alive ? '' : 'dead'}`;
      if (selectableIds && selectableIds.includes(p.id)) card.classList.add('selectable');
      if (selectedIds.includes(p.id)) card.classList.add('chosen');
      card.dataset.pid = p.id;

      const showRole = !p.alive || p.isHuman || revealAll;
      const hosted = !p.isHuman && Settings.isLLMHosted(p.roleId);
      const canPeek = hosted && Settings.data.thoughtVision && typeof SessionManager !== 'undefined' && SessionManager.has(p.roleId);
      if (canPeek) card.classList.add('peekable');
      let statusText = '';
      if (!p.alive) statusText = '已出局';
      else if (p.protected) statusText = '<span class="pc-status protected">✦ 受保护</span>';
      else if (p.poisonedRound != null) statusText = '<span class="pc-status poisoned">☠ 已中毒</span>';

      card.innerHTML = `
        <div class="pc-avatar"><img src="${role.img}" alt=""></div>
        <div class="pc-info">
          <div class="pc-name">${p.name}${p.isHuman ? '<span class="me-tag">YOU</span>' : ''}${hosted ? '<span class="ai-tag">AI</span>' : ''}</div>
          <div class="pc-role" style="color:${showRole ? camp.color : 'var(--dim)'}">
            ${showRole ? role.name + '·' + role.star : '身份未知'}
          </div>
          <div>${statusText ? statusText : '<div class="pc-status">' + (p.alive ? '在线' : '') + '</div>'}</div>
        </div>
        ${canPeek ? '<div class="peek-icon" data-pid="' + p.id + '" title="查看AI思考">◉</div>' : ''}`;
      grid.appendChild(card);
    });
    if (!grid.dataset.peekBound) {
      grid.addEventListener('click', e => {
        const icon = e.target.closest('.peek-icon');
        if (!icon) return;
        e.stopPropagation();
        this.showThought(+icon.dataset.pid);
      });
      grid.dataset.peekBound = '1';
    }
  },

  /* ---------- 思考透视 ---------- */
  showThought(pid) {
    const p = Game.byId(pid);
    if (!p) return;
    const session = SessionManager.get(p.roleId);
    const thought = session ? session.latestThought() : null;
    const role = Game.role(p);
    const body = thought && thought.text
      ? `<div class="thought-meta">第 ${thought.round} 回合 · ${thought.action || '决策'}</div>
         <div class="thought-text">${Settings.esc(thought.text)}</div>`
      : '<div class="thought-empty">该角色暂无思考记录（可能尚未行动，或模型未返回思考内容）。</div>';
    this.modal({
      title: `◉ ${p.name} 的思考 · ${role.name}`,
      body,
      buttons: [{ label: '关闭', value: false }]
    });
  },

  /* ---------- 事件播放 ---------- */
  async playEvents(events, speed = 420) {
    const feed = this.$('event-feed');
    for (const ev of events) {
      const div = document.createElement('div');
      let cls = 'ev ', prefix = '';
      switch (ev.type) {
        case 'phase': cls += 'phase-event'; break;
        case 'death': cls += 'death-event'; break;
        case 'notice': cls += 'notice-event'; prefix = '[私密] '; break;
        case 'vote': cls += 'vote-event'; break;
        case 'win': cls += 'win-event'; break;
        case 'system': cls += 'system-event'; break;
        default: cls += 'system-event';
      }
      const isMine = ev.privateTo === 0;
      const isSecretHidden = ev.secret && ev.privateTo !== undefined && !isMine;
      if (isSecretHidden) continue; // 私密事件只展示给目标玩家
      div.className = cls;
      div.textContent = (prefix || '') + ev.text;
      feed.appendChild(div);
      feed.scrollTop = feed.scrollHeight;
      if (ev.type === 'death' || ev.type === 'win') {
        this.renderPlayers();
        this.updateHUD();
      }
      if (ev.type === 'notice' && isMine) this.renderNotes();
      if (ev.type === 'win') { this.renderLog(); return; }
      await this.wait(speed);
    }
    this.renderLog();
  },

  wait(ms) { return new Promise(r => setTimeout(r, ms)); },

  setBanner(html) { this.$('stage-banner').innerHTML = `<span class="prompt-icon">▸</span>${html}`; },
  clearStage() { this.$('speech-stage').innerHTML = ''; this.$('action-area').innerHTML = ''; },

  /* ---------- 发言展示（打字机） ---------- */
  async showSpeeches(speeches) {
    const stage = this.$('speech-stage');
    stage.innerHTML = '<div class="intel-label" style="color:var(--good)">// 公开讨论记录</div>';
    for (const s of speeches) {
      const bubble = document.createElement('div');
      bubble.className = `speech-bubble ${s.camp}`;
      bubble.style.setProperty('--c', CAMPS[s.camp].color);
      bubble.innerHTML = `<div class="sp-name" style="color:${CAMPS[s.camp].color}">${s.name}</div><div class="sp-text"></div>`;
      stage.appendChild(bubble);
      const textEl = bubble.querySelector('.sp-text');
      for (let i = 1; i <= s.text.length; i++) {
        textEl.textContent = s.text.slice(0, i);
        if (i % 2 === 0) await this.wait(14);
      }
      stage.scrollTop = stage.scrollHeight;
      await this.wait(140);
    }
  },

  /* ---------- 发言输入 ---------- */
  askSpeech() {
    return new Promise(resolve => {
      const area = this.$('action-area');
      area.innerHTML = `
        <div class="input-row">
          <textarea class="speech-input" id="speech-input" maxlength="100" placeholder="输入你的发言（最多100字）……"></textarea>
          <div class="char-count" id="char-count">0 / 100</div>
          <button class="neon-btn primary" id="speech-submit"><span>发言</span><span class="arrow">▶</span></button>
        </div>
        <div class="action-hint">ENTER 发送 · SHIFT+ENTER 换行 · 发言上限 100 字</div>`;
      const input = this.$('speech-input');
      const counter = this.$('char-count');
      input.focus();
      input.addEventListener('input', () => {
        counter.textContent = input.value.length + ' / 100';
        counter.classList.toggle('warn', input.value.length >= 95);
      });
      const submit = () => {
        const text = input.value;
        area.innerHTML = '';
        resolve(text);
      };
      this.$('speech-submit').addEventListener('click', submit);
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
      });
    });
  },

  /* ---------- 目标选择面板（通用） ---------- */
  askTarget({ title, desc, targets, allowSkip = true, needCamp = false, needText = false, extraHtml = '' }) {
    return new Promise(resolve => {
      const area = this.$('action-area');
      let selected = null, camp = null;
      const campBtns = needCamp ? `
        <div class="camp-choice">
          <button class="camp-btn" data-c="good">好人</button>
          <button class="camp-btn" data-c="evil">坏人</button>
          <button class="camp-btn" data-c="neutral">中立</button>
        </div>` : '';
      const textInput = needText ? `<input class="rewrite-input" id="rewrite-text" maxlength="100" placeholder="输入改写后的发言（留空则自动生成）…">` : '';
      area.innerHTML = `
        <div class="choice-panel">
          <div class="choice-title">${title}</div>
          <div class="choice-desc">${desc}</div>
          ${campBtns}
          ${textInput}
          ${extraHtml}
          ${targets && targets.length ? `<div class="target-list" id="target-list"></div>` : '<div class="choice-desc">（本技能无需指定目标）</div>'}
          <div class="choice-actions">
            ${allowSkip ? '<button class="neon-btn ghost" id="skip-btn"><span>跳过</span></button>' : ''}
            <button class="neon-btn primary" id="confirm-btn"><span>确认</span><span class="arrow">▶</span></button>
          </div>
        </div>`;

      if (targets && targets.length) {
        const list = this.$('target-list');
        targets.forEach(p => {
          const chip = document.createElement('div');
          chip.className = 'target-chip';
          chip.dataset.pid = p.id;
          const c = CAMPS[p.camp].color;
          chip.innerHTML = `<span class="tc-dot" style="background:${c}"></span>${p.name}<span style="color:var(--dim);font-size:10px">${Game.role(p).name}</span>`;
          chip.addEventListener('click', () => {
            list.querySelectorAll('.target-chip').forEach(x => x.classList.remove('selected'));
            chip.classList.add('selected');
            selected = p.id;
          });
          list.appendChild(chip);
        });
      }
      if (needCamp) {
        area.querySelectorAll('.camp-btn').forEach(b => {
          b.addEventListener('click', () => {
            area.querySelectorAll('.camp-btn').forEach(x => x.classList.remove('selected'));
            b.classList.add('selected');
            camp = b.dataset.c;
          });
        });
      }
      const finish = () => {
        const text = needText ? (this.$('rewrite-text')?.value || '') : '';
        area.innerHTML = '';
        resolve({ targetId: selected, camp, text });
      };
      this.$('confirm-btn').addEventListener('click', finish);
      if (allowSkip) this.$('skip-btn').addEventListener('click', () => { area.innerHTML = ''; resolve(null); });
    });
  },

  /* ---------- 模态框 ---------- */
  modal({ title, body, buttons }) {
    return new Promise(resolve => {
      const root = this.$('modal-root');
      const mask = document.createElement('div');
      mask.className = 'modal-mask';
      mask.innerHTML = `
        <div class="modal-box">
          <h3>${title}</h3>
          <p>${body}</p>
          <div class="modal-actions"></div>
        </div>`;
      const actions = mask.querySelector('.modal-actions');
      buttons.forEach(b => {
        const btn = document.createElement('button');
        btn.className = 'neon-btn ' + (b.style || 'ghost');
        btn.innerHTML = `<span>${b.label}</span>`;
        btn.addEventListener('click', () => { root.removeChild(mask); resolve(b.value); });
        actions.appendChild(btn);
      });
      root.appendChild(mask);
    });
  },

  /* ---------- 情报 ---------- */
  renderNotes() {
    const me = Game.human();
    const box = this.$('private-notes');
    if (!me.privateNotes.length) {
      box.innerHTML = '<div class="private-empty">暂无私密情报。使用技能以获取线索。</div>';
      return;
    }
    box.innerHTML = me.privateNotes.slice().reverse().map(n => `<div class="private-note">${n}</div>`).join('');
    box.scrollTop = 0;
  },

  renderLog() {
    const list = this.$('log-list');
    const logs = Game.state.log.filter(e => ['death','vote','system','win'].includes(e.type) && !e.secret);
    list.innerHTML = logs.slice(-40).reverse().map(e => {
      const cls = e.type === 'death' ? 'death' : '';
      return `<div class="log-item ${cls}">${e.text}</div>`;
    }).join('');
  },

  /* ---------- 结算 ---------- */
  renderEnd() {
    const st = Game.state;
    const win = st.winner;
    const me = Game.human();
    const playerWon = win.ids.includes(me.id) || (win.type !== 'neutral' && me.camp === win.type);
    this.$('end-banner').textContent = 'GAME OVER // FINAL VERDICT';
    const title = this.$('end-title');
    title.textContent = playerWon ? '胜 利' : '失 败';
    title.className = 'end-title ' + (playerWon ? 'win' : 'lose');
    this.$('end-desc').textContent = `${win.desc}　你的身份：${Game.role(me).name}·${Game.role(me).star}（${CAMPS[me.camp].short}）`;

    const roles = this.$('end-roles');
    st.players.forEach(p => {
      const role = Game.role(p);
      const camp = CAMPS[p.camp];
      const div = document.createElement('div');
      div.className = 'end-role' + (p.isHuman ? ' me' : '');
      div.style.setProperty('--c', camp.color);
      div.innerHTML = `
        <img src="${role.img}" alt="">
        <b>${p.name}${p.isHuman ? '（你）' : ''}</b>
        <span>${role.name}·${role.star} / ${camp.short}</span>`;
      roles.appendChild(div);
    });
    this.show('end-screen');
  }
};
