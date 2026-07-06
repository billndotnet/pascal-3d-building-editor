import { CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from 'three'
import { INCHES_TO_METERS } from '../duct-segment/geometry'
import type { HydronicLineNode } from './schema'

const RADIAL_SEGMENTS = 16

// Warm coolant-line tone (glycol/water hydronic), distinct from lineset copper.
const TUBE_COLOR = '#b45309'
// Light foam sleeve, matching the lineset jacket read.
const INSULATION_COLOR = '#e8e8ea'
const INSULATION_THICKNESS_M = 0.01

const UP = new Vector3(0, 1, 0)

function buildRun(
  start: Vector3,
  end: Vector3,
  radius: number,
  material: MeshStandardMaterial,
  name: string,
): Mesh | null {
  const dir = new Vector3().subVectors(end, start)
  const length = dir.length()
  if (length < 1e-6) return null
  dir.normalize()
  const mesh = new Mesh(
    new CylinderGeometry(radius, radius, length, RADIAL_SEGMENTS, 1, false),
    material,
  )
  mesh.name = name
  mesh.position.copy(start).addScaledVector(dir, length / 2)
  mesh.quaternion.setFromUnitVectors(UP, dir)
  return mesh
}

/**
 * Pure geometry builder for a hydronic line: a single insulated tube that
 * follows the node path centerline. Mirrors the lineset builder but with one
 * tube sized by `diameter`. Spheres cap every path point so turns read as
 * continuous pipe. Coordinates are level-local meters.
 */
export function buildHydronicLineGeometry(node: HydronicLineNode): Group {
  const group = new Group()
  if (node.path.length < 2) return group

  const tubeR = (node.diameter * INCHES_TO_METERS) / 2
  const jacketR = node.insulated ? tubeR + INSULATION_THICKNESS_M : tubeR

  const tubeMat = new MeshStandardMaterial({ color: TUBE_COLOR, metalness: 0.3, roughness: 0.5 })
  const insulationMat = new MeshStandardMaterial({
    color: INSULATION_COLOR,
    metalness: 0.1,
    roughness: 0.9,
  })

  const points = node.path.map(([x, y, z]) => new Vector3(x, y, z))

  for (let i = 0; i < points.length - 1; i++) {
    const tube = buildRun(points[i]!, points[i + 1]!, tubeR, tubeMat, `hydronic-tube-${i}`)
    if (tube) group.add(tube)
    if (node.insulated) {
      const jacket = buildRun(points[i]!, points[i + 1]!, jacketR, insulationMat, `hydronic-jacket-${i}`)
      if (jacket) group.add(jacket)
    }
  }

  for (let i = 0; i < points.length; i++) {
    const joint = new Mesh(new SphereGeometry(tubeR, RADIAL_SEGMENTS, 10), tubeMat)
    joint.name = `hydronic-tube-joint-${i}`
    joint.position.copy(points[i] as Vector3)
    group.add(joint)
    if (node.insulated) {
      const jJoint = new Mesh(new SphereGeometry(jacketR, RADIAL_SEGMENTS, 10), insulationMat)
      jJoint.name = `hydronic-jacket-joint-${i}`
      jJoint.position.copy(points[i] as Vector3)
      group.add(jJoint)
    }
  }

  return group
}
