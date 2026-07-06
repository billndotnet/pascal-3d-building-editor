import { describe, expect, test } from 'bun:test'
import { AnyNode } from '../types'
import { HydronicLineNode } from './hydronic-line'

const base = {
  object: 'node',
  id: 'hydronic-line_1',
  type: 'hydronic-line',
  parentId: null,
  visible: true,
  metadata: {},
  path: [
    [0, 0, 0],
    [2, 0, 0],
  ],
}

describe('HydronicLineNode', () => {
  test('applies defaults', () => {
    const n = HydronicLineNode.parse(base)
    expect(n.diameter).toBe(0.5)
    expect(n.insulated).toBe(true)
    expect(n.role).toBe('transport')
  })

  test('rejects a single-point path', () => {
    expect(HydronicLineNode.safeParse({ ...base, path: [[0, 0, 0]] }).success).toBe(false)
  })

  test('rejects an unknown role', () => {
    expect(HydronicLineNode.safeParse({ ...base, role: 'bogus' }).success).toBe(false)
  })

  test('is a member of the AnyNode union', () => {
    expect(AnyNode.safeParse(HydronicLineNode.parse(base)).success).toBe(true)
  })
})
