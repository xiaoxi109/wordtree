import type { CategoryId } from './types'

/**
 * 场景归类规则（用于没有人工分类的词条：ECDICT 补充词 + 外部词库）
 * ==================================================================
 * 词典只给「中文释义 + 词性」，没有场景分类，默认全部落到 thinking 兜底，
 * 会让「内容场景」筛选和 AI 选场景失真。这里按七级信号归类（先可靠、后兜底）：
 *
 *   1. 词典领域标签：释义里的 [医] [法] [经] [计] [化] …（最可靠）
 *   2. 英文疑问词：what / who / how … → 疑问词
 *   3. 英文功能词：介词/连词/代词 → 语法；数词 → 数字；频率词 → 时间；方位词 → 空间
 *   4. 中文关键词：释义里出现「医院」「面包」「法律」这类实义词
 *   5. 英文精确词表：少数手写词形（geography / psychology / shovel …）
 *   6. 英文构词后缀：-tion 抽象名词、-ist 职业、-ize 动词 …
 *   7. 词性兜底：动词 → actions，其余 → thinking
 *
 * 返回 null 表示没有把握，由调用方回退到原有 categoryOf()。
 */

/** 词典领域标签 → 场景（词典释义里常见这些方括号标注） */
const DOMAIN_RULES: { re: RegExp; cat: CategoryId }[] = [
  { re: /\[医\]|【医】/, cat: 'health' },
  { re: /\[法\]|【法】/, cat: 'law' },
  { re: /\[经\]|【经】/, cat: 'shopping' },
  { re: /\[计\]|【计】/, cat: 'tech' },
  { re: /\[化\]|【化】/, cat: 'science' },
  { re: /\[机\]|【机】/, cat: 'tech' },
  { re: /\[电\]|【电】/, cat: 'tech' },
  { re: /\[汽\]|【汽】/, cat: 'travel' },
  { re: /\[铁\]|【铁】/, cat: 'travel' },
  { re: /\[航\]|【航】/, cat: 'travel' },
  { re: /\[邮\]|【邮】/, cat: 'media' },
  { re: /\[政\]|【政】/, cat: 'society' },
  { re: /\[宗\]|【宗】/, cat: 'religion' },
  { re: /\[教\]|【教】/, cat: 'education' },
  { re: /\[体\]|【体】/, cat: 'sports' },
  { re: /\[军\]|【军】/, cat: 'military' },
  { re: /\[农\]|【农】/, cat: 'nature' },
  { re: /\[矿\]|【矿】/, cat: 'nature' },
  { re: /\[林\]|【林】/, cat: 'nature' },
  { re: /\[渔\]|【渔】/, cat: 'nature' },
  { re: /\[畜\]|【畜】/, cat: 'nature' },
  { re: /\[数\]|【数】/, cat: 'numbers' },
  { re: /\[量\]|【量】/, cat: 'numbers' },
  { re: /\[物\]|【物】/, cat: 'science' },
  { re: /\[语\]|【语】/, cat: 'communication' },
  { re: /\[音\]|【音】/, cat: 'music' },
  { re: /\[气\]|【气】/, cat: 'weather' },
  { re: /\[摄\]|【摄】/, cat: 'arts' },
  { re: /\[剧\]|【剧】/, cat: 'arts' },
  { re: /\[美术\]|\[艺\]/, cat: 'arts' },
  { re: /\[诗\]/, cat: 'arts' },
  { re: /\[食\]|【食】/, cat: 'food' },
  { re: /\[饮\]|【饮】/, cat: 'food' },
  { re: /\[衣\]|【衣】/, cat: 'clothes' },
  { re: /\[住\]|【住】/, cat: 'home' },
  { re: /\[行\]|【行】/, cat: 'travel' },
  { re: /\[银\]|【银】/, cat: 'shopping' },
  { re: /\[税\]|【税】/, cat: 'shopping' },
  { re: /\[证\]|【证】/, cat: 'work' },
  { re: /\[心\]|【心】/, cat: 'emotions' },
  { re: /\[情\]|【情】/, cat: 'emotions' },
  { re: /\[时\]|【时】/, cat: 'time' },
  { re: /\[空\]|【空】/, cat: 'space' },
  { re: /\[方\]|【方】/, cat: 'space' },
  { re: /\[位\]|【位】/, cat: 'space' },
  { re: /\[地\]|【地】/, cat: 'nature' },
  { re: /\[天\]|【天】/, cat: 'nature' },
  { re: /\[海\]|【海】/, cat: 'nature' },
  { re: /\[山\]|【山】/, cat: 'nature' },
  { re: /\[动\]|【动】/, cat: 'animals' },
  { re: /\[兽\]|【兽】/, cat: 'animals' },
  { re: /\[鸟\]|【鸟】/, cat: 'animals' },
  { re: /\[鱼\]|【鱼】/, cat: 'animals' },
  { re: /\[虫\]|【虫】/, cat: 'animals' },
  { re: /\[测\]|【测】/, cat: 'science' },
  { re: /\[检\]|【检】/, cat: 'work' },
  { re: /\[哲\]|【哲】/, cat: 'thinking' },
]

/** 英文疑问词 → 疑问词 */
const QUESTION_WORDS = new Set([
  'what', 'who', 'whom', 'whose', 'which', 'where', 'when', 'why', 'how',
])

