/* ============================================================
 * YOCIM-STAR · data.js
 * 角色 / 技能 / 阵营配比 / 文案库
 * 纯全局对象，兼容 file:// 直接打开
 * ============================================================ */

// ---------- 阵营 ----------
const CAMPS = {
  good:    { id: 'good',    name: '蓝色星空', short: '好人', color: '#00e5ff', glow: 'rgba(0,229,255,.55)', emblem: '✦' },
  evil:    { id: 'evil',    name: '红色星空', short: '坏人', color: '#ff2d55', glow: 'rgba(255,45,85,.55)',  emblem: '✧' },
  neutral: { id: 'neutral', name: '金色星空', short: '中立', color: '#ffd700', glow: 'rgba(255,215,0,.55)',  emblem: '✶' }
};

// 技能频率：perRound 每回合 / perGame 每局 / passive 被动
// 阶段：night 夜晚 / day 白天(投票阶段) / passive 触发
const ROLES = [
  // ============ 蓝色星空 · 好人 ============
  {
    id: 'detective', name: '侦探', star: '天宿星', camp: 'good', gender: 'male',
    img: 'public/侦探-天宿星.webp',
    title: '蛛丝马迹',
    skill: { id: 'investigate', name: '蛛丝马迹', freq: 'perRound', uses: Infinity,
             phase: 'night', target: 'single',
             desc: '查验一名玩家的身份阵营（好人 / 坏人 / 中立）。每回合可用一次。' }
  },
  {
    id: 'monarch', name: '君主', star: '天权星', camp: 'good', gender: 'male',
    img: 'public/君主-天宿星.webp',
    title: '独断专行',
    skill: { id: 'voidVote', name: '独断专行', freq: 'perGame', uses: 2,
             phase: 'day', target: 'none',
             desc: '使用技能后，本场投票作废，无人被放逐。每局可用两次。' }
  },
  {
    id: 'priest', name: '牧师', star: '天光星', camp: 'good', gender: 'male',
    img: 'public/牧师-天光星.webp',
    title: '苏生祷告',
    skill: { id: 'revive', name: '苏生祷告', freq: 'perGame', uses: 1,
             phase: 'night', target: 'dead',
             desc: '复活一名已死亡的玩家。每局仅可一次。' }
  },
  {
    id: 'knight', name: '骑士', star: '天盾星', camp: 'good', gender: 'male',
    img: 'public/骑士-天盾星.webp',
    title: '骑士精神',
    skill: { id: 'protect', name: '骑士精神', freq: 'perRound', uses: Infinity,
             phase: 'night', target: 'single',
             desc: '指定保护一位玩家，使其本夜不受任何伤害。每回合可用一次。' }
  },
  {
    id: 'poet', name: '诗人', star: '天妄星', camp: 'good', gender: 'male',
    img: 'public/诗人-天妄星.webp',
    title: '吟游诗人',
    skill: { id: 'damageTransfer', name: '吟游诗人', freq: 'passive', uses: 2,
             phase: 'passive', target: 'auto',
             desc: '被动：受到致命伤害时，有 50% 概率将伤害转移给其他玩家。最多触发两次。' }
  },
  {
    id: 'judge', name: '判官', star: '天衡星', camp: 'good', gender: 'male',
    img: 'public/判官-天衡星.webp',
    title: '审判之日',
    skill: { id: 'judge', name: '审判之日', freq: 'perGame', uses: 1,
             phase: 'night', target: 'single',
             desc: '指定一名玩家并指认其阵营。指认成功，对方直接出局；指认失败，技能失效。每局一次。' }
  },

  // ============ 红色星空 · 坏人 ============
  {
    id: 'assassin', name: '刺客', star: '地杀星', camp: 'evil', gender: 'male',
    img: 'public/刺客-地杀星.webp',
    title: '暗杀行动',
    skill: { id: 'attack', name: '暗杀行动', freq: 'perRound', uses: Infinity, cooldown: 1,
             phase: 'night', target: 'single',
             desc: '指定攻击一名玩家。若成功，进入一回合冷却；若失败，无冷却。' }
  },
  {
    id: 'madman', name: '狂人', star: '地爆星', camp: 'evil', gender: 'male',
    img: 'public/狂人-地爆星.webp',
    title: '爆破狂人',
    skill: { id: 'deathChain', name: '爆破狂人', freq: 'passive', uses: 1,
             phase: 'passive', target: 'single',
             desc: '被动：死亡后，选择一位玩家与其一同出局。一局最多一次。' }
  },
  {
    id: 'enchantress', name: '魅影', star: '地灵星', camp: 'evil', gender: 'female',
    img: 'public/魅影-地灵星.webp',
    title: '勾魂摄魄',
    skill: { id: 'voteRedirect', name: '勾魂摄魄', freq: 'perGame', uses: 2,
             phase: 'night', target: 'single',
             desc: '使用后，下一回合投给自己的票会转移到指定的玩家身上。一局两次。' }
  },
  {
    id: 'poisoner', name: '毒师', star: '地咒星', camp: 'evil', gender: 'male',
    img: 'public/毒师-地咒星.webp',
    title: '毒药炼制',
    skill: { id: 'poison', name: '毒药炼制', freq: 'perGame', uses: 1,
             phase: 'night', target: 'single',
             desc: '标记一名玩家，被标记者将在 3 回合后毒发死亡。一局一次。' }
  },
  {
    id: 'spy', name: '间谍', star: '地策星', camp: 'evil', gender: 'male',
    img: 'public/间谍-地煞星.webp',
    title: '双生假面',
    skill: { id: 'spy', name: '双生假面', freq: 'passive', uses: 1,
             phase: 'passive', target: 'auto',
             desc: '被动：不会被地杀星（刺客）杀死，一局一次；被侦探查验时显示好人，一局一次。' }
  },
  {
    id: 'gambler', name: '赌徒', star: '地煞星', camp: 'evil', gender: 'male',
    img: 'public/赌徒-地煞星.webp',
    title: '生命赌注',
    skill: { id: 'bet', name: '生命赌注', freq: 'perGame', uses: 1,
             phase: 'night', target: 'single',
             desc: '绑定一名玩家。该玩家出局或死亡时，自己代替其死亡。一局一次。' }
  },

  // ============ 金色星空 · 中立 ============
  {
    id: 'flame', name: '流焰', star: '熠阳', camp: 'neutral', gender: 'female',
    img: 'public/流焰-熠阳.webp',
    title: '言论操纵',
    skill: { id: 'rewrite', name: '言论操纵', freq: 'perRound', uses: Infinity,
             phase: 'night', target: 'single',
             desc: '改写一名玩家的文字发言。被改写的玩家会收到通知（只有他自己知道）。每回合一次。',
             win: '成功改写发言 ≥3 次且存活至游戏结束' }
  },
  {
    id: 'frost', name: '寒霜', star: '曦月', camp: 'neutral', gender: 'female',
    img: 'public/寒霜-曦月.webp',
    title: '缄默不语',
    skill: { id: 'silence', name: '缄默不语', freq: 'perGame', uses: 1,
             phase: 'night', target: 'none',
             desc: '使用后，全场禁言一回合，会有播报。每局一次。',
             win: '成功发动全场禁言 ≥2 次且存活至游戏结束' }
  }
];

