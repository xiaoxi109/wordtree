# 移动端 App 交互设计

> **Workspace:** Unknown

---

**User**

Use plugin: trae-remote-official:rapid-prototype-craft怎么设计移动端的app交互

**Assistant**

The user wants to use the rapid-prototype-craft plugin to design mobile app interactions. Let me invoke the skill first to understand its capabilities, then help them design mobile app interactions.

Let me start by invoking the prototype-craft skill.

你触发了 rapid-prototype-craft 技能。在开始构建移动端交互原型之前，我需要明确目标，因为你的请求比较宽泛。

移动端 App 交互设计涵盖很多方向，不同的 App 类型交互模式差异很大。请告诉我你的场景：

好的，确定方案：**背单词 App，简洁现代风格，5-10 页完整多页原型**。

我先按技能流程加载设计规范参考，然后冻结设计契约再实现。

参考已加载。现在冻结设计契约并开始构建。

**技术栈判定**：移动端 App 交互原型，轻交互 + 多屏切换，采用**纯静态 HTML/CSS/JS（SPA 单页多屏）**——手机外壳 + 底部 Tab 作为 App Shell 只写一次，各屏内容切换主槽位。最贴合移动端原型且结构上杜绝导航漂移。

**设计契约要点**：
- 风格：极简现代（暖纸白底 + 深墨蓝主色 + 琥珀强调色，避开紫色渐变俗套）
- 字体：衬线展示字体（词典/编辑感）+ 无衬线正文
- App Shell：手机外壳 + 固定底部 Tab（首页/学习/统计/我的）
- 6 屏：首页、翻卡学习、答题测试、学习统计、词库、我的

让我建好任务清单并开始。

Let me write the design contract to a temp working directory, then build the prototype. Let me first check the directory structure.

Let me write the design contract file first, then build the project. I'll create the project folder under the delivery directory.

Delivery directory: C:\Users\sunxingba\Documents\Trae-CN\default
Project folder: C:\Users\sunxingba\Documents\Trae-CN\default\vocabulary-app\

Let me write the design contract to a temp location first. Actually, the skill says "Write it to a temp working directory (not polluting the delivery directory)". Let me use the temp dir.

Let me just write the contract to a temp location and then build. Actually, I'll keep the contract concise and write it to a temp file.

Let me proceed efficiently. I'll write the design contract to temp, then build the actual files.

---

**User**

继续

**Assistant**

继续。先冻结设计契约，再开始构建。

设计契约（已冻结，作为唯一视觉来源）：

- **风格**：极简现代 · 编辑/词典质感（warm paper-white + 深墨蓝主色 + 琥珀强调色，避开紫色渐变俗套）
- **技术栈**：纯静态 HTML/CSS/JS · SPA 单页多屏 · 离线可开
- **字体**：衬线展示（Noto Serif SC/Georgia 词典感）+ 无衬线正文（PingFang/系统）
- **图标**：Lucide 内联 SVG，零外部依赖
- **App Shell**：手机外壳（桌面端带边框居中，移动端全屏）+ 固定底部 Tab（首页/学习/统计/我的）+ 伪状态栏
- **6 屏**：首页 / 翻卡学习 / 答题测试 / 学习统计 / 词库 / 我的

先写设计契约到临时目录，然后开始构建项目文件。

契约已冻结。现在创建项目目录并开始写文件。先并行写 styles.css 和 mock.js。

现在写 mock.js 和 index.html。

现在写 index.html（App Shell + 6 屏容器）。

现在写 app.js（状态管理 + 各屏渲染 + 交互逻辑）。

文件全部写完。现在做静态自检。先更新进度，然后审查代码找问题。

审查发现几处需要修复的问题：

1. **学习完成重启逻辑冲突**：`showLearnComplete` 里改了 `dataset.go` 又立即移除，导致重启失效
2. **quiz 完成屏**引用了不存在的 `#quizHint`（实际是 class）
3. **深色模式**开关无对应 CSS，是空交互
4. **词库行点击**无响应（死交互）

逐一修复。

修复 #2：给 quiz-hint 加 id 并在完成屏更新它。

修复 #3：添加深色模式 CSS 覆盖。

修复 #4：词库行点击跳转到学习屏并提示。

还需在 `renderQuiz` 里重置 hint 文本，避免上一题残留。

还需处理一个交互问题：从首页点「继续学习」或 Tab 进入学习屏时，若上一轮已完成会停留在完成屏。进入学习屏时重置一轮新会话更符合演示体验。

自检完成。清理临时契约文件并确认项目结构。

The temp file path was wrong in my delete call. Let me use the correct path. The file was at `C:\Users\sunxingba\Documents\Trae-CN\default\.tmp-design-contract.md`. Let me delete it properly.

全部完成。更新任务状态并交付。

移动端背单词 App 交互原型已完成，静态自检通过。

[打开背单词 App 原型](computer://C:\Users\sunxingba\Documents\Trae-CN\default\vocab-app\index.html)

**项目结构**（纯静态，离线可开，零外部依赖）：
- [index.html](file:///C:/Users/sunxingba/Documents/Trae-CN/default/vocab-app/index.html) — App Shell（手机外壳 + 状态栏 + 底部 Tab）+ 6 屏容器
- [styles.css](file:///C:/Users/sunxingba/Documents/Trae-CN/default/vocab-app/styles.css) — 设计令牌 + 组件 + 深色模式
- [mock.js](file:///C:/Users/sunxingba/Documents/Trae-CN/default/vocab-app/mock.js) — 24 个真实单词数据 + API stub
- [app.js](file:///C:/Users/sunxingba/Documents/Trae-CN/default/vocab-app/app.js) — 状态管理 + 各屏渲染 + 交互

**设计方向**：极简现代 · 编辑/词典质感 —— 暖纸白底 + 深墨蓝主色 + 琥珀强调色，衬线字体展示单词（避开紫色渐变俗套），Lucide 内联 SVG 图标。

**6 屏交互**：
1. **首页** — 圆环进度、连续打卡天数、今日单词横滑预览、学习概览卡片、继续学习 CTA
2. **翻卡学习** — 3D 翻转卡片（点击翻面看释义/例句）、认识/不认识标记、进度条 + 记忆率、完成后可重启
3. **答题测试** — 单词释义四选一、即时正误反馈、计分、下一题/查看结果
4. **学习统计** — 本周柱状图、4 周打卡热力图、累计数据卡片
5. **词库** — 搜索（防抖）、状态筛选（全部/新词/学习中/已掌握）、单词列表点击跳转
6. **我的** — 个人资料、每日目标、学习提醒开关、深色模式开关（真实切换）、成就徽章

**可交互验证**：底部 Tab 切换、翻卡动画、答题判分、筛选搜索、深色模式、Toast 提示均已实装。桌面端显示带边框的手机外壳，移动端自动全屏适配安全区。

如需调整某个页面的交互、增加词库数据，或接入真实后端（走 backend-handoff 导出契约），告诉我即可。

---