/** 英文语法功能词（冠词/介词/连词/代词/限定词/助动词）→ 基础功能词 */
const GRAMMAR_WORDS = new Set([
  // 冠词
  'a', 'an', 'the',
  // 介词
  'of', 'in', 'on', 'at', 'to', 'for', 'with', 'from', 'by', 'into', 'onto',
  'about', 'above', 'below', 'after', 'against', 'along', 'among', 'around',
  'before', 'behind', 'beneath', 'beside', 'besides', 'between', 'beyond',
  'during', 'except', 'in front of', 'inside', 'near', 'over', 'through',
  'throughout', 'till', 'under', 'underneath', 'until', 'unto', 'upon',
  'without', 'within', 'per', 'via', 'plus', 'minus', 'versus',
  // 连词
  'and', 'or', 'but', 'if', 'so', 'as', 'than', 'that', 'whether', 'though',
  'although', 'unless', 'whereas', 'while', 'because', 'both', 'either', 'neither',
  // 代词
  'it', 'its', 'he', 'she', 'we', 'they', 'them', 'his', 'her', 'their', 'our',
  'my', 'your', 'mine', 'yours', 'hers', 'ours', 'theirs', 'i', 'you', 'me',
  'us', 'him', 'myself', 'ourselves', 'yourselves', 'themselves', 'himself',
  'herself', 'itself', 'one another',
  // 限定词 / 指示词
  'this', 'these', 'those', 'each', 'every', 'all', 'any', 'some', 'none',
  'other', 'another', 'such', 'own', 'same', 'both',
  // 助动词
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did',
  'done', 'have', 'has', 'had', 'will', 'would', 'shall', 'should', 'might',
  'must', 'can', 'could', 'ought', 'need',
  // 否定 / 存在
  'not', 'no', 'nor', 'yes', 'ok', 'okay',
])

/** 英文数词 / 数量词 → 数字与数量 */
const NUMBER_WORDS = new Set([
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'twenty',
  'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety',
  'hundred', 'thousand', 'million', 'billion', 'first', 'second', 'third',
  'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
  'once', 'twice', 'half', 'quarter', 'double', 'triple', 'zero', 'dozen',
  'pair', 'couple', 'several', 'many', 'much', 'few', 'various', 'numerous',
])

/** 英文时间 / 频率词 → 时间与频率 */
const TIME_WORDS = new Set([
  'now', 'then', 'soon', 'already', 'still', 'yet', 'again', 'always', 'never',
  'often', 'sometimes', 'usually', 'rarely', 'seldom', 'ever', 'immediately',
  'finally', 'lately', 'today', 'tomorrow', 'yesterday', 'tonight', 'weekday',
  'weekend', 'annual', 'daily', 'monthly', 'weekly', 'yearly', 'hourly',
  'hour', 'minute', 'moment', 'instant', 'season', 'spring', 'summer',
  'autumn', 'winter', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
  'saturday', 'sunday', 'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december', 'dawn',
  'dusk', 'noon', 'midnight', 'date', 'deadline', 'century', 'decade',
  'millennium', 'era', 'epoch', 'duration', 'interval', 'history', 'historic',
])

/** 英文方位 / 空间词 → 方位与空间 */
const SPACE_WORDS = new Set([
  'here', 'there', 'up', 'down', 'above', 'below', 'inside', 'outside', 'near',
  'behind', 'front', 'left', 'right', 'top', 'bottom', 'middle', 'centre',
  'center', 'edge', 'corner', 'direction', 'side', 'north', 'south', 'east',
  'west', 'northern', 'southern', 'eastern', 'western', 'northeast',
  'southwest', 'southeast', 'northwest', 'position', 'location', 'distance',
  'space', 'surface', 'latitude', 'longitude', 'horizon', 'hemisphere',
  'equator', 'upstairs', 'downstairs', 'indoors', 'outdoors', 'vicinity',
  'midway', 'backward', 'backwards', 'forward', 'forwards',
])

/** 英文外形 / 尺寸词 → 外形与尺寸 */
const SIZE_WORDS = new Set([
  'size', 'shape', 'length', 'height', 'width', 'depth', 'weight', 'radius',
  'diameter', 'volume', 'thickness', 'tiny', 'huge', 'enormous', 'gigantic',
  'minuscule', 'slender', 'broad', 'narrow', 'large', 'tiny', 'vast', 'giant',
])

/**
 * 中文关键词 → 场景
 * 顺序即优先级（越具体的场景放前面）；单字高频字尽量换成词组或加排除，
 * 避免「明白→颜色」「计划→绘画」「参加→数字」这类误判。
 */
