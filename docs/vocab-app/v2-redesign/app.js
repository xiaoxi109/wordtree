/* ============================================================
   LexiCore 改进原型 —— 状态 + 渲染 + 交互
   4 Tab: 今日 / 词库 / 学习 / 我的
   ============================================================ */
(function () {
  'use strict';

  const M = window.MOCK;
  const $ = (sel, root = document) => root.querySelector(sel);
  const screenEl = $('#screen');
  const tabbarEl = $('#tabbar');
  const overlayEl = $('#overlay');

  /* ---------- 图标 ---------- */
  const ICONS = {
    home: '<path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/><path d="M9.5 21v-6h5v6"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z"/><path d="M18 3v18"/>',
    study: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
    flame: '<path d="M12 2s4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 1-3s-2 1-2 4a6 6 0 0 0 12 0c0-5-5-11-5-11z"/>',
    sparkles: '<path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z"/><path d="M19 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    wand: '<path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M14.2 6.2L13 5M14.2 11.8L13 13"/><path d="M3 21l9-9"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    rotc: '<path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4"/>',
    play: '<path d="M6 4l14 8-14 8z"/>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
    shuffle: '<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
    speaker: '<path d="M3 10v4h4l5 4V6L7 10z"/><path d="M16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    star: '<path d="M12 3l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.8 6.7 19.2l1-5.8L3.5 9.2l5.9-.9z"/>',
    bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10c1 1 1.5 2 1.5 3h5C14.5 15 15 14 16 13a6 6 0 0 0-4-10z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  };
  function svg(name, size = 20) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="${size}" height="${size}">${ICONS[name] || ''}</svg>`;
  }

  /* ---------- 状态 ---------- */
  const state = {
    screen: 'home',
    theme: localStorage.getItem('lexicore-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
    reader: null,
    wordDetail: null,   // { key, mode: 'both' | 'en' | 'zh' }
    sheet: null,
    study: { mode: 'due', session: [], index: 0, revealed: false, stats: { again: 0, hard: 0, good: 0 } },
    level: 'primary', // 用户当前等级（设置里可改）
    library: { ladder: 'primary', scene: 'all', pos: 'all', keyword: '', mode: 'both', mastered: 'all' },
  };

  /* ---------- 工具 ---------- */
  function wordByKey(k) { return M.WORDS.find((w) => w.key === k); }
  function masteredSet() { return new Set(M.MASTERED); }
  function escape(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  /* ---------- 渲染主入口 ---------- */
  function render() {
    document.documentElement.setAttribute('data-theme', state.theme);
    screenEl.innerHTML = renderScreen();
    renderTabbar();
    renderOverlay();
    screenEl.scrollTop = 0;
  }

  /* ---------- Tabbar —— 砍成 2 个 ----------
     原来的"词库"和"学习"从首页大按钮进入，Tab 只留首页和我的
  ---------- */
  const TABS = [
    { id: 'home', label: '今日', icon: 'home' },
    { id: 'me', label: '我的', icon: 'user' },
  ];
  function renderTabbar() {
    tabbarEl.innerHTML = TABS.map((t) => `
      <button class="tab ${state.screen === t.id ? 'active' : ''}" data-tab="${t.id}">
        ${svg(t.icon)}<span>${t.label}</span>
      </button>`).join('');
    tabbarEl.querySelectorAll('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => { state.screen = b.dataset.tab; render(); }));
  }

  /* ---------- 屏幕分发 ---------- */
  function renderScreen() {
    switch (state.screen) {
      case 'home': return renderHome();
      case 'library': return renderLibrary();
      case 'study': return renderStudy();
      case 'me': return renderMe();
    }
    return '';
  }

  /* ============================================================
     今日 Home
     ============================================================ */
  function renderHome() {
    const S = M.STATS;
    const pct = Math.round((S.todayDone / S.todayGoal) * 100);
    const ringR = 46, circ = 2 * Math.PI * ringR;
    const dash = (pct / 100) * circ;
    const due = S.due;
    const levelWords = M.WORDS.filter((w) => w.ladder === state.level);
    const mSet = masteredSet();
    const nw = levelWords.filter((w) => !mSet.has(w.key)).length;
    const todayLesson = M.LESSONS[0];

    return `
      <div class="stagger">
        <!-- 问候 -->
        <div class="flex items-end justify-between" style="padding:18px 2px 16px">
          <div>
            <p class="eyebrow">${greet()}</p>
            <h1 class="display" style="font-size:26px;font-weight:700;margin:4px 0 0;letter-spacing:-0.5px">今日任务</h1>
          </div>
          <button class="icon-btn" id="themeBtn">${state.theme === 'dark' ? svg('sun') : svg('moon')}</button>
        </div>

        <!-- 任务大卡 -->
        <div class="surface" style="padding:22px 20px;display:flex;align-items:center;gap:20px">
          <div class="ring">
            <svg width="108" height="108">
              <circle cx="54" cy="54" r="${ringR}" fill="none" stroke="var(--brand-100)" stroke-width="10"/>
              <circle cx="54" cy="54" r="${ringR}" fill="none" stroke="var(--brand)" stroke-width="10" stroke-linecap="round"
                stroke-dasharray="${dash} ${circ}" style="transition:stroke-dasharray .8s var(--ease-spring)"/>
            </svg>
            <div class="ring-val"><b>${S.todayDone}/${S.todayGoal}</b><span>今日</span></div>
          </div>
          <div style="flex:1;min-width:0">
            <p class="eyebrow">到期复习</p>
            <p class="display" style="font-size:34px;font-weight:700;line-height:1.1;color:var(--brand)">${due}<span style="font-size:16px;color:var(--text-3);font-weight:600"> 词</span></p>
            <p class="eyebrow" style="margin-top:10px">新词待学</p>
            <p class="display" style="font-size:22px;font-weight:700">${nw} 个</p>
            <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
              <span class="chip on" style="background:var(--brand-soft);color:var(--brand);border-color:transparent">🔥 连续 ${S.streak} 天</span>
            </div>
          </div>
        </div>

        <!-- 两个主入口大按钮：背词 → 词库 / 复习 → 学习 -->
        <div style="margin-top:16px;display:flex;gap:10px">
          <!-- 背词：进词库页 -->
          <button class="surface" data-go="library" style="cursor:pointer;flex:1;padding:20px 16px;text-align:left;border:none">
            <div style="width:44px;height:44px;border-radius:14px;background:var(--brand-soft);color:var(--brand);display:flex;align-items:center;justify-content:center">${svg('book', 22)}</div>
            <p class="display" style="font-size:20px;font-weight:700;margin:14px 0 2px">背词</p>
            <p style="font-size:11px;color:var(--text-3)">${nw} 个本级新词待学</p>
            <div style="margin-top:10px;display:flex;align-items:center;gap:4px">
              <span style="font-size:11px;font-weight:700;color:var(--brand)">进入词库</span>
              <span style="color:var(--brand)">${svg('arrow', 12)}</span>
            </div>
          </button>
          <!-- 复习：进学习页 mode=due -->
          <button class="surface" data-go="review" style="cursor:pointer;flex:1;padding:20px 16px;text-align:left;border:none">
            <div style="width:44px;height:44px;border-radius:14px;background:var(--amber-soft);color:var(--amber);display:flex;align-items:center;justify-content:center">${svg('rotc', 22)}</div>
            <p class="display" style="font-size:20px;font-weight:700;margin:14px 0 2px">复习</p>
            <p style="font-size:11px;color:var(--text-3)">${due} 个到期词汇</p>
            <div style="margin-top:10px;display:flex;align-items:center;gap:4px">
              <span style="font-size:11px;font-weight:700;color:var(--amber)">开始复习</span>
              <span style="color:var(--amber)">${svg('arrow', 12)}</span>
            </div>
          </button>
        </div>

        <!-- 最近掌握 -->
        <div style="margin-top:22px">
          <div class="flex items-center justify-between" style="margin-bottom:10px">
            <p class="eyebrow">最近掌握</p>
            <button class="btn-ghost" data-go="library">全部</button>
          </div>
          <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:6px" class="no-scrollbar">
            ${M.WORDS.filter((w) => masteredSet().has(w.key)).slice(0, 8).map((w) => `
              <div class="surface" style="min-width:96px;padding:14px 12px;text-align:center;border:1px solid var(--border-soft)">
                <p class="display" style="font-size:17px;font-weight:700">${w.word}</p>
                <p style="font-size:11px;color:var(--text-3);margin-top:6px">${w.meaning}</p>
              </div>`).join('')}
          </div>
        </div>
      </div>`;
  }

  function greet() {
    const h = new Date().getHours();
    if (h < 6) return '凌晨好'; if (h < 12) return '早上好'; if (h < 14) return '中午好';
    if (h < 18) return '下午好'; return '晚上好';
  }

  /* ============================================================
     词库 Library
     ============================================================ */
  function renderLibrary() {
    const { mode, keyword } = state.library;
    return `
      <div class="stagger">
        <!-- 标题 -->
        <div style="padding:18px 2px 8px">
          <div class="flex items-center" style="gap:10px">
            <button class="icon-btn" data-go="home" style="width:36px;height:36px">${svg('back', 18)}</button>
            <h1 class="display" style="font-size:26px;font-weight:700;letter-spacing:-0.5px;margin:0">词库</h1>
          </div>
        </div>

        <!-- 显示模式三档 -->
        <div style="margin-top:8px">
          <div class="seg" style="width:100%;display:flex">
            <button class="${mode === 'both' ? 'on' : ''}" style="flex:1" data-wmode="both">中英</button>
            <button class="${mode === 'en' ? 'on' : ''}" style="flex:1" data-wmode="en">英文</button>
            <button class="${mode === 'zh' ? 'on' : ''}" style="flex:1" data-wmode="zh">中文</button>
          </div>
        </div>

        <!-- 搜索 + 筛选 -->
        <div style="margin-top:12px;display:flex;gap:8px;align-items:stretch">
          <div style="position:relative;flex:1">
            <span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--text-3);pointer-events:none">${svg('search', 16)}</span>
            <input id="libSearch" class="field" style="width:100%;padding:11px 12px 11px 40px" placeholder="搜索单词 / 释义 / 音标" value="${escape(keyword)}" />
          </div>
          <button class="chip ${state.sheet === 'filter' ? 'on' : ''}" data-sheet="filter" style="flex:none;align-self:stretch;display:flex;align-items:center;gap:6px;padding:0 14px;font-size:11px;font-weight:700">
            ${svg('sliders', 14)} 筛选
          </button>
        </div>

        <!-- 词表 -->
        <div id="libList" style="margin-top:16px">${libListHTML()}</div>
      </div>`;
  }

  function libListHTML() {
    const { ladder, scene, pos, keyword, mode, mastered } = state.library;
    const mSet = masteredSet();
    const list = M.WORDS.filter((w) => w.ladder === ladder)
      .filter((w) => !keyword || w.word.includes(keyword.toLowerCase()) || w.meaning.includes(keyword) || (w.ipa || '').includes(keyword))
      .filter((w) => scene === 'all' || w.cat === scene)
      .filter((w) => pos === 'all' || w.pos.startsWith(pos))
      .filter((w) => mastered === 'all' ? true : mastered === 'mastered' ? mSet.has(w.key) : !mSet.has(w.key));
    if (!list.length) return `<div class="surface" style="padding:40px 20px;text-align:center;color:var(--text-3);font-size:13px">没有符合条件的单词</div>`;

    // 场景 emoji 映射（跟 mock.js 的 cat 对齐）
    const CAT_EMOJI = {
      fruit: '🍎', people: '👤', clothes: '👕', weather: '☀️',
      food: '🍜', home: '🏠', school: '📚', nature: '🌳',
      work: '💼', travel: '✈️', emotion: '❤️', body: '💪', animal: '🐶', family: '👨‍👩‍👧',
    };
    const LABEL_EMOJI = { kinder: '🧒', primary: '📘', g7: '📙', g8: '📗', g9: '📕', h1: '📓', h2: '📒', h3: '📔', cet4: '📝', cet6: '🎓', kaoyan: '🏆' };

    const groups = {};
    for (const w of list) (groups[w.cat] = groups[w.cat] || []).push(w);
    const catLabel = (id) => (M.SCENES.find((s) => s.id === id) || {}).label || id;

    const showEn = mode === 'both' || mode === 'en';
    const showZh = mode === 'both' || mode === 'zh';

    return Object.entries(groups).map(([cat, words]) => `
      <div style="margin-bottom:24px">
        <!-- 场景 eyebrow -->
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">
          <span style="width:8px;height:8px;border-radius:50%;background:var(--brand);flex:none"></span>
          <span class="eyebrow">${catLabel(cat)} ${cat.toUpperCase()} · ${words.length}</span>
        </div>

        <!-- 2 列网格词卡 -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          ${words.map((w) => {
            const lvlLabel = (M.LADDER.find((l) => l.id === w.ladder) || {}).label || w.ladder;
            const lvlEmoji = LABEL_EMOJI[w.ladder] || '📖';
            return `
              <button class="surface" data-word="${w.key}" style="cursor:pointer;border:none;padding:12px 12px 10px;text-align:left;display:flex;flex-direction:column;gap:0;position:relative;border:1px solid var(--border-soft);border-radius:18px">
                <!-- 左上等级标签 -->
                <div style="display:flex;align-items:center;gap:4px;margin-bottom:8px">
                  <span style="font-size:12px">${lvlEmoji}</span>
                  <span style="font-size:10px;color:var(--accent-coral);font-weight:700;letter-spacing:0.02em">${lvlLabel}</span>
                </div>
                <!-- 单词 -->
                ${showEn ? `<p class="display" style="font-size:17px;font-weight:700;line-height:1.15;color:var(--text);margin:0">${w.word}</p>` : ''}
                <!-- 音标 -->
                ${showEn && w.ipa ? `<p style="font-size:11px;color:var(--text-3);margin:3px 0 0">${w.ipa}</p>` : ''}
                <!-- 中文释义 -->
                ${showZh ? `<p style="font-size:13px;font-weight:600;color:var(--text-2);margin:3px 0 0;line-height:1.3">${w.meaning}</p>` : ''}
                <!-- 右下 speaker 图标 -->
                <span style="position:absolute;right:10px;bottom:8px;width:26px;height:26px;border-radius:50%;background:var(--brand-soft);color:var(--brand);display:flex;align-items:center;justify-content:center;pointer-events:none">
                  ${svg('speaker', 14)}
                </span>
              </button>`;
          }).join('')}
        </div>
      </div>`).join('');
  }

  /* ============================================================
     学习 Study
     ============================================================ */
  function renderStudy() {
    const st = state.study;
    if (!st.session.length) {
      return `
        <div class="stagger" style="padding-top:20px">
          <div class="flex items-end justify-between" style="margin-bottom:14px">
            <div class="flex items-center" style="gap:10px">
              <button class="icon-btn" data-go="home" style="width:36px;height:36px">${svg('back', 18)}</button>
              <h1 class="display" style="font-size:26px;font-weight:700;margin:0">学习</h1>
            </div>
            <button class="icon-btn" data-sheet="study-filter">${svg('sliders')}</button>
          </div>
          <div class="seg" style="width:100%;display:flex">
            <button class="${st.mode === 'due' ? 'on' : ''}" style="flex:1" data-mode="due">到期复习</button>
            <button class="${st.mode === 'new' ? 'on' : ''}" style="flex:1" data-mode="new">学新词</button>
          </div>
          <div class="surface" style="padding:30px 20px;text-align:center;margin-top:18px">
            <div style="font-size:40px">${st.mode === 'due' ? '🔁' : '✨'}</div>
            <p style="font-size:15px;font-weight:700;margin-top:10px">${st.mode === 'due' ? '当前没有到期复习' : '准备学一批新词'}</p>
            <p style="font-size:12px;color:var(--text-3);margin-top:6px;line-height:1.6">${st.mode === 'due' ? '到期词会在复习时自动出现，保持记忆新鲜。' : '从词库挑出未掌握的词，正面回忆，背面看释义。'}</p>
            <button class="btn btn-primary" data-start style="margin-top:16px;width:100%">${st.mode === 'due' ? '开始复习' : '开始学新词'}</button>
          </div>
        </div>`;
    }

    const card = st.session[st.index];
    if (!card) return renderStudyFinish();
    const done = Math.min(st.index, st.session.length);
    const pct = Math.round((done / st.session.length) * 100);
    const mSet = masteredSet();

    return `
      <div style="padding-top:16px">
        <!-- 顶部返回 + 进度 -->
        <div style="margin-bottom:14px">
          <div class="flex items-center justify-between" style="margin-bottom:8px">
            <button class="icon-btn" data-go="home" style="width:34px;height:34px">${svg('back', 18)}</button>
            <span style="font-size:11px;color:var(--text-3);font-weight:600">${st.mode === 'due' ? '到期复习' : '学新词'}</span>
          </div>
          <div style="height:6px;border-radius:999px;background:var(--surface-inset);overflow:hidden">
            <div style="height:100%;width:${pct}%;background:var(--brand);border-radius:999px;transition:width .4s var(--ease-spring)"></div>
          </div>
          <div style="font-size:11px;color:var(--text-3);margin-top:4px;text-align:right">第 ${st.index + 1} / ${st.session.length} 张</div>
        </div>

        <!-- 卡片 -->
        <div class="flashcard" data-reveal style="padding:36px 24px">
          ${!st.revealed ? `
            <div>
              <span class="chip" style="background:${st.mode === 'due' ? 'var(--brand-soft)' : 'var(--amber-soft)'};color:${st.mode === 'due' ? 'var(--brand)' : 'var(--amber)'};border-color:transparent">${st.mode === 'due' ? '复习' : '新词'}</span>
              <p class="word" style="margin-top:18px">${card.word}</p>
              ${card.ipa ? `<p class="ipa">${card.ipa}</p>` : ''}
              <p style="font-size:11px;color:var(--text-3);margin-top:22px">先在心里回忆它的意思</p>
              <button class="btn btn-ink" data-reveal style="margin-top:14px;width:100%">显示答案</button>
            </div>` : `
            <div>
              <p class="word">${card.word}</p>
              ${card.ipa ? `<p class="ipa">${card.ipa}</p>` : ''}
              <div class="surface-inset" style="margin-top:20px;padding:14px">
                <div class="flex items-start gap-8" style="gap:8px">
                  ${card.pos ? `<span style="font-size:11px;font-weight:700;color:var(--text-2);background:var(--surface);padding:2px 8px;border-radius:6px">${card.pos}</span>` : ''}
                  <p style="font-size:15px;font-weight:600;line-height:1.5">${card.meaning}</p>
                </div>
                ${card.examples.length ? `
                  <ul style="margin:12px 0 0;padding:0;list-style:none">
                    ${card.examples.map((ex) => `
                      <li style="display:flex;gap:6px;margin-top:10px">
                        <span style="color:var(--brand);flex:none">${svg('speaker', 15)}</span>
                        <div><p style="font-size:13px;line-height:1.5">${ex.en}</p><p style="font-size:11px;color:var(--text-3);margin-top:2px">${ex.zh}</p></div>
                      </li>`).join('')}
                  </ul>` : ''}
              </div>
              <p style="font-size:10px;color:var(--text-3);margin-top:14px;text-align:center">左滑「不认识」· 右滑「认识」</p>
            </div>`}
        </div>

        ${st.revealed ? `
          <div class="grade3" style="margin-top:16px">
            <button class="grade-btn again" data-grade="again">
              <span class="dot">${svg('x', 18)}</span><b>不认识</b><small>10 分钟后</small>
            </button>
            <button class="grade-btn hard" data-grade="hard">
              <span class="dot">${svg('rotc', 18)}</span><b>模糊</b><small>明天</small>
            </button>
            <button class="grade-btn good" data-grade="good">
              <span class="dot">${svg('check', 18)}</span><b>认识</b><small>3 天后</small>
            </button>
          </div>` : ''}
      </div>`;
  }

  function renderStudyFinish() {
    const st = state.study;
    const total = st.stats.again + st.stats.hard + st.stats.good;
    return `
      <div class="surface" style="padding:34px 24px;text-align:center;margin-top:30px">
        <div style="width:64px;height:64px;border-radius:20px;background:var(--brand-soft);color:var(--brand);display:flex;align-items:center;justify-content:center;margin:0 auto 16px">${svg('check', 30)}</div>
        <h2 class="display" style="font-size:22px;font-weight:700">本轮完成</h2>
        <p style="font-size:12px;color:var(--text-3);margin-top:4px">共判断 ${total} 次</p>
        <div class="grid3" style="margin-top:20px">
          <div class="stat"><b style="color:var(--brand)">${st.stats.good}</b><span>认识</span></div>
          <div class="stat"><b style="color:var(--amber)">${st.stats.hard}</b><span>模糊</span></div>
          <div class="stat"><b style="color:var(--accent-coral)">${st.stats.again}</b><span>不认识</span></div>
        </div>
        <button class="btn btn-primary" data-start style="margin-top:22px;width:100%">再来一轮</button>
        <button class="btn btn-soft" data-tab-go="home" style="margin-top:10px;width:100%">回到首页</button>
      </div>`;
  }

  /* ============================================================
     我的 Me
     ============================================================ */
  function renderMe() {
    const S = M.STATS;
    const mSet = masteredSet();
    const curLabel = (M.LADDER.find((l) => l.id === state.level) || {}).label;
    const maxW = Math.max(...S.week);
    return `
      <div class="stagger">
        <div style="padding:18px 2px 16px">
          <div class="flex items-end justify-between">
            <h1 class="display" style="font-size:26px;font-weight:700">我的</h1>
            <button class="icon-btn" id="themeBtn">${state.theme === 'dark' ? svg('sun') : svg('moon')}</button>
          </div>
        </div>

        <!-- 顶部数据 -->
        <div class="surface" style="padding:22px 20px;display:flex;justify-content:space-between;align-items:center">
          <div>
            <p class="eyebrow">累计掌握</p>
            <p class="display" style="font-size:36px;font-weight:700;line-height:1.1">${S.totalMastered}<span style="font-size:15px;color:var(--text-3);font-weight:600"> 词</span></p>
          </div>
          <div style="text-align:right">
            <p class="eyebrow">连续打卡</p>
            <p class="display" style="font-size:36px;font-weight:700;line-height:1.1;color:var(--brand)">${S.streak}<span style="font-size:15px;color:var(--text-3);font-weight:600"> 天</span></p>
          </div>
        </div>

        <!-- 本周柱状图 -->
        <div class="surface" style="padding:18px;margin-top:14px">
          <div class="flex items-center justify-between" style="margin-bottom:14px">
            <p class="eyebrow">本周学习</p>
            <span style="font-size:12px;color:var(--text-3)">${S.week.reduce((a, b) => a + b, 0)} 次</span>
          </div>
          <div class="bars">
            ${S.week.map((v, i) => `
              <div class="bar-col">
                <div class="bar ${i === S.todayIdx ? 'today' : ''}" style="height:${Math.max(6, (v / maxW) * 70)}px"></div>
                <span class="bar-label">${['一', '二', '三', '四', '五', '六', '日'][i]}</span>
              </div>`).join('')}
          </div>
        </div>

        <!-- 更多统计 -->
        <div class="grid2" style="margin-top:12px">
          <div class="stat"><b>${M.WORDS.filter((w) => w.ladder === state.level && !mSet.has(w.key)).length}</b><span>本级未掌握</span></div>
          <div class="stat"><b>${S.readLessons}</b><span>已读文章</span></div>
          <div class="stat"><b>${Math.round(S.coverage * 100)}%</b><span>文章覆盖率</span></div>
          <div class="stat"><b>${S.todayDone}</b><span>今日完成</span></div>
        </div>

        <!-- 成就 -->
        <div style="margin-top:20px">
          <p class="eyebrow" style="margin-bottom:10px">成就</p>
          <div class="grid3">
            ${M.ACHIEVEMENTS.map((a) => `
              <div class="badge ${a.on ? 'on' : ''}">${svg(a.icon, 20)}<span>${a.label}</span></div>`).join('')}
          </div>
        </div>

        <!-- 设置：surface 堆叠 + icon box + chevron，跟现有 App SettingsView 对齐 -->
        <div style="margin-top:20px">
          <p class="eyebrow" style="margin-bottom:8px">设置</p>
          <div style="display:flex;flex-direction:column;gap:10px">

            <!-- 我的等级 -->
            <button class="surface" data-open-level style="width:100%;cursor:pointer;padding:10px 12px;display:flex;align-items:center;gap:12px;text-align:left;border:none;border-radius:20px">
              <span style="flex:none;width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.05);color:var(--text-3)">${svg('sliders', 18)}</span>
              <div style="flex:1;min-width:0">
                <p style="font-size:13px;font-weight:700;margin:0">我的等级</p>
                <p style="font-size:11px;color:var(--text-3);margin:1px 0 0">当前：${curLabel}</p>
              </div>
              ${svg('arrow', 14)}
            </button>

            <!-- 大模型设置 -->
            <button class="surface" data-sheet="llm" style="width:100%;cursor:pointer;padding:10px 12px;display:flex;align-items:center;gap:12px;text-align:left;border:none;border-radius:20px">
              <span style="flex:none;width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:var(--brand-soft);color:var(--brand)">${svg('bulb', 18)}</span>
              <div style="flex:1;min-width:0">
                <p style="font-size:13px;font-weight:700;margin:0">大模型设置</p>
                <p style="font-size:11px;color:var(--text-3);margin:1px 0 0">OpenAI 兼容接口</p>
              </div>
              ${svg('arrow', 14)}
            </button>

            <!-- 每日目标 -->
            <button class="surface" style="width:100%;cursor:pointer;padding:10px 12px;display:flex;align-items:center;gap:12px;text-align:left;border:none;border-radius:20px">
              <span style="flex:none;width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.05);color:var(--text-3)">${svg('target', 18)}</span>
              <div style="flex:1;min-width:0">
                <p style="font-size:13px;font-weight:700;margin:0">每日目标</p>
                <p style="font-size:11px;color:var(--text-3);margin:1px 0 0">20 词 / 天</p>
              </div>
              ${svg('arrow', 14)}
            </button>

            <!-- 深色模式（真 toggle switch） -->
            <div class="surface" style="padding:10px 12px;display:flex;align-items:center;gap:12px;border-radius:20px">
              <span style="flex:none;width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.05);color:var(--text-3)">
                ${state.theme === 'dark' ? svg('moon', 18) : svg('sun', 18)}
              </span>
              <div style="flex:1;min-width:0">
                <p style="font-size:13px;font-weight:700;margin:0">深色模式</p>
                <p style="font-size:11px;color:var(--text-3);margin:1px 0 0">${state.theme === 'dark' ? '已开启' : '跟随系统'}</p>
              </div>
              <button class="switch ${state.theme === 'dark' ? 'on' : ''}" data-toggle-theme aria-label="深色模式">
                <span class="knob"></span>
              </button>
            </div>

          </div>
          <p style="font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--text-mute);text-align:center;margin-top:14px;font-weight:700">
            LexiCore v0.6 · 本地优先
          </p>
        </div>
      </div>`;
  }

  /* ============================================================
     覆盖层：Sheet / Reader / 词详情
     ============================================================ */
  function renderOverlay() {
    if (state.reader) {
      overlayEl.innerHTML = renderReader();
      bindReader();
      return;
    }
    if (state.wordDetail) {
      overlayEl.innerHTML = renderWordDetail();
      bindWordDetail();
      return;
    }
    if (state.sheet === 'level') {
      overlayEl.innerHTML = renderLevelPicker();
      bindLevelPicker();
      return;
    }
    if (state.sheet === 'study-filter') {
      overlayEl.innerHTML = renderStudyFilter();
      bindStudyFilter();
      return;
    }
    if (state.sheet === 'filter') {
      overlayEl.innerHTML = renderFilterSheet();
      bindFilterSheet();
      return;
    }
    overlayEl.innerHTML = '';
  }

  /* ---- 词库筛选 Sheet（场景 + 词性 + 掌握状态） ---- */
  function renderFilterSheet() {
    const { scene, pos, mastered } = state.library;
    return `
      <div class="sheet-mask" data-close>
        <div class="sheet" data-stop>
          <div class="grab"></div>
          <h3>筛选</h3>
          <p class="sub">按场景、词性或掌握状态缩小范围</p>

          <div style="margin-top:16px">
            <p class="eyebrow" style="margin-bottom:10px">掌握状态</p>
            <div style="display:flex;gap:8px">
              ${[{ id: 'all', label: '全部' }, { id: 'mastered', label: '已掌握' }, { id: 'unmastered', label: '未掌握' }].map((m) => `<button class="chip ${mastered === m.id ? 'on' : ''}" data-mastered="${m.id}" style="flex:1">${m.label}</button>`).join('')}
            </div>
          </div>

          <div style="margin-top:18px">
            <p class="eyebrow" style="margin-bottom:10px">场景</p>
            <div style="display:flex;flex-wrap:wrap;gap:8px">
              ${M.SCENES.map((s) => `<button class="chip ${scene === s.id ? 'on' : ''}" data-scene="${s.id}">${s.label}</button>`).join('')}
            </div>
          </div>

          <div style="margin-top:18px">
            <p class="eyebrow" style="margin-bottom:10px">词性</p>
            <div style="display:flex;flex-wrap:wrap;gap:8px">
              ${[{ id: 'all', label: '全部' }, { id: 'n', label: '名词' }, { id: 'v', label: '动词' }, { id: 'adj', label: '形容词' }].map((p) => `<button class="chip ${pos === p.id ? 'on' : ''}" data-pos="${p.id}">${p.label}</button>`).join('')}
            </div>
          </div>

          <div style="margin-top:24px;display:flex;gap:10px">
            <button class="chip" data-scene="all" data-pos="all" data-mastered="all" style="flex:1;padding:12px;font-weight:700">重置</button>
            <button class="btn btn-primary" data-close style="flex:2">完成</button>
          </div>
        </div>
      </div>`;
  }
  function bindFilterSheet() {
    overlayEl.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { state.sheet = null; render(); }));
  }

  /* ---- 词详情 Sheet ---- */
  function renderWordDetail() {
    const w = wordByKey(state.wordDetail?.key || state.wordDetail);
    if (!w) return '';
    const mode = state.wordDetail?.mode || 'both'; // 'both' | 'en' | 'zh'
    const mSet = masteredSet();
    const on = mSet.has(w.key);
    const showEn = mode === 'both' || mode === 'en';
    const showZh = mode === 'both' || mode === 'zh';
    return `
      <div class="sheet-mask" data-close>
        <div class="sheet" data-stop>
          <div class="grab"></div>
          <div class="flex items-center justify-between" style="margin-bottom:4px">
            <div class="flex items-center" style="gap:10px">
              <span class="display" style="font-size:28px;font-weight:700">${w.word}</span>
              <button class="icon-btn" data-speak style="width:32px;height:32px;color:var(--brand)">${svg('speaker', 18)}</button>
            </div>
            <button class="icon-btn" data-close style="width:36px;height:36px">${svg('x', 16)}</button>
          </div>
          ${w.ipa ? `<p style="font-size:13px;color:var(--text-3);margin-top:2px">${w.ipa}</p>` : ''}

          <!-- 显示模式切换 -->
          <div style="margin-top:12px">
            <div class="seg" style="display:flex">
              <button class="${mode === 'both' ? 'on' : ''}" style="flex:1" data-wmode="both">中英</button>
              <button class="${mode === 'en' ? 'on' : ''}" style="flex:1" data-wmode="en">仅英文</button>
              <button class="${mode === 'zh' ? 'on' : ''}" style="flex:1" data-wmode="zh">仅中文</button>
            </div>
          </div>

          <!-- 词根词缀 -->
          ${w.root && w.root !== '—' ? `
            <div class="surface-inset" style="margin-top:14px;padding:12px 14px;border-left:3px solid var(--brand)">
              <p style="font-size:11px;color:var(--brand);font-weight:700;letter-spacing:0.5px">词根词缀</p>
              <p style="font-size:13px;font-weight:600;margin-top:4px;line-height:1.5">${escape(w.root)}</p>
            </div>` : ''}

          <!-- 释义 + 例句 -->
          <div class="surface-inset" style="margin-top:14px;padding:16px">
            <div class="flex items-start gap-8" style="gap:8px">
              ${w.pos ? `<span style="font-size:11px;font-weight:700;color:var(--text-2);background:var(--surface);padding:2px 8px;border-radius:6px">${w.pos}</span>` : ''}
              ${showZh ? `<p style="font-size:16px;font-weight:600">${escape(w.meaning)}</p>` : ''}
            </div>
            ${w.examples.length ? `
              <ul style="margin:14px 0 0;padding:0;list-style:none">
                ${w.examples.map((ex) => `
                  <li style="display:flex;gap:6px;margin-top:10px">
                    ${showEn ? `<span style="color:var(--brand);flex:none">${svg('speaker', 15)}</span>
                    <div style="flex:1;min-width:0">
                      <p style="font-size:14px;line-height:1.5">${escape(ex.en)}</p>
                      ${showZh ? `<p style="font-size:12px;color:var(--text-3);margin-top:2px">${escape(ex.zh)}</p>` : ''}
                    </div>` : ''}
                  </li>`).join('')}
              </ul>` : ''}
          </div>

          <button class="btn ${on ? 'btn-soft' : 'btn-primary'}" data-toggle-master style="width:100%;margin-top:16px">
            ${on ? `${svg('check', 18)} 已掌握 · 点击取消` : `${svg('star', 18)} 标记为已掌握`}
          </button>
          <p style="font-size:11px;color:var(--text-3);text-align:center;margin-top:10px;line-height:1.5">
            ${on ? '已纳入复习计划，AI 文章会优先使用。' : '标记后进入复习队列，逐步积累掌握。'}
          </p>
        </div>
      </div>`;
  }
  function bindWordDetail() {
    overlayEl.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeOverlay));
    overlayEl.querySelector('[data-toggle-master]')?.addEventListener('click', () => {
      const k = state.wordDetail?.key || state.wordDetail;
      const idx = M.MASTERED.indexOf(k);
      if (idx >= 0) M.MASTERED.splice(idx, 1); else M.MASTERED.push(k);
      closeOverlay(); render();
    });
    overlayEl.querySelectorAll('[data-wmode]').forEach((b) => b.addEventListener('click', () => {
      state.wordDetail = { key: state.wordDetail.key, mode: b.dataset.wmode };
      render();
    }));
    overlayEl.querySelector('[data-speak]')?.addEventListener('click', () => {
      const w = wordByKey(state.wordDetail?.key || state.wordDetail);
      toast(w ? `正在发音：${w.word}` : '发音不可用');
    });
  }

  /* ---- 学习筛选 Sheet ---- */
  function renderStudyFilter() {
    const st = state.study;
    const curLabel = (M.LADDER.find((l) => l.id === state.level) || {}).label;
    return `
      <div class="sheet-mask" data-close>
        <div class="sheet" data-stop>
          <div class="grab"></div>
          <h3>复习筛选</h3>
          <p class="sub">选范围与答案语言</p>
          <div style="margin-top:16px;display:flex;flex-direction:column;gap:18px">
            <div>
              <p class="eyebrow" style="margin-bottom:10px">学习对象</p>
              <div class="seg" style="display:flex">
                <button class="${st.mode === 'due' ? 'on' : ''}" style="flex:1" data-mode="due">到期复习</button>
                <button class="${st.mode === 'new' ? 'on' : ''}" style="flex:1" data-mode="new">学新词</button>
              </div>
            </div>
            <div>
              <p class="eyebrow" style="margin-bottom:10px">当前等级词库</p>
              <button class="btn btn-soft" data-sheet="level" style="width:100%;justify-content:space-between">
                <span>${svg('sliders', 16)} ${curLabel} · 点我更换</span>
                <span style="color:var(--text-mute)">${svg('arrow', 14)}</span>
              </button>
            </div>
          </div>
          <button class="btn btn-ink" data-close style="width:100%;margin-top:20px">完成</button>
        </div>
      </div>`;
  }
  function bindStudyFilter() {
    overlayEl.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeOverlay));
    overlayEl.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      state.study.mode = b.dataset.mode; state.study.session = [];
      closeOverlay(); render();
    }));
    overlayEl.querySelector('[data-sheet="level"]')?.addEventListener('click', () => {
      state.sheet = 'level'; render();
    });
  }

  /* ---- 等级选择 Sheet ---- */
  function renderLevelPicker() {
    const curIdx = M.LADDER.findIndex((l) => l.id === state.level);
    const curLabel = (M.LADDER[curIdx] || {}).label;
    return `
      <div class="sheet-mask" data-close>
        <div class="sheet" data-stop>
          <div class="grab"></div>
          <h3>选择我的英文等级</h3>
          <p class="sub">不同等级看到的词库范围不同，选合适自己的才能高效背词。</p>
          <div style="margin-top:14px;display:flex;flex-direction:column;gap:8px">
            ${M.LADDER.map((l, i) => {
              const active = i === curIdx;
              const done = i < curIdx;
              const words = M.WORDS.filter((w) => w.ladder === l.id);
              const mastered = words.filter((w) => masteredSet().has(w.key)).length;
              const pct = words.length ? Math.round((mastered / words.length) * 100) : 0;
              return `
                <button class="level-item ${active ? 'active' : ''} ${done ? 'done' : ''}" data-pick-level="${l.id}">
                  <div class="lv-num">${i + 1}</div>
                  <div class="lv-info">
                    <p class="lv-label">${l.label}</p>
                    ${words.length ? `
                      <div style="margin-top:4px;display:flex;align-items:center;gap:8px">
                        <div class="progress-track" style="flex:1"><div class="progress-fill" style="width:${pct}%"></div></div>
                        <span style="font-size:10px;font-weight:700;color:var(--text-3);flex:none;width:28px;text-align:right">${pct}%</span>
                      </div>
                    ` : `<p class="lv-sub">暂无词</p>`}
                  </div>
                  <div class="lv-right">
                    ${active ? `<span style="color:var(--brand)">${svg('check', 16)}</span>` : done ? '✓' : `${mastered}/${words.length}`}
                  </div>
                </button>`;
            }).join('')}
          </div>
          <p style="font-size:11px;color:var(--text-3);text-align:center;margin-top:12px;line-height:1.5">
            当前：${curLabel} · 本等级词全掌握后会出现「一键升级」横幅
          </p>
        </div>
      </div>`;
  }
  function bindLevelPicker() {
    overlayEl.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeOverlay));
    overlayEl.querySelectorAll('[data-pick-level]').forEach((b) => b.addEventListener('click', () => {
      state.level = b.dataset.pickLevel;
      state.library.ladder = state.level;
      closeOverlay(); render();
    }));
  }

  /* ---- AI 阅读 Reader ---- */
  function renderReader() {
    const lesson = M.LESSONS.find((l) => l.id === state.reader);
    if (!lesson) return '';
    return `
      <div class="reader">
        <div class="reader-bar">
          <button class="icon-btn" data-close style="width:38px;height:38px">${svg('back', 18)}</button>
          <div style="flex:1;min-width:0">
            <p style="font-size:14px;font-weight:700">${lesson.title}</p>
            <p style="font-size:11px;color:var(--text-3)">${lesson.emoji} ${lesson.type} · ${lesson.words} 词</p>
          </div>
          <button class="icon-btn" style="width:38px;height:38px">${svg('speaker', 18)}</button>
        </div>
        <div class="reader-body">
          <p class="reader-title display">${lesson.title}</p>
          <p class="reader-meta">覆盖率 ${Math.round(lesson.coverage * 100)}% · 点或长按单词查词</p>
          ${lesson.segments.map((seg) => `
            <div class="reader-seg">
              <p class="en">${seg.en}</p>
              <p class="zh">${seg.zh}</p>
            </div>`).join('')}
        </div>
        <div class="reader-foot">
          <button class="btn btn-primary" style="flex:1">${svg('book', 18)} 继续阅读</button>
          <button class="btn btn-soft" data-close>标记已读</button>
        </div>
      </div>`;
  }
  function bindReader() {
    overlayEl.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeOverlay));
  }

  function closeOverlay() {
    state.reader = null; state.wordDetail = null; state.sheet = null;
    render();
  }

  let _toastTimer = null;
  function toast(msg) {
    let el = document.getElementById('_toast');
    if (!el) {
      el = document.createElement('div');
      el.id = '_toast';
      el.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,.78);color:#fff;padding:10px 18px;border-radius:12px;font-size:13px;z-index:9999;pointer-events:none;opacity:0;transition:opacity .2s';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { el.style.opacity = '0'; }, 1400);
  }

  /* ============================================================
     全局事件绑定
     ============================================================ */
  function bindGlobal() {
    screenEl.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab-go],[data-go],[data-read],[data-word],[data-scene],[data-pos],[data-gen],[data-mode],[data-start],[data-reveal],[data-grade],[data-sheet],[data-upgrade],[data-open-level],[data-toggle-theme]');
      if (!t) return;

      if (t.dataset.tabGo) { state.screen = t.dataset.tabGo; render(); return; }
      if ('toggleTheme' in t.dataset) { toggleTheme(); return; }
      if ('openLevel' in t.dataset) { state.sheet = 'level'; render(); return; }

      if (t.dataset.go === 'library') { state.screen = 'library'; render(); return; }
      if (t.dataset.go === 'review') {
        state.study.mode = 'due';
        state.study.session = [];
        state.screen = 'study';
        render();
        return;
      }

      if (t.dataset.scene) { state.library.scene = t.dataset.scene; state.sheet = null; render(); return; }
      if (t.dataset.pos) { state.library.pos = t.dataset.pos; state.sheet = null; render(); return; }
      if (t.dataset.mastered) { state.library.mastered = t.dataset.mastered; state.sheet = null; render(); return; }

      if (t.dataset.wmode) { state.library.mode = t.dataset.wmode; render(); return; }

      if (t.dataset.read) { openReader(t.dataset.read); return; }

      if (t.dataset.word) { state.wordDetail = { key: t.dataset.word, mode: 'both' }; render(); return; }

      if (t.dataset.scene) { state.library.scene = t.dataset.scene; render(); return; }
      if (t.dataset.pos) { state.library.pos = t.dataset.pos; render(); return; }

      if ('upgrade' in t.dataset) {
        const idx = M.LADDER.findIndex((l) => l.id === state.level);
        if (idx >= 0 && idx < M.LADDER.length - 1) state.level = M.LADDER[idx + 1].id;
        state.library.ladder = state.level;
        toast(`已升级到「${(M.LADDER.find((l) => l.id === state.level) || {}).label || state.level}」`);
        render();
        return;
      }

      if ('gen' in t.dataset) { openReader(M.LESSONS[1].id); return; }

      if (t.dataset.mode) {
        state.study.mode = t.dataset.mode;
        state.study.session = [];
        render();
        return;
      }

      if ('start' in t.dataset) {
        const mSet = masteredSet();
        if (state.study.mode === 'new') {
          // 学新词：本级未掌握的词，最多 5 个
          const pool = M.WORDS.filter((w) => w.ladder === state.level && !mSet.has(w.key));
          state.study.session = pool.slice(0, 5);
        } else {
          state.study.session = [...M.REVIEW_SESSION];
        }
        state.study.index = 0; state.study.revealed = false;
        state.study.stats = { again: 0, hard: 0, good: 0 };
        render();
        return;
      }

      if ('reveal' in t.dataset) { state.study.revealed = true; render(); return; }

      if (t.dataset.grade) { grade(t.dataset.grade); return; }

      if (t.dataset.sheet === 'study-filter') { state.sheet = 'study-filter'; render(); return; }
    });

    // 搜索输入：只重渲染词表，保持输入框焦点与滚动位置
    screenEl.addEventListener('input', (e) => {
      if (e.target.id !== 'libSearch') return;
      state.library.keyword = e.target.value;
      const listEl = $('#libList');
      if (listEl) listEl.innerHTML = libListHTML();
    });

    // 主题
    screenEl.addEventListener('click', (e) => {
      if (e.target.closest('#themeBtn')) toggleTheme();
    });
  }

  function grade(g) {
    const st = state.study;
    st.stats[g]++;
    // 简化：认识 → 标记掌握
    if (g === 'good') {
      const card = st.session[st.index];
      if (card && !masteredSet().has(card.key)) M.MASTERED.push(card.key);
    }
    st.index++; st.revealed = false;
    render();
  }

  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('lexicore-theme', state.theme);
    render();
  }

  function openReader(id) { state.reader = id; render(); }

  /* ---------- 启动 ---------- */
  function tick() { $('#clock').textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }); }
  tick(); setInterval(tick, 30000);

  bindGlobal();
  render();
})();
