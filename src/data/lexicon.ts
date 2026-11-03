/**
 * LexiCore 词库数据层（新版本）。
 *
 * 原型阶段的演示词库：27 个受控样本，覆盖 6 个场景、多个年级 / CEFR 等级，
 * 足以驱动六大页面与复习、闯关、互动阅读等全部交互。后续接入真实 20k 策展词库时，
 * 只需替换本文件的 `WORDS`，其余页面与算法无需改动。
 */

export interface Example {
  en: string
  zh: string
}

export interface Word {
  id: string
  word: string
  ipa: string
  pos: string[]
  m: string[]
  ex: Example[]
  grade: string
  level: string
  scene: string
  freq: number
}

export interface Scene {
  n: string
  en: string
  c: string
  i: string
}

export const SCENES: Record<string, Scene> = {
  fruit: { n: '水果', en: 'Fruit', c: '#f97316', i: '🍎' },
  clothes: { n: '衣物', en: 'Clothes', c: '#a855f7', i: '👕' },
  weather: { n: '天气', en: 'Weather', c: '#0ea5e9', i: '🌤️' },
  food: { n: '食物饮料', en: 'Food', c: '#22c55e', i: '🍞' },
  animal: { n: '动物', en: 'Animal', c: '#eab308', i: '🐱' },
  people: { n: '人物关系', en: 'People', c: '#ec4899', i: '👪' },
}

export const GRADES = ['小学', '初一', '初二', '初三', '高一', '高二', '高三', '四级', '六级', '考研']
export const CEFR = ['Pre-A1', 'A1', 'A2', 'B1', 'B2', 'C1']
export const POS = ['n.', 'v.', 'adj.', 'adv.', 'prep.', 'pron.', 'conj.', 'int.']
export const POS_CN: Record<string, string> = {
  'n.': '名词',
  'v.': '动词',
  'adj.': '形容词',
  'adv.': '副词',
  'prep.': '介词',
  'pron.': '代词',
  'conj.': '连词',
  'int.': '感叹词',
}

export type GradeWindow = 'myLevel' | 'all' | (string & {})

export const GRADE_RANK = (g: string): number => GRADES.indexOf(g)

/**
 * 词是否落在当前等级窗内：
 * - 'all'：全部
 * - 'myLevel'：我的等级及以下（按年级序号）
 * - 具体等级名：仅该等级
 */
export function inWindow(w: Word, win: GradeWindow, myLevelCn: string): boolean {
  if (win === 'all') return true
  if (win === 'myLevel') return GRADE_RANK(w.grade) <= GRADE_RANK(myLevelCn)
  return w.grade === win
}

