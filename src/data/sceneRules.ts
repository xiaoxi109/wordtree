import type { CategoryId } from './types'

/**
 * 场景归类规则（仅用于 ECDICT 补充词）
 * ===================================
 * ECDICT 只给「中文释义 + 词性」，没有场景分类，默认全部落到 thinking 兜底，
 * 会让「内容场景」筛选和 AI 选场景失真。这里按三级信号归类：
 *
 *   1. 词典领域标签：释义里的 [医] [法] [经] [计] [化] …（最可靠）
 *   2. 中文关键词：释义里出现「医院」「面包」「法律」这类实义词
 *   3. 词性兜底：动词 → actions，其余 → thinking
 *
 * 返回 null 表示没有把握，由调用方回退到原有 categoryOf()。
 */

/** 词典领域标签 → 场景（ECDICT 的释义里常见这些方括号标注） */
const DOMAIN_RULES: { re: RegExp; cat: CategoryId }[] = [
  { re: /\[医\]|【医】/, cat: 'health' },
  { re: /\[法\]|【法】/, cat: 'society' },
  { re: /\[经\]|【经】/, cat: 'shopping' },
  { re: /\[计\]|【计】/, cat: 'media' },
  { re: /\[化\]|【化】/, cat: 'science' },
  { re: /\[机\]|【机】/, cat: 'science' },
  { re: /\[电\]|【电】/, cat: 'media' },
  { re: /\[军\]|【军】/, cat: 'society' },
  { re: /\[农\]|【农】/, cat: 'nature' },
  { re: /\[数\]|【数】/, cat: 'numbers' },
  { re: /\[物\]|【物】/, cat: 'science' },
  { re: /\[语\]|【语】/, cat: 'communication' },
  { re: /\[音\]|【音】/, cat: 'arts' },
  { re: /\[美术\]|\[艺\]/, cat: 'arts' },
  { re: /\[体育\]/, cat: 'toys' },
  { re: /\[心\]|【心】/, cat: 'emotions' },
  { re: /\[哲\]|【哲】/, cat: 'thinking' },
]

