import type { ScenarioScript } from '../types'
import { steps as part1 } from './normal-approve.part1'
import { steps as part2 } from './normal-approve.part2'

export default {
  id: 'normal-approve',
  steps: { ...part1, ...part2 },
} satisfies ScenarioScript