export const WORDS: Word[] = [
  { id: 'apple', word: 'apple', ipa: 'ˈæpl', pos: ['n.'], m: ['苹果', '苹果树'], ex: [{ en: 'I eat an apple every morning.', zh: '我每天早上吃一个苹果。' }, { en: 'The apple is red and sweet.', zh: '这个苹果又红又甜。' }, { en: 'She buys apples at the market.', zh: '她在市场上买苹果。' }, { en: 'This apple tree has many fruits.', zh: '这棵苹果树结了很多果子。' }], grade: '小学', level: 'A1', scene: 'fruit', freq: 1 },
  { id: 'banana', word: 'banana', ipa: 'bəˈnɑːnə', pos: ['n.'], m: ['香蕉'], ex: [{ en: 'I like bananas.', zh: '我喜欢香蕉。' }, { en: 'The monkey is eating a banana.', zh: '猴子正在吃一根香蕉。' }, { en: 'Bananas are good for you.', zh: '香蕉对你有好处。' }], grade: '小学', level: 'A1', scene: 'fruit', freq: 2 },
  { id: 'orange', word: 'orange', ipa: 'ˈɒrɪndʒ', pos: ['n.', 'adj.'], m: ['橙子', '橙色的'], ex: [{ en: 'The orange is sweet today.', zh: '今天的橙子很甜。' }, { en: 'She is drinking orange juice.', zh: '她在喝橙汁。' }, { en: 'He bought three oranges.', zh: '他买了三个橙子。' }], grade: '小学', level: 'A1', scene: 'fruit', freq: 3 },
  { id: 'grape', word: 'grape', ipa: 'ɡreɪp', pos: ['n.'], m: ['葡萄'], ex: [{ en: 'We bought some grapes.', zh: '我们买了一些葡萄。' }, { en: 'Grapes are small and sweet.', zh: '葡萄又小又甜。' }, { en: 'She likes to eat grapes.', zh: '她喜欢吃葡萄。' }], grade: '小学', level: 'A2', scene: 'fruit', freq: 4 },
  { id: 'watermelon', word: 'watermelon', ipa: 'ˈwɔːtəmelən', pos: ['n.'], m: ['西瓜'], ex: [{ en: 'Watermelon is cool in summer.', zh: '西瓜在夏天很清凉。' }, { en: 'We eat watermelon after dinner.', zh: '我们晚饭后吃西瓜。' }, { en: 'This watermelon is very big.', zh: '这个西瓜非常大。' }], grade: '初一', level: 'A2', scene: 'fruit', freq: 5 },
  { id: 'strawberry', word: 'strawberry', ipa: 'ˈstrɔːbəri', pos: ['n.'], m: ['草莓'], ex: [{ en: 'She likes strawberry cake.', zh: '她喜欢草莓蛋糕。' }, { en: 'Strawberries are red and sweet.', zh: '草莓又红又甜。' }, { en: 'I pick strawberries in the garden.', zh: '我在花园里摘草莓。' }], grade: '初一', level: 'B1', scene: 'fruit', freq: 6 },
  { id: 'shirt', word: 'shirt', ipa: 'ʃɜːt', pos: ['n.'], m: ['衬衫'], ex: [{ en: 'He wears a white shirt.', zh: '他穿一件白衬衫。' }, { en: 'This shirt is too big for me.', zh: '这件衬衫对我来说太大了。' }, { en: 'Put on your shirt before you go out.', zh: '出门前把衬衫穿上。' }], grade: '小学', level: 'A1', scene: 'clothes', freq: 7 },
  { id: 'coat', word: 'coat', ipa: 'kəʊt', pos: ['n.'], m: ['外套'], ex: [{ en: 'It is cold, put on your coat.', zh: '天很冷，穿上外套。' }, { en: 'She has a long grey coat.', zh: '她有一件灰色长大衣。' }, { en: 'Take your coat with you.', zh: '带上你的外套。' }], grade: '初一', level: 'B1', scene: 'clothes', freq: 8 },
  { id: 'dress', word: 'dress', ipa: 'dres', pos: ['n.'], m: ['连衣裙'], ex: [{ en: 'The dress is beautiful.', zh: '这条连衣裙很漂亮。' }, { en: 'She bought a red dress yesterday.', zh: '她昨天买了一条红裙子。' }, { en: 'What a nice dress!', zh: '多漂亮的裙子啊！' }], grade: '初一', level: 'A2', scene: 'clothes', freq: 9 },
  { id: 'hat', word: 'hat', ipa: 'hæt', pos: ['n.'], m: ['帽子'], ex: [{ en: 'She has a red hat.', zh: '她有一顶红帽子。' }, { en: 'Put on your hat, the sun is strong.', zh: '戴上帽子，太阳很晒。' }, { en: 'The boy is wearing a blue hat.', zh: '男孩戴着蓝帽子。' }], grade: '小学', level: 'A1', scene: 'clothes', freq: 10 },
  { id: 'sunny', word: 'sunny', ipa: 'ˈsʌni', pos: ['adj.'], m: ['晴朗的'], ex: [{ en: 'It is a sunny day.', zh: '今天是个晴天。' }, { en: 'We go to the park on sunny days.', zh: '晴天我们会去公园。' }, { en: 'The sun is very bright today.', zh: '今天阳光很明亮。' }], grade: '小学', level: 'A1', scene: 'weather', freq: 11 },
  { id: 'rain', word: 'rain', ipa: 'reɪn', pos: ['n.', 'v.'], m: ['雨', '下雨'], ex: [{ en: 'The rain is heavy.', zh: '雨下得很大。' }, { en: 'It is going to rain this evening.', zh: '今天晚上要下雨。' }, { en: 'Take an umbrella, it may rain.', zh: '带把伞，可能会下雨。' }], grade: '小学', level: 'A1', scene: 'weather', freq: 12 },
  { id: 'snow', word: 'snow', ipa: 'snəʊ', pos: ['n.', 'v.'], m: ['雪', '下雪'], ex: [{ en: 'We play in the snow.', zh: '我们在雪里玩。' }, { en: 'It snowed all night.', zh: '雪下了一整夜。' }, { en: 'The snow is white and clean.', zh: '雪又白又干净。' }], grade: '小学', level: 'A1', scene: 'weather', freq: 13 },
  { id: 'windy', word: 'windy', ipa: 'ˈwɪndi', pos: ['adj.'], m: ['有风的'], ex: [{ en: 'It is windy outside.', zh: '外面刮风了。' }, { en: 'The wind is too strong today.', zh: '今天风太大了。' }, { en: 'Close the window, it is windy.', zh: '关上窗户，风很大。' }], grade: '初二', level: 'A2', scene: 'weather', freq: 14 },
  { id: 'cloudy', word: 'cloudy', ipa: 'ˈklaʊdi', pos: ['adj.'], m: ['多云的'], ex: [{ en: 'The sky is cloudy.', zh: '天空多云。' }, { en: 'It will be cloudy this afternoon.', zh: '今天下午会多云。' }, { en: 'Clouds cover the sun.', zh: '云遮住了太阳。' }], grade: '初二', level: 'A2', scene: 'weather', freq: 15 },
  { id: 'bread', word: 'bread', ipa: 'bred', pos: ['n.'], m: ['面包'], ex: [{ en: 'I eat bread for breakfast.', zh: '我早餐吃面包。' }, { en: 'The bread smells very good.', zh: '这面包闻起来很香。' }, { en: 'She buys bread and milk.', zh: '她买了面包和牛奶。' }], grade: '小学', level: 'A1', scene: 'food', freq: 16 },
  { id: 'water', word: 'water', ipa: 'ˈwɔːtə', pos: ['n.'], m: ['水'], ex: [{ en: 'Drink some water.', zh: '喝点水。' }, { en: 'Please give me a glass of water.', zh: '请给我一杯水。' }, { en: 'We should drink more water every day.', zh: '我们每天应该多喝水。' }], grade: '小学', level: 'A1', scene: 'food', freq: 17 },
  { id: 'rice', word: 'rice', ipa: 'raɪs', pos: ['n.'], m: ['米饭', '大米'], ex: [{ en: 'We eat rice every day.', zh: '我们每天吃米饭。' }, { en: 'This rice comes from the south.', zh: '这种大米来自南方。' }, { en: 'Would you like some rice?', zh: '你想吃点米饭吗？' }], grade: '小学', level: 'A1', scene: 'food', freq: 18 },
  { id: 'milk', word: 'milk', ipa: 'mɪlk', pos: ['n.'], m: ['牛奶'], ex: [{ en: 'Milk is good for you.', zh: '牛奶对你有好处。' }, { en: 'She drinks a glass of milk every morning.', zh: '她每天早上喝一杯牛奶。' }, { en: 'I put milk in my coffee.', zh: '我在咖啡里加牛奶。' }], grade: '小学', level: 'A1', scene: 'food', freq: 19 },
  { id: 'cat', word: 'cat', ipa: 'kæt', pos: ['n.'], m: ['猫'], ex: [{ en: 'The cat is small.', zh: '这只猫很小。' }, { en: 'My cat likes to sleep on the sofa.', zh: '我的猫喜欢睡在沙发上。' }, { en: 'The cat is drinking milk.', zh: '猫在喝牛奶。' }], grade: '小学', level: 'A1', scene: 'animal', freq: 20 },
  { id: 'dog', word: 'dog', ipa: 'dɒɡ', pos: ['n.'], m: ['狗'], ex: [{ en: 'A dog is our friend.', zh: '狗是我们的朋友。' }, { en: 'The dog runs fast in the park.', zh: '这只狗在公园里跑得很快。' }, { en: 'I walk my dog every evening.', zh: '我每天晚上遛狗。' }], grade: '小学', level: 'A1', scene: 'animal', freq: 21 },
  { id: 'elephant', word: 'elephant', ipa: 'ˈelɪfənt', pos: ['n.'], m: ['大象'], ex: [{ en: 'The elephant is big.', zh: '这只大象很大。' }, { en: 'Elephants have very long noses.', zh: '大象有很长的鼻子。' }, { en: 'The elephant likes bananas.', zh: '大象喜欢吃香蕉。' }], grade: '初一', level: 'A2', scene: 'animal', freq: 22 },
  { id: 'tiger', word: 'tiger', ipa: 'ˈtaɪɡə', pos: ['n.'], m: ['老虎'], ex: [{ en: 'The tiger is strong.', zh: '这只老虎很强壮。' }, { en: 'Tigers live in the forest.', zh: '老虎生活在森林里。' }, { en: 'The tiger is running fast.', zh: '老虎跑得很快。' }], grade: '初一', level: 'A2', scene: 'animal', freq: 23 },
  { id: 'mother', word: 'mother', ipa: 'ˈmʌðə', pos: ['n.'], m: ['母亲'], ex: [{ en: 'My mother is a teacher.', zh: '我的母亲是一位老师。' }, { en: 'My mother makes very good food.', zh: '我妈妈做的饭很好吃。' }, { en: 'I call my mother every weekend.', zh: '我每个周末给妈妈打电话。' }], grade: '小学', level: 'A1', scene: 'people', freq: 24 },
  { id: 'father', word: 'father', ipa: 'ˈfɑːðə', pos: ['n.'], m: ['父亲'], ex: [{ en: 'My father likes rice.', zh: '我父亲喜欢吃米饭。' }, { en: 'My father works in a hospital.', zh: '我父亲在医院工作。' }, { en: 'He looks like my father.', zh: '他长得像我父亲。' }], grade: '小学', level: 'A1', scene: 'people', freq: 25 },
  { id: 'teacher', word: 'teacher', ipa: 'ˈtiːtʃə', pos: ['n.'], m: ['老师'], ex: [{ en: 'The teacher is kind.', zh: '这位老师很和蔼。' }, { en: 'Our teacher speaks English very well.', zh: '我们老师英语说得很好。' }, { en: 'The students listen to the teacher.', zh: '学生们认真听老师讲课。' }], grade: '小学', level: 'A1', scene: 'people', freq: 26 },
  { id: 'friend', word: 'friend', ipa: 'frend', pos: ['n.'], m: ['朋友'], ex: [{ en: 'He is my friend.', zh: '他是我的朋友。' }, { en: 'We are good friends at school.', zh: '我们在学校是好朋友。' }, { en: 'My friend can play the guitar.', zh: '我朋友会弹吉他。' }], grade: '小学', level: 'A1', scene: 'people', freq: 27 },
]

export function findWord(id: string): Word | undefined {
  return WORDS.find((w) => w.id === id)
}

export function findWordByText(t: string): Word | undefined {
  const norm = t.replace(/[^a-zA-Z]/g, '').toLowerCase()
  if (!norm) return undefined
  return WORDS.find((w) => w.word.toLowerCase() === norm)
}

/* ---------------- 课文（互动阅读） ---------------- */
export const LESSON = {
  scene: 'fruit',
  title: '🍎 在水果店',
  body: [
    { en: 'I want a red apple and a yellow banana.', zh: '我想要一个红苹果和一根黄香蕉。' },
    { en: 'The orange is sweet today.', zh: '今天的橙子很甜。' },
  ],
  quiz: { prompt: '文中 "sweet" 最接近的意思是？', options: ['酸的', '甜的', '苦的'], answer: 1 },
  branch: {
    prompt: '店主问你还要点什么，你打算怎么回？',
    choices: ['「再来两斤葡萄。」（练 grape）', '「不用了，谢谢。」'],
  },
}

export const CH_SAMPLE = ['grape', 'coat', 'windy', 'dress', 'watermelon']
