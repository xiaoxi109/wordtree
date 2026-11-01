/* ============================================================
   app.js — 背单词 App 状态管理 + 交互逻辑
   ============================================================ */

/* ---- State ---- */
const State = {
  screen: "home",
  learn: { queue: [], idx: 0, known: 0, total: 0, flipped: false },
  quiz: { queue: [], idx: 0, correct: 0, answered: false, selected: null },
  library: { filter: "all", keyword: "" },
  notify: true,
  dark: false,
};

/* ---- Helpers ---- */
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 1800);
}

function statusBadge(status) {
  const map = { new: ["badge-new", "新词"], learning: ["badge-learning", "学习中"], mastered: ["badge-mastered", "已掌握"] };
  const [cls, label] = map[status] || map.learning;
  return `<span class="badge ${cls}"><span class="badge-dot"></span>${label}</span>`;
}

/* ---- Screen Switch ---- */
function switchScreen(name) {
  State.screen = name;
  $$('.screen').forEach(s => s.classList.toggle("active", s.dataset.screen === name));
  $$('.tab-item').forEach(t => t.classList.toggle("active", t.dataset.nav === name));
  document.body.dataset.screen = name;
  // reset scroll
  const sc = $("#screenContent");
  if (sc) sc.scrollTop = 0;
  // trigger reveal re-animation
  const screen = document.querySelector(`.screen[data-screen="${name}"]`);
  if (screen) {
    screen.querySelectorAll(".reveal").forEach(el => {
      el.style.animation = "none";
      void el.offsetWidth;
      el.style.animation = "";
    });
  }
  // entering learn screen → start a fresh flashcard session
  if (name === "learn" && State.learn.idx >= State.learn.total) {
    initLearn();
  }
}

// delegated click handler for [data-go]
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-go]");
  if (!el) return;
  const target = el.dataset.go;
  if (target === "next-known") { handleLearn(true); return; }
  if (target === "next-unknown") { handleLearn(false); return; }
  switchScreen(target);
});

/* ============================================================
   HOME
   ============================================================ */
function renderHome() {
  const u = DB.user;
  $("#streakNum").textContent = u.streak;
  $("#homeGoalNum").textContent = u.dailyGoal;
  const pct = Math.min(u.todayLearned / u.dailyGoal, 1);
  $("#homeRingNum").textContent = u.todayLearned;
  const ring = $("#homeRing");
  const C = 2 * Math.PI * 48;
  ring.setAttribute("stroke-dasharray", C);
  ring.setAttribute("stroke-dashoffset", C * (1 - pct));

  // today's word preview (first 6 learning/new words)
  const todayWords = DB.words.filter(w => w.status !== "mastered").slice(0, 6);
  $("#homeWordList").innerHTML = todayWords.map(w =>
    `<div class="word-chip" data-go="learn"><div class="wc-word">${w.word}</div><div class="wc-mean">${w.meaning}</div></div>`
  ).join("");
}

/* ============================================================
   LEARN (Flashcard)
   ============================================================ */
function initLearn() {
  State.learn.queue = DB.words.filter(w => w.status !== "mastered").slice(0, 10);
  if (State.learn.queue.length === 0) {
    State.learn.queue = DB.words.slice(0, 10);
  }
  State.learn.idx = 0;
  State.learn.known = 0;
  State.learn.total = State.learn.queue.length;
  $("#learnTotal").textContent = State.learn.total;
  renderLearn();
}

function renderLearn() {
  const { queue, idx } = State.learn;
  if (idx >= queue.length) {
    showLearnComplete();
    return;
  }
  const w = queue[idx];
  $("#learnCur").textContent = idx + 1;
  $("#fcWord").textContent = w.word;
  $("#fcPhonetic").textContent = w.phonetic;
  $("#fcPos").textContent = w.pos;
  $("#fcMeaning").textContent = w.meaning;
  $("#fcExample").textContent = w.example;
  $("#fcExampleCn").textContent = w.exampleCn;
  // reset flip
  State.learn.flipped = false;
  $("#flashcard").classList.remove("flipped");
  // progress
  const pct = (idx) / State.learn.total * 100;
  $("#learnBar").style.width = pct + "%";
  const rate = State.learn.known / Math.max(idx, 1) * 100;
  $("#learnRate").textContent = `记忆率 ${Math.round(rate)}%`;
}

function flipCard() {
  if (State.learn.idx >= State.learn.queue.length) return;
  State.learn.flipped = !State.learn.flipped;
  $("#flashcard").classList.toggle("flipped", State.learn.flipped);
}

