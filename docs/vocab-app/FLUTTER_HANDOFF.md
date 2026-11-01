# 背单词 App — Flutter 开发交接文档

> 本文档由 HTML 高保真交互原型（`vocab-app/`）整理而来，供 Flutter 开发直接参照实现。
> 包含设计令牌、ThemeData、路由、数据模型、API 契约、可复用组件、各屏实现要点。

---

## 0. 技术栈建议

| 关注点 | 推荐方案 | 说明 |
|---|---|---|
| 状态管理 | **Riverpod** (`flutter_riverpod`) | 官方推荐，类型安全，可测试性好；亦可换 Provider |
| 路由 | **go_router** | 官方推荐，声明式路由，支持深链接 |
| HTTP | **Dio** | 拦截器生态好，便于后续接鉴权 |
| 本地存储 | **shared_preferences** / **Hive** | 存打卡记录、设置项 |
| 图标 | **lucide_flutter** 或 **tabler_icons** | 与原型 Lucide 图标一致 |
| 动画 | 原生 `AnimatedContainer` / `TweenAnimationBuilder` / `Hero` | 翻卡用 `AnimatedSwitcher` + `Matrix4.rotationY` |
| 图表 | **fl_chart** | 统计页柱状图 |

---

## 1. 设计令牌 → Flutter ThemeData

原型的设计令牌（见 `styles.css` 的 `:root`）已映射为 Flutter `ThemeData`。浅色 + 深色两套。

```dart
// lib/theme/app_theme.dart
import 'package:flutter/material.dart';

class AppColors {
  // primary
  static const primary = Color(0xFF1E3A5F);
  static const primaryHi = Color(0xFF2A4A78);
  static const primarySoft = Color(0xFFEAF0F8);
  // bg / surface
  static const bg = Color(0xFFF7F4EF);
  static const surface = Color(0xFFFFFFFF);
  static const border = Color(0xFFE8E3DC);
  // text
  static const text = Color(0xFF1F2933);
  static const textSub = Color(0xFF6B7280);
  static const textMute = Color(0xFF9CA3AF);
  // accent / status
  static const accent = Color(0xFFE8A33D);
  static const accentSoft = Color(0xFFFDF3E0);
  static const success = Color(0xFF2E9E6B);
  static const successSoft = Color(0xFFE8F5EE);
  static const danger = Color(0xFFD96A4A);
  static const dangerSoft = Color(0xFFFBEEE8);
  // status
  static const cNew = Color(0xFFE8A33D);
  static const cLearning = Color(0xFF1E3A5F);
  static const cMastered = Color(0xFF2E9E6B);
}

class AppTheme {
  // 衬线展示字体（词典/编辑感），正文用系统字体
  static const _serif = FontFamily('NotoSerifSC'); // 或 'Georgia'

  static ThemeData get light => ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.primary,
          brightness: Brightness.light,
          surface: AppColors.surface,
          onSurface: AppColors.text,
          primary: AppColors.primary,
          onPrimary: Colors.white,
        ),
        scaffoldBackgroundColor: AppColors.bg,
        appBarTheme: const AppBarTheme(
          backgroundColor: AppColors.bg,
          foregroundColor: AppColors.text,
          elevation: 0,
          centerTitle: false,
          titleTextStyle: TextStyle(
            fontSize: 24, fontWeight: FontWeight.w700,
            color: AppColors.text, letterSpacing: -0.5),
        ),
        cardTheme: CardThemeData(
          color: AppColors.surface,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
            side: const BorderSide(color: AppColors.border),
          ),
          margin: EdgeInsets.zero,
        ),
        textTheme: TextTheme(
          displayLarge: TextStyle(fontFamily: _serif, fontSize: 40, fontWeight: FontWeight.w700, color: AppColors.text, letterSpacing: -1),
          displayMedium: TextStyle(fontFamily: _serif, fontSize: 28, fontWeight: FontWeight.w700, color: AppColors.text, letterSpacing: -0.5),
          headlineSmall: TextStyle(fontFamily: _serif, fontSize: 24, fontWeight: FontWeight.w700, color: AppColors.text),
          titleLarge: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: AppColors.text),
          titleMedium: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppColors.textSub),
          bodyLarge: TextStyle(fontSize: 16, fontWeight: FontWeight.w500, color: AppColors.text),
          bodyMedium: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: AppColors.textSub),
          labelSmall: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: AppColors.textSub),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: AppColors.surface,
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.border)),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.border)),
          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.primary, width: 1.5)),
        ),
         elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
            minimumSize: const Size.fromHeight(50),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            foregroundColor: AppColors.text,
            side: const BorderSide(color: AppColors.border),
            minimumSize: const Size.fromHeight(50),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
        switchTheme: SwitchThemeData(
          thumbShape: const CircleBorder(),
          trackColor: WidgetStateProperty.resolveWith((states) {
            return states.contains(WidgetState.selected) ? AppColors.primary : const Color(0xFFD4CCBF);
          }),
        ),
        dividerTheme: const DividerThemeData(color: AppColors.border, thickness: 1),
      );

  static ThemeData get dark => light.copyWith(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF14181F),
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.primary,
          brightness: Brightness.dark,
          surface: const Color(0xFF1E242E),
          onSurface: const Color(0xFFE8EAED),
        ),
        cardTheme: CardThemeData(
          color: const Color(0xFF1E242E),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
            side: const BorderSide(color: const Color(0xFF2D3644)),
          ),
        ),
      );
}
```

