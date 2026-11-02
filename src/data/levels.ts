/**
 * 双阶梯等级系统（LexiCore v3 架构）
 * =================================
 * 单一 20k 策展通用词层，每个词同时携带中式 grade 与西式 level，
 * 两阶梯通过本文件的对照表互相映射；设置中可切换路线，已掌握词原样保留。
 *
 * 中式阶梯（GradeRung）：幼儿园/小学 → 初一 → 初二 → 初三 → 高一 → 高二 → 高三 → 四级 → 六级 → 考研
 * 西式阶梯（LevelRung）：Pre-A1 → A1 → A2 → B1 → B2 → C1 → C2
 *
 * 注：当前词库上限为 B2（Oxford 3000），C1/C2 保留为扩展预留。
 */

import type { Level } from './types'

/** 中式阶梯 rung 顺序（由低到高） */
export type GradeRung =
  | 'primary'   // 小学 / 幼儿园起点
  | 'g7'        // 初一
  | 'g8'        // 初二
  | 'g9'        // 初三
  | 'g10'       // 高一
  | 'g11'       // 高二
  | 'g12'       // 高三
  | 'cet4'      // 四级
  | 'cet6'      // 六级
  | 'kaoyan'    // 考研

/** 西式阶梯 rung 顺序（由低到高） */
export type LevelRung = Level | 'C1' | 'C2'

/** 中式 rung 元数据 */
export interface GradeRungMeta {
  id: GradeRung
  label: string       // 中文短名
  desc: string        // 中文描述
  level: LevelRung    // 映射到西式 rung
  order: number       // 由低到高排序值
}

/** 西式 rung 元数据 */
export interface LevelRungMeta {
  id: LevelRung
  label: string
  desc: string
  grades: GradeRung[] // 反查：哪些中式 rung 映射到此
  order: number
}

/* ----------------------------- 对照表 ----------------------------- */

export const GRADE_RUNGS: GradeRungMeta[] = [
  { id: 'primary', label: '小学',  desc: '三年级起点 · 基础起步',   level: 'Pre-A1', order: 0 },
  { id: 'g7',      label: '初一',  desc: '七年级 · 入门表达',       level: 'A1',     order: 1 },
  { id: 'g8',      label: '初二',  desc: '八年级 · 日常拓展',       level: 'A2',     order: 2 },
  { id: 'g9',      label: '初三',  desc: '九年级 · 中考必备',       level: 'A2',     order: 3 },
  { id: 'g10',     label: '高一',  desc: '必修 · 独立运用',         level: 'B1',     order: 4 },
  { id: 'g11',     label: '高二',  desc: '选择性必修 · 进阶',       level: 'B1',     order: 5 },
  { id: 'g12',     label: '高三',  desc: '总复习 · 流利表达',       level: 'B2',     order: 6 },
  { id: 'cet4',    label: '四级',  desc: 'CET-4 · 大学基础',        level: 'B2',     order: 7 },
  { id: 'cet6',    label: '六级',  desc: 'CET-6 · 大学进阶',        level: 'C1',     order: 8 },
  { id: 'kaoyan',  label: '考研',  desc: '研究生入学 · 高阶',       level: 'C1',     order: 9 },
]

export const LEVEL_RUNGS: LevelRungMeta[] = [
  { id: 'Pre-A1', label: 'Pre-A1', desc: '最基础 · 起步词汇',        grades: ['primary'],        order: 0 },
  { id: 'A1',     label: 'A1',     desc: '基础 · 日常必备',          grades: ['g7'],             order: 1 },
  { id: 'A2',     label: 'A2',     desc: '进阶 · 表达更丰富',        grades: ['g8', 'g9'],       order: 2 },
  { id: 'B1',     label: 'B1',     desc: '中级 · 独立运用',          grades: ['g10', 'g11'],     order: 3 },
  { id: 'B2',     label: 'B2',     desc: '中高级 · 流利表达',        grades: ['g12', 'cet4'],    order: 4 },
  { id: 'C1',     label: 'C1',     desc: '高级 · 熟练驾驭',          grades: ['cet6', 'kaoyan'], order: 5 },
  { id: 'C2',     label: 'C2',     desc: '精通 · 母语者水平（预留）', grades: [],                order: 6 },
]

/** 中式 rung → 西式 rung */
export function gradeToLevel(grade: GradeRung): LevelRung {
  return GRADE_RUNGS.find((g) => g.id === grade)?.level ?? 'Pre-A1'
}

/** 西式 rung → 中式 rung 列表（一对多） */
export function levelToGrades(level: LevelRung): GradeRung[] {
  return LEVEL_RUNGS.find((l) => l.id === level)?.grades ?? []
}

/** 获取中式 rung 的排序值（越小越低） */
export function gradeOrder(g: GradeRung): number {
  return GRADE_RUNGS.find((r) => r.id === g)?.order ?? 0
}

/** 获取西式 rung 的排序值 */
export function levelOrder(l: LevelRung): number {
  return LEVEL_RUNGS.find((r) => r.id === l)?.order ?? 0
}

/** 判断中式 rung a ≤ b（a 在 b 之下或同级） */
export function gradeLe(a: GradeRung, b: GradeRung): boolean {
  return gradeOrder(a) <= gradeOrder(b)
}

/** 判断西式 rung a ≤ b */
export function levelLe(a: LevelRung, b: LevelRung): boolean {
  return levelOrder(a) <= levelOrder(b)
}

/* ----------------------------- 路线（学习路线） ----------------------------- */

/** 当前用户选择的学习路线 */
export type Route = 'grade' | 'level'

/** 默认我的等级（首次启动：小学生起步） */
export const DEFAULT_GRADE: GradeRung = 'primary'
export const DEFAULT_LEVEL: LevelRung = 'Pre-A1'

/** 根据路线和当前等级，返回「当前及以下」的所有中式 rung */
export function activeGrades(route: Route, current: GradeRung | LevelRung): GradeRung[] {
  if (route === 'grade') {
    const order = gradeOrder(current as GradeRung)
    return GRADE_RUNGS.filter((r) => r.order <= order).map((r) => r.id)
  } else {
    // 西式路线：当前 level 以下的所有中式 rung
    const order = levelOrder(current as LevelRung)
    const grades: GradeRung[] = []
    for (const lr of LEVEL_RUNGS) {
      if (lr.order <= order) grades.push(...lr.grades)
    }
    return grades
  }
}

/** 根据路线和当前等级，返回「当前及以下」的所有西式 rung */
export function activeLevels(route: Route, current: GradeRung | LevelRung): LevelRung[] {
  if (route === 'level') {
    const order = levelOrder(current as LevelRung)
    return LEVEL_RUNGS.filter((r) => r.order <= order).map((r) => r.id)
  } else {
    const order = gradeOrder(current as GradeRung)
    const levels: LevelRung[] = []
    for (const gr of GRADE_RUNGS) {
      if (gr.order <= order) {
        if (!levels.includes(gr.level)) levels.push(gr.level)
      }
    }
    return levels
  }
}

/** 获取下一个中式 rung（用于闯关晋级） */
export function nextGrade(current: GradeRung): GradeRung | null {
  const order = gradeOrder(current)
  const next = GRADE_RUNGS.find((r) => r.order === order + 1)
  return next?.id ?? null
}

/** 获取下一个西式 rung */
export function nextLevel(current: LevelRung): LevelRung | null {
  const order = levelOrder(current)
  const next = LEVEL_RUNGS.find((r) => r.order === order + 1)
  return next?.id ?? null
}