/** 中文关键词 → 场景（顺序即优先级，越具体的放前面） */
const KEYWORD_RULES: { re: RegExp; cat: CategoryId }[] = [
  // 具体物件 / 领域优先
  { re: /医院|医生|病人|疾病|症|药|治疗|手术|护士|健康|康复|疫苗|病毒|细菌/, cat: 'health' },
  { re: /法律|法规|法庭|法官|律师|犯罪|判决|宪法|条例|诉讼|权利|义务/, cat: 'society' },
  { re: /政府|国家|政治|公民|社会|议会|选举|总统|部长|政策|外交|军|战争|和平|陪审|警|宗教|信仰|圣经|教堂|祈祷|攻击|袭击|战斗|斗士|武器|枪|炮|炸弹/, cat: 'society' },
  { re: /面包|米饭|食物|食品|饭菜|菜|饮料|水果|蔬菜|肉|蛋|奶|糖|盐|油|汤|厨师|餐厅|饮食|味道|调味|苹果|香蕉|橘子|橙子|葡萄|梨|桃子|草莓|西瓜|坚果|大米|面粉/, cat: 'food' },
  { re: /衣服|服装|穿|裙|裤|鞋|帽|衬衫|外套|西装|领带|袜|手套|围巾|时装/, cat: 'clothes' },
  { re: /家具|房间|厨房|卧室|客厅|门|窗|墙|地板|屋顶|沙发|桌|椅|床|家居|住宅|公寓/, cat: 'home' },
  { re: /动物|鸟|鱼|兽|昆虫|宠物|狗|猫|马|牛|羊|猪|鸡|鸭|狮|虎|象|猴|蛇|蛙|鼠|狼|狐|鹿|熊|熊猫/, cat: 'animals' },
  { re: /植物|树|花|草|叶|森林|山|河|海|湖|石头|岩石|天气|雨|雪|风|云|晴|温度|季节|春天|夏天|秋天|冬天|自然|地球|环境/, cat: 'nature' },
  { re: /学校|学生|老师|教师|课程|课|教育|学习|大学|学院|考试|作业|班级|教授|学位|知识|教材/, cat: 'education' },
  { re: /工作|职业|公司|经理|雇主|雇员|招聘|面试|同事|老板|职员|办公|薪水|工厂|行业|业务/, cat: 'work' },
  { re: /旅行|旅游|飞机|火车|机场|车站|酒店|旅馆|出发|到达|行李|护照|签证|观光|导游|交通|公交|地铁|汽车|车辆|卡车|轿车/, cat: 'travel' },
  { re: /钱|价格|买|卖|购物|商店|超市|支付|付款|账单|折扣|便宜|昂贵|货币|银行|账户|成本|费用|资产|财产|资金|贷款|债务|税/, cat: 'shopping' },
  { re: /科学|技术|实验|物理|化学|生物|机器|机械|工程|能源|原子|分子|数学|研究|发明|理论模型/, cat: 'science' },
  { re: /电脑|计算机|网络|互联网|手机|软件|数据|网站|程序|数字设备|电子|邮件|社交媒体|服务器/, cat: 'media' },
  { re: /艺术|音乐|歌曲|唱歌|画|绘画|电影|戏剧|舞蹈|乐器|钢琴|演出|表演|文学|诗|小说/, cat: 'arts' },
  { re: /游戏|玩具|玩|娱乐|比赛|运动|球|游泳|跑步|棋/, cat: 'toys' },
  { re: /头|脸|眼睛|眼|耳|鼻|嘴|牙|舌|唇|脖子|肩|手臂|手|手指|背|血|骨|脑|胸|心|皮肤|胃|肌肉|腿|脚|身体/, cat: 'body' },
  { re: /时间|小时|分钟|秒|星期|周一|周末|月|年|早上|上午|下午|晚上|夜|今天|明天|昨天|经常|总是|偶尔|频率/, cat: 'time' },
  { re: /高兴|快乐|悲伤|难过|害怕|恐惧|愤怒|生气|惊讶|情感|情绪|喜欢|讨厌|爱|担心|焦虑|满意|失望|骄傲|羞/, cat: 'emotions' },
  { re: /说|说话|语言|谈话|交流|沟通|告诉|讨论|演讲|口音|翻译|表达|写作|阅读|听|声音|词|争论|争吵|辩论|对话/, cat: 'communication' },
  { re: /颜色|红|蓝|绿|黄|黑|白|灰|紫|粉|棕|橙/, cat: 'colors' },
  { re: /数字|数量|数|计算|百分|一半|倍|加|减|乘|除|统计|平均|比例|多|少/, cat: 'numbers' },
  { re: /形状|大小|尺寸|长|宽|高|低|圆|方|三角|面积|体积|重量|直径/, cat: 'size' },
  { re: /思维|思想|想法|概念|理论|观点|认为|逻辑|推理|记忆|想象|判断|假设|哲学|意义/, cat: 'thinking' },
  { re: /位置|方向|上|下|左|右|前|后|里|外|旁边|中间|附近|距离|空间/, cat: 'space' },
  { re: /人|人们|朋友|家庭|父亲|母亲|孩子|男|女|性别|青年|老人|同事|成员|居民|市民|人口|离婚|婚姻|结婚|婚礼|婴儿/, cat: 'people' },
]

/**
 * 没有中文关键词时的词性兜底。
 * ECDICT 的 pos 字段常常为空，但释义开头一定带词性（"vt. 完成…"），
 * 所以这里直接读释义前缀。
 */
function posFallback(text: string): CategoryId | null {
  const head = text.trim().slice(0, 8)
  if (/^(vt|vi|v|aux)\./.test(head)) return 'actions'
  if (/^num\./.test(head)) return 'numbers'
  if (/^(prep|conj|pron|art|det|int|part)\./.test(head)) return 'grammar'
  if (/^(adv|ad|a|adj)\./.test(head)) return 'thinking'
  return null
}

/**
 * 猜测一个词的场景。
 * @param meaning ECDICT 中文释义（形如 "n. 苹果；苹果树"）
 * @param pos     词性（形如 "n." / "vt."，可能为空）
 */
export function guessScene(meaning: string, pos = ''): CategoryId | null {
  const text = meaning || ''
  if (!text) return null

  // 1. 领域标签
  for (const rule of DOMAIN_RULES) {
    if (rule.re.test(text)) return rule.cat
  }
  // 2. 关键词
  for (const rule of KEYWORD_RULES) {
    if (rule.re.test(text)) return rule.cat
  }
  // 3. 词性兜底（pos 为空时用释义前缀）
  return posFallback(pos || text)
}