**字体注意**：若用 `NotoSerifSC`，需在 `pubspec.yaml` 声明 assets 并配置 `fontFamily`；或直接用 `Georgia`（系统自带衬线）以省去打包。原型里单词展示用衬线，正文用无衬线。

---

## 2. 项目结构建议

```
lib/
├── main.dart                      # MaterialApp.router + Theme
├── theme/app_theme.dart           # 上节 ThemeData
├── router/app_router.dart         # go_router 配置
├── models/
│   ├── word.dart                  # Word 数据类
│   ├── user.dart                  # User 数据类
│   └── achievement.dart           # Achievement
├── api/
│   └── api_service.dart           # Dio 封装 + 接口定义
├── providers/
│   ├── auth_provider.dart         # 用户/设置
│   ├── word_provider.dart         # 单词列表/学习状态
│   └── stats_provider.dart        # 统计/打卡记录
├── widgets/
│   ├── common/
│   │   ├── app_button.dart        # 统一按钮
│   │   ├── status_badge.dart      # 状态徽章
│   │   ├── progress_ring.dart     # 圆环进度
│   │   ├── heatmap_cell.dart      # 热力图格子
│   │   └── toast.dart             # SnackBar 封装
│   └── layout/
│       ├── bottom_nav.dart        # 底部 Tab（自定义）
│       └── status_bar_mock.dart   # 伪状态栏（调试用，真机移除）
├── screens/
│   ├── home/home_screen.dart
│   ├── learn/learn_screen.dart
│   ├── learn/flashcard_widget.dart
│   ├── quiz/quiz_screen.dart
│   ├── stats/stats_screen.dart
│   ├── library/library_screen.dart
│   └── profile/profile_screen.dart
└── utils/
    └── date_util.dart
```

---

## 3. 路由结构

6 个页面，底部 4 Tab（首页/学习/统计/我的），词库与测试从首页/学习进入。

```dart
// lib/router/app_router.dart
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../screens/home/home_screen.dart';
import '../screens/learn/learn_screen.dart';
import '../screens/quiz/quiz_screen.dart';
import '../screens/stats/stats_screen.dart';
import '../screens/library/library_screen.dart';
import '../screens/profile/profile_screen.dart';

final GoRouter appRouter = GoRouter(
  initialLocation: '/home',
  routes: [
    GoRoute(path: '/home', builder: (c, s) => const HomeScreen()),
    GoRoute(path: '/learn', builder: (c, s) => const LearnScreen()),
    GoRoute(path: '/quiz', builder: (c, s) => const QuizScreen()),
    GoRoute(path: '/stats', builder: (c, s) => const StatsScreen()),
    GoRoute(path: '/library', builder: (c, s) => const LibraryScreen()),
    GoRoute(path: '/profile', builder: (c, s) => const ProfileScreen()),
  ],
);
```