const ROLE_MAP = {};
ROLES.forEach(r => ROLE_MAP[r.id] = r);

// ---------- 人数配比（好 / 坏 / 中） ----------
const SETUPS = {
  6:  { good: 3, evil: 2, neutral: 1 },
  8:  { good: 4, evil: 3, neutral: 1 },
  10: { good: 5, evil: 3, neutral: 2 },
  12: { good: 6, evil: 4, neutral: 2 },
  14: { good: 6, evil: 6, neutral: 2 }
};

// ---------- AI 名字库 ----------
const NAME_POOL = [
  '零号', '夜枭', '银翼', '灰烬', '脉冲', '霓虹', '残响', '夜莺',
  '逆熵', '浮光', '霜刃', '弦月', '赤霄', '青鸟', '孤星', '白噪',
  '棱镜', '涡流', '断点', '幽蓝', '赤瞳', '苍穹'
];

// ---------- 事件播报文案 ----------
const FLAVOR = {
  nightFall: [
    '城市霓虹熄灭，星空协议启动。',
    '终端接入……夜晚降临，行动开始。',
    '数据流静止，暗处的存在开始移动。'
  ],
  dawn: [
    '天光刺破数据雾，新的一天开始。',
    '系统重启，昨夜的痕迹被逐一读取。',
    '晨间播报已生成，请查阅昨夜结果。'
  ],
  noDeath: [
    '昨夜风平浪静，无人生还……啊不，无人死亡。',
    '扫描完成：昨夜没有伤亡记录。',
    '昨夜一切正常，星空保持沉默。'
  ],
  death: (names) => `昨夜，${names.join('、')} 的生命信号已中断。`,
  exile: (name) => `${name} 被放逐出星空。`,
  tied: '票数相同，无人被放逐。',
  voided: '君主发动【独断专行】，本场投票作废！',
  silenced: '寒霜发动【缄默不语】，今日全场禁言，播报强制开启！',
  poisoned: (name) => `${name} 毒发身亡，系统检测到异常毒素反应。`,
  revived: (name) => `${name} 的生命信号被重新点亮——牧师发动了【苏生祷告】。`
};