const KEYWORD_RULES: { re: RegExp; cat: CategoryId }[] = [
  // 健康医疗
  { re: /医院|医生|病人|患者|疾病|病症|症状|药|治疗|手术|护士|健康|康复|疫苗|病毒|细菌|疗法|护理|急救|流感|发烧|咳嗽|牙医|眼科|住院|诊所|处方|化验|体检|受伤|伤口|骨折|贫血|按摩|救护|药剂|服药|肥胖|减肥|失眠|过敏|肿瘤|癌症|血压|血糖|体温|免疫|养生|医学|门诊|病房|急救车|残疾|理疗/, cat: 'health' },
  // 法律与制度
  { re: /法律|法院|法官|律师|诉讼|判决|法庭|法规|条例|宪法|犯罪|罪犯|监狱|指控|审判|罪行|违法|法令|司法|罚金|陪审|证据|证人|嫌疑|罪责/, cat: 'law' },
  // 战争与军事
  { re: /战争|军队|士兵|军人|武器|枪|坦克|军舰|部队|战役|战斗|军事|战场|兵营|核武器|停战|战斗机|轰炸机|军服|军衔|征兵/, cat: 'military' },
  // 宗教与信仰
  { re: /宗教|教堂|寺庙|清真寺|圣经|祈祷|祷告|信仰|上帝|神灵|僧侣|牧师|神父|修女|经文|教义|弥撒|朝圣|福音|佛像|佛寺|洗礼|皈依/, cat: 'religion' },
  // 节日与庆祝
  { re: /节日|圣诞|新年|元旦|春节|中秋|端午|元宵|复活节|感恩节|万圣节|生日|庆祝|庆典|纪念日|派对|聚会|烟花|红包|婚礼|周年/, cat: 'festival' },
  // 社会与国家
  { re: /政府|国家|政治|公民|社会|议会|选举|总统|部长|政策|政党|革命|和平|福利|移民|贫困|市政|公共|民族|民主|自由|平等|人权|治安|国际|外交|联合国|条约|安全|协议|恐怖|社会主义|资本|遗产|文化|游客|客人|专家|共和|警察|警官|坟墓|消防|志愿|募捐|和平主义|治安/, cat: 'society' },
  // 易误判的固定词组（放在具体场景之前，避免被「风」「学」等单字抢走）
  { re: /麦克风|扬声器|扩音器|音响|收音机|电视机/, cat: 'media' },
  // 动物（与食物同尾字，优先判定：鲨鱼/金鱼/鱼缸…）
  { re: /金鱼|鲨鱼|鲸鱼|章鱼|鱿鱼|鳄鱼|海豚|娃娃鱼|鱼缸|鱼塘|鱼饵|鱼钩|鱼竿|鱼群|鱼苗|鱼籽|鱼鳞|鱼鳍|鱼雷|鱼肝/, cat: 'animals' },
  // 食物饮料
  { re: /面包|米饭|食物|食品|饭菜|菜肴|菜(?!单)|蔬菜|饮料|水果|肉(?!体|桂)|蛋|鱼|苹果|香蕉|橘子|橙子|葡萄|梨|桃子|草莓|西瓜|坚果|大米|面粉|茶叶|咖啡|果汁|啤酒|红酒|早餐|午餐|晚餐|甜点|蛋糕|饼干|牛奶|奶酪|黄油|面条|海鲜|厨房|厨师|餐厅|饮食|味道|调味|食谱|食材|零食|点心|汤|糖|盐|油(?!画|漆|田|井)|蜂蜜|果酱|沙拉|三明治|汉堡|披萨|寿司|饺子|包子|馒头|粥|奶昔|汽水|矿泉水|酒|烟|糕点|果冻/, cat: 'food' },
  // 衣着配饰
  { re: /衣服|服装|穿(?!越|透)|裙|裤|鞋|帽|衬衫|外套|西装|领带|袜|手套|围巾|时装|毛衣|大衣|靴|眼镜|珠宝|项链|戒指|钱包|背包|布料|棉(?!花)|羊毛|丝绸|皮革|纽扣|拉链|睡衣|泳衣|披肩|背心|夹克|风衣|制服|校服|礼服|丝巾|耳环|手镯|胸针|箱包|行囊|化妆品|彩妆|化妆|服装店/, cat: 'clothes' },
  // 城市与建筑
  { re: /城市|城镇|城区|市中心|郊区|闹市区|建筑|建筑物|摩天大楼|公寓|写字楼|办公楼|街区|街道|人行道|广场|公园|大桥|桥梁|市政|居民区|小区|别墅|村庄|小镇|天际线|建筑工地/, cat: 'city' },
  // 家居生活
  { re: /家具|房间|卧室|客厅|门(?!口|槛)|窗|墙|地板|屋顶|沙发|桌|椅|床(?!头)|家居|住宅|浴室|厕所|楼梯|钥匙|锁|打扫|垃圾|房租|蜡烛|花园|院子|阳台|电器|被褥|床单|窗帘|地毯|书架|橱柜|餐具|水龙头|插座|电灯|工具|冰箱|洗衣机|微波炉|空调|被子|枕头|毛巾|肥皂|洗发|牙刷|灯(?!光|笼|塔)|桶|罐|瓶|剪刀|扫帚|篮子/, cat: 'home' },
  // 动物
  { re: /动物|鸟类|昆虫|宠物|狗|猫|马|牛|羊|猪|鸡|鸭|狮|虎|象|猴|蛇|蛙|鼠|狼|狐|鹿|熊|熊猫|兔|骆驼|斑马|长颈鹿|袋鼠|考拉|企鹅|鹰|鸽子|麻雀|天鹅|鹅|鹦鹉|猫头鹰|蝙蝠|松鼠|老鼠|蟑螂|蝴蝶|蜜蜂|蚂蚁|蜘蛛|蜗牛|蚯蚓|螃蟹|龙虾|水母|海星|珊瑚|山羊|奶牛|孔雀/, cat: 'animals' },
  // 天气与气候
  { re: /天气|气象|预报|晴|阴天|多云|云|下雨|下雪|雪地|雪人|雨伞|大雨|小雨|暴雨|台风|龙卷风|暴风雨|风暴|雷电|闪电|气温|温度|湿度|潮湿|干燥|雾|大雾|雾气|雾霾|霜|露|寒潮|酷暑|温暖|寒冷|炎热|阴晴/, cat: 'weather' },
  // 自然与地貌
  { re: /植物|树|花(?!费|开|火)|草|叶|森林|山|河|海(?!外)|湖|石头|岩石|风(?!格|筝|扇|铃|机|景|险)|季节|春天|夏天|秋天|冬天|自然|地球|环境|气候|太阳|月亮|宇宙|海洋|土壤|沙漠|岛|火山|地震|污染|种子|草原|溪|瀑布|峡谷|山谷|冰川|极光|日落|日出|天空|生物体|金矿|煤矿|丛|簇|英亩|亩|风景|地貌|田野|原野|晶体|化石/, cat: 'nature' },
  // 学习教育
  { re: /学校|学生|老师|教师|课程|课|教育|学习|大学|学院|考试|作业|班级|教授|学位|知识|教材|课堂|图书馆|研究所|训练|练习|学科|专业|毕业|证书|成绩|论文|教学|学期|招生|奖学金|讲座|研讨|教科书|字典|词典|手册|读本|辅导|入学|上课|下课|开学|放学|上学|学费|学历|校园|师生|课本|课间|升学|补习|课业|学位课/, cat: 'education' },
  // 工作职业
  { re: /工作|职业|公司|经理|雇主|雇员|招聘|面试|同事|老板|职员|办公|薪水|工厂|行业|业务|客户|合同|效率|岗位|职责|商业|商务|合作|团队|部门|加班|退休|失业|简历|企业|车间|职场|上班|打工|工种|职工|员工|年终|实习|应聘|工人|农民|牧民|管理者|工程师|设计师|会计师|技师|管理|咨询|顾问|客服|文案|策划/, cat: 'work' },
  // 旅行交通
  { re: /旅行|旅游|飞机|火车|机场|车站|酒店|旅馆|出发|到达|行李|护照|签证|观光|导游|交通|公交|地铁|汽车|车辆|卡车|轿车|预订|机票|车票|旅程|目的地|航班|码头|出租车|高速公路|驾驶|乘客|旅客|出行|宾馆|民宿|自驾|邮轮|轮船|船票|站台|候车|航站楼|驾车|开车|坐车|骑车|马路|公路|小路|飞行员|航行|航海|露营|行程|旅店|航线|候机|渡轮|旅行团|旅游团|客运|快车/, cat: 'travel' },
  // 购物金钱
  { re: /钱|价格|买|卖|购物|商店|超市|支付|付款|账单|折扣|便宜|昂贵|货币|银行|账户|成本|费用|资产|财产|资金|贷款|债务|税|售价|商场|百货|结算|存钱|借贷|利息|投资|股票|基金|保险|硬币|纸币|商品|顾客|零售|批发|消费|开支|预算|收据|发票|优惠|促销|打折|购物车|理财|物价|租金|押金|包裹|经济学|市价|赌注|彩票|中奖|博彩|拍卖/, cat: 'shopping' },
  // 科学技术
  { re: /科学|技术|实验|物理|化学|生物|机器|机械|工程|能源|原子|分子|数学|研究|发明|理论|地质|天文|定律|公式|引擎|发动机|显微镜|望远镜|专利|结论|假设|观察|分析|科学家|实验室|元素|化合物|重力|磁力|电学|力学|热学|光学|量子|电子学|电力|机制|计算(?!机)|几何|代数|化学家|物理学家/, cat: 'science' },
  // 科技与数码
  { re: /电脑|计算机|网络|互联网|手机|软件|数据|网站|程序|电子|服务器|数据库|硬件|下载|上传|密码|上网|在线|数码|文件|文件夹|图标|界面|代码|编程|算法|装置|芯片|传感器|应用程序|操作系统|浏览器|路由器|邮箱|充电|人工智能|机器人/, cat: 'tech' },
  // 媒体网络
  { re: /邮件|社交媒体|视频|音频|通信|传输|新闻|报纸|杂志|期刊|电视|广播|节目|频道|博客|帖子|短信|带宽|媒体|播客|清单|记者|采访|直播|短视频|自媒体|公众号|出版/, cat: 'media' },
  // 音乐与乐器
  { re: /音乐|歌曲|唱歌|歌手|合唱|乐器|钢琴|小提琴|大提琴|长笛|萨克斯|手风琴|乐谱|音符|旋律|节奏|专辑|乐队|交响|演唱会|唱片|摇滚|民谣|舞曲|乐团|钢琴家/, cat: 'music' },
  // 艺术娱乐
  { re: /艺术|画(?!计)|绘画|电影|戏剧|舞蹈|演出|表演|文学|诗|小说|展览|博物馆|雕塑|摄影|影视|导演|演员|剧本|风格|创作|艺术品|娱乐|歌舞|京剧|相声|书法|国画|油画|水彩|漫画|木刻|陶瓷|瓷器|编织|工艺|作品|图片|图像|影子|魔术|杂技/, cat: 'arts' },
  // 运动与健身
  { re: /比赛|运动|球类|球|游泳|跑步|慢跑|健身|锻炼|瑜伽|奥林匹克|冠军|奖牌|奖杯|队友|选手|教练|球迷|足球|篮球|排球|网球|乒乓球|羽毛球|高尔夫|滑雪|滑冰|登山|徒步|野餐|田径|举重|拳击|体操|赛跑|运动会|体育场|游泳馆|健身房|亚军|锦标赛|运动员/, cat: 'sports' },
  // 玩具游戏
  { re: /游戏|玩具|玩|棋|拼图|积木|游乐场|谜语|填字|纸牌|扑克|象棋|跳棋|跳绳|滑板|风筝|飞盘|秋千|跷跷板|玩偶|弹珠|拼装/, cat: 'toys' },
  // 身体部位
  { re: /头(?!发)|脸|眼睛|眼|耳|鼻|嘴|牙|舌|唇|脖|肩|手臂|手(?!表|机|势|续|工|段|法|术|册)|指|背(?!景|负|书)|血|骨|脑|胸|心(?!情|愿|思)|皮肤|胃|肌肉|腿|脚(?!本|色|手)|身体|头发|心脏|肺|肝|肾|肠|神经|细胞|动脉|静脉|指甲|眉毛|睫毛|下巴|额头|脸颊|呼吸|汗水|骨骼|脊/, cat: 'body' },
  // 时间频率
  { re: /时间|小时|分钟|秒钟|星期|周一|周末|月份|年代|世纪|季度|早晨|中午|午夜|将来|过去|最近|持续|及时|日历|日程|截止|期限|阶段|周期|时期|瞬间|片刻|整天|整夜|半天|全年|经常|总是|偶尔|频率|时刻|早上|上午|下午|晚上|童年|历史|古时/, cat: 'time' },
  // 情感感受
  { re: /高兴|快乐|悲伤|难过|害怕|恐惧|愤怒|生气|惊讶|情感|情绪|喜欢|讨厌|爱|担心|焦虑|满意|失望|骄傲|羞|感情|心情|感觉|厌恶|同情|愿望|信心|乐观|悲观|沮丧|内疚|兴奋|激动|平静|紧张|烦恼|伤心|开心|愉快|恼怒|感激|敬佩|嫉妒|羞愧|好奇|欣慰|烦躁|抑郁|心理|勇气|精神|叹息|叹气|担忧/, cat: 'emotions' },
  // 沟通语言
  { re: /说|说话|语言|谈话|交流|沟通|告诉|讨论|演讲|口音|翻译|表达|写作|阅读|听|声音|词(?!典)|争论|争吵|辩论|对话|言语|词语|句子|语法|发音|解释|说明|讲述|回答|提问|询问|通知|宣布|声明|报告|信件|传播|说服|消息|短信|通讯|留言|注明|口述|书信|邮递|信函|措辞|指示/, cat: 'communication' },
  // 颜色
  { re: /颜色|色彩|彩色|色调|颜料|着色|上色|染色|红色|蓝色|绿色|黄色|黑色|白色|灰色|紫色|粉色|棕色|橙色|金色|银色|褐色|深色|浅色|鲜艳|五颜六色|红|绿|黄|紫|棕|粉红|深红|浅蓝|天蓝|藏青|原色|本色/, cat: 'colors' },
  // 数字数量
  { re: /数字|数目|数量|计数|统计|总计|百分|百分之|一半|两倍|倍数|整数|小数|序号|编号|加法|减法|乘法|除法|相加|相减|余数|整除|分数|平均|比例|比率|数量级|位数|个位|十位|算术|几何|代数|变量|变数|百分点|增加|减少|加数|减数|乘数|除数|合计|总和|总数|多数|少数|附加/, cat: 'numbers' },
  // 外形尺寸
  { re: /形状|尺寸|大小|长短|高矮|圆|方形|三角|面积|体积|重量|直径|半径|长度|宽度|高度|深度|厚度|椭圆形|扁平|三角形|球形|立方|加大|加长|缩短|变高|变宽|加宽|尺度/, cat: 'size' },
  // 思维概念
  { re: /思维|思想|想法|概念|理论|观点|认为|逻辑|推理|记忆|想象|判断|假设|哲学|意义|目的|动机|原因|结果|影响|因素|条件|过程|方法|方式|手段|原则|标准|规则|定义|抽象|本质|特点|特性|能力|技能|技巧|策略|态度|观念|信念|价值|质量|品质|理解|认知|思考|道理|智慧|智商|智力|优势|劣势|利弊|可能性|必要性|实际|习惯|本能|命运|奇迹|理由|特征|规律|主意|念头|点子/, cat: 'thinking' },
  // 方位空间
  { re: /位置|方向|方位|附近|旁边|中间|中央|周围|角落|边缘|表面|背面|前面|后面|上面|下面|左边|右边|上层|楼下|距离|空间|区域|地区|地点|场所|内部|外部|四周|周边|领域|层面|地图|图表|刻度|比例尺|上升|下降|上方|下方|前方|后方|顶部|底部|中部|另一侧|对侧/, cat: 'space' },
  // 人物关系
  { re: /人|人们|朋友|家庭|父亲|母亲|孩子|男|女|性别|青年|老人|同事|成员|居民|市民|人口|离婚|婚姻|结婚|婚礼|婴儿|亲戚|亲属|兄弟|姐妹|丈夫|妻子|家人|亲人|祖父|祖母|叔叔|阿姨|儿子|女儿|大人|成人|少年|女孩|男孩|夫人|先生|女士|友谊|亲情|恋人|伴侣|邻居|伙伴|同伴|关系/, cat: 'people' },
]

