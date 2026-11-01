/* ============================================================
   mock.js — 背单词 App 模拟数据 (single source of truth)
   ============================================================ */

const DB = {
  user: {
    name: "Alex",
    avatarText: "A",
    bio: "每天进步一点点",
    streak: 23,
    dailyGoal: 30,
    todayLearned: 18,
    totalWords: 1247,
    mastered: 892,
    accuracy: 92,
  },

  // 词库: 24 个单词, 覆盖 new/learning/mastered 三种状态
  words: [
    { id: 1,  word: "ephemeral",     phonetic: "/ɪˈfem(ə)rəl/",  pos: "adj.", meaning: "短暂的；瞬息的",     example: "Fame, in the age of social media, can be ephemeral.", exampleCn: "在社交媒体时代，名声往往是短暂的。", status: "learning", book: "CET-6" },
    { id: 2,  word: "meticulous",     phonetic: "/məˈtɪkjʊləs/", pos: "adj.", meaning: "一丝不苟的；极细致的", example: "Her meticulous records impressed the auditors.",     exampleCn: "她细致入微的记录给审计员留下了深刻印象。", status: "mastered", book: "CET-6" },
    { id: 3,  word: "resilient",     phonetic: "/rɪˈzɪliənt/", pos: "adj.", meaning: "有韧性的；能迅速恢复的", example: "Children are often more resilient than adults expect.", exampleCn: "孩子们往往比成年人想象的更有韧性。", status: "learning", book: "CET-6" },
    { id: 4,  word: "paradigm",     phonetic: "/ˈpærədaɪm/",  pos: "n.",   meaning: "范式；典范",         example: "The invention of the smartphone created a new paradigm.", exampleCn: "智能手机的发明创造了一种新的范式。", status: "new", book: "CET-6" },
    { id: 5,  word: "ubiquitous",    phonetic: "/juːˈbɪkwɪtəs/", pos: "adj.", meaning: "无处不在的；普遍存在的", example: "Smartphones have become ubiquitous in modern life.",   exampleCn: "智能手机在现代生活中已无处不在。", status: "learning", book: "CET-6" },
    { id: 6,  word: "pragmatic",     phonetic: "/præɡˈmætɪk/", pos: "adj.", meaning: "务实的；实用主义的", example: "We need a pragmatic approach to solve this problem.", exampleCn: "我们需要用务实的方法来解决这个问题。", status: "mastered", book: "CET-6" },
    { id: 7,  word: "deference",     phonetic: "/ˈdef(ə)rəns/", pos: "n.",   meaning: "敬重；遵从",         example: "He showed deference to his elders.",                  exampleCn: "他对长辈表示尊敬。", status: "new", book: "GRE" },
    { id: 8,  word: "intrinsic",     phonetic: "/ɪnˈtrɪnsɪk/", pos: "adj.", meaning: "内在的；固有的",     example: "The intrinsic value of gold remains unchanged.",      exampleCn: "黄金的内在价值保持不变。", status: "learning", book: "CET-6" },
    { id: 9,  word: "lucid",         phonetic: "/ˈluːsɪd/",     pos: "adj.", meaning: "清晰的；明理智的",   example: "The professor gave a lucid explanation of the theory.", exampleCn: "教授对该理论给出了清晰的解释。", status: "mastered", book: "CET-6" },
    { id: 10, word: "tenacious",     phonetic: "/tɪˈneɪʃəs/",  pos: "adj.", meaning: "坚韧不拔的；固执的", example: "Her tenacious effort finally paid off.",              exampleCn: "她坚韧不拔的努力终于得到了回报。", status: "new", book: "GRE" },
    { id: 11, word: "amenable",      phonetic: "/əˈmiːnəbl/",   pos: "adj.", meaning: "顺从的；可接受影响的", example: "The policy is amenable to change if needed.",        exampleCn: "如有必要，该政策可以调整。", status: "new", book: "GRE" },
    { id: 12, word: "elaborate",     phonetic: "/ɪˈlæb(ə)rət/",pos: "adj.", meaning: "精心制作的；详尽的", example: "They made elaborate preparations for the ceremony.",   exampleCn: "他们为典礼做了精心的准备。", status: "learning", book: "CET-6" },
    { id: 13, word: "predominant",  phonetic: "/prɪˈdɒmɪnənt/",pos: "adj.", meaning: "主要的；占主导地位的", example: "English is the predominant language of science.",   exampleCn: "英语是科学领域的主要语言。", status: "mastered", book: "CET-6" },
    { id: 14, word: "verdict",       phonetic: "/ˈvɜːdɪkt/",    pos: "n.",   meaning: "裁决；结论",         example: "The jury reached a verdict after two days.",           exampleCn: "陪审团在两天后作出了裁决。", status: "new", book: "CET-6" },
    { id: 15, word: "impetus",       phonetic: "/ˈɪmpɪtəs/",   pos: "n.",   meaning: "动力；推动力",       example: "The new policy gave an impetus to local economies.", exampleCn: "新政策为地方经济注入了动力。", status: "learning", book: "GRE" },
    { id: 16, word: "salient",       phonetic: "/ˈseɪliənt/",  pos: "adj.", meaning: "显著的；最重要的",   example: "Let me highlight the salient points of the report.",  exampleCn: "让我强调报告中的几个重点。", status: "new", book: "GRE" },
    { id: 17, word: "cogent",        phonetic: "/ˈkoʊdʒənt/", pos: "adj.", meaning: "有说服力的；令人信服的", example: "He presented a cogent argument for the proposal.", exampleCn: "他为该提案提出了有说服力的论证。", status: "mastered", book: "GRE" },
    { id: 18, word: "feasible",      phonetic: "/ˈfiːzɪbl/",  pos: "adj.", meaning: "可行的；可能实现的", example: "The plan is feasible with enough funding.",           exampleCn: "只要资金充足，这个计划是可行的。", status: "learning", book: "CET-4" },
    { id: 19, word: "vitiate",       phonetic: "/ˈvɪʃieɪt/", pos: "v.",   meaning: "削弱；使失效",       example: "Poor planning can vitiate a good idea.",               exampleCn: "糟糕的规划会削弱一个好主意。", status: "new", book: "GRE" },
    { id: 20, word: "docile",        phonetic: "/ˈdoʊsaɪl/",  pos: "adj.", meaning: "温顺的；易管教的",   example: "The training made the horse docile and calm.",         exampleCn: "训练让这匹马变得温顺安静。", status: "new", book: "GRE" },
    { id: 21, word: "pernicious",    phonetic: "/pəˈnɪʃəs/",  pos: "adj.", meaning: "有害的；恶性的",     example: "Smoking has a pernicious effect on health.",           exampleCn: "吸烟对健康有有害影响。", status: "learning", book: "GRE" },
    { id: 22, word: "frugal",        phonetic: "/ˈfruːɡ(ə)l/",pos: "adj.", meaning: "节俭的；朴素的",     example: "Their frugal lifestyle allowed them to save a lot.",  exampleCn: "他们节俭的生活方式让他们存下了不少钱。", status: "mastered", book: "CET-4" },
    { id: 23, word: "ostentatious",  phonetic: "/ˌɒstɛnˈteɪʃəs/",pos: "adj.", meaning: "炫耀的；铺张的",   example: "His ostentatious display of wealth impressed no one.", exampleCn: "他炫耀财富的举动没人买账。", status: "new", book: "GRE" },
    { id: 24, word: "mundanet",      phonetic: "/mʌnˈdeɪn/",  pos: "adj.", meaning: "平凡的；世俗的",     example: "He longed for something beyond his mundane routine.",   exampleCn: "他渴望能超越平凡的日常。", status: "learning", book: "CET-6" },
  ],

  // 每日学习记录（最近 14 天，用于热力图和图表）
  records: {
    "2026-10-17": 20, "2026-10-18": 25, "2026-10-19": 18, "2026-10-20": 30,
    "2026-10-21": 22, "2026-10-22": 28, "2026-10-23": 15, "2026-10-24": 24,
    "2026-10-25": 20, "2026-10-26": 26, "2026-10-27": 30, "2026-10-28": 22,
    "2026-10-29": 18, "2026-10-30": 18,
  },

  // 成就
  achievements: [
    { id: "a1", label: "初学者", icon: "sparkles", color: "blue", unlocked: true },
    { id: "a2", label: "坚持7天", icon: "flame", color: "amber", unlocked: true },
    { id: "a3", label: "词汇达人", icon: "book-open", color: "green", unlocked: true },
    { id: "a4", label: "满分通关", icon: "trophy", color: "gold", unlocked: true },
    { id: "a5", label: "勤学不辍", icon: "calendar", color: "blue", unlocked: true },
    { id: "a6", label: "记忆大师", icon: "brain", color: "green", unlocked: false },
    { id: "a7", label: "百日打卡", icon: "medal", color: "gold", unlocked: false },
    { id: "a8", label: "测试状元", icon: "crown", color: "red", unlocked: false },
  ],
};

