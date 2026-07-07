import { describe, expect, test } from 'bun:test'
import { AnyNode } from '../types'
import { HYDRONIC_KINDS, HydronicComponentNode } from './hydronic-component'

const base = {
  object: 'node', id: 'hydronic-component_1', type: 'hydronic-component',
  parentId: null, visible: true, metadata: {},
  position: [0, 0, 0], rotation: 0, kind: 'pump',
}

describe('HydronicComponentNode', () => {
  test('applies defaults', () => {
    const n = HydronicComponentNode.parse(base)
    expect(n.kind).toBe('pump')
    expect(n.diameter).toBe(0.5)
  })
  test('rejects an unknown kind', () => {
    expect(HydronicComponentNode.safeParse({ ...base, kind: 'bogus' }).success).toBe(false)
  })
  test('is a member of AnyNode', () => {
    expect(AnyNode.safeParse(HydronicComponentNode.parse(base)).success).toBe(true)
  })
  test('every kind has a config with a positive size and >=1 port', () => {
    for (const cfg of Object.values(HYDRONIC_KINDS)) {
      expect(cfg.size.every((d) => d > 0)).toBe(true)
      expect(cfg.ports.length).toBeGreaterThanOrEqual(1)
    }
  })
})
