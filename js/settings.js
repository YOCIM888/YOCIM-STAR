/* ============================================================
 * YOCIM-STAR · settings.js
 * AI 托管设置：服务商预设 / 多Key / 角色托管 / 思考透视
 * 仅配置写入 localStorage，会话记忆不落盘
 * ============================================================ */

const PROVIDER_PRESETS = {
  deepseek: {
    name: 'DeepSeek', baseURL: 'https://api.deepseek.com/v1',
    models: ['deepseek-flash', 'deepseek-v4-pro'],
    note: '旧 deepseek-chat/reasoner 已停用'
  },
  qwen: {
    name: '通义千问 Qwen', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen3.8-flash', 'qwen3.7-plus', 'qwen3.8-max'],
    note: '国际站改用 dashscope-intl.aliyuncs.com'
  },
  kimi: {
    name: 'Kimi 月之暗面', baseURL: 'https://api.moonshot.cn/v1',
    models: ['kimi-k2.6'], note: '国际站改用 api.moonshot.ai'
  },
  minimax: {
    name: 'MiniMax', baseURL: 'https://api.minimax.cn/v1',
    models: ['MiniMax-M3'], note: '国际站改用 api.minimax.io'
  },
  glm: {
    name: '智谱 GLM', baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4.7', 'glm-4.7-flash'], note: ''
  },
  openai: {
    name: 'OpenAI / ChatGPT', baseURL: 'https://api.openai.com/v1',
    models: ['gpt-5.4-mini', 'gpt-5.4', 'gpt-5.5'], note: '需支持 /chat/completions'
  },
  custom: {
    name: '自定义接口', baseURL: '', models: [],
    note: '任意 OpenAI 兼容接口，如本地 Ollama: http://localhost:11434/v1'
  }
};

const LS_KEY = 'yocim-star-settings-v1';

