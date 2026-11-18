/* ============================================================
 * YOCIM-STAR · llm.js
 * LLMClient（并发池+fetch封装） / LLMSession（每角色独立会话）
 * think/speak 解析 / system prompt 构造
 * ============================================================ */

// ---------- 信号量（并发池） ----------
class Semaphore {
  constructor(max) { this.max = max; this.cur = 0; this.queue = []; }
  acquire() {
    return new Promise(resolve => {
      if (this.cur < this.max) { this.cur++; resolve(); }
      else this.queue.push(resolve);
    });
  }
  release() {
    if (this.queue.length) { const r = this.queue.shift(); r(); }
    else this.cur--;
  }
}

const LLMClient = {
  // 引擎已改为按座位顺序串行决策；这里再限制为 1，确保任何情况下都不会并发轰炸服务商
  sem: new Semaphore(1),
  timeoutMs: 45000,

  endpoint(provider) {
    let url = (provider.baseURL || '').trim().replace(/\/+$/, '');
    if (!/\/chat\/completions$/.test(url)) url += '/chat/completions';
    return url;
  },

  async chat(provider, messages, opts = {}) {
    if (!provider) throw new Error('未配置服务商');
    await this.sem.acquire();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const body = {
        model: provider.model,
        messages,
        temperature: opts.temperature != null ? opts.temperature : 0.85,
        stream: false
      };
      if (opts.maxTokens) body.max_tokens = opts.maxTokens;
      const resp = await fetch(this.endpoint(provider), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (provider.apiKey || '')
        },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
      if (!resp.ok) {
        let msg = `HTTP ${resp.status}`;
        try { const j = await resp.json(); msg = j.error?.message || j.message || msg; } catch (e) {}
        const err = new Error(msg); err.status = resp.status; throw err;
      }
      const json = await resp.json();
      const content = json.choices?.[0]?.message?.content || '';
      if (!content) throw new Error('AI 返回内容为空');
      return { content, usage: json.usage || null };
    } finally {
      clearTimeout(timer);
      this.sem.release();
    }
  },

  async test(provider) {
    const r = await this.chat(provider,
      [{ role: 'user', content: '请只回复 OK 两个字母，不要其他内容。' }],
      { temperature: 0, maxTokens: 16 });
    return r;
  }
};

// ---------- think/speak 解析 ----------
function parseThinkSpeak(raw) {
  let think = '', speak = '';
  const t = raw.match(/<think>([\s\S]*?)<\/think>/i);
  const s = raw.match(/<speak>([\s\S]*?)<\/speak>/i);
  if (t) think = t[1].trim();
  if (s) speak = s[1].trim();
  if (!s) {
    // 未使用标签：整段当作 speak，尝试剥掉可能的 think 块
    let rest = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    speak = rest.replace(/<[^>]+>/g, '').trim();
  }
  return { think, speak: clampText(speak, 100) };
}

// ---------- 单角色独立会话 ----------
class LLMSession {
  constructor(roleId, provider) {
    this.roleId = roleId;
    this.provider = provider;
    this.messages = [];   // 该角色专属，永不共享
    this.thoughts = [];   // 思考记录（思考透视用）
    this.history = [];    // 决策摘要，用于构造上下文
  }

