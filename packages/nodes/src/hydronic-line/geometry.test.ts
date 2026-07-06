import { describe, expect, test } from 'bun:test'
import { Group } from 'three'
import { buildHydronicLineGeometry } from './geometry'

const node = (over: Record<string, unknown> = {}) =>
  ({
    object: 'node',
    id: 'hydronic-line_1',
    type: 'hydronic-line',
    parentId: null,
    visible: true,
    metadata: {},
    path: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
    ],
    diameter: 0.5,
    insulated: true,
    role: 'transport',
    ...over,
  }) as never

describe('buildHydronicLineGeometry', () => {
  test('returns a Group with tube segments and joint caps', () => {
    const g = buildHydronicLineGeometry(node())
    expect(g).toBeInstanceOf(Group)
    // 2 tube segments + 2 jacket segments + 3 tube joints + 3 jacket joints
    expect(g.children.length).toBeGreaterThanOrEqual(8)
  })

  test('omits jacket meshes when not insulated', () => {
    const bare = buildHydronicLineGeometry(node({ insulated: false }))
    const insulated = buildHydronicLineGeometry(node({ insulated: true }))
    expect(bare.children.length).toBeLessThan(insulated.children.length)
  })

  test('empty group for a degenerate single-point path', () => {
    const g = buildHydronicLineGeometry(node({ path: [[0, 0, 0]] }))
    expect(g.children.length).toBe(0)
  })
})