const Settings = {
  data: { providers: [], assignment: {}, thoughtVision: false },

  /* ---------- 持久化 ---------- */
  load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        this.data = {
          providers: Array.isArray(d.providers) ? d.providers : [],
          assignment: d.assignment && typeof d.assignment === 'object' ? d.assignment : {},
          thoughtVision: !!d.thoughtVision
        };
      }
    } catch (e) { console.warn('设置读取失败，使用默认', e); }
    return this.data;
  },
  save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(this.data)); }
    catch (e) { console.warn('设置保存失败', e); }
  },

  /* ---------- 查询 ---------- */
  providerById(id) { return this.data.providers.find(p => p.id === id) || null; },
  hostedCount() { return Math.min(13, Object.values(this.data.assignment).filter(v => v && v !== 'local' && this.providerById(v)).length); },
  isLLMHosted(roleId) {
    const pid = this.data.assignment[roleId];
    return !!(pid && pid !== 'local' && this.providerById(pid));
  },
  providerFor(roleId) { return this.providerById(this.data.assignment[roleId]); },

  /* ---------- 设置面板 ---------- */
  openPanel() {
    this.renderPanel();
    const root = document.getElementById('settings-root');
    root.style.display = 'block';
  },
  closePanel() {
    const root = document.getElementById('settings-root');
    root.style.display = 'none';
  },

  renderPanel() {
    const root = document.getElementById('settings-root');
    const d = this.data;
    const presetOptions = Object.keys(PROVIDER_PRESETS).map(k =>
      `<option value="${k}">${PROVIDER_PRESETS[k].name}</option>`).join('');

    const providerCards = d.providers.map((p, i) => this.providerCardHTML(p, i, presetOptions)).join('');

    // 角色托管矩阵
    const assignOptions = `<option value="local">本地AI</option>` +
      d.providers.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    const roleRows = ROLES.map(r => {
      const cur = d.assignment[r.id] || 'local';
      const opts = assignOptions.replace(`value="${cur}"`, `value="${cur}" selected`);
      const camp = CAMPS[r.camp];
      return `<div class="assign-row">
        <img src="${r.img}" alt="">
        <div class="assign-name"><b>${r.name}·${r.star}</b><span style="color:${camp.color}">${camp.short}</span></div>
        <select data-role="${r.id}">${opts}</select>
      </div>`;
    }).join('');

    root.innerHTML = `
      <div class="settings-mask" id="settings-mask"></div>
      <div class="settings-panel">
        <div class="settings-head">
          <div>
            <div class="settings-title">AI 托管设置</div>
            <div class="settings-sub">OPENAI-COMPATIBLE PROVIDERS // 浏览器直连 · Key 仅本机使用</div>
          </div>
          <button class="settings-close" id="settings-close">✕</button>
        </div>
        <div class="settings-body">
          <div class="settings-section">
            <div class="section-head">
              <span>01 // 服务商配置</span>
              <button class="neon-btn ghost small" id="add-provider">+ 添加服务商</button>
            </div>
            <div id="provider-list">${providerCards || '<div class="empty-hint">尚未配置服务商。添加一个服务商即可接入 AI 托管。</div>'}</div>
          </div>

          <div class="settings-section">
            <div class="section-head">
              <span>02 // 角色托管</span>
              <span class="hosted-counter" id="hosted-counter">已托管 ${this.hostedCount()}/13</span>
            </div>
            <div class="assign-hint">每张角色卡可指定由哪家服务商的 AI 托管，上限 13 个（玩家始终保留 1 个自己操作）。未托管或使用「本地AI」的角色由内置启发式驱动。</div>
            <div class="assign-grid">${roleRows}</div>
          </div>

          <div class="settings-section">
            <div class="section-head"><span>03 // 高级</span></div>
            <label class="toggle-row">
              <input type="checkbox" id="thought-vision" ${d.thoughtVision ? 'checked' : ''}>
              <span class="toggle-switch"></span>
              <span class="toggle-label"><b>思考透视</b><small>开启后，游戏中点击任意 AI 托管角色的卡牌可查看其思考过程。默认关闭。</small></span>
            </label>
          </div>

          <div class="privacy-note">
            ⚠ 浏览器直连：API Key 仅保存在本机浏览器，直接发送给对应服务商，不经过任何第三方服务器、不写入日志、会话记忆每局清空。请勿在公用电脑保存主 Key。
          </div>
        </div>
        <div class="settings-foot">
          <button class="neon-btn ghost" id="settings-cancel">取消</button>
          <button class="neon-btn primary" id="settings-save"><span>保存设置</span><span class="arrow">▶</span></button>
        </div>
      </div>`;

    this.bindPanel();
  },

  providerCardHTML(p, i, presetOptions) {
    const preset = p.preset || 'custom';
    const modelList = PROVIDER_PRESETS[preset]?.models || [];
    const datalist = modelList.length
      ? `<datalist id="models-${p.id}">${modelList.map(m => `<option value="${m}">`).join('')}</datalist>` : '';
    return `<div class="provider-card" data-pid="${p.id}">
      <div class="pc-head">
        <select class="preset-sel">
          ${presetOptions.replace(`value="${preset}"`, `value="${preset}" selected`)}
        </select>
        <input class="provider-name" value="${this.esc(p.name)}" placeholder="配置名称">
        <button class="del-provider" title="删除">✕</button>
      </div>
      <div class="pc-row"><label>Base URL</label><input class="base-url" value="${this.esc(p.baseURL)}" placeholder="https://.../v1"></div>
      <div class="pc-row"><label>Model</label><input class="model-input" list="models-${p.id}" value="${this.esc(p.model)}" placeholder="模型名">${datalist}</div>
      <div class="pc-row"><label>API Key</label><input class="api-key" type="password" value="${this.esc(p.apiKey)}" placeholder="sk-..."></div>
      <div class="pc-foot">
        <span class="preset-note">${PROVIDER_PRESETS[preset]?.note || ''}</span>
        <button class="neon-btn ghost small test-conn">测试连接</button>
        <span class="test-result"></span>
      </div>
    </div>`;
  },

  bindPanel() {
    const root = document.getElementById('settings-root');
    const $ = sel => root.querySelector(sel);
    const $$ = sel => Array.from(root.querySelectorAll(sel));

    document.getElementById('settings-close').onclick = () => this.closePanel();
    document.getElementById('settings-mask').onclick = () => this.closePanel();
    document.getElementById('settings-cancel').onclick = () => this.closePanel();
    document.getElementById('settings-save').onclick = () => { if (this.collect()) this.closePanel(); };

    document.getElementById('add-provider').onclick = () => {
      const id = 'p' + Date.now().toString(36);
      this.data.providers.push({ id, preset: 'deepseek', name: '新配置', baseURL: PROVIDER_PRESETS.deepseek.baseURL, model: 'deepseek-flash', apiKey: '' });
      this.renderPanel();
      // 滚到新卡片
      const card = root.querySelector(`[data-pid="${id}"]`);
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    // 服务商卡片事件（事件委托）
    root.querySelector('#provider-list').addEventListener('input', e => this.collect());
    root.querySelector('#provider-list').addEventListener('change', e => {
      const card = e.target.closest('.provider-card');
      if (!card) return;
      if (e.target.classList.contains('preset-sel')) {
        // 切换预设：自动填 baseURL 和默认 model
        const pid = card.dataset.pid;
        const p = this.data.providers.find(x => x.id === pid);
        const preset = PROVIDER_PRESETS[e.target.value];
        if (p && preset) {
          p.preset = e.target.value;
          p.baseURL = preset.baseURL;
          p.model = preset.models[0] || '';
          this.renderPanel();
        }
      }
    });
    root.querySelector('#provider-list').addEventListener('click', async e => {
      const card = e.target.closest('.provider-card');
      if (!card) return;
      const pid = card.dataset.pid;
      if (e.target.classList.contains('del-provider')) {
        this.collect();
        this.data.providers = this.data.providers.filter(p => p.id !== pid);
        // 清除使用该服务商的托管
        Object.keys(this.data.assignment).forEach(k => { if (this.data.assignment[k] === pid) this.data.assignment[k] = 'local'; });
        this.renderPanel();
      }
      if (e.target.classList.contains('test-conn')) {
        this.collect();
        const p = this.providerById(pid);
        const resultEl = card.querySelector('.test-result');
        resultEl.textContent = '测试中...';
        try {
          await LLMClient.test(p);
          resultEl.innerHTML = '<span style="color:#00e5ff">✓ 连接成功</span>';
        } catch (err) {
          resultEl.innerHTML = `<span style="color:#ff2d55">✕ ${this.esc(err.message || '失败')}</span>`;
        }
      }
    });

    // 托管下拉
    $$('.assign-row select').forEach(sel => {
      sel.addEventListener('change', () => {
        this.collect();
        const cnt = this.hostedCount();
        if (cnt > 13) {
          // 超限：回退
          sel.value = 'local';
          this.collect();
          alert('最多托管 13 个角色（玩家需保留 1 个自己操作）。');
        }
        document.getElementById('hosted-counter').textContent = `已托管 ${this.hostedCount()}/13`;
      });
    });

    const tv = document.getElementById('thought-vision');
    tv.addEventListener('change', () => { this.data.thoughtVision = tv.checked; this.save(); });
  },

  // 从 DOM 收集配置到 data
  collect() {
    const root = document.getElementById('settings-root');
    if (!root) return true;
    Array.from(root.querySelectorAll('.provider-card')).forEach(card => {
      const p = this.data.providers.find(x => x.id === card.dataset.pid);
      if (!p) return;
      p.name = card.querySelector('.provider-name').value.trim() || '未命名';
      p.baseURL = card.querySelector('.base-url').value.trim();
      p.model = card.querySelector('.model-input').value.trim();
      p.apiKey = card.querySelector('.api-key').value.trim();
    });
    root.querySelectorAll('.assign-row select').forEach(sel => {
      this.data.assignment[sel.dataset.role] = sel.value;
    });
    const tv = root.querySelector('#thought-vision');
    if (tv) this.data.thoughtVision = tv.checked;
    this.save();
    return true;
  },

  esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
};