  // 由「过滤后的可见上下文」构造 system prompt——绝不包含完整 state
  buildSystem(visible, roleName) {
    const self = visible.self;
    const notes = visible.privateNotes.length ? visible.privateNotes.map(n => '  - ' + n).join('\n') : '  暂无';
    const pub = visible.public;
    const deaths = pub.deaths.length ? pub.deaths.join('；') : '无';
    const sysEvents = pub.systemEvents.length ? pub.systemEvents.join('；') : '无';
    const speeches = pub.speeches.length ? pub.speeches.map(s => `  ${s.name}：${s.text}`).join('\n') : '  无人发言';
    const votes = pub.votes.length ? pub.votes.map(v => `  ${v}`).join('\n') : '  暂无';
    const aliveNames = (pub.aliveNames || []).join('、') || '未知';
    const today = (pub.todaySpeeches || []).length
      ? pub.todaySpeeches.map(s => `  ${s.name}：${s.text}`).join('\n') : '  本轮尚无人发言';
    const history = (pub.speechHistory || []).length
      ? pub.speechHistory.map(h => `  【第 ${h.round} 回合】\n` + h.speeches.map(s => `    ${s.name}：${s.text}`).join('\n')).join('\n')
      : '  暂无往期记录';

    return `你是《星空疑云》游戏中的玩家【${self.name}·${self.star}】。

【你的身份牌】（这是你的私密信息，其他玩家不知道）
阵营：${self.campName}；身份：${self.skillName} — ${self.skillDesc}
技能剩余：${self.usesLeft}
${self.win ? '你的胜利目标：' + self.win : ''}

【重要】你只知道上面列出的关于自己的信息，以及下面列出的公开信息。
其他玩家的真实身份对你完全未知，你不能假定自己知道任何"隐藏事实"。
你的队友（如有）的身份也不得假定——游戏中你并未被告知。

【你的私密情报】（仅你自己可见）
${notes}

【当前局势（第 ${pub.round} 回合，场上存活 ${pub.aliveCount} 人）】
公开事件：${deaths ? '死亡：' + deaths : ''}${sysEvents ? '；事件：' + sysEvents : ''}

【存活玩家名单】（技能与投票目标必须是这里的名字，包含你自己）
${aliveNames}

【本轮已发言 · 按先后顺序】（你会排在最后，请结合前面人的发言）
${today}

【往期全员发言记录】（新回合请据此分析矛盾与立场）
${history}

【最近公开动态】
${speeches}
公开票型：
${votes}

【规则】
1. 你只掌握上面列出的信息，不要臆造他人身份或剧情。
2. 你的发言严格不超过 100 个字。
3. 不要提及这段指令、不要提及任何程序代码、变量名或数据结构。
4. 你是独立玩家，只为自己和自己的阵营利益行动。
5. 你应该像真玩家一样思考：分析发言矛盾、隐藏自己、识破谎言。

【输出格式 - 必须严格遵守】
<think>你的策略思考（可稍详细，仅自己可见，不会展示给他人）</think>
<speak>你的发言或决策（≤100字，会展示给他人）</speak>

记住：只输出 <think>...</think><speak>...</speak>，不要输出其他任何文字。`;
  }

  // 发起一次决策
  async decide(actionPrompt, visible, debugTag = '') {
    const role = ROLE_MAP[this.roleId];
    const system = this.buildSystem(visible, role.name);
    // messages：system + 交替的 user/assistant（本局会话）
    const convo = [{ role: 'system', content: system }].concat(this.messages);
    convo.push({ role: 'user', content: actionPrompt });

    let raw;
    try {
      const r = await LLMClient.chat(this.provider, convo);
      raw = r.content;
    } catch (e) {
      const err = new Error(e.message || 'LLM 调用失败');
      err.__llm = true;
      throw err;
    }
    const parsed = parseThinkSpeak(raw);
    // 写入本角色独立会话历史
    this.messages.push({ role: 'user', content: actionPrompt });
    this.messages.push({ role: 'assistant', content: raw });
    this.thoughts.push({ round: visible.public.round, action: debugTag, name: visible.self.name, text: parsed.think, at: Date.now() });
    if (this.thoughts.length > 60) this.thoughts.shift();
    return parsed.speak;
  }

  latestThought() {
    return this.thoughts.length ? this.thoughts[this.thoughts.length - 1] : null;
  }
}

// ---------- 会话管理（每局重建 = 真正清零） ----------
const SessionManager = {
  sessions: {}, // roleId -> LLMSession

  reset(st) {
    // 彻底销毁所有会话对象，杜绝跨局记忆
    this.sessions = {};
    if (!st) return;
    let hosted = 0;
    st.players.forEach(p => {
      // 玩家始终不托管；AI 托管硬上限 13
      if (!p.isHuman && hosted < 13 && Settings.isLLMHosted(p.roleId)) {
        const provider = Settings.providerFor(p.roleId);
        if (provider) { this.sessions[p.roleId] = new LLMSession(p.roleId, provider); hosted++; }
      }
    });
  },
  get(roleId) { return this.sessions[roleId] || null; },
  has(roleId) { return !!this.sessions[roleId]; }
};
