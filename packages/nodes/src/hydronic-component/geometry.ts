import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import { HYDRONIC_KINDS } from './schema'
import type { HydronicComponentNode } from './schema'

/**
 * Box body for a hydronic component, sized and colored by `kind`. Origin at
 * the base center; y=0 is the base. Positioned + yaw-rotated to the node's
 * frame.
 */
export function buildHydronicComponentGeometry(node: HydronicComponentNode): Group {
  const group = new Group()
  const cfg = HYDRONIC_KINDS[node.kind]
  const [w, h, d] = cfg.size
  const body = new Mesh(
    new BoxGeometry(w, h, d),
    new MeshStandardMaterial({ color: cfg.color, metalness: 0.3, roughness: 0.6 }),
  )
  body.name = `hydronic-${node.kind}-body`
  body.position.set(0, h / 2, 0) // lift so y=0 is the base
  group.add(body)
  group.position.set(node.position[0], node.position[1], node.position[2])
  group.rotation.y = node.rotation
  return group
}
