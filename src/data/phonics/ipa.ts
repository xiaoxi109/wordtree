import type { Phoneme, PhonemeGroup } from './types'

type Raw = [w: string, zh: string, hi?: string, ipa?: string]

/**
 * 47 个国际音标（美式 General American 体系，与打包的 en_US/lessac 发音一致）。
 * 19 个元音 = 11 单元音 + 8 双元音（含 /ɪr/ /ɛr/ /ʊr/ 三个卷舌元音）；
 * 28 个辅音 = 24 个真辅音 + /tr/ /dr/ /ts/ /dz/ 四个连缀。
 *
 * 美式与英式的差异都体现在这里：DRESS 用 /ɛ/（不是 /e/）、GOAT 用 /oʊ/（不是 /əʊ/）、
 * LOT 并入 /ɑː/（father-bother 合并）、centring 双元音卷舌化为 /ɪr/ /ɛr/ /ʊr/。
 *
 * 每个音标配 6 个例词，例词完整音标由 ipaLookup 优先取美式音标（americanIpa）自动补全。
 */
function P(
  id: string,
  group: PhonemeGroup,
  zh: string,
  mouth: string,
  spellings: string[],
  examples: Raw[],
  contrast?: string[],
): Phoneme {
  return {
    id,
    ipa: `/${id}/`,
    group,
    zh,
    mouth,
    spellings,
    examples: examples.map(([w, z, hi, ipa]) => ({ w, zh: z, hi, ipa })),
    contrast,
  }
}