> 底部 Tab 用自定义 `BottomNav` widget 持有 `currentIndex` StatefulBuilder，切换时 `context.go('/home')` 等。词库、测试是次级页面，有返回箭头 `context.pop()`。

---

## 4. 数据模型（Dart）

由 `mock.js` 的 `DB` 结构反推，字段一一对应。

```dart
// lib/models/word.dart
enum WordStatus { newWord, learning, mastered }

class Word {
  final int id;
  final String word;
  final String phonetic;
  final String pos;        // 词性: adj./n./v.
  final String meaning;
  final String example;
  final String exampleCn;
  final WordStatus status;
  final String book;

  const Word({
    required this.id,
    required this.word,
    required this.phonetic,
    required this.pos,
    required this.meaning,
    required this.example,
    required this.exampleCn,
    required this.status,
    required this.book,
  });

  factory Word.fromJson(Map<String, dynamic> j) => Word(
    id: j['id'], word: j['word'], phonetic: j['phonetic'],
    pos: j['pos'], meaning: j['meaning'], example: j['example'],
    exampleCn: j['exampleCn'],
    status: WordStatus.values.firstWhere(
      (e) => e.name == j['status'],
      orElse: () => WordStatus.learning,
    ),
    book: j['book'],
  );
}

// lib/models/user.dart
class User {
  final String name;
  final String avatarText;
  final String bio;
  final int streak;
  final int dailyGoal;
  final int todayLearned;
  final int totalWords;
  final int mastered;
  final int accuracy;

  const User({required this.name, required this.avatarText, required this.bio,
    required this.streak, required this.dailyGoal, required this.todayLearned,
    required this.totalWords, required this.mastered, required this.accuracy});
}

// lib/models/achievement.dart
class Achievement {
  final String id;
  final String label;
  final String icon;   // lucide 图标名
  final String color;  // gold/blue/green/red
  final bool unlocked;
  const Achievement({required this.id, required this.label,
    required this.icon, required this.color, required this.unlocked});
}
```

---

## 5. API 契约（REST）

原型 `mock.js` 里的 API stub 签名即真实后端接口形状。开发时用 Dio 实现这些方法即可，前端其余代码不变。

| 功能 | Method | Path | 请求 | 响应 |
|---|---|---|---|---|
| 获取单词列表 | GET | `/api/words` | `?status=all&keyword=` | `{ code, data: Word[], total }` |
| 获取学习统计 | GET | `/api/stats/daily` | — | `{ code, data: { weekly, heatmap, records } }` |
| 记录学习行为 | POST | `/api/learn/record` | `{ wordId, known }` | `{ code, data: { wordId, status } }` |

```dart
// lib/api/api_service.dart
import 'package:dio/dio.dart';
import '../models/word.dart';

class ApiService {
  static const baseUrl = 'https://your-api.example.com';
  final Dio _dio = Dio(BaseOptions(baseUrl: baseUrl, connectTimeout: const Duration(seconds: 10)));

  // TODO: 接入真实鉴权拦截器（JWT）
  // _dio.interceptors.add(AuthInterceptor());

  /// GET /api/words?status=&keyword=
  Future<List<Word>> fetchWords({String status = 'all', String keyword = ''}) async {
    final res = await _dio.get('/api/words', queryParameters: {
      'status': status, 'keyword': keyword,
    });
    final list = (res.data['data'] as List).map((e) => Word.fromJson(e)).toList();
    return list;
  }

  /// GET /api/stats/daily
  Future<Map<String, dynamic>> fetchStats() async {
    final res = await _dio.get('/api/stats/daily');
    return res.data['data'] as Map<String, dynamic>;
  }

  /// POST /api/learn/record  { wordId, known }
  Future<void> recordLearn(int wordId, bool known) async {
    await _dio.post('/api/learn/record', data: {'wordId': wordId, 'known': known});
  }
}
```