// 本周图表数据（周一~周日）
function getWeeklyData() {
  const days = ["一","二","三","四","五","六","日"];
  const vals = [22, 28, 15, 24, 20, 26, 18];
  return days.map((d, i) => ({ day: d, val: vals[i], isToday: i === 4 }));
}

// 热力图（最近 4 周 × 7 天）
function getHeatmap() {
  const levels = [0,1,2,3,4];
  const grid = [];
  // 4周 x 7天 = 28格，最后一天是今天(2026-10-30 周四)
  const sample = [0,2,3,0,4,1,2, 3,4,2,0,1,3,2, 4,3,2,1,4,3,0, 2,3,4,1,3,4,0];
  for (let i = 0; i < 28; i++) {
    grid.push({ level: sample[i], isToday: i === 27 });
  }
  return grid;
}

/* ---- API stubs (show future backend shape; never call real services) ---- */
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// TODO: GET /api/words?status=&book=&keyword=  — 返回单词列表
async function fetchWords({ status = "all", keyword = "" } = {}) {
  await delay(350);
  let list = DB.words;
  if (status !== "all") list = list.filter(w => w.status === status);
  if (keyword) list = list.filter(w => w.word.includes(keyword) || w.meaning.includes(keyword));
  return { code: 0, data: list, total: list.length };
}

// TODO: GET /api/stats/daily  — 返回每日学习记录
async function fetchStats() {
  await delay(300);
  return { code: 0, data: { weekly: getWeeklyData(), heatmap: getHeatmap(), records: DB.records } };
}

// TODO: POST /api/learn/record  { wordId, known }  — 记录学习行为
async function recordLearn(wordId, known) {
  await delay(200);
  // 更新本地状态模拟
  const w = DB.words.find(x => x.id === wordId);
  if (w) {
    if (known && w.status === "learning") w.status = "mastered";
    else if (!known && w.status === "new") w.status = "learning";
  }
  return { code: 0, data: { wordId, status: w ? w.status : null } };
}
