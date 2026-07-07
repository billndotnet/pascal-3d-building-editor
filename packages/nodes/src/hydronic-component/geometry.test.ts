import { describe, expect, test } from 'bun:test'
import { Group } from 'three'
import { buildHydronicComponentGeometry } from './geometry'
import { getHydronicComponentPorts } from './ports'

const node = (over: Record<string, unknown> = {}) =>
  ({
    object: 'node', id: 'hydronic-component_1', type: 'hydronic-component',
    parentId: null, visible: true, metadata: {},
    position: [1, 0, 2], rotation: 0, kind: 'pump', diameter: 0.5,
    ...over,
  }) as never

describe('hydronic-component geometry + ports', () => {
  test('geometry is a Group with a body mesh', () => {
    const g = buildHydronicComponentGeometry(node())
    expect(g).toBeInstanceOf(Group)
    expect(g.children.length).toBeGreaterThanOrEqual(1)
  })
  test('pump exposes in + out hydronic ports at world position', () => {
    const ports = getHydronicComponentPorts(node())
    expect(ports.map((p) => p.id).sort()).toEqual(['in', 'out'])
    expect(ports.every((p) => p.system === 'hydronic')).toBe(true)
    // ports are offset from the node position along X (rotation 0)
    expect(ports.find((p) => p.id === 'out')!.position[0]).toBeGreaterThan(1)
  })
  test('manifold exposes 4 ports', () => {
    expect(getHydronicComponentPorts(node({ kind: 'manifold' }))).toHaveLength(4)
  })
})
