/* ============================================================
   mock 数据 —— 词库 + 阶梯 + 场景分类 + 词根词缀
   ============================================================ */

// 学习阶梯（中国式递进）
const LADDER = [
  { id: 'kinder', label: '幼儿园' },
  { id: 'primary', label: '小学' },
  { id: 'g7', label: '初一' },
  { id: 'g8', label: '初二' },
  { id: 'g9', label: '初三' },
  { id: 'h1', label: '高一' },
  { id: 'h2', label: '高二' },
  { id: 'h3', label: '高三' },
  { id: 'cet4', label: '四级' },
  { id: 'cet6', label: '六级' },
  { id: 'kaoyan', label: '考研' },
];

// 场景分类
const SCENES = [
  { id: 'all', label: '全部' },
  { id: 'fruit', label: '水果' },
  { id: 'people', label: '人物' },
  { id: 'clothes', label: '衣物' },
  { id: 'weather', label: '天气' },
  { id: 'food', label: '食物' },
  { id: 'travel', label: '旅行' },
  { id: 'nature', label: '自然' },
  { id: 'home', label: '家庭' },
  { id: 'school', label: '学校' },
  { id: 'time', label: '时间' },
  { id: 'emotion', label: '情感' },
  { id: 'work', label: '工作' },
];

const WORDS = [
  // ---- 小学 ----
  { key: 'apple', word: 'apple', ipa: '/ˈæp.əl/', pos: 'n.', meaning: '苹果', cat: 'fruit', root: '—', ladder: 'primary',
    examples: [{ en: 'I eat an apple every day.', zh: '我每天吃一个苹果。' }] },
  { key: 'happy', word: 'happy', ipa: '/ˈhæp.i/', pos: 'adj.', meaning: '快乐的；高兴的', cat: 'emotion', root: 'hapl-（机会）+ -y', ladder: 'primary',
    examples: [{ en: 'She is very happy today.', zh: '她今天很开心。' }] },
  { key: 'water', word: 'water', ipa: '/ˈwɔː.tər/', pos: 'n.', meaning: '水', cat: 'nature', root: 'aqua-（水）', ladder: 'primary',
    examples: [{ en: 'Please give me some water.', zh: '请给我一些水。' }] },
  { key: 'house', word: 'house', ipa: '/haʊs/', pos: 'n.', meaning: '房子', cat: 'home', root: 'dom-（家）', ladder: 'primary',
    examples: [{ en: 'My house is very big.', zh: '我的房子很大。' }] },
  { key: 'friend', word: 'friend', ipa: '/frend/', pos: 'n.', meaning: '朋友', cat: 'people', root: '—', ladder: 'primary',
    examples: [{ en: 'He is my best friend.', zh: '他是我最好的朋友。' }] },
  { key: 'english', word: 'English', ipa: '/ˈɪŋ.ɡlɪʃ/', pos: 'n.', meaning: '英语；英国人', cat: 'school', root: 'Angles（盎格鲁人）', ladder: 'primary',
    examples: [{ en: 'I study English at school.', zh: '我在学校学英语。' }] },
  { key: 'family', word: 'family', ipa: '/ˈfæm.əl.i/', pos: 'n.', meaning: '家庭', cat: 'people', root: 'fam-（家庭）', ladder: 'primary',
    examples: [{ en: 'My family is small.', zh: '我的家庭很小。' }] },
  // ---- 初一 ----
  { key: 'journey', word: 'journey', ipa: '/ˈdʒɜː.ni/', pos: 'n.', meaning: '旅程；旅行', cat: 'travel', root: 'jour-（日）→ 一日行程', ladder: 'g7',
    examples: [{ en: 'We had a long journey home.', zh: '我们回家的旅程很长。' }] },
  { key: 'weather', word: 'weather', ipa: '/ˈweð.ər/', pos: 'n.', meaning: '天气', cat: 'weather', root: '—', ladder: 'g7',
    examples: [{ en: 'How is the weather today?', zh: '今天天气怎么样？' }] },
  // ---- 初二 ----
  { key: 'discover', word: 'discover', ipa: '/dɪˈskʌv.ər/', pos: 'v.', meaning: '发现；发觉', cat: 'school', root: 'dis-（分开）+ cover（盖）', ladder: 'g8',
    examples: [{ en: 'Scientists discovered a new star.', zh: '科学家发现了一颗新恒星。' }] },
  { key: 'brave', word: 'brave', ipa: '/breɪv/', pos: 'adj.', meaning: '勇敢的', cat: 'emotion', root: '—', ladder: 'g8',
    examples: [{ en: 'The boy was brave in the storm.', zh: '男孩在暴风雨中很勇敢。' }] },
  { key: 'forest', word: 'forest', ipa: '/ˈfɒr.ɪst/', pos: 'n.', meaning: '森林', cat: 'nature', root: 'for-（外面）→ 户外之林', ladder: 'g8',
    examples: [{ en: 'The forest is home to many animals.', zh: '森林是许多动物的家。' }] },
  { key: 'weekend', word: 'weekend', ipa: '/ˌwiːkˈend/', pos: 'n.', meaning: '周末', cat: 'time', root: 'week（周）+ end（末）', ladder: 'g8',
    examples: [{ en: 'What do you do on the weekend?', zh: '你周末做什么？' }] },
  // ---- 初三 ----
  { key: 'volunteer', word: 'volunteer', ipa: '/ˌvɒl.ənˈtɪər/', pos: 'n.', meaning: '志愿者', cat: 'work', root: 'vol-（意愿）', ladder: 'g9',
    examples: [{ en: 'She works as a volunteer at the hospital.', zh: '她在医院做志愿者。' }] },
  { key: 'achieve', word: 'achieve', ipa: '/əˈtʃiːv/', pos: 'v.', meaning: '实现；取得', cat: 'school', root: 'ad-（到）+ chiev（抓住）', ladder: 'g9',
    examples: [{ en: 'You can achieve your dreams.', zh: '你可以实现你的梦想。' }] },
  { key: 'travel', word: 'travel', ipa: '/ˈtræv.əl/', pos: 'v.', meaning: '旅行', cat: 'travel', root: '—', ladder: 'g9',
    examples: [{ en: 'I love to travel in summer.', zh: '我喜欢在夏天旅行。' }] },
  { key: 'message', word: 'message', ipa: '/ˈmes.ɪdʒ/', pos: 'n.', meaning: '消息；信息', cat: 'people', root: 'messe（信使）', ladder: 'g9',
    examples: [{ en: 'I got a message from my teacher.', zh: '我收到了老师的消息。' }] },
  // ---- 高一 ----
  { key: 'agriculture', word: 'agriculture', ipa: '/ˈæɡ.rɪ.kʌl.tʃər/', pos: 'n.', meaning: '农业', cat: 'nature', root: 'agri-（田）+ cultura（耕作）', ladder: 'h1',
    examples: [{ en: 'Agriculture is important for the country.', zh: '农业对这个国家很重要。' }] },
  { key: 'advantage', word: 'advantage', ipa: '/ədˈvɑːn.tɪdʒ/', pos: 'n.', meaning: '优势；有利条件', cat: 'work', root: 'ad-（向）+ vant（前）', ladder: 'h1',
    examples: [{ en: 'Speaking English well is a big advantage.', zh: '英语说得好是很大的优势。' }] },
  // ---- 高二 ----
  { key: 'accommodation', word: 'accommodation', ipa: '/əˌkɒm.əˈdeɪ.ʃən/', pos: 'n.', meaning: '住宿', cat: 'travel', root: 'ac-（加强）+ commod（方便）', ladder: 'h2',
    examples: [{ en: 'The hotel offers accommodation and meals.', zh: '酒店提供住宿和餐饮。' }] },
  { key: 'adolescent', word: 'adolescent', ipa: '/ˌæd.əˈles.ənt/', pos: 'n.', meaning: '青少年', cat: 'people', root: 'ad-（向）+ ol（长大）', ladder: 'h2',
    examples: [{ en: 'Adolescents need more sleep.', zh: '青少年需要更多睡眠。' }] },
  // ---- 高三 ----
  { key: 'ambiguous', word: 'ambiguous', ipa: '/æmˈbɪɡ.ju.əs/', pos: 'adj.', meaning: '模糊的；模棱两可的', cat: 'school', root: 'ambi-（两边）+ agere（做）', ladder: 'h3',
    examples: [{ en: 'His answer was ambiguous.', zh: '他的回答模棱两可。' }] },
  { key: 'anticipate', word: 'anticipate', ipa: '/ænˈtɪs.ɪ.peɪt/', pos: 'v.', meaning: '预料；期待', cat: 'emotion', root: 'anti-（前）+ cip（抓）', ladder: 'h3',
    examples: [{ en: 'We anticipate great success.', zh: '我们期待巨大的成功。' }] },
  // ---- 四级 ----
  { key: 'abandon', word: 'abandon', ipa: '/əˈbæn.dən/', pos: 'v.', meaning: '放弃；抛弃', cat: 'school', root: 'a-（离开）+ band（约束）', ladder: 'cet4',
    examples: [{ en: 'He abandoned his car in the snow.', zh: '他把汽车丢在了雪地里。' }] },
  { key: 'absorb', word: 'absorb', ipa: '/əbˈzɔːb/', pos: 'v.', meaning: '吸收；吸引', cat: 'nature', root: 'ab-（离开）+ sorb（吸）', ladder: 'cet4',
    examples: [{ en: 'Plants absorb sunlight.', zh: '植物吸收阳光。' }] },
  // ---- 六级 ----
  { key: 'abundant', word: 'abundant', ipa: '/əˈbʌn.dənt/', pos: 'adj.', meaning: '丰富的；充裕的', cat: 'nature', root: 'ab-（加强）+ und（波浪）', ladder: 'cet6',
    examples: [{ en: 'The region has abundant natural resources.', zh: '该地区自然资源丰富。' }] },
  { key: 'accelerate', word: 'accelerate', ipa: '/əkˈsel.ər.eɪt/', pos: 'v.', meaning: '加速；促进', cat: 'work', root: 'ac-（加强）+ celer（快）', ladder: 'cet6',
    examples: [{ en: 'The car accelerated down the hill.', zh: '汽车沿山坡加速下行。' }] },
  // ---- 考研 ----
  { key: 'accommodate', word: 'accommodate', ipa: '/əˈkɒm.ə.deɪt/', pos: 'v.', meaning: '容纳；适应', cat: 'home', root: 'ac-（加强）+ commod（方便）', ladder: 'kaoyan',
    examples: [{ en: 'The hotel can accommodate 200 guests.', zh: '这家酒店可容纳 200 位客人。' }] },
  { key: 'acknowledge', word: 'acknowledge', ipa: '/əkˈnɒl.ɪdʒ/', pos: 'v.', meaning: '承认；致谢', cat: 'people', root: 'ac-（加强）+ knowledge（知晓）', ladder: 'kaoyan',
    examples: [{ en: 'He acknowledged his mistake.', zh: '他承认了自己的错误。' }] },
];

