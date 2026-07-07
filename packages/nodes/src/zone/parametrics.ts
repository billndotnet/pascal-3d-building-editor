import type { ParametricDescriptor, ZoneNode } from '@pascal-app/core'

export const zoneParametrics: ParametricDescriptor<ZoneNode> = {
  groups: [
    {
      label: 'Volume',
      fields: [
        // Extrusion height in metres (0 / unset keeps the default wall height).
        { key: 'height', kind: 'number', unit: 'm', min: 0, max: 5, step: 0.05 },
        // Base elevation the volume rises from (e.g. stack chassis bays).
        { key: 'elevation', kind: 'number', unit: 'm', min: -3, max: 5, step: 0.05 },
        { key: 'volumeStyle', kind: 'enum', display: 'segmented', options: ['walls', 'prism'] },
      ],
    },
  ],
}