/**
 * 英文精确词表：中文释义通常只给一两个词、看不出场景的常见词。
 * 放在中文关键词之后（中文更具体时以中文为准），构词后缀之前。
 */
const EN_EXACT: Record<string, CategoryId> = {
  // 科学 / 数学
  biology: 'science', chemistry: 'science', physics: 'science', genetics: 'science',
  astronomy: 'science', geology: 'science', arithmetic: 'numbers', algebra: 'numbers',
  geometry: 'numbers', calculus: 'numbers', statistics: 'numbers', percentage: 'numbers',
  decimal: 'numbers', integer: 'numbers', numerator: 'numbers', denominator: 'numbers',
  equation: 'numbers', metric: 'numbers', microscope: 'science', telescope: 'science',
  laboratory: 'science', hypothesis: 'science', molecule: 'science', atom: 'science',
  particle: 'science', energy: 'science', gravity: 'science', magnet: 'science',
  laser: 'science', battery: 'science', turbine: 'science', engine: 'science',
  robot: 'science', ecosystem: 'nature', organism: 'nature',
  atmosphere: 'nature', habitat: 'nature', species: 'nature', breed: 'nature',
  volcano: 'nature', earthquake: 'nature', hurricane: 'nature', tornado: 'nature',
  glacier: 'nature', desert: 'nature', rainforest: 'nature', jungle: 'nature',
  meadow: 'nature', valley: 'nature', canyon: 'nature', island: 'nature', coral: 'nature',
  comet: 'science', asteroid: 'science', meteor: 'science', orbit: 'space',
  oxygen: 'science', hydrogen: 'science', nitrogen: 'science', carbon: 'science',
  dioxide: 'science', mineral: 'nature', photosynthesis: 'science',
  // 社会 / 学科
  sociology: 'society', theology: 'society', ethics: 'society', politics: 'society',
  economics: 'shopping', political: 'society',
  anthropology: 'society', criminology: 'society', philosophy: 'thinking',
  psychology: 'emotions', psychiatry: 'health',
  journalism: 'media', culture: 'society',
  // 空间
  geography: 'space', latitude: 'space', longitude: 'space', horizon: 'space',
  hemisphere: 'space', equator: 'space',
  // 动物
  puppy: 'animals', kitten: 'animals', calf: 'animals', lamb: 'animals',
  foal: 'animals', colt: 'animals', mare: 'animals', bull: 'animals', ox: 'animals',
  goat: 'animals', sheep: 'animals', piglet: 'animals', cub: 'animals', hare: 'animals',
  rabbit: 'animals', squirrel: 'animals', fox: 'animals', wolf: 'animals',
  bear: 'animals', tiger: 'animals', lion: 'animals', elephant: 'animals',
  giraffe: 'animals', zebra: 'animals', monkey: 'animals', gorilla: 'animals',
  dolphin: 'animals', whale: 'animals', shark: 'animals', octopus: 'animals',
  turtle: 'animals', tortoise: 'animals', frog: 'animals', toad: 'animals',
  lizard: 'animals', snake: 'animals', eagle: 'animals', owl: 'animals',
  sparrow: 'animals', penguin: 'animals', parrot: 'animals', swan: 'animals',
  goose: 'animals', duck: 'animals', chicken: 'animals', rooster: 'animals',
  hen: 'animals', mosquito: 'animals', butterfly: 'animals', bee: 'animals',
  ant: 'animals', spider: 'animals', worm: 'animals', snail: 'animals',
  crab: 'animals', lobster: 'animals', shrimp: 'animals', jellyfish: 'animals',
  camel: 'animals', llama: 'animals', alpaca: 'animals', kangaroo: 'animals',
  koala: 'animals', panda: 'animals', leopard: 'animals', cheetah: 'animals',
  buffalo: 'animals', mule: 'animals', donkey: 'animals', pony: 'animals',
  // 食物
  cuisine: 'food', recipe: 'food', ingredient: 'food', beverage: 'food',
  dessert: 'food', appetizer: 'food', snack: 'food', grocery: 'food',
  bakery: 'food', cafeteria: 'food', barbecue: 'food', ketchup: 'food',
  mayonnaise: 'food', yogurt: 'food',
  // 衣着
  wardrobe: 'clothes', garment: 'clothes', costume: 'clothes', uniform: 'clothes',
  outfit: 'clothes', footwear: 'clothes', headwear: 'clothes', underwear: 'clothes',
  sweater: 'clothes', jacket: 'clothes', trousers: 'clothes', blouse: 'clothes',
  pajamas: 'clothes', kimono: 'clothes', apron: 'clothes', scarf: 'clothes',
  glove: 'clothes', stocking: 'clothes', sneaker: 'clothes', sandal: 'clothes',
  umbrella: 'clothes',
  // 家居
  furniture: 'home', appliance: 'home', kitchenware: 'home', cutlery: 'home',
  bedding: 'home', curtain: 'home', blanket: 'home', cushion: 'home', sofa: 'home',
  lamp: 'home', cupboard: 'home', cabinet: 'home', fridge: 'home',
  refrigerator: 'home', stove: 'home', oven: 'home', kettle: 'home',
  toaster: 'home', blender: 'home', thermostat: 'home', bookshelf: 'home',
  mirror: 'home', doormat: 'home',
  // 旅行
  luggage: 'travel', passport: 'travel', visa: 'travel', itinerary: 'travel',
  souvenir: 'travel', hostel: 'travel', motel: 'travel', departure: 'travel',
  arrival: 'travel', layover: 'travel', excursion: 'travel', cruise: 'travel',
  cabin: 'travel', aisle: 'travel', boarding: 'travel', transit: 'travel',
  commute: 'travel', passenger: 'travel', pedestrian: 'travel', pilot: 'travel',
  // 购物
  coupon: 'shopping', discount: 'shopping', sale: 'shopping', price: 'shopping',
  cost: 'shopping', expense: 'shopping', budget: 'shopping', invoice: 'shopping',
  receipt: 'shopping', retail: 'shopping', wholesale: 'shopping', bargain: 'shopping',
  installment: 'shopping', checkout: 'shopping', merchant: 'shopping',
  vendor: 'shopping', clientele: 'shopping',
  // 健康
  symptom: 'health', diagnosis: 'health', prescription: 'health', surgery: 'health',
  vaccine: 'health', therapy: 'health', patient: 'health', nurse: 'health',
  physician: 'health', dentist: 'health', pharmacy: 'health', illness: 'health',
  disease: 'health', disorder: 'health', syndrome: 'health', infection: 'health',
  inflammation: 'health', allergy: 'health', obesity: 'health', insomnia: 'health',
  anesthesia: 'health', bandage: 'health', wheelchair: 'health', stretcher: 'health',
  ambulance: 'health', epidemic: 'health', pandemic: 'health', chronic: 'health',
  acute: 'health', rehabilitation: 'health', clinic: 'health',
  // 身体
  bone: 'body', muscle: 'body', neuron: 'body', organ: 'body', skeleton: 'body',
  limb: 'body', knee: 'body', elbow: 'body', shoulder: 'body', wrist: 'body',
  ankle: 'body', spine: 'body', lung: 'body', liver: 'body', kidney: 'body',
  stomach: 'body', intestine: 'body', vein: 'body', artery: 'body', skin: 'body',
  skull: 'body', rib: 'body', jaw: 'body', cheek: 'body', chin: 'body',
  eyelid: 'body', cornea: 'body', retina: 'body', thumb: 'body', toe: 'body',
  heel: 'body', palm: 'body', chest: 'body',
  // 媒体
  podcast: 'media', newsletter: 'media', blog: 'media', channel: 'media',
  broadcast: 'media', television: 'media', radio: 'media', newspaper: 'media',
  magazine: 'media', journal: 'media', media: 'media', platform: 'media',
  listing: 'media', list: 'media',
  // 艺术
  painting: 'arts', sculpture: 'arts', drawing: 'arts', gallery: 'arts',
  museum: 'arts', theatre: 'arts', theater: 'arts',
  performance: 'arts', actor: 'arts', actress: 'arts',
  director: 'arts', producer: 'arts', screenplay: 'arts', novel: 'arts',
  poem: 'arts', poet: 'arts', novelist: 'arts', playwright: 'arts',
  ballet: 'arts',
  choreography: 'arts', portrait: 'arts', statue: 'arts',
  mosaic: 'arts', pottery: 'arts',
  harmony: 'arts', sonnet: 'arts', typography: 'arts',
  photography: 'arts',
  // 音乐与乐器
  music: 'music', song: 'music', singer: 'music', album: 'music', band: 'music',
  concert: 'music', choir: 'music', orchestra: 'music', instrument: 'music',
  melody: 'music', rhythm: 'music', tempo: 'music', tune: 'music', lyrics: 'music',
  violin: 'music', guitar: 'music', piano: 'music', drum: 'music', flute: 'music',
  trumpet: 'music', cello: 'music', harp: 'music', opera: 'music',
  symphony: 'music', musician: 'music', scale: 'music',
  // 教育
  school: 'education', teacher: 'education', student: 'education',
  classroom: 'education', homework: 'education', exam: 'education',
  lesson: 'education', curriculum: 'education', syllabus: 'education',
  degree: 'education', diploma: 'education', scholarship: 'education',
  lecture: 'education', seminar: 'education', tutorial: 'education',
  professor: 'education', academy: 'education', kindergarten: 'education',
  principal: 'education', semester: 'education', textbook: 'education',
  classmate: 'education', alumnus: 'education', tuition: 'shopping',
  // 工作
  engineer: 'work', manager: 'work', secretary: 'work', receptionist: 'work',
  mechanic: 'work', plumber: 'work', electrician: 'work', carpenter: 'work',
  contractor: 'work', clerk: 'work', cashier: 'work',
  waiter: 'work', waitress: 'work', tailor: 'work', barber: 'work',
  hairdresser: 'work', consultant: 'work', entrepreneur: 'work',
  employer: 'work', employee: 'work', colleague: 'work', salary: 'work',
  wage: 'work', payroll: 'work', portfolio: 'work', workflow: 'work',
  internship: 'work', apprentice: 'work', recruit: 'work', applicant: 'work',
  supervisor: 'work', diplomat: 'society',
  // 运动与健身
  football: 'sports', basketball: 'sports', soccer: 'sports', tennis: 'sports',
  volleyball: 'sports', badminton: 'sports', swimming: 'sports', runner: 'sports',
  race: 'sports', gym: 'sports', fitness: 'sports', exercise: 'sports',
  athlete: 'sports', coach: 'sports', referee: 'sports', tournament: 'sports',
  golf: 'sports', golfer: 'sports', yoga: 'sports', boxing: 'sports',
  hockey: 'sports', skiing: 'sports', stadium: 'sports', jersey: 'sports',
  score: 'sports', champion: 'sports', trophy: 'sports', medal: 'sports',
  team: 'sports', match: 'sports', league: 'sports',
  // 科技与数码
  computer: 'tech', laptop: 'tech', smartphone: 'tech', software: 'tech',
  hardware: 'tech', website: 'tech', internet: 'tech', network: 'tech',
  database: 'tech', server: 'tech', browser: 'tech', password: 'tech',
  username: 'tech', download: 'tech', upload: 'tech', bandwidth: 'tech',
  algorithm: 'tech', coding: 'tech', screenshot: 'tech', pixel: 'tech',
  folder: 'tech', monitor: 'tech', keyboard: 'tech', printer: 'tech',
  scanner: 'tech', router: 'tech', streaming: 'tech', playlist: 'tech',
  meme: 'tech', chip: 'tech', sensor: 'tech', gadget: 'tech', tablet: 'tech',
  // 城市与建筑
  city: 'city', town: 'city', urban: 'city', suburb: 'city', downtown: 'city',
  skyscraper: 'city', building: 'city', house: 'city', apartment: 'city',
  street: 'city', sidewalk: 'city', avenue: 'city', square: 'city', park: 'city',
  bridge: 'city', municipal: 'city', cityscape: 'city', village: 'city',
  neighborhood: 'city', neighbourhood: 'city', residential: 'city',
  architect: 'city', architecture: 'city',
  // 节日与庆祝
  festival: 'festival', celebration: 'festival', birthday: 'festival',
  christmas: 'festival', parade: 'festival', carnival: 'festival',
  easter: 'festival', halloween: 'festival', thanksgiving: 'festival',
  wedding: 'festival', ceremony: 'festival', anniversary: 'festival',
  // 法律与制度
  law: 'law', court: 'law', judge: 'law', lawyer: 'law', trial: 'law',
  crime: 'law', prison: 'law', legal: 'law', justice: 'law', sentence: 'law',
  criminal: 'law', jury: 'law', evidence: 'law', verdict: 'law',
  attorney: 'law', witness: 'law',
  // 战争与军事
  war: 'military', army: 'military', soldier: 'military', weapon: 'military',
  gun: 'military', battle: 'military', military: 'military', navy: 'military',
  tank: 'military', regiment: 'military', troops: 'military', missile: 'military',
  warship: 'military',
  // 宗教与信仰
  god: 'religion', church: 'religion', religion: 'religion', bible: 'religion',
  pray: 'religion', priest: 'religion', temple: 'religion', holy: 'religion',
  faith: 'religion', worship: 'religion', gospel: 'religion', mosque: 'religion',
  monk: 'religion', angel: 'religion', soul: 'religion', heaven: 'religion',
  hell: 'religion',
  // 天气与气候
  weather: 'weather', rain: 'weather', rainy: 'weather', snow: 'weather',
  snowy: 'weather', wind: 'weather', windy: 'weather', sunny: 'weather',
  cloud: 'weather', cloudy: 'weather', storm: 'weather', fog: 'weather',
  climate: 'weather', temperature: 'weather', thunder: 'weather',
  lightning: 'weather', humid: 'weather', breeze: 'weather', forecast: 'weather',
  shower: 'weather', drizzle: 'weather',
  // 颜色
  red: 'colors', blue: 'colors', green: 'colors', yellow: 'colors',
  black: 'colors', white: 'colors', grey: 'colors', gray: 'colors',
  purple: 'colors', pink: 'colors', brown: 'colors', orange: 'colors',
  violet: 'colors', colour: 'colors', color: 'colors', crimson: 'colors',
  scarlet: 'colors', azure: 'colors', indigo: 'colors', beige: 'colors',
  ivory: 'colors', olive: 'food',
  // 疑问 / 思维
  question: 'questions', questions: 'questions', query: 'questions',
  inquiry: 'questions', interrogative: 'questions', dilemma: 'thinking',
  paradox: 'thinking', motive: 'thinking', norm: 'thinking',
  principle: 'thinking', criterion: 'thinking', virtue: 'thinking',
  logic: 'thinking', concept: 'thinking', insight: 'thinking', reason: 'thinking',
  wisdom: 'thinking', curiosity: 'thinking', idiom: 'idioms',
  // 其它
  idiot: 'thinking', harvest: 'nature',
  guest: 'people', idiocy: 'thinking', panic: 'emotions', comic: 'arts',
  topic: 'communication', tragic: 'emotions', medical: 'health',
  musical: 'arts', physical: 'body', practical: 'thinking', logical: 'thinking',
  magical: 'thinking', historical: 'time', biological: 'science',
  chemical: 'science', electrical: 'science',
}

