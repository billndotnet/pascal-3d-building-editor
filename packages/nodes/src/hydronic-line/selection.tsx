'use client'

import { HYDRONIC_PORT_SYSTEMS } from '../shared/ports'
import { createRefrigerantLineSelectionAffordance } from '../shared/refrigerant-line-selection'

export default createRefrigerantLineSelectionAffordance('hydronic-line', HYDRONIC_PORT_SYSTEMS)
