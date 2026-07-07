import { describe, expect, test } from 'bun:test'
import { buildHydronicComponentFloorplan } from './floorplan'

const node = (over: Record<string, unknown> = {}) =>
  ({
    object: 'node', id: 'hydronic-component_1', type: 'hydronic-component',
    parentId: null, visible: true, metadata: {},
    position: [0, 0, 0], rotation: 0, kind: 'pump', diameter: 0.5, ...over,
  }) as never

describe('buildHydronicComponentFloorplan', () => {
  test('returns a group', () => {
    expect(buildHydronicComponentFloorplan(node(), { viewState: undefined } as never)?.kind).toBe('group')
  })
  test('emits a move-handle when selected', () => {
    const g = buildHydronicComponentFloorplan(node(), { viewState: { selected: true } } as never)
    expect(JSON.stringify(g)).toContain('"move-handle"')
  })
})