/** 英文构词后缀 → 场景（中文释义与精确词表都判不出时的最后兜底） */
const SUFFIX_RULES: [string, CategoryId][] = [
  ['ology', 'science'],
  ['graphy', 'arts'],
  ['ics', 'science'],
  ['ician', 'work'],
  ['ist', 'work'],
  ['eer', 'work'],
  ['tion', 'thinking'],
  ['sion', 'thinking'],
  ['ment', 'thinking'],
  ['ness', 'thinking'],
  ['ity', 'thinking'],
  ['ance', 'thinking'],
  ['ence', 'thinking'],
  ['ship', 'people'],
  ['hood', 'people'],
  ['ism', 'thinking'],
  ['ure', 'thinking'],
  ['age', 'thinking'],
  ['ic', 'science'],
  ['ical', 'science'],
  ['ize', 'actions'],
  ['ise', 'actions'],
  ['ify', 'actions'],
  ['ward', 'space'],
  ['wards', 'space'],
  ['wear', 'clothes'],
  ['suit', 'clothes'],
  ['shirt', 'clothes'],
  ['shoe', 'clothes'],
  ['coat', 'clothes'],
  ['dress', 'clothes'],
  ['skirt', 'clothes'],
  ['trouser', 'clothes'],
  ['boot', 'clothes'],
  ['sock', 'clothes'],
  ['hat', 'clothes'],
  ['ware', 'shopping'],
]