> **Mock 模式**：开发阶段可保留一个 `MockApiService` 实现同签名，返回本地数据，通过依赖注入切换，无需改 UI 代码。这正是原型 `api.js` 的设计意图。

---

## 6. 可复用组件

### 6.1 状态徽章

```dart
// lib/widgets/common/status_badge.dart
import 'package:flutter/material.dart';
import '../../models/word.dart';

class StatusBadge extends StatelessWidget {
  final WordStatus status;
  const StatusBadge({super.key, required this.status});

  static const _map = {
    WordStatus.newWord: (Color c, String l) => (c, l),
    WordStatus.learning: (Color c, String l) => (c, l),
    WordStatus.mastered: (Color c, String l) => (c, l),
  };

  @override
  Widget build(BuildContext context) {
    final (color, label) = switch (status) {
      WordStatus.newWord => (AppColors.cNew, '新词'),
      WordStatus.learning => (AppColors.cLearning, '学习中'),
      WordStatus.mastered => (AppColors.cMastered, '已掌握'),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 6, height: 6, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
        const SizedBox(width: 4),
        Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: color)),
      ]),
    );
  }
}
```

### 6.2 圆环进度（首页）

```dart
// lib/widgets/common/progress_ring.dart
import 'package:flutter/material.dart';

class ProgressRing extends StatelessWidget {
  final double progress; // 0~1
  final double size;
  const ProgressRing({super.key, required this.progress, this.size = 110});

  @override
  Widget build(BuildContext context) {
    final strokeW = 9.0;
    final r = (size - strokeW) / 2;
    final c = 2 * 3.14159 * r;
    return SizedBox(
      width: size, height: size,
      child: Stack(alignment: Alignment.center, children: [
        SizedBox(width: size, height: size,
          child: Transform.rotate(angle: -3.14159 / 2,
            child: CircularProgressIndicator(
              value: progress,
              strokeWidth: strokeW,
              backgroundColor: const Color(0xFFECE7DF),
              valueColor: const AlwaysStoppedAnimation(AppColors.primary),
            ))),
        Text('${(progress * 100).round()}%', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, fontFamily: 'Georgia', color: AppColors.primary)),
      ]),
    );
  }
}
```

### 6.3 底部导航（自定义，与原型一致）

原型底部 4 Tab：首页/学习/统计/我的。用自定义 `BottomNav` 实现，选中态有上移 + 顶部指示条。

```dart
// lib/widgets/layout/bottom_nav.dart
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class BottomNav extends StatelessWidget {
  final String current;
  const BottomNav({super.key, required this.current});

  static const _items = [
    _NavItem(icon: Icons.home_outlined, activeIcon: Icons.home, label: '首页', path: '/home'),
    _NavItem(icon: Icons.menu_book_outlined, activeIcon: Icons.menu_book, label: '学习', path: '/learn'),
    _NavItem(icon: Icons.bar_chart_outlined, activeIcon: Icons.bar_chart, label: '统计', path: '/stats'),
    _NavItem(icon: Icons.person_outline, activeIcon: Icons.person, label: '我的', path: '/profile'),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.92),
        boxShadow: [BoxShadow(color: AppColors.text.withOpacity(0.06), blurRadius: 16, offset: const Offset(0, -2))]);
      child: SafeArea(top: false, child: SizedBox(
        height: 68,
        child: Row(children: _items.map((e) {
          final active = current == e.path;
          return Expanded(child: InkWell(
            onTap: () => context.go(e.path),
            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(active ? e.activeIcon : e.icon, size: 24, color: active ? AppColors.primary : AppColors.textMute),
              const SizedBox(height: 3),
              Text(e.label, style: TextStyle(fontSize: 10, fontWeight: active ? FontWeight.w600 : FontWeight.w500,
                color: active ? AppColors.primary : AppColors.textMute)),
            ]),
          ));
        }).toList()),
      )),
    );
  }
}

class _NavItem {
  final IconData icon, activeIcon; final String label, path;
  const _NavItem({required this.icon, required this.activeIcon, required this.label, required this.path});
}
```

