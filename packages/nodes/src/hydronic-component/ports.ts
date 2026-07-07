import type { NodePort } from '@pascal-app/core'
import { Vector3 } from 'three'
import { HYDRONIC_KINDS } from './schema'
import type { HydronicComponentNode } from './schema'

/** `def.ports` — the kind's local in/out (or manifold branch) ports
 * transformed into level-local space (yaw + position). */
export function getHydronicComponentPorts(node: HydronicComponentNode): NodePort[] {
  const cfg = HYDRONIC_KINDS[node.kind]
  const offset = new Vector3(node.position[0], node.position[1], node.position[2])
  return cfg.ports.map((port) => {
    const position = new Vector3(...port.position)
      .applyAxisAngle(new Vector3(0, 1, 0), node.rotation)
      .add(offset)
    const direction = new Vector3(...port.direction)
      .applyAxisAngle(new Vector3(0, 1, 0), node.rotation)
      .normalize()
    return {
      id: port.id,
      position: [position.x, position.y, position.z] as const,
      direction: [direction.x, direction.y, direction.z] as const,
      diameter: node.diameter,
      system: 'hydronic',
    }
  })
}
