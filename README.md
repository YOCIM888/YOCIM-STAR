# YOCIM-STAR · 星空疑云

**赛博朋克风格的在线卡牌推理游戏（类狼人杀）· A cyberpunk social-deduction card game (like Werewolf / Mafia).**

[![Deploy](https://github.com/YOCIM888/YOCIM-STAR/actions/workflows/deploy.yml/badge.svg)](https://github.com/YOCIM888/YOCIM-STAR/actions/workflows/deploy.yml)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)

**在线试玩 / Play online:** [https://star.yocim.top](https://star.yocim.top)

---

## 中文

星空疑云是一款纯前端、打开浏览器即可游玩的卡牌推理游戏。14 张角色卡分属三大阵营，玩家在「夜晚暗中发动技能 → 白天轮流发言 → 投票放逐」的循环里推理身份、合作或欺骗，直到某一方取得胜利。

### 玩法
- **阵营**：蓝色星空（好人）、红色星空（坏人）、金色星空（中立）。
- **流程**：夜晚特殊角色结算技能 → 白天公布结果并轮流发言（每人 100 字以内）→ 投票放逐一人 → 检查胜负 → 下一回合。
- **人数**：支持 6 / 8 / 10 / 12 / 14 人局，阵营按人数平衡配比，身份随机分配。
- **胜负**：好人全灭坏人获胜；坏人数量压过好人则坏人获胜；中立需活到终局并完成个人目标。

### 角色
- **蓝色星空**：侦探（查验身份）、君主（作废投票）、牧师（复活）、骑士（保护）、诗人（伤害转移）、判官（指认出局）。
- **红色星空**：刺客（暗杀）、狂人（死亡拉人）、魅影（转移选票）、毒师（延迟毒发）、间谍（免死 / 伪装查验）、赌徒（替死）。
- **金色星空**：流焰（改写发言）、寒霜（全场禁言）。

### AI 托管模式
无需 AI 也可玩：内置本地 AI 默认接管其余角色。也可在游戏内「AI 托管设置」中填入 API Key，让真实大模型接管指定角色卡（最多 13 个）。每个 AI 角色拥有**独立会话与记忆**，只知道自己的身份与公开信息；每局开始自动清空，绝不跨局记忆。开启「思考透视」后可点击 AI 角色卡查看其思考过程。发言始终限制在 100 字以内。

### 本地运行
纯静态项目，无需构建。直接双击 `index.html` 即可打开；或启动任意静态服务器：

```bash
# 例如使用 Python
python -m http.server 8000
# 然后访问 http://localhost:8000
```

### 技术栈
原生 HTML + CSS + JavaScript，无框架、无构建步骤。GitHub Actions 自动部署到 GitHub Pages，自定义域名 `star.yocim.top`，强制 HTTPS。

### 许可证
[ISC License](LICENSE) © 2026 YOCIM

---

## English

YOCIM-STAR is a browser-based social-deduction card game. Fourteen role cards are split among three factions. Players cycle through **nighttime secret abilities → daytime speeches → exile voting** to deduce identities and cooperate or deceive until one side wins.

### Gameplay
- **Factions**: Blue Star (good), Red Star (evil), Gold Star (neutral).
- **Flow**: Night — special roles resolve abilities → Day — results are announced and players speak in turn (max 100 characters each) → vote to exile one player → check win conditions → next round.
- **Player counts**: 6 / 8 / 10 / 12 / 14 players, with balanced faction ratios and random role assignment.
- **Victory**: Good wins by eliminating all evil; evil wins when its numbers match or exceed good; neutrals must survive to the endgame and complete their personal goals.

### Roles
- **Blue Star**: Detective (investigate), Monarch (void vote), Priest (revive), Knight (protect), Poet (damage transfer), Judge (accuse & execute).
- **Red Star**: Assassin (kill), Madman (death chain), Enchantress (vote redirect), Poisoner (delayed poison), Spy (immune / fake innocent), Gambler (sacrifice).
- **Gold Star**: Flame (rewrite speech), Frost (global silence).

### AI Mode
Playable without any API key — a built-in local AI controls the other roles by default. You can also enter an API key in the in-game "AI Hosting Settings" to let a real LLM take over specific role cards (up to 13). Each AI role has an **independent session and memory**, knows only its own identity and public information, and is fully wiped at the start of every game — no cross-game memory. Enable "Thought Vision" to click an AI role card and read its reasoning. Speeches are always capped at 100 characters.

### Run locally
Pure static site, no build step. Open `index.html` directly, or serve it with any static server:

```bash
python -m http.server 8000
# then visit http://localhost:8000
```

### Tech stack
Vanilla HTML + CSS + JavaScript — no framework, no build. Auto-deployed to GitHub Pages via GitHub Actions, custom domain `star.yocim.top`, HTTPS enforced.

### License
[ISC License](LICENSE) © 2026 YOCIM
