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
    const reviewBtn = this.$('review-btn');
    if (reviewBtn) reviewBtn.addEventListener('click', () => {
      if (typeof Review !== 'undefined') Review.run();
    });

    // AI 设置入口 / 历史发言
    this.$('settings-entry').addEventListener('click', () => Settings.openPanel());
    this.$('hud-settings').addEventListener('click', () => Settings.openPanel());
    const histBtn = this.$('history-btn');
    if (histBtn) histBtn.addEventListener('click', () => this.showSpeechHistory());
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
      card.className = `player-card ${p.alive ? '' : 'dead'}`;
      if (selectableIds && selectableIds.includes(p.id)) card.classList.add('selectable');
      if (selectedIds.includes(p.id)) card.classList.add('chosen');
      card.dataset.pid = p.id;

      const showRole = !p.alive || p.isHuman || revealAll;
      const hosted = !p.isHuman && Settings.isLLMHosted(p.roleId);
      // 阵营色只在身份公开（死亡亮牌/自己/结算）时显示，避免提前泄露
      if (showRole) card.classList.add(p.camp);
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
        </div>`;
      grid.appendChild(card);
    });
    if (typeof ThoughtFab !== 'undefined') ThoughtFab.sync();
  },

  /* ---------- 历史发言面板 ---------- */
  showSpeechHistory() {
    const hist = (Game.state && Game.state.speechHistory) || [];
    let body;
    if (!hist.length) {
      body = '<div class="thought-empty">还没有已结束的发言回合。</div>';
    } else {
      body = '<div class="history-list">' + hist.slice().reverse().map(h => `
        <div class="hist-round">
          <div class="hist-round-title">◆ 第 ${h.round} 回合</div>
          ${h.speeches.map(s => `<div class="hist-line"><b>${Settings.esc(s.name)}</b><span>${Settings.esc(s.text)}</span></div>`).join('')}
        </div>`).join('') + '</div>';
    }
    this.modal({ title: '历史发言记录', body, buttons: [{ label: '关闭', value: false }] });
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

  /* ---------- 单条发言展示（打字机，放慢节奏，不带阵营信息） ---------- */
  async showSpeech(s, first = false) {
    const stage = this.$('speech-stage');
    if (first) stage.innerHTML = '<div class="intel-label" style="color:var(--good)">// 公开讨论记录</div>';
    const bubble = document.createElement('div');
    bubble.className = 'speech-bubble'; // 不附带阵营 class，避免泄露身份
    bubble.innerHTML = `<div class="sp-name">${Settings.esc(s.name)}${s.isHuman ? '<span class="me-tag">YOU</span>' : ''}</div><div class="sp-text"></div>`;
    stage.appendChild(bubble);
    const textEl = bubble.querySelector('.sp-text');
    for (let i = 1; i <= s.text.length; i++) {
      textEl.textContent = s.text.slice(0, i);
      await this.wait(20); // 每字 20ms，100 字约 2 秒，看清节奏
    }
    stage.scrollTop = stage.scrollHeight;
    await this.wait(260); // 发言之间停顿，便于消化
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
          // 只显示昵称，绝不显示身份/阵营（否则投票等于明牌）
          chip.innerHTML = `<span class="tc-dot" style="background:var(--good)"></span>${Settings.esc(p.name)}`;
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
    const isDraw = win.type === 'draw';
    const playerWon = isDraw ? null : (win.ids.includes(me.id) || (win.type !== 'neutral' && me.camp === win.type));
    this.$('end-banner').textContent = 'GAME OVER // FINAL VERDICT';
    const title = this.$('end-title');
    title.textContent = isDraw ? '平 局' : (playerWon ? '胜 利' : '失 败');
    title.className = 'end-title ' + (isDraw ? 'draw' : (playerWon ? 'win' : 'lose'));
    this.$('end-desc').textContent = `${win.desc}　你的身份：${Game.role(me).name}·${Game.role(me).star}（${CAMPS[me.camp].short}）`;

    const roles = this.$('end-roles');
    roles.innerHTML = '';
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

/* ============================================================
 * 思考透视 · 可拖动悬浮球 + 浮窗（按回合依次显示所有 AI 的思考）
 * ============================================================ */
const ThoughtFab = {
  ball: null, panel: null, open: false,
  dragging: false, moved: false, sx: 0, sy: 0, ox: 0, oy: 0,

  init() {
    this.ball = document.getElementById('thought-fab');
    this.panel = document.getElementById('thought-panel');
    if (!this.ball || !this.panel) return;
    this.ball.addEventListener('mousedown', e => this.down(e));
    this.ball.addEventListener('touchstart', e => this.down(e), { passive: false });
    window.addEventListener('mousemove', e => this.move(e));
    window.addEventListener('touchmove', e => this.move(e), { passive: false });
    window.addEventListener('mouseup', () => this.up());
    window.addEventListener('touchend', () => this.up());
    const close = this.panel.querySelector('.tf-close');
    if (close) close.addEventListener('click', () => this.hide());
    this.sync();
  },

  // 仅在开启思考透视、且有托管 AI、且对局进行时显示
  sync() {
    const st = Game.state;
    const hasAI = typeof SessionManager !== 'undefined' && Object.keys(SessionManager.sessions || {}).length > 0;
    // 结算后也保留，方便回顾整局全部思考
    const show = !!(Settings.data.thoughtVision && hasAI && st);
    if (this.ball) this.ball.classList.toggle('show', show);
    if (!show) this.hide();
    else if (this.open) this.render();
  },

  down(e) {
    if (!this.ball || !this.ball.classList.contains('show')) return;
    this.dragging = true; this.moved = false;
    const t = e.touches ? e.touches[0] : e;
    this.sx = t.clientX; this.sy = t.clientY;
    const r = this.ball.getBoundingClientRect();
    this.ox = r.left; this.oy = r.top;
    e.preventDefault();
  },
  move(e) {
    if (!this.dragging) return;
    const t = e.touches ? e.touches[0] : e;
    const dx = t.clientX - this.sx, dy = t.clientY - this.sy;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) this.moved = true;
    const x = Math.max(4, Math.min(window.innerWidth - 52, this.ox + dx));
    const y = Math.max(4, Math.min(window.innerHeight - 52, this.oy + dy));
    this.ball.style.left = x + 'px';
    this.ball.style.top = y + 'px';
    e.preventDefault();
  },
  up() {
    if (!this.dragging) return;
    this.dragging = false;
    if (!this.moved) this.toggle();
  },
  toggle() { this.open ? this.hide() : this.show(); },

  show() {
    if (!this.ball || !this.ball.classList.contains('show')) return;
    this.render();
    this.panel.classList.add('show');
    this.open = true;
  },
  hide() {
    if (!this.panel) return;
    this.panel.classList.remove('show');
    this.open = false;
  },

  collect() {
    const all = [];
    Object.values(SessionManager.sessions || {}).forEach(s => {
      (s.thoughts || []).forEach(t => all.push(t));
    });
    all.sort((a, b) => (a.round - b.round) || (a.at - b.at));
    return all;
  },

  render() {
    const body = this.panel.querySelector('.tf-body');
    if (!body) return;
    const list = this.collect();
    if (!list.length) {
      body.innerHTML = '<div class="thought-empty">暂无思考记录。AI 行动后，这里会按回合依次显示。</div>';
      return;
    }
    body.innerHTML = list.map(t => `
      <div class="tf-item">
        <div class="tf-meta">第 ${t.round} 回合 · ${this.actionName(t.action)} · ${Settings.esc(t.name || '')}</div>
        <div class="tf-text">${Settings.esc(t.text || '（模型未返回思考内容）')}</div>
      </div>`).join('');
    body.scrollTop = body.scrollHeight;
  },

  actionName(a) {
    return ({ speech: '发言', night: '夜晚技能', vote: '投票', voidVote: '作废投票', deathChain: '死亡连锁', revive: '复活' })[a] || (a || '决策');
  }
};