/**
 * 没有中文关键词时的词性兜底。
 * ECDICT 的 pos 字段常常为空或只给 "vt" 这种无点号缩写，释义里则带完整词性
 * （"vt. 完成…"），多义项释义（"n. 擦拭；vt. 擦"）里词性可能出现在中间，
 * 所以这里：先看词性标记本身 → 再看释义开头 → 最后扫全文第一个词性标记。
 */
function posFallback(text: string): CategoryId | null {
  const t = (text || '').trim()
  if (!t) return null
  const byTag = (tag: string): CategoryId | null => {
    if (tag === 'vt' || tag === 'vi' || tag === 'v' || tag === 'aux') return 'actions'
    if (tag === 'num') return 'numbers'
    if (
      tag === 'prep' || tag === 'conj' || tag === 'pron' ||
      tag === 'art' || tag === 'det' || tag === 'int' || tag === 'part'
    ) return 'grammar'
    if (tag === 'adv' || tag === 'adj' || tag === 'ad' || tag === 'a') return 'thinking'
    return null
  }
  const TAG = '(vt|vi|aux|v|num|prep|conj|pron|art|det|int|part|adv|adj|ad|a)'
  // 1. 释义开头的词性最可信（兼容 "vt." 与 "vt" 两种写法）
  const headTag = t.slice(0, 8).match(new RegExp(`^${TAG}\\b\\.?`))
  if (headTag) return byTag(headTag[1])
  // 2. 多义项释义里取第一个出现的词性标记（名词性 n. 不参与，避免名词被当成动作）
  const anyTag = t.match(new RegExp(`(?:^|[；;，,。、（(\\s])${TAG}\\s*\\.?`))
  if (anyTag) return byTag(anyTag[1])
  return null
}

