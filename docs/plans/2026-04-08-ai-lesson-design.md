# AI 定制课程集（AI Lessons）设计

日期：2026-04-08 ｜ 状态：已实现并通过测试（`npm test` 28 项、`npm run e2e:ai` 真实 API 链路验证）

## 目标

基于用户**已掌握的词汇**（CEFR + 人教共用的 `lexicore-mastered`），一次性调用大模型生成一整套个性化阅读教程（英文小短故事 / 中英对话场景），覆盖全部已掌握词；阅读时可对文中目标词标记三态，标记结果反向修正掌握进度，形成「掌握 → 生成 → 阅读 → 回流 → 再生成」的个人定制学习闭环。仅在 Android APK 内可用。

## 决策记录

| 议题 | 决定 |
|---|---|
| API 配置 | 设置页可改 + 内置默认（`src/config/llm.ts`，占位由需求方填入实际值） |
| 协议 | OpenAI 兼容 `POST {baseUrl}/chat/completions` |
| 教程形式 | 英文小短故事、中英对话场景（不附独立测验） |
| 错词来源 | 文中点词三态标记：`不认识 / 模糊 / 已掌握` |
| 回流语义 | `不认识/模糊` → 立即从 `lexicore-mastered` 移除（CEFR 与人教两页同步变为未掌握）；`已掌握` → 重新加入 |
| 生成时机 | 一次生成覆盖全部已掌握词：按场景聚类为 N 组，每组一篇，组成**课程集** |
| 定制条件 | 题材主题、难度等级、随机；**题材=排序侧重而非硬过滤，难度=写作风格提示而非词表过滤**（保证 100% 覆盖） |
| 跨域 | Android 用 `CapacitorHttp` 原生请求绕过 CORS；Web 版隐藏入口 |
| 学习闭环编排 | 同场景 / 同主题的词优先编入同一篇（复用 `category` + `WORD_THEME`） |

## 组件

```
src/config/llm.ts            默认 API 配置（baseUrl/apiKey/model/wordsPerLesson）+ localStorage 读写
src/lib/llm.ts               chatJSON()：CapacitorHttp 请求、状态码归类、JSON 解析容错
src/lib/cluster.ts           buildMasteredPool() + clusterWords()（纯函数，可单测）
src/lib/parse.ts             课程 JSON 校验/解析、<w> 标签提取、无标签回退词形匹配（纯函数）
src/db.ts                    IndexedDB `lexicore-ai`：sets / lessons 两表
src/hooks/useAiLessons.ts    生成编排：并发 2、每篇重试 2 次、进度/取消/单篇重试
src/components/AiSettings.tsx API 设置弹窗（含测试连接）
src/views/AiView.tsx          课程集列表 + 条件表单 + 生成进度
src/views/LessonReader.tsx    阅读页：分段正文、点词三态、发音、篇章翻页
```

## 数据流

1. `buildMasteredPool(masteredSet)`：`ALL_WORDS ∩ 掌握集` + `wordsByGrade() ∩ 掌握集`，按小写键去重，附 `category/theme/level/ipa/meaning`
2. `clusterWords(pool, {wordsPerLesson, topic})`：按 `category` 分桶 → 超上限按 `WORD_THEME` 切块 → 余数补入有容量的组 → 题材排序 / 随机排序；每组目标 15-25 词
3. 每组一次 `chatJSON`，prompt 要求 `{title, type: story|dialogue, segments:[{speaker?, en, zh}]}`，目标词用 `<w>word</w>` 包裹，`response_format: json_object`
4. 解析成功 → 写 IndexedDB（失败也保存词表以便单篇重试）；进度 `done/total`
5. 阅读页点词 → 更新 `lesson.marks` + 增删 `lexicore-mastered`

## 每篇 prompt 要点

- 输入：场景名、重点词表（词 + 中文释义）、题材侧重、难度句式指令、篇幅 180-320 词
- 硬性要求：每个重点词至少出现一次且用 `<w>` 包裹、故事分段给逐段中文、对话逐句给中文
- 失败处理：401/403 → 提示检查 Key；429 → 退避重试；JSON 截断/不合法 → 重试 2 次后该篇标记失败，可单篇重试

## 存储

- `localStorage.lexicore-mastered`：沿用，三态标记直接增删（无迁移）
- `localStorage.lexicore-ai-config`：API 配置
- IndexedDB `lexicore-ai`：`sets`（课程集元信息 + 生成条件 + 状态）、`lessons`（正文分段 + 重点词表 + marks），避免 localStorage 5MB 配额限制

## 测试

Vitest 覆盖纯逻辑（`npm test`）：聚类不变量（词数守恒 / 无重复 / 每组上限）、`<w>` 解析与词形回退匹配、课程 JSON 校验、prompt 构建、视图挂载冒烟。`npm run e2e:ai` 用真实 API 走完整链路（聚类 → prompt → chat/completions → 解析 → 覆盖率统计）。

## 真机验收要点

1. **CapacitorHttp**：APK 内点「设置 → 测试连接」应返回「连接成功」（原生请求不走 WebView CORS）
2. **点词回流**：阅读中点词 →「不认识/模糊」→ 回到 CEFR / 人教页，该词应变为未掌握；点词「已掌握」则重新加入
3. **生成流程**：进度条推进、可中途取消、失败篇目可「继续」补齐、鉴权失败给出明确提示
4. **Web 版**：`?ai=1` 之外不显示 AI 入口（生产构建中 `import.meta.env.DEV` 为 false）

