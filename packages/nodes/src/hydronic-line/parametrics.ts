import type { ParametricDescriptor } from '@pascal-app/core'
import type { HydronicLineNode } from './schema'

export const hydronicLineParametrics: ParametricDescriptor<HydronicLineNode> = {
  groups: [
    {
      label: 'Tube',
      fields: [{ key: 'diameter', kind: 'number', unit: 'in', min: 0.25, max: 2, step: 0.125 }],
    },
    {
      label: 'Insulation',
      fields: [{ key: 'insulated', kind: 'boolean' }],
    },
    {
      label: 'Role',
      fields: [
        {
          key: 'role',
          kind: 'enum',
          options: ['transport', 'zone-branch', 'radiator-branch'],
          display: 'segmented',
        },
      ],
    },
  ],
}