/**
 * 英文词形的词类信号：疑问词 / 功能词 / 数词 / 时间词 / 方位词 / 尺寸词。
 * 只处理单词形（短语不做后缀判断）。
 */
function englishFunctionScene(word: string): CategoryId | null {
  const w = word.trim().toLowerCase()
  if (!w || w.includes(' ')) return null
  if (GRAMMAR_WORDS.has(w)) return 'grammar'
  if (NUMBER_WORDS.has(w)) return 'numbers'
  if (TIME_WORDS.has(w)) return 'time'
  if (SPACE_WORDS.has(w)) return 'space'
  if (SIZE_WORDS.has(w)) return 'size'
  return null
}

/**
 * 猜测一个词的场景。
 * @param meaning 中文释义（形如 "n. 苹果；苹果树"）
 * @param pos     词性（形如 "n." / "vt."，可能为空）
 * @param word    英文词形（可选，用于疑问词 / 功能词 / 后缀判定）
 */
export function guessScene(meaning: string, pos = '', word = ''): CategoryId | null {
  const text = meaning || ''
  const w = (word || '').trim().toLowerCase()
  if (!text && !w) return null

  // 1. 词典领域标签（优先取首个义项：标签出现在后续义项里说明这不是词的主场景）
  const head = text.split(/[；;]/)[0]
  let domainCat: CategoryId | null = null
  for (const rule of DOMAIN_RULES) {
    if (rule.re.test(head)) {
      domainCat = rule.cat
      break
    }
  }
  if (domainCat) return domainCat
  // 2. 英文疑问词
  if (w && QUESTION_WORDS.has(w)) return 'questions'
  // 3. 英文功能词（词类信号）
  const enScene = englishFunctionScene(w)
  if (enScene) return enScene
  // 4. 中文关键词
  for (const rule of KEYWORD_RULES) {
    if (rule.re.test(text)) return rule.cat
  }
  // 5. 英文精确词表
  if (w && EN_EXACT[w]) return EN_EXACT[w]
  // 6. 英文构词后缀
  if (w.length >= 5) {
    for (const [suffix, cat] of SUFFIX_RULES) {
      if (w.endsWith(suffix)) return cat
    }
  }
  // 7. 次要义项里的领域标签（前面都没命中时兜底，避免词直接掉进 thinking）
  if (!domainCat) {
    for (const rule of DOMAIN_RULES) {
      if (rule.re.test(text)) return rule.cat
    }
  }
  // 8. 词性兜底：先看词性字段（ECDICT 给的是 "vt" 这种缩写），再看释义
  return posFallback(pos) ?? posFallback(text)
}