async function handleLearn(known) {
  const { queue, idx } = State.learn;
  if (idx >= queue.length) return;
  const w = queue[idx];
  if (known) State.learn.known++;
  // API stub: record learn behavior
  await recordLearn(w.id, known);
  // advance
  State.learn.idx++;
  if (State.learn.idx >= State.learn.total) {
    showLearnComplete();
  } else {
    renderLearn();
  }
}

function showLearnComplete() {
  $("#learnCur").textContent = State.learn.total;
  $("#learnBar").style.width = "100%";
  $("#learnRate").textContent = `记忆率 ${Math.round(State.learn.known / State.learn.total * 100)}%`;
  $("#fcWord").textContent = "完成！";
  $("#fcPhonetic").textContent = "";
  $("#fcPos").textContent = "";
  $("#fcMeaning").textContent = `本轮掌握 ${State.learn.known}/${State.learn.total}`;
  $("#fcExample").textContent = State.learn.known >= State.learn.total / 2 ? "表现不错，继续保持！" : "多复习，你会更棒。";
  $("#fcExampleCn").textContent = "点击「认识」可重新开始";
  $("#flashcard").classList.remove("flipped");
}

// restart learn when at end
document.addEventListener("click", (e) => {
  const el = e.target.closest('[data-go="next-known"]');
  if (el && State.learn.idx >= State.learn.total) {
    initLearn();
  }
});

/* ============================================================
   QUIZ
   ============================================================ */
function initQuiz() {
  const pool = DB.words.filter(w => w.status !== "mastered").slice(0, 5);
  State.quiz.queue = pool.length ? pool : DB.words.slice(0, 5);
  State.quiz.idx = 0;
  State.quiz.correct = 0;
  State.quiz.answered = false;
  $("#quizTotal").textContent = State.quiz.queue.length;
  renderQuiz();
}

function renderQuiz() {
  const { queue, idx } = State.quiz;
  if (idx >= queue.length) { showQuizComplete(); return; }
  const w = queue[idx];
  $("#quizIndex").textContent = idx + 1;
  $("#quizCorrect").textContent = State.quiz.correct;
  $("#quizWord").textContent = w.word;
  $("#quizPhonetic").textContent = w.phonetic;
  $("#quizHint").textContent = "请选择正确的中文释义";
  State.quiz.answered = false;
  State.quiz.selected = null;
  $("#quizFeedback").classList.remove("show");
  $("#quizNext").disabled = true;
  $("#quizNext").textContent = idx === queue.length - 1 ? "查看结果" : "下一题";

  // build options: correct meaning + 3 distractors from other words
  const distractors = DB.words.filter(x => x.id !== w.id).map(x => x.meaning);
  const opts = [w.meaning, ...shuffle(distractors)].slice(0, 4);
  const keys = ["A", "B", "C", "D"];
  $("#quizOptions").innerHTML = opts.map((o, i) =>
    `<button class="quiz-opt" data-meaning="${o}" data-correct="${o === w.meaning}"><span class="opt-key">${keys[i]}</span><span>${o}</span></button>`
  ).join("");
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

document.addEventListener("click", (e) => {
  const opt = e.target.closest(".quiz-opt");
  if (!opt || State.quiz.answered) return;
  const correct = opt.dataset.correct === "true";
  State.quiz.answered = true;
  State.quiz.selected = correct;
  if (correct) State.quiz.correct++;
  // mark all options
  $$("#quizOptions .quiz-opt").forEach(o => {
    o.classList.add("disabled");
    if (o.dataset.correct === "true") o.classList.add("correct");
    if (o === opt && !correct) o.classList.add("wrong");
  });
  // feedback
  const fb = $("#quizFeedback");
  const w = State.quiz.queue[State.quiz.idx];
  fb.classList.add("show", correct ? "right" : "wrong");
  $("#qfText").textContent = correct ? "回答正确！" : "再想想～";
  $("#qfMean").textContent = `正确释义：${w.meaning}`;
  $("#quizCorrect").textContent = State.quiz.correct;
  $("#quizNext").disabled = false;
});

$("#quizNext").addEventListener("click", () => {
  State.quiz.idx++;
  renderQuiz();
});

function showQuizComplete() {
  const rate = Math.round(State.quiz.correct / State.quiz.queue.length * 100);
  $("#quizWord").textContent = "测试完成";
  $("#quizPhonetic").textContent = `正确率 ${rate}%`;
  $("#quizHint").textContent = `本轮答对 ${State.quiz.correct} / ${State.quiz.queue.length}`;
  $("#quizOptions").innerHTML = `<div style="text-align:center;padding:24px;color:var(--c-text-sub)">${rate >= 80 ? "太棒了！" : rate >= 60 ? "还不错，继续加油" : "再多练习一下哦"}</div>`;
  $("#quizIndex").textContent = State.quiz.queue.length;
  $("#quizCorrect").textContent = State.quiz.correct;
  $("#quizNext").disabled = true;
}

/* ============================================================
   STATS
   ============================================================ */
async function renderStats() {
  const data = await fetchStats();
  const { weekly, heatmap } = data.data;
  const maxVal = Math.max(...weekly.map(d => d.val));
  $("#weekChart").innerHTML = weekly.map(d => {
    const h = (d.val / maxVal * 130) + 6;
    return `<div class="chart-bar-col"><div class="chart-bar ${d.isToday ? "today" : ""}" style="height:${h}px"></div><div class="chart-bar-label">${d.day}</div></div>`;
  }).join("");

  $("#heatmap").innerHTML = heatmap.map(c =>
    `<div class="heat-cell ${c.level ? "l" + c.level : ""}" ${c.isToday ? 'style="box-shadow:0 0 0 2px var(--c-accent)"' : ""}></div>`
  ).join("");
}

/* ============================================================
   LIBRARY
   ============================================================ */
async function renderLibrary() {
  const { filter, keyword } = State.library;
  const data = await fetchWords({ status: filter, keyword });
  const list = data.data;
  if (list.length === 0) {
    $("#wordList").innerHTML = `<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><div class="es-text">没有找到相关单词</div></div>`;
    return;
  }
  $("#wordList").innerHTML = list.map(w =>
    `<div class="word-row" data-word="${w.id}"><div class="wr-word">${w.word}</div><div class="wr-mean">${w.meaning}</div>${statusBadge(w.status)}<div class="wr-arrow"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></div></div>`
  ).join("");
}

$("#filterTabs").addEventListener("click", (e) => {
  const tab = e.target.closest(".filter-tab");
  if (!tab) return;
  $$("#filterTabs .filter-tab").forEach(t => t.classList.remove("active"));
  tab.classList.add("active");
  State.library.filter = tab.dataset.filter;
  renderLibrary();
});

let searchTimer;
$("#searchInput").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  const val = e.target.value.trim();
  searchTimer = setTimeout(() => {
    State.library.keyword = val;
    renderLibrary();
  }, 250);
});