> 深色模式下把 `Container` 颜色换成 `AppColors.surface.withOpacity(0.92)` 即可。

---

## 7. 各屏实现要点

### 7.1 首页 HomeScreen

- 顶部问候语（按时间段切换"早安/午安/晚安"）
- `ProgressRing`（今日进度）+ 连续打卡天数
- 今日单词横滑 `ListView.separated`（`SizedBox` 固定宽度 chip）
- 学习概览 2×2 网格卡片
- "继续学习"大按钮 → `go('/learn')`

关键代码：
```dart
// 圆环进度
ProgressRing(progress: (user.todayLearned / user.dailyGoal).clamp(0.0, 1.0))

// 横滑单词
ListView.separated(
  scrollDirection: Axis.horizontal,
  itemCount: todayWords.length,
  separatorBuilder: (_, __) => const SizedBox(width: 10),
  itemBuilder: (_, i) => _WordChip(word: todayWords[i]),
)
```

### 7.2 学习 LearnScreen + 翻卡 FlashcardWidget

**核心交互：3D 翻转卡片。** 用 `Matrix4.rotationY` + `AnimatedSwitcher`。

```dart
// lib/screens/learn/flashcard_widget.dart
import 'package:flutter/material.dart';

class FlashcardWidget extends StatefulWidget {
  final Word word;
  final VoidCallback onTap;
  const FlashcardWidget({super.key, required this.word, required this.onTap});

  @override
  State<FlashcardWidget> createState() => _FlashcardWidgetState();
}

class _FlashcardWidgetState extends State<FlashcardWidget> {
  bool _flipped = false;
  static const _frontKey = ValueKey('front');
  static const _backKey = ValueKey('back');

  @override
  Widget build(BuildContext context) {
    return GestureDetector(onTap: widget.onTap, child: SizedBox(
      width: 340, height: 380,
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 600),
        curve: Curves.easeInOut,
        transitionBuilder: (child, anim) => AnimatedBuilder(
          animation: anim,
          builder: (_, c) => Transform(
            transform: Matrix4.rotationY(anim.progress * 3.14159 * (_flipped ? 1 : 1)),
            child: c,
          ),
        ),
        child: _flipped ? _BackFace(key: _backKey, word: widget.word) : _FrontFace(key: _frontKey, word: widget.word),
      ),
    ));
  }
}
```

> 学习屏顶部有进度条 + "第 N/总数" + 记忆率；底部"不认识"(danger) / "认识"(primary) 两个按钮，点击后 `recordLearn(wordId, known)` 并推进下一张。

### 7.3 测试 QuizScreen

- 顶部单词 + 音标 + 提示
- 4 个选项按钮（`OutlinedButton`），点击后锁定，正误着色
- 反馈条（`Container` + 颜色）
- "下一题"按钮（disabled → enabled）
- 末题显示正确率结果

选项生成逻辑：正确释义 + 3 个干扰项（从其他单词取 meaning），打乱顺序。

```dart
// 选项打乱
final distractors = DB.words.where((w) => w.id != word.id).map((w) => w.meaning).toList()..shuffle();
final options = [word.meaning, ...distractors].take(4).toList()..shuffle();
```

### 7.4 统计 StatsScreen

- 4 个数据卡片（2×2）
- 本周柱状图：用 `fl_chart` 的 `BarChart`，今日柱子用 `accent` 色
- 打卡热力图：7 列 GridView，按学习量着色 5 级

```dart
// 热力图格子
Container(
  decoration: BoxDecoration(
    color: _levelColor(level), // [#EDE8DF, #D4C9B3, #B3A07A, #8A7552, primary]
    borderRadius: BorderRadius.circular(4),
  ),
)
```

### 7.5 词库 LibraryScreen

- 搜索框（`TextField` + 防抖 250ms）
- 筛选 Tab（全部/新词/学习中/已掌握）
- 列表（`ListView`），每行单词 + 释义 + 徽章，点击 `go('/learn')` 或弹详情

