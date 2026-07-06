import { describe, expect, test } from 'bun:test'
import { AnyNode } from '@pascal-app/core/schema'
import { metadata, template } from './rv-class-a'

describe('rv-class-a template', () => {
  test('root is the site node', () => {
    expect(template.rootNodeIds).toEqual(['site_rv'])
  })

  test('every node passes AnyNode.safeParse', () => {
    for (const node of Object.values(template.nodes)) {
      const result = AnyNode.safeParse(node)
      expect(result.success).toBe(true)
    }
  })

  test('has three levels: chassis (-1), main (0), roof (1)', () => {
    const levels = Object.values(template.nodes)
      .filter((n) => (n as { type: string }).type === 'level')
      .map((n) => (n as { level: number }).level)
      .sort((a, b) => a - b)
    expect(levels).toEqual([-1, 0, 1])
  })

  test('main level has four boundary walls, all locked', () => {
    const walls = Object.values(template.nodes).filter(
      (n) => (n as { type: string }).type === 'wall',
    )
    expect(walls).toHaveLength(4)
    for (const w of walls) {
      expect((w as { metadata: { locked?: boolean } }).metadata.locked).toBe(true)
    }
  })

  test('chassis level has the seven named bays', () => {
    const roles = Object.values(template.nodes)
      .filter((n) => (n as { type: string }).type === 'zone')
      .map((n) => (n as { metadata: { bayRole?: string } }).metadata.bayRole)
      .sort()
    expect(roles).toEqual(
      ['battery', 'black-tank', 'engine', 'fresh-tank', 'generator', 'grey-tank', 'propane'].sort(),
    )
  })

  test('metadata id matches', () => {
    expect(metadata.id).toBe('rv-class-a')
  })
})