## 风险

- 一次全量生成约 N 篇 × ~1.5K 输出 tokens（已掌握 500 词 ≈ 10-15 篇），生成前展示预估篇数并可取消
- 内置默认 Key 会被打进 APK（可反编译），需使用限额 Key；设置页可随时替换
- `CapacitorHttp` 为显式调用，不启用全局 fetch 拦截，避免影响既有 blob/stream 行为

---

# 迭代 v2（2026-10-22）：闭环修正 · 任意词查词 · 词汇随掌握量增长 · 交互现代化

## 1. 错词真正回流（修正 v1 的闭环缺口）

v1 的问题：点「不认识/模糊」只是把词移出 `lexicore-mastered`，而生成只取已掌握词 → 该词**反而再也不会出现在 AI 课程里**，与「回流」的承诺相反。

修正：

- 新增错词队列 `src/lib/review.ts`（`localStorage.lexicore-ai-review`，上限 200 条，按最近标记时间排序）
  - `不认识` 权重 2、`模糊` 权重 1，重复标记累加 `misses`
  - 阅读页标记为「已掌握」时移出队列，并加回 `lexicore-mastered`
- 生成时把队列里「当前未掌握」的词作为**复习词**编入：`clusterWords(pool, { review })` 按每篇 `max(2, round(per*0.25))` 的预算轮转注入，标记 `isReview`
- prompt 要求复习词各重复出现 2-3 次；阅读页与词表显示「复习」角标

## 2. 词汇随掌握量增长（只用已掌握词写作）

- prompt 附带**可用词汇表**（全部已掌握词；超过 `ALLOWED_CAP=1200` 时同场景词优先截断）+ 功能词白名单
- 硬性约束：实词优先取自已掌握词；不足时每篇最多补 8 个 A1 常见词；同句最多 2 个重点词
- 生成后做两道校验（`src/lib/vocab.ts`）：
  1. `matchedKeys()`：重点词是否真的写进正文，缺词带 `missingWords` 重试
  2. `vocabUsage()`：统计「超纲实词」数量，超过 `OUT_OF_VOCAB_BUDGET=8` 时带 `bannedWords` 重试
- 最多 3 稿，保留**质量最佳**的一稿（先比重点词覆盖，再比用词率），并在阅读页展示 `覆盖 18/20`、`用词 62% 来自你的词库`
- 真实 API 验证（14 词小词池）：重试使用词率 26% → 54.5%、37% → 70.5%

## 3. 任意词查词

- 新增本地词典 `src/lib/dict.ts`：`ALL_WORDS` + 人教补充词构建 `词形变体 → 词条` 索引，含不规则变化表与去尾回退，`ordered/studies/went` 都能查到
- 阅读页改用 `textTokens()`：整段文本逐词 token 化，**每个英文单词都可点击**；命中重点词时保留高亮 + 三态标记，其余词展示词典释义 + 发音
- 底部弹层（`Sheet`）展示：词形 / 音标 / 原形 / 释义 / 朗读 / 重点词·复习词角标

## 4. 阅读与生成体验

- 已读追踪：首次打开即写入 `lesson.readAt`，课程集累加 `readCount`；卡片展示 `已读 X/N` 与进度条
- 续读位置：`set.lastIndex` 记住上次读到第几篇，「继续阅读」直达
- 生成不再黑箱：逐篇实时状态列表（排队 / 写作中 / 完成 / 失败）+ 可取消
- 交互现代化（`src/components/Sheet.tsx`）：条件选择、课程集操作（补齐 / 删除）全部改为底部弹层 + 操作列表，移除 `window.confirm`
- 阅读页：篇章进度条、读完 CTA、横向滑动翻页（区分纵向滚动避免误触）、点词弹层发音

## 5. 新增/变更文件

```
src/lib/review.ts        错词复习队列
src/lib/dict.ts          任意词查词（本地词典 + 不规则变化）
src/lib/vocab.ts         功能词表 / 不规则表 / vocabUsage() 用词率统计
src/components/Sheet.tsx 底部弹层 + 操作列表弹层
src/views/AiView.tsx     渐变主卡 + 条件弹层 + 实时生成列表 + 已读进度卡片
src/views/LessonReader.tsx textTokens 任意词查词 + 已读/续读 + 复习词角标
src/lib/parse.ts         textTokens / matchedKeys / 导出 wordVariants
src/lib/cluster.ts       复习词注入、isReview、categoryOfKey
src/lib/prompt.ts        可用词汇表、禁用词、复习词重复要求
src/hooks/useAiLessons.ts 复习词 + 允许词表 + 覆盖率/用词率重试 + 逐篇实时状态
src/db.ts                readCount / lastIndex / coverage / readAt + markLessonRead、saveSetPosition
```

## 6. 测试

`npm test` 60 项全绿，新增覆盖：`textTokens`（任意词可点）、`matchedKeys`（覆盖率）、复习词注入与预算、错词队列增删/脏数据容错、本地词典查词（含不规则与变体）、`vocabUsage` 用词率与超纲词识别、prompt 词汇约束与禁用词。

