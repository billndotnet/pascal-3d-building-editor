import { describe, expect, test } from 'bun:test'
import { Group } from 'three'
import { hydronicComponentDefinition } from './definition'

describe('hydronicComponentDefinition', () => {
  test('kind + placed capabilities', () => {
    expect(hydronicComponentDefinition.kind).toBe('hydronic-component')
    expect(hydronicComponentDefinition.capabilities.floorPlaced).toBeDefined()
  })
  test('geometry, ports, floorplan, tool all wired', () => {
    const n = { ...hydronicComponentDefinition.defaults(), id: 'hydronic-component_1', type: 'hydronic-component' } as never
    expect(hydronicComponentDefinition.geometry?.(n)).toBeInstanceOf(Group)
    expect((hydronicComponentDefinition.ports?.(n) ?? []).every((p) => p.system === 'hydronic')).toBe(true)
    expect(typeof hydronicComponentDefinition.floorplan).toBe('function')
    expect(hydronicComponentDefinition.tool).toBeDefined()
  })
})