export const PHONEMES: Phoneme[] = [
  /* ── 单元音 12 ───────────────────────────────────────────── */
  P('iː', 'monophthong', '长「衣」', '嘴角向两边拉开像微笑，舌前部抬高，声音拉长', ['ee', 'ea', 'e', 'ie', 'ey'], [
    ['see', '看见', 'ee'],
    ['tea', '茶', 'ea'],
    ['me', '我', 'e'],
    ['field', '田野', 'ie'],
    ['green', '绿色的', 'ee'],
    ['key', '钥匙', 'ey'],
  ], ['ɪ']),
  P('ɪ', 'monophthong', '短「衣」', '嘴微张、舌前部稍抬，短促不拖长，肌肉比 /iː/ 放松', ['i', 'y', 'u', 'e', 'ui'], [
    ['sit', '坐', 'i'],
    ['big', '大的', 'i'],
    ['gym', '健身房', 'y'],
    ['busy', '忙碌的', 'u'],
    ['fish', '鱼', 'i'],
    ['six', '六', 'i'],
  ], ['iː']),
  P('ɛ', 'monophthong', '短「诶」', '嘴半张，舌尖抵下齿，短促干脆，不要滑成双元音', ['e', 'ea', 'a', 'ie'], [
    ['bed', '床', 'e'],
    ['head', '头', 'ea'],
    ['many', '许多', 'a'],
    ['friend', '朋友', 'ie'],
    ['pen', '钢笔', 'e'],
    ['red', '红色的', 'e'],
  ], ['æ']),
  P('æ', 'monophthong', '「暗」去鼻音', '嘴张大到能塞进两指，舌位低而前，嘴角向两边平拉：像说「暗」但不收鼻音 -n，比「啊」更靠前', ['a'], [
    ['cat', '猫', 'a'],
    ['hand', '手', 'a'],
    ['apple', '苹果', 'a'],
    ['black', '黑色', 'a'],
    ['bag', '包', 'a'],
    ['happy', '快乐的', 'a'],
  ], ['ɛ']),
  P('ɑː', 'monophthong', '长「啊」', '嘴自然张大，舌后部放低，声音沉而长：美音里 hot、dog 里的 o 也发这个音', ['ar', 'a', 'al', 'o', 'ear'], [
    ['car', '汽车', 'ar'],
    ['father', '父亲', 'a'],
    ['calm', '平静的', 'al'],
    ['hot', '热的', 'o'],
    ['dog', '狗', 'o'],
    ['box', '盒子', 'o'],
  ], ['ʌ']),
  P('ɔː', 'monophthong', '长「奥」', '唇收圆前突，舌后部抬高，声音拉长（thought /θɔːt/、door /dɔːr/）', ['or', 'oor', 'ore', 'aw', 'al'], [
    ['law', '法律', 'aw'],
    ['talk', '谈话', 'al'],
    ['horse', '马', 'or'],
    ['short', '短的', 'or'],
    ['door', '门', 'oor'],
    ['more', '更多', 'ore'],
  ], ['ɑː']),
  P('ʊ', 'monophthong', '短「乌」', '唇收圆但放松，舌后部抬高，短促、不拖长', ['oo', 'u', 'ou', 'o'], [
    ['book', '书', 'oo'],
    ['put', '放', 'u'],
    ['could', '能够', 'ou'],
    ['wolf', '狼', 'o'],
    ['good', '好的', 'oo'],
    ['full', '满的', 'u'],
  ], ['uː']),
  P('uː', 'monophthong', '长「乌」', '嘴唇用力收圆前突，舌后部高抬，声音拉长', ['oo', 'ue', 'u', 'ew', 'o', 'ou'], [
    ['food', '食物', 'oo'],
    ['blue', '蓝色', 'ue'],
    ['rule', '规则', 'u'],
    ['new', '新的', 'ew'],
    ['school', '学校', 'oo'],
    ['moon', '月亮', 'oo'],
  ], ['ʊ']),
  P('ʌ', 'monophthong', '短「阿」', '嘴半张、双唇完全放松，舌中部略抬，短促有力', ['u', 'o', 'ou', 'oo'], [
    ['cup', '杯子', 'u'],
    ['sun', '太阳', 'u'],
    ['love', '爱', 'o'],
    ['blood', '血', 'oo'],
    ['bus', '公共汽车', 'u'],
    ['money', '钱', 'o'],
  ], ['æ']),
  P('ɜː', 'monophthong', '长「额」', '双唇平展不圆，舌中部抬起，声音长；美音带卷舌（bird /bɝːd/）', ['ir', 'er', 'ur', 'or', 'ear'], [
    ['bird', '鸟', 'ir'],
    ['her', '她', 'er'],
    ['turn', '转弯', 'ur'],
    ['learn', '学习', 'ear'],
    ['work', '工作', 'or'],
    ['nurse', '护士', 'ur'],
  ], ['ə']),
  P('ə', 'monophthong', '弱读「呃」', '全身上下最放松的音：嘴微张、舌平放，轻轻带过，多出现在非重读音节', ['a', 'e', 'o', 'u'], [
    ['about', '关于', 'a'],
    ['sofa', '沙发', 'a'],
    ['banana', '香蕉', 'a'],
    ['problem', '问题', 'e'],
    ['ago', '以前', 'a'],
    ['open', '打开', 'o'],
  ], ['ɜː']),

  /* ── 双元音 8 ───────────────────────────────────────────── */
  P('eɪ', 'diphthong', '「诶—衣」', '从 /e/ 滑向 /ɪ/，前重后轻，口型由半张变扁', ['a_e', 'ai', 'ay', 'ea', 'ey', 'eigh'], [
    ['name', '名字', 'a'],
    ['rain', '雨', 'ai'],
    ['day', '白天', 'ay'],
    ['eight', '八', 'eigh'],
    ['game', '游戏', 'a'],
    ['play', '玩', 'ay'],
  ], ['ɛ']),
  P('aɪ', 'diphthong', '「啊—衣」', '嘴从大张滑到扁平，前重后轻，像中文「爱」的收尾', ['i_e', 'i', 'igh', 'y', 'ie'], [
    ['time', '时间', 'i'],
    ['my', '我的', 'y'],
    ['high', '高的', 'igh'],
    ['pie', '派', 'ie'],
    ['bike', '自行车', 'i'],
    ['fly', '飞', 'y'],
  ], ['ɪ']),
  P('ɔɪ', 'diphthong', '「奥—衣」', '唇由圆变扁，从 /ɔ/ 滑向 /ɪ/，重心在前', ['oi', 'oy'], [
    ['boy', '男孩', 'oy'],
    ['coin', '硬币', 'oi'],
    ['noise', '噪音', 'oi'],
    ['toy', '玩具', 'oy'],
    ['enjoy', '享受', 'oy'],
    ['voice', '声音', 'oi'],
  ]),
  P('aʊ', 'diphthong', '「啊—乌」', '嘴从大张收到圆唇，前重后轻，像中文「熬」', ['ou', 'ow'], [
    ['out', '出去', 'ou'],
    ['now', '现在', 'ow'],
    ['house', '房子', 'ou'],
    ['town', '城镇', 'ow'],
    ['down', '向下', 'ow'],
    ['flower', '花', 'ow'],
  ], ['oʊ']),
  P('oʊ', 'diphthong', '「欧—乌」', '双唇由半开到圆，从 /o/ 滑向 /ʊ/，前重后轻（go /ɡoʊ/）', ['o_e', 'o', 'oa', 'ow', 'ough'], [
    ['home', '家', 'o'],
    ['go', '去', 'o'],
    ['boat', '船', 'oa'],
    ['snow', '雪', 'ow'],
    ['coat', '外套', 'oa'],
    ['window', '窗户', 'ow'],
  ], ['aʊ']),
  P('ɪr', 'diphthong', '「衣—儿」', '从 /ɪ/ 滑向卷舌 /r/，前重后轻（美式卷舌元音）', ['ear', 'eer', 'ere', 'ier'], [
    ['ear', '耳朵', 'ear'],
    ['here', '这里', 'ere'],
    ['near', '近的', 'ear'],
    ['deer', '鹿', 'eer'],
    ['beer', '啤酒', 'eer'],
    ['year', '年', 'ear'],
  ], ['ɛr']),
  P('ɛr', 'diphthong', '「诶—儿」', '从 /ɛ/ 滑向卷舌 /r/，嘴半张（美式卷舌元音）', ['air', 'are', 'ear', 'ere', 'ar'], [
    ['air', '空气', 'air'],
    ['hair', '头发', 'air'],
    ['care', '关心', 'are'],
    ['where', '哪里', 'ere'],
    ['share', '分享', 'are'],
    ['parent', '父母', 'ar'],
  ], ['ɪr']),
  P('ʊr', 'diphthong', '「乌—儿」', '从 /ʊ/ 滑向卷舌 /r/，注意别读成 /ɔːr/', ['ure', 'our', 'oor', 'ur'], [
    ['tour', '旅行', 'our'],
    ['pure', '纯净的', 'ure'],
    ['sure', '确定的', 'ure'],
    ['cure', '治愈', 'ure'],
    ['tourist', '游客', 'our'],
    ['during', '在…期间', 'ur'],
  ], ['ɔː']),

  /* ── 辅音 24 ────────────────────────────────────────────── */
  P('p', 'consonant', '清辅音「泼」', '双唇紧闭憋气后突然放开，声带不振动（手放嘴前能感到气）', ['p', 'pp'], [
    ['pen', '钢笔', 'p'],
    ['apple', '苹果', 'pp'],
    ['cup', '杯子', 'p'],
    ['pig', '猪', 'p'],
    ['happy', '快乐的', 'pp'],
  ], ['b']),
  P('b', 'consonant', '浊辅音「波」', '口型同 /p/，但声带振动，出气更弱', ['b', 'bb'], [
    ['boy', '男孩', 'b'],
    ['rabbit', '兔子', 'bb'],
    ['job', '工作', 'b'],
    ['bag', '包', 'b'],
    ['big', '大的', 'b'],
  ], ['p']),
  P('t', 'consonant', '清辅音「特」', '舌尖抵上齿龈后突然放开，声带不振动', ['t', 'tt', 'ed'], [
    ['tea', '茶', 't'],
    ['water', '水', 't'],
    ['cat', '猫', 't'],
    ['ten', '十', 't'],
    ['city', '城市', 't'],
  ], ['d']),
  P('d', 'consonant', '浊辅音「得」', '口型同 /t/，声带振动', ['d', 'dd', 'ed'], [
    ['dog', '狗', 'd'],
    ['ladder', '梯子', 'dd'],
    ['red', '红色', 'd'],
    ['day', '白天', 'd'],
    ['good', '好的', 'd'],
  ], ['t']),
  P('k', 'consonant', '清辅音「克」', '舌根抵软腭后放开，声带不振动；c 在 a/o/u 前读 /k/', ['c', 'k', 'ck', 'ch', 'qu'], [
    ['cat', '猫', 'c'],
    ['key', '钥匙', 'k'],
    ['book', '书', 'k'],
    ['school', '学校', 'ch'],
    ['cup', '杯子', 'c'],
    ['black', '黑色', 'ck'],
  ], ['g']),
  P('g', 'consonant', '浊辅音「哥」', '口型同 /k/，声带振动', ['g', 'gg', 'gu'], [
    ['go', '去', 'g'],
    ['egg', '蛋', 'gg'],
    ['big', '大的', 'g'],
    ['game', '游戏', 'g'],
    ['bag', '包', 'g'],
  ], ['k']),
  P('f', 'consonant', '清辅音「夫」', '上齿轻抵下唇，气流从缝隙挤出，声带不振动', ['f', 'ff', 'ph', 'gh'], [
    ['fish', '鱼', 'f'],
    ['off', '关掉', 'ff'],
    ['phone', '电话', 'ph'],
    ['laugh', '笑', 'gh'],
    ['five', '五', 'f'],
    ['coffee', '咖啡', 'ff'],
  ], ['v']),
  P('v', 'consonant', '浊辅音「夫（振动）」', '口型同 /f/，声带振动；别读成 /w/', ['v'], [
    ['very', '非常', 'v'],
    ['love', '爱', 'v'],
    ['give', '给', 'v'],
    ['visit', '参观', 'v'],
    ['seven', '七', 'v'],
  ], ['f']),
  P('θ', 'consonant', '清辅音「咬舌丝」', '舌尖轻放在上下齿之间，送气但不振动；别读成 /s/', ['th'], [
    ['think', '想', 'th'],
    ['three', '三', 'th'],
    ['mouth', '嘴', 'th'],
    ['thank', '感谢', 'th'],
    ['health', '健康', 'th'],
  ], ['ð']),
  P('ð', 'consonant', '浊辅音「咬舌兹」', '口型同 /θ/，声带振动', ['th'], [
    ['this', '这个', 'th'],
    ['mother', '母亲', 'th'],
    ['they', '他们', 'th'],
    ['that', '那个', 'th'],
    ['weather', '天气', 'th'],
  ], ['θ']),
  P('s', 'consonant', '清辅音「丝」', '舌尖靠近上齿龈留细缝，气流擦出，声带不振动', ['s', 'ss', 'c', 'sc'], [
    ['see', '看见', 's'],
    ['class', '班级', 'ss'],
    ['city', '城市', 'c'],
    ['science', '科学', 'sc'],
    ['sun', '太阳', 's'],
    ['bus', '公共汽车', 's'],
  ], ['z']),
  P('z', 'consonant', '浊辅音「兹」', '口型同 /s/，声带振动，像蜜蜂嗡嗡', ['z', 'zz', 's'], [
    ['zoo', '动物园', 'z'],
    ['buzz', '嗡嗡叫', 'zz'],
    ['easy', '容易的', 's'],
    ['zero', '零', 'z'],
    ['music', '音乐', 's'],
  ], ['s']),
  P('ʃ', 'consonant', '清辅音「嘘」', '双唇稍前突，舌面靠近齿龈后部，出气不振动', ['sh', 'ti', 'ci', 's', 'ch'], [
    ['she', '她', 'sh'],
    ['fish', '鱼', 'sh'],
    ['nation', '国家', 'ti'],
    ['sure', '确定的', 's'],
    ['shop', '商店', 'sh'],
    ['special', '特别的', 'ci'],
  ], ['ʒ']),
  P('ʒ', 'consonant', '浊辅音「日语」', '口型同 /ʃ/，声带振动', ['s', 'g', 'z', 'si'], [
    ['measure', '测量', 's'],
    ['vision', '视觉', 's'],
    ['usual', '通常的', 's'],
    ['garage', '车库', 'g'],
    ['decision', '决定', 'si'],
    ['television', '电视', 'si'],
  ], ['ʃ']),
  P('h', 'consonant', '清辅音「喝」', '口自然张开，气流从喉咙呼出，声带不振动', ['h', 'wh'], [
    ['hat', '帽子', 'h'],
    ['hello', '你好', 'h'],
    ['who', '谁', 'wh'],
    ['home', '家', 'h'],
    ['behind', '在…后面', 'h'],
  ]),
  P('tʃ', 'consonant', '清辅音「吃」', '先像 /t/ 堵住，再迅速滑到 /ʃ/，整体只算一个音', ['ch', 'tch', 't', 'tu'], [
    ['chair', '椅子', 'ch'],
    ['watch', '手表', 'tch'],
    ['nature', '自然', 't'],
    ['picture', '图片', 't'],
    ['cheese', '奶酪', 'ch'],
    ['teacher', '老师', 't'],
  ], ['dʒ']),
  P('dʒ', 'consonant', '浊辅音「知」', '口型同 /tʃ/，声带振动', ['j', 'g', 'dge', 'd'], [
    ['job', '工作', 'j'],
    ['age', '年龄', 'g'],
    ['bridge', '桥', 'dge'],
    ['soldier', '士兵', 'd'],
    ['jump', '跳', 'j'],
    ['orange', '橙子', 'g'],
  ], ['tʃ']),
  P('m', 'consonant', '鼻音「嗯」', '双唇闭合，气流从鼻腔出，声带振动', ['m', 'mm', 'mb'], [
    ['man', '男人', 'm'],
    ['summer', '夏天', 'mm'],
    ['climb', '爬', 'mb'],
    ['milk', '牛奶', 'm'],
    ['woman', '女人', 'm'],
  ]),
  P('n', 'consonant', '鼻音「恩」', '舌尖抵上齿龈，气流从鼻腔出', ['n', 'nn', 'kn'], [
    ['no', '不', 'n'],
    ['sun', '太阳', 'n'],
    ['know', '知道', 'kn'],
    ['name', '名字', 'n'],
    ['dinner', '晚餐', 'nn'],
  ]),
  P('ŋ', 'consonant', '鼻音「英尾」', '舌根抵软腭，气流从鼻腔出；不要在后面多读一个 /g/', ['ng', 'n'], [
    ['sing', '唱歌', 'ng'],
    ['long', '长的', 'ng'],
    ['bank', '银行', 'n'],
    ['thing', '东西', 'ng'],
    ['English', '英语', 'ng'],
  ], ['n']),
  P('l', 'consonant', '浊辅音「勒」', '舌尖抵上齿龈，气流从舌头两侧流出，声带振动', ['l', 'll'], [
    ['look', '看', 'l'],
    ['ball', '球', 'll'],
    ['little', '小的', 'l'],
    ['leg', '腿', 'l'],
    ['yellow', '黄色的', 'll'],
  ], ['r']),
  P('r', 'consonant', '浊辅音「若」', '舌尖卷起但不碰上腭，双唇略收圆，声带振动', ['r', 'rr', 'wr'], [
    ['red', '红色', 'r'],
    ['car', '汽车', 'r'],
    ['write', '写', 'wr'],
    ['rain', '雨', 'r'],
    ['sorry', '抱歉的', 'rr'],
  ], ['l']),
  P('w', 'consonant', '半元音「喔」', '双唇收圆前突，快速滑向后面的元音，声带振动', ['w', 'wh', 'u', 'o'], [
    ['we', '我们', 'w'],
    ['water', '水', 'w'],
    ['one', '一', 'o'],
    ['quick', '快的', 'u'],
    ['window', '窗户', 'w'],
    ['always', '总是', 'w'],
  ]),
  P('j', 'consonant', '半元音「耶」', '舌面抬高贴近硬腭，快速滑向元音，像「耶」的起头', ['y', 'u', 'ew'], [
    ['yes', '是', 'y'],
    ['you', '你', 'y'],
    ['use', '使用', 'u'],
    ['few', '很少', 'ew'],
    ['year', '年', 'y'],
    ['music', '音乐', 'u'],
  ]),

  /* ── 辅音连缀 4 ─────────────────────────────────────────── */
  P('tr', 'cluster', '连缀「戳」', '先 /t/ 再迅速卷舌到 /r/，连成一个音组，不要拆开', ['tr'], [
    ['tree', '树', 'tr'],
    ['train', '火车', 'tr'],
    ['try', '尝试', 'tr'],
    ['travel', '旅行', 'tr'],
    ['street', '街道', 'tr'],
  ]),
  P('dr', 'cluster', '连缀「捉」', '先浊音 /d/ 再卷舌 /r/，声带全程振动', ['dr'], [
    ['draw', '画', 'dr'],
    ['dress', '连衣裙', 'dr'],
    ['dream', '梦', 'dr'],
    ['drive', '驾驶', 'dr'],
    ['children', '孩子们', 'dr'],
  ]),
  P('ts', 'cluster', '连缀「次」', '/t/ + /s/ 快速连读，多出现在名词复数与动词三单词尾', ['ts', 'tes'], [
    ['cats', '猫（复数）', 'ts', '/kæts/'],
    ['sits', '坐（三单）', 'ts', '/sɪts/'],
    ['gates', '大门（复数）', 'tes', '/ɡeɪts/'],
    ['students', '学生（复数）', 'ts', '/ˈstuːdənts/'],
    ['lots', '许多', 'ts', '/lɑːts/'],
  ]),
  P('dz', 'cluster', '连缀「兹」', '/d/ + /z/ 快速连读，多出现在复数词尾', ['ds', 'des'], [
    ['beds', '床（复数）', 'ds', '/bɛdz/'],
    ['needs', '需要（三单）', 'ds', '/niːdz/'],
    ['words', '单词（复数）', 'ds', '/wɜːdz/'],
    ['friends', '朋友（复数）', 'ds', '/frɛndz/'],
    ['hands', '手（复数）', 'ds', '/hændz/'],
  ]),
]

/** 掌握记录以 id 为 key，查表用 */
export const PHONEME_BY_ID: Record<string, Phoneme> = Object.fromEntries(
  PHONEMES.map((p) => [p.id, p]),
)

export const PHONEME_TOTAL = PHONEMES.length

export function phonemesOfGroup(group: PhonemeGroup): Phoneme[] {
  return PHONEMES.filter((p) => p.group === group)
}