防抖：
```dart
final _controller = TextEditingController();
late final Debounced _debounce; // 或用 flutter_debounce
// onChanged → _debounce.call(() => _search());
```

### 7.6 我的 ProfileScreen

- 头像 + 昵称 + 简介
- 设置项列表（每日目标、学习提醒 Switch、深色模式 Switch）
- 成就徽章 4 列 GridView

Switch 切换深色模式：
```dart
ThemeMode _themeMode = ThemeMode.system; // provider 持有
// 切换时 provider 更新，MaterialApp.router 监听 themeMode
```

---

## 8. 状态管理（Riverpod）

```dart
// lib/providers/word_provider.dart
final wordListProvider = FutureProvider<List<Word>>((ref) async {
  final api = ref.watch(apiServiceProvider);
  return api.fetchWords();
});

final wordFilterProvider = StateProvider<({String status, String keyword})>(
  (ref) => (status: 'all', keyword: ''),
);

// lib/providers/stats_provider.dart
final statsProvider = FutureProvider<StatsData>((ref) async {
  final api = ref.watch(apiServiceProvider);
  return api.fetchStats();
});

// lib/providers/theme_provider.dart
final themeModeProvider = StateNotifierProvider<ThemeNotifier, ThemeMode>((ref) {
  return ThemeNotifier(ThemeMode.system);
});

class ThemeNotifier extends StateNotifier<ThemeMode> {
  ThemeNotifier(super.initialState);
  void toggle() => state = state == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark;
}
```

`main.dart`：
```dart
void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    const ProviderScope(
      child: VocabApp(),
    ),
  );
}

class VocabApp extends ConsumerWidget {
  final _router = appRouter;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(themeModeProvider);
    return MaterialApp.router(
      title: 'Vocab',
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: themeMode,
      routerConfig: _router,
      scaffoldBackgroundColor: AppColors.bg,
    );
  }
}
```

---

## 9. 开发顺序建议

1. **搭骨架**：pubspec、ThemeData、go_router、BottomNav —— 跑通空壳多页跳转
2. **数据层**：数据模型 + MockApiService（返回本地 JSON）—— 先不接后端
3. **首页 + 统计**：数据展示为主，验证 ThemeData 视觉
4. **学习屏 + 翻卡**：核心交互，重点打磨翻转动画
5. **测试屏**：选项生成 + 判分逻辑
6. **词库 + 我的**：搜索筛选、Switch 设置
7. **接真实后端**：把 `MockApiService` 换成 `ApiService`（Dio），其余不动

---

## 10. Mock → 真实后端切换

原型的设计意图就是"前端只认 api.js 签名"。Flutter 端同理：

- 开发阶段：`MockApiService`（同签名，返回本地数据）
- 上线阶段：`ApiService`（Dio 实现，同签名）
- 切换点：`apiServiceProvider` 里换一行实现即可，UI 层零改动

后端选型（三档，按需选）：
- **最快**：Supabase / Firebase —— 按 `data-model` 建表，直接出 REST/GraphQL
- **自建**：Node/Go/Python + OpenAPI codegen —— 前后端契约驱动
- **外包**：把本文档 + `contract/openapi.yaml` 交给团队

> 鉴权（JWT/OAuth）、部署、监控属工程范畴，不在本文档范围。原型里的"登录"是前端 mock，真实应用需独立实现。

---

## 附：与原型的对应关系

| 原型文件 | Flutter 对应 |
|---|---|
| `styles.css` 的 `:root` | `AppTheme` / `AppColors` |
| `mock.js` 的 `DB` | `models/*.dart` + `MockApiService` |
| `app.js` 的 `State` | `providers/*` (Riverpod) |
| `app.js` 的 `switchScreen` | `go_router` + `BottomNav` |
| `flashcard` 翻卡 | `FlashcardWidget` + `AnimatedSwitcher` |
| `quiz` 答题 | `QuizScreen` + 选项生成 |
| `heatmap` 热力图 | `StatsScreen` GridView |
| `filter-tabs` 筛选 | `LibraryScreen` + `StateProvider` |
| `toggle` 开关 | `Switch` + `themeModeProvider` |