// 掌握状态：true = 已掌握
const MASTERED = ['apple', 'happy', 'water', 'friend', 'house', 'english', 'family'];

const STATS = {
  streak: 7,
  totalMastered: 7,
  due: 4,
  newCount: 8,
  todayGoal: 20,
  todayDone: 12,
  week: [6, 9, 4, 12, 8, 10, 12],
  todayIdx: 6,
  coverage: 0.82,
  readLessons: 5,
};

const ACHIEVEMENTS = [
  { id: 'streak7', label: '坚持7天', on: true, icon: 'flame' },
  { id: 'master20', label: '掌握20词', on: false, icon: 'sparkles' },
  { id: 'read5', label: '读5篇文', on: true, icon: 'book' },
  { id: 'early', label: '早起学习', on: true, icon: 'sun' },
  { id: 'perfect', label: '全对一轮', on: false, icon: 'target' },
  { id: 'ai', label: '生成首课', on: true, icon: 'wand' },
];

const LESSONS = [
  {
    id: 'l1', title: 'My Little Garden', type: '小故事', emoji: '📖', words: 5, coverage: 0.91, read: 3,
    segments: [
      { en: 'Every morning, I walk to my little <w>garden</w>. The <w>water</w> in the small pool shines like a mirror.', zh: '每天清晨，我都会走到我的小花园。小水池里的水像镜子一样闪亮。' },
      { en: 'My <w>friend</w> likes to come and help me. We eat an <w>apple</w> and sit in the sun.', zh: '我的朋友喜欢来帮我。我们吃着苹果，坐在阳光里。' },
      { en: 'I am <w>happy</w> here, because my garden is full of quiet life.', zh: '我在这里很快乐，因为我的花园里充满了安静的生命。' },
    ],
  },
  {
    id: 'l2', title: 'A Brave Journey', type: '小故事', emoji: '📖', words: 6, coverage: 0.78, read: 0,
    segments: [
      { en: 'One summer, a little boy decided to <w>travel</w> to the big <w>forest</w>. He wanted to <w>discover</w> what lived there.', zh: '一个夏天，一个小男孩决定去大森林旅行。他想发现那里住着什么。' },
      { en: 'The journey was long, but he was <w>brave</w>. He carried a bottle of <w>water</w> and walked all day.', zh: '旅程很长，但他很勇敢。他带着一瓶水，走了一整天。' },
      { en: 'At sunset, he saw a deer. He smiled. The forest was not scary at all.', zh: '日落时分，他看见了一只鹿。他笑了。森林一点也不可怕。' },
    ],
  },
  {
    id: 'l3', title: 'A Message from the Weekend', type: '日记', emoji: '📔', words: 4, coverage: 0.88, read: 1,
    segments: [
      { en: 'Saturday, sunny. The <w>weather</w> was perfect for a trip.', zh: '星期六，晴。天气很适合出行。' },
      { en: 'I sent a <w>message</w> to my family: “Let’s go to the park!” We had a happy <w>weekend</w> together.', zh: '我给家人发了条消息：「我们去公园吧！」我们一起度过了一个快乐的周末。' },
    ],
  },
];

const REVIEW_SESSION = [
  WORDS.find(w => w.key === 'journey'),
  WORDS.find(w => w.key === 'discover'),
  WORDS.find(w => w.key === 'weather'),
  WORDS.find(w => w.key === 'forest'),
  WORDS.find(w => w.key === 'brave'),
];

const NEW_SESSION = [
  WORDS.find(w => w.key === 'volunteer'),
  WORDS.find(w => w.key === 'achieve'),
  WORDS.find(w => w.key === 'message'),
  WORDS.find(w => w.key === 'travel'),
  WORDS.find(w => w.key === 'english'),
];

window.MOCK = { WORDS, MASTERED, STATS, ACHIEVEMENTS, LESSONS, REVIEW_SESSION, NEW_SESSION, LADDER, SCENES };