// word row click → go to learn screen
$("#wordList").addEventListener("click", (e) => {
  const row = e.target.closest(".word-row");
  if (!row) return;
  const wordId = row.dataset.word;
  const w = DB.words.find(x => x.id === Number(wordId));
  if (w) toast(`${w.word} · ${w.meaning}`);
  switchScreen("learn");
});

/* ============================================================
   ME
   ============================================================ */
function renderMe() {
  const achMap = {
    sparkles: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/></svg>',
    flame: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
    bookOpen: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
    trophy: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
    calendar: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    brain: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/></svg>',
    medal: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><circle cx="12" cy="17" r="5"/></svg>',
    crown: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7z"/><path d="M5 16h14"/></svg>',
  };
  $("#achGrid").innerHTML = DB.achievements.map(a =>
    `<div class="ach-item"><div class="ach-icon ${a.color}">${achMap[a.icon] || achMap.sparkles}</div><div class="ach-label" style="${a.unlocked ? '' : 'opacity:.4'}">${a.label}</div></div>`
  ).join("");

  // toggles
  $("#notifyToggle").classList.toggle("on", State.notify);
  $("#darkToggle").classList.toggle("on", State.dark);
  $("#goalVal").textContent = DB.user.dailyGoal + " 词";
}

$("#notifyToggle").addEventListener("click", (e) => {
  State.notify = !State.notify;
  renderMe();
  toast(State.notify ? "已开启学习提醒" : "已关闭学习提醒");
});

$("#darkToggle").addEventListener("click", (e) => {
  State.dark = !State.dark;
  document.body.classList.toggle("dark", State.dark);
  renderMe();
  toast(State.dark ? "已切换深色模式" : "已切换浅色模式");
});

$("#goalRow").addEventListener("click", () => {
  toast("每日目标设置功能开发中");
});

/* ============================================================
   INIT
   ============================================================ */
function init() {
  renderHome();
  initLearn();
  initQuiz();
  renderStats();
  renderLibrary();
  renderMe();
}

document.addEventListener("DOMContentLoaded", init);
