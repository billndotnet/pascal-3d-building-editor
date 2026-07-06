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
