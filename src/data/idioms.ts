// 常用多词短语与口语表达 (IDIOMS)
// 单独场景：category = 'idioms'
// 含空格/逗号的短语不进主词库，统一归到这里管理
import type { Word } from './types'

export const IDIOMS: Word[] = [
  // === 来自 CEFR 主库但被主词库过滤掉的 10 条 ===
  { word: 'a, an', level: 'A1', ipa: 'eɪ; æn', pos: 'art.', meaning: '冠词（a 用于辅音音素前，an 用于元音音素前）', examples: [
    { en: 'a book / an apple', zh: '一本书 / 一个苹果' }
  ], category: 'idioms' },
  { word: 'have to', level: 'A1', ipa: 'ˈhæv tu', pos: 'modalv.', meaning: '必须，不得不', examples: [
    { en: 'I have to finish this today.', zh: '我今天得把这个做完。' }
  ], category: 'idioms' },
  { word: 'used to', level: 'A2', ipa: 'ˈjuːst tu', pos: 'modalv.', meaning: '过去常常', examples: [
    { en: 'I used to play basketball.', zh: '我过去常打篮球。' }
  ], category: 'idioms' },
  { word: 'next to', level: 'A1', ipa: 'ˈnekst tu', pos: 'prep.', meaning: '紧挨着，靠近', examples: [
    { en: 'The gym is next to the library.', zh: '体育馆紧挨着图书馆。' }
  ], category: 'idioms' },
  { word: 'no one', level: 'A1', ipa: 'ˈnəʊ wʌn', pos: 'pron.', meaning: '没有人', examples: [
    { en: 'No one answered the phone.', zh: '没人接电话。' }
  ], category: 'idioms' },
  { word: 'all right', level: 'A2', ipa: 'ɔːl ˈraɪt', pos: 'int./adj.', meaning: '好的；还行', examples: [
    { en: '— Are you OK? — All right.', zh: '— 你没事吧？ — 还好。' }
  ], category: 'idioms' },
  { word: 'any more', level: 'A2', ipa: 'ˈeni mɔː(r)', pos: 'adv.', meaning: '再；还', examples: [
    { en: 'I don\'t want any more coffee.', zh: '我不想再喝咖啡了。' }
  ], category: 'idioms' },
  { word: 'according to', level: 'A2', ipa: 'əˈkɔːdɪŋ tu', pos: 'prep.', meaning: '根据，按照', examples: [
    { en: 'According to the weather report...', zh: '根据天气预报……' }
  ], category: 'idioms' },
  { word: 'per cent', level: 'A2', ipa: 'pə ˈsent', pos: 'n.', meaning: '百分之…', examples: [
    { en: 'Ten per cent of the population.', zh: '百分之十的人口。' }
  ], category: 'idioms' },
  { word: 'ice cream', level: 'A1', ipa: 'ˈaɪs kriːm', pos: 'n.', meaning: '冰淇淋', examples: [
    { en: 'I love chocolate ice cream.', zh: '我爱吃巧克力冰淇淋。' }
  ], category: 'idioms' },

  // === 常用口语缩写 / 情态短语 ===
  { word: 'going to', level: 'A2', ipa: 'ˈɡəʊɪŋ tu', pos: 'modalv.', meaning: '打算，将要（be going to）', examples: [], category: 'idioms' },
  { word: 'want to', level: 'A2', ipa: 'wɒnt tu', pos: 'modalv.', meaning: '想要（want to）', examples: [], category: 'idioms' },
  { word: 'got to', level: 'B1', ipa: 'ˈɡɒt tu', pos: 'modalv.', meaning: '必须，得（have got to）', examples: [], category: 'idioms' },
  { word: 'kind of', level: 'A2', ipa: 'kaɪnd əv', pos: 'adv.', meaning: '有点，稍微', examples: [
    { en: 'It\'s kind of cold today.', zh: '今天有点冷。' }
  ], category: 'idioms' },
  { word: 'sort of', level: 'B1', ipa: 'sɔːt əv', pos: 'adv.', meaning: '有点，算是', examples: [], category: 'idioms' },
  { word: 'a lot of', level: 'A1', ipa: 'ə lɒt əv', pos: 'det.', meaning: '许多，大量', examples: [
    { en: 'There are a lot of books.', zh: '有很多书。' }
  ], category: 'idioms' },
  { word: 'lots of', level: 'A2', ipa: 'lɒts əv', pos: 'det.', meaning: '许多，大量', examples: [], category: 'idioms' },
  { word: 'a bit', level: 'A2', ipa: 'ə bɪt', pos: 'adv.', meaning: '有点，稍微', examples: [
    { en: 'I\'m a bit tired.', zh: '我有点累。' }
  ], category: 'idioms' },
  { word: 'a little', level: 'A2', ipa: 'ə ˈlɪtl', pos: 'adv.', meaning: '有点，稍微', examples: [], category: 'idioms' },
  { word: 'a few', level: 'A1', ipa: 'ə fjuː', pos: 'det.', meaning: '几个', examples: [
    { en: 'A few people came.', zh: '来了几个人。' }
  ], category: 'idioms' },
  { word: 'a little bit', level: 'B1', ipa: 'ə ˈlɪtl bɪt', pos: 'adv.', meaning: '一点点', examples: [], category: 'idioms' },

  // === 介词短语 ===
  { word: 'in front of', level: 'A1', ipa: 'ɪn frʌnt əv', pos: 'prep.', meaning: '在……前面', examples: [], category: 'idioms' },
  { word: 'close to', level: 'A2', ipa: 'kləʊs tu', pos: 'prep.', meaning: '靠近', examples: [], category: 'idioms' },
  { word: 'due to', level: 'B1', ipa: 'djuː tu', pos: 'prep.', meaning: '由于', examples: [], category: 'idioms' },
  { word: 'thanks to', level: 'B1', ipa: 'θæŋks tu', pos: 'prep.', meaning: '多亏', examples: [], category: 'idioms' },
  { word: 'as well as', level: 'B1', ipa: 'æz wel æz', pos: 'conj.', meaning: '以及，也', examples: [], category: 'idioms' },
  { word: 'because of', level: 'A2', ipa: 'bɪˈkɒz əv', pos: 'prep.', meaning: '因为', examples: [], category: 'idioms' },
  { word: 'instead of', level: 'A2', ipa: 'ɪnˈsted əv', pos: 'prep.', meaning: '代替，而不是', examples: [], category: 'idioms' },
  { word: 'except for', level: 'A2', ipa: 'ɪkˈsept fə(r)', pos: 'prep.', meaning: '除了', examples: [], category: 'idioms' },
  { word: 'in case', level: 'B1', ipa: 'ɪn keɪs', pos: 'conj.', meaning: '以防万一', examples: [], category: 'idioms' },

  // === 口语常用表达 ===
  { word: 'you know', level: 'B1', ipa: 'juː nəʊ', pos: 'int.', meaning: '你知道（口语填充）', examples: [], category: 'idioms' },
  { word: 'I mean', level: 'B1', ipa: 'aɪ miːn', pos: 'int.', meaning: '我是说（口语填充）', examples: [], category: 'idioms' },
  { word: 'by the way', level: 'A2', ipa: 'baɪ ðə weɪ', pos: 'int.', meaning: '顺便说一下', examples: [], category: 'idioms' },
  { word: 'for example', level: 'A1', ipa: 'fɔː ɪɡˈzɑːmpl', pos: 'adv.', meaning: '例如', examples: [], category: 'idioms' },
  { word: 'on the other hand', level: 'B1', ipa: 'ɒn ði ˈʌðə hænd', pos: 'adv.', meaning: '另一方面', examples: [], category: 'idioms' },
  { word: 'to be honest', level: 'B1', ipa: 'tuː bi ˈɒnɪst', pos: 'int.', meaning: '老实说', examples: [], category: 'idioms' },
  { word: 'as a result', level: 'B1', ipa: 'æz ə rɪˈzʌlt', pos: 'adv.', meaning: '结果', examples: [], category: 'idioms' },
  { word: 'in fact', level: 'A2', ipa: 'ɪn fækt', pos: 'adv.', meaning: '事实上', examples: [], category: 'idioms' },
  { word: 'at first', level: 'A2', ipa: 'æt fɜːst', pos: 'adv.', meaning: '起初', examples: [], category: 'idioms' },
  { word: 'at last', level: 'A2', ipa: 'æt lɑːst', pos: 'adv.', meaning: '终于', examples: [], category: 'idioms' },
  { word: 'in the end', level: 'A2', ipa: 'ɪn ði end', pos: 'adv.', meaning: '最后', examples: [], category: 'idioms' },
  { word: 'right now', level: 'A2', ipa: 'raɪt naʊ', pos: 'adv.', meaning: '此刻，马上', examples: [], category: 'idioms' },
  { word: 'no longer', level: 'B1', ipa: 'nəʊ ˈlɒŋɡə(r)', pos: 'adv.', meaning: '不再', examples: [], category: 'idioms' },
]
