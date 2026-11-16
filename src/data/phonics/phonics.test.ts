import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PHONEMES, PHONEME_BY_ID, PHONEME_TOTAL } from './ipa'
import { PHONICS_RULES, RULE_TOTAL, rulesOfStage } from './rules'
import { PHONICS_STAGES, PHONEME_GROUPS, type PhonicsStageId } from './types'
import { collectClipTokens, ipaClipSlug } from './clips'
import { exampleIpa } from './ipaLookup'
import { AMERICAN_IPA } from './americanIpa'

/**
 * 内容完整性守卫：
 * 音标表与拼读规则是纯手写数据，最怕「改一处删掉一行」这种静默丢失。
 * 这里固定住总量与结构，新增内容时可以同步改断言，删除时会立刻报错。
 */
describe('音标表', () => {
  it('共 47 个，分组数量符合美式 General American 体系', () => {
    expect(PHONEME_TOTAL).toBe(47)
    const count = (g: string) => PHONEMES.filter((p) => p.group === g).length
    expect(count('monophthong')).toBe(11)
    expect(count('diphthong')).toBe(8)
    expect(count('consonant')).toBe(24)
    expect(count('cluster')).toBe(4)
  })

  it('id 唯一，且与展示用音标一致', () => {
    const ids = PHONEMES.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const p of PHONEMES) {
      expect(p.ipa).toBe(`/${p.id}/`)
      expect(PHONEME_BY_ID[p.id]).toBe(p)
    }
  })

  it('每个音标都有口型要诀、字母组合与至少 5 个例词', () => {
    for (const p of PHONEMES) {
      expect(p.zh.length).toBeGreaterThan(0)
      expect(p.mouth.length).toBeGreaterThan(10)
      expect(p.spellings.length).toBeGreaterThan(0)
      expect(p.examples.length).toBeGreaterThanOrEqual(5)
      for (const ex of p.examples) {
        expect(ex.w.length).toBeGreaterThan(0)
        expect(ex.zh.length).toBeGreaterThan(0)
      }
    }
  })

  it('每个例词都能解析出完整音标（/…/ 形式）', () => {
    for (const p of PHONEMES) {
      for (const ex of p.examples) {
        const ipa = exampleIpa(ex)
        expect(ipa, `${p.id} 的例词 ${ex.w} 没有音标`).toBeTruthy()
        expect(ipa!.startsWith('/') && ipa!.endsWith('/'), `${ex.w} 音标格式异常：${ipa}`).toBe(true)
      }
    }
    for (const r of PHONICS_RULES) {
      for (const ex of r.examples) {
        expect(exampleIpa(ex), `${r.id} 的例词 ${ex.w} 没有音标`).toBeTruthy()
      }
    }
  })

  it('例词的拼写提示真的在词里（否则卡片高亮会失效）', () => {
    for (const p of PHONEMES) {
      for (const ex of p.examples) {
        if (!ex.hi) continue
        expect(
          ex.w.toLowerCase().includes(ex.hi.toLowerCase()),
          `${p.id} 的例词 ${ex.w} 的拼写提示「${ex.hi}」不在词里`,
        ).toBe(true)
      }
    }
  })

  it('每个例词都有与实际发音一致的美式音标（americanIpa.ts 由工具生成）', () => {
    for (const p of PHONEMES) {
      for (const ex of p.examples) {
        const ipa = AMERICAN_IPA[ex.w.toLowerCase()]
        expect(ipa, `${ex.w} 缺少美式音标，请跑 tools/gen-american-ipa.ts`).toBeTruthy()
        expect(ipa!.startsWith('/') && ipa!.endsWith('/')).toBe(true)
      }
    }
  })

  it('易混音必须指向真实存在的音标', () => {
    for (const p of PHONEMES) {
      for (const id of p.contrast ?? []) {
        expect(PHONEME_BY_ID[id], `${p.id} 的易混音 ${id} 不存在`).toBeTruthy()
      }
    }
  })

  it('分组元信息覆盖全部分组', () => {
    expect(PHONEME_GROUPS.map((g) => g.id).sort()).toEqual(
      Array.from(new Set(PHONEMES.map((p) => p.group))).sort(),
    )
  })
})

describe('自然拼读规则', () => {
  it('共 99 条，7 个阶段都有内容', () => {
    expect(RULE_TOTAL).toBe(99)
    expect(PHONICS_STAGES).toHaveLength(7)
    for (const stage of PHONICS_STAGES) {
      expect(rulesOfStage(stage.id).length, `阶段 ${stage.id} 没有规则`).toBeGreaterThan(0)
    }
  })

  it('id 唯一，字段完整', () => {
    const ids = PHONICS_RULES.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const r of PHONICS_RULES) {
      expect(r.grapheme.length).toBeGreaterThan(0)
      // 音标统一写 /x/；不发音的规则用「（…不发音）」明确标注
      expect(
        r.sound.startsWith('/') || r.sound.startsWith('（'),
        `${r.id} 的音标字段不规范：${r.sound}`,
      ).toBe(true)
      expect(r.tip.length).toBeGreaterThan(5)
      expect(r.examples.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('第 1 阶段覆盖 26 个字母音', () => {
    const letters = rulesOfStage(1).map((r) => r.grapheme.toLowerCase())
    expect(letters.sort()).toEqual('abcdefghijklmnopqrstuvwxyz'.split(''))
  })

  it('每个阶段的规则都属于该阶段', () => {
    for (const stage of PHONICS_STAGES) {
      const id = stage.id as PhonicsStageId
      expect(rulesOfStage(id).every((r) => r.stage === id)).toBe(true)
    }
  })
})

describe('音标发音音频', () => {
  const tokens = collectClipTokens(
    PHONEMES.map((p) => p.id),
    PHONICS_RULES.map((r) => r.sound),
  )

  it('slug 全小写且唯一，不会两个音撞到同一个文件', () => {
    const slugs = tokens.map(ipaClipSlug)
    expect(new Set(slugs).size).toBe(slugs.length)
    // Windows / macOS 文件系统不区分大小写：大小写不同也会互相覆盖
    expect(new Set(slugs.map((s) => s.toLowerCase())).size).toBe(slugs.length)
    for (const s of slugs) expect(s, `${s} 含大写字母`).toBe(s.toLowerCase())
  })

  it('音频文件数量与 token 数量一致（没有互相覆盖）', () => {
    const dir = resolve(process.cwd(), 'public/audio/ipa')
    const files = readdirSync(dir).filter((f) => f.endsWith('.wav'))
    expect(files.length).toBe(tokens.length)
  })

  it('每个音标与规则音都有打包好的 wav（缺文件应跑 tools/gen-ipa-clips.ts）', () => {
    const dir = resolve(process.cwd(), 'public/audio/ipa')
    for (const token of tokens) {
      const file = resolve(dir, `${ipaClipSlug(token)}.wav`)
      expect(existsSync(file), `${token} 缺少音频：${file}`).toBe(true)
    }
  })
})
