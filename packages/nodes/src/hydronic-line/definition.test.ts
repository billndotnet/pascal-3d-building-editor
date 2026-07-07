import { describe, expect, test } from 'bun:test'
import { Group } from 'three'
import { hydronicLineDefinition } from './definition'

describe('hydronicLineDefinition', () => {
  test('declares the hydronic-line kind with a run role', () => {
    expect(hydronicLineDefinition.kind).toBe('hydronic-line')
    expect(hydronicLineDefinition.distributionRole).toBe('run')
  })

  test('geometry builds a Group from defaults', () => {
    const node = { ...hydronicLineDefinition.defaults(), id: 'hydronic-line_1', type: 'hydronic-line' } as never
    expect(hydronicLineDefinition.geometry?.(node)).toBeInstanceOf(Group)
  })

  test('exposes typed hydronic ports at both ends', () => {
    const node = { ...hydronicLineDefinition.defaults(), id: 'hydronic-line_1', type: 'hydronic-line' } as never
    const ports = hydronicLineDefinition.ports?.(node) ?? []
    expect(ports).toHaveLength(2)
    expect(ports.every((p) => p.system === 'hydronic')).toBe(true)
  })
})

describe('hydronicLineDefinition interactive wiring', () => {
  test('exposes a 2D floorplan builder', () => {
    expect(typeof hydronicLineDefinition.floorplan).toBe('function')
  })
  test('exposes parametrics', () => {
    expect(hydronicLineDefinition.parametrics).toBeDefined()
  })
  test('registers the move-path-point floorplan affordance', () => {
    expect(hydronicLineDefinition.floorplanAffordances?.['move-path-point']).toBeDefined()
  })
  test('provides a draw tool and selection/move affordance tools', () => {
    expect(hydronicLineDefinition.tool).toBeDefined()
    expect(hydronicLineDefinition.affordanceTools?.selection).toBeDefined()
    expect(hydronicLineDefinition.affordanceTools?.move).toBeDefined()
  })
})
