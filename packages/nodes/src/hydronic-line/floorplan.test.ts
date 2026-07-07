import { describe, expect, test } from 'bun:test'
import { buildHydronicLineFloorplan } from './floorplan'

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

const ctx = { viewState: undefined } as never

describe('buildHydronicLineFloorplan', () => {
  test('returns a group with the run polylines for a multi-point path', () => {
    const g = buildHydronicLineFloorplan(node(), ctx)
    expect(g?.kind).toBe('group')
  })

  test('returns null for a degenerate single-point path', () => {
    expect(buildHydronicLineFloorplan(node({ path: [[0, 0, 0]] }), ctx)).toBeNull()
  })
})
