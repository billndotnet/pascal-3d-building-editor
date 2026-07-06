import { describe, expect, test } from 'bun:test'
import { AnyNode } from '@pascal-app/core/schema'
import { isTemplateId, TEMPLATES } from './index'
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
      .filter(
        (n) =>
          (n as { type: string }).type === 'zone' &&
          (n as { metadata: { bayRole?: string } }).metadata.bayRole !== undefined,
      )
      .map((n) => (n as { metadata: { bayRole: string } }).metadata.bayRole)
      .sort()
    expect(roles).toEqual(
      ['battery', 'black-tank', 'engine', 'fresh-tank', 'generator', 'grey-tank', 'propane'].sort(),
    )
  })

  test('metadata id matches', () => {
    expect(metadata.id).toBe('rv-class-a')
  })
})

describe('rv-class-a WB40 dimensions', () => {
  const zoneById = (id: string) =>
    Object.values(template.nodes).find((n) => (n as { id: string }).id === id) as
      | { polygon: Array<[number, number]>; metadata: { area?: string } }
      | undefined

  test('main level is split into cockpit and cabin zones', () => {
    const cockpit = zoneById('zone_cockpit')
    const cabin = zoneById('zone_cabin')
    expect(cockpit?.metadata.area).toBe('cockpit')
    expect(cabin?.metadata.area).toBe('cabin')
  })

  test('interior clear width is 95 inches', () => {
    const cabin = zoneById('zone_cabin')
    const xs = (cabin?.polygon ?? []).map((p) => p[0])
    const width = Math.max(...xs) - Math.min(...xs)
    expect(width).toBeCloseTo(95 * 0.0254, 4) // 2.413 m
  })

  test('cockpit is the front 4 feet; cabin is the remaining ~36 feet', () => {
    const cockpit = zoneById('zone_cockpit')
    const cabin = zoneById('zone_cabin')
    const zSpan = (poly?: Array<[number, number]>) => {
      const zs = (poly ?? []).map((p) => p[1])
      return Math.max(...zs) - Math.min(...zs)
    }
    expect(zSpan(cockpit?.polygon)).toBeCloseTo(4 * 0.3048, 4) // 1.2192 m
    // Interior length is the 40′ body less the two 3.5″ end walls; cabin = that − cockpit.
    const interiorLen = 40 * 0.3048 - 2 * (3.5 * 0.0254)
    expect(zSpan(cabin?.polygon)).toBeCloseTo(interiorLen - 4 * 0.3048, 4)
  })

  test('boundary walls carry the 79-inch ceiling and 3.5-inch build', () => {
    const walls = Object.values(template.nodes).filter(
      (n) => (n as { type: string }).type === 'wall',
    ) as Array<{ height: number; thickness: number }>
    expect(walls.length).toBeGreaterThan(0)
    for (const w of walls) {
      expect(w.height).toBeCloseTo(79 * 0.0254, 4) // 2.0066 m
      expect(w.thickness).toBeCloseTo(3.5 * 0.0254, 4) // 0.0889 m
    }
  })
})

describe('rv-class-a registration', () => {
  test('is registered in TEMPLATES', () => {
    expect(Object.keys(TEMPLATES)).toContain('rv-class-a')
  })

  test('isTemplateId accepts it', () => {
    expect(isTemplateId('rv-class-a')).toBe(true)
  })

  test('registered entry exposes the template graph', () => {
    expect(TEMPLATES['rv-class-a'].template.rootNodeIds).toEqual(['site_rv'])
  })
})