// ---------- AI 发言模板 ----------
// 占位符：{self} {target} {camp} {role} {n} {death}
const SPEECH = {
  good: {
    opening: [
      '我是{role}，先说一句：这局我{lead}，大家别急着带节奏。',
      '开场报个身份，{role}。夜里我没看到什么，先听你们说。',
      '{role}在此。昨夜{death}，我觉得这信息挺关键。',
      '我是{role}，先排除干扰项。{sus}的行动逻辑不太对。'
    ],
    lead: ['在看', '有点头绪', '暂时没思路', '盯上了一个人'],
    accuse: [
      '我怀疑{sus}，投他这票我不后悔。',
      '{sus}刚才的话前后矛盾，谁注意到没？',
      '按票型看，{sus} Problem最大，建议集火。',
      '我昨天查到{role}阵营的气息……直说我怀疑{sus}。'
    ],
    defend: [
      '别打我，我是{role}，查我等于浪费一回合。',
      '我这张牌很干净，{sus}才是问题所在。',
      '真要有问题，我活不到现在还报身份。'
    ],
    vote: [
      '这票我投{sus}，理由就是上面说的。',
      '我跟票{sus}，逻辑闭环了。',
      '投{sus}，剩下的下回合再说。'
    ]
  },
  evil: {
    opening: [
      '我是{role}，好人别乱投啊，{sus}看着才像狼。',
      '报个身份，{role}。昨晚我旁边动静挺大，注意{sus}。',
      '各位别急着站队，我先观察，{sus}太急了。',
      '{role}路过，今天风向怪怪的，我信{sus}。'
    ],
    accuse: [
      '说真的{sus}最可疑，一直没发声，藏什么呢？',
      '我不装了，{sus}就是坏人，投他。',
      '{sus}刚才那句话说漏了，你们品品。',
      '我拿身份担保，{sus}绝对有问题。'
    ],
    defend: [
      '我是好人，你们投我以后别后悔。',
      '搞什么，我全程在做事，{sus}才是真凶吧。',
      '冤枉啊，我要是坏人早赢了。'
    ],
    vote: [
      '投{sus}，我跟大部分人走。',
      '这票给{sus}，别投错。',
      '算了，随大流投{sus}。'
    ]
  },
  neutral: {
    opening: [
      '我？路过的，{role}罢了，你们聊你们的。',
      '身份先不报，这局我想看戏。',
      '我只是来凑个热闹，{sus}别看我。'
    ],
    accuse: [
      '{sus}吧，我也没什么依据，直觉。',
      '你们说的都有理，我倾向{sus}。',
      '随便投投，{sus}看起来不太顺眼。'
    ],
    defend: [
      '我无所谓啊，投我也行，别耽误事。',
      '我这身份说了你们也不信，算了。'
    ],
    vote: [
      '投{sus}，就这样。',
      '我跟{sus}。'
    ]
  }
};

// ---------- 工具 ----------
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function clampText(s, n = 100) {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) : s;
}
