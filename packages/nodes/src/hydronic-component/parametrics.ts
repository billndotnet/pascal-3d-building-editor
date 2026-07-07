import type { ParametricDescriptor } from '@pascal-app/core'
import type { HydronicComponentNode } from './schema'

export const hydronicComponentParametrics: ParametricDescriptor<HydronicComponentNode> = {
  groups: [
    {
      label: 'Component',
      fields: [
        {
          key: 'kind',
          kind: 'enum',
          display: 'segmented',
          options: ['pump', 'zone-valve', 'manifold', 'radiator'],
        },
        { key: 'diameter', kind: 'number', unit: 'in', min: 0.25, max: 2, step: 0.125 },
      ],
    },
  ],
}
