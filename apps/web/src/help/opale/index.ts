import { YBALAC_HELP } from './ybalac';
import { YBALAF_HELP } from './ybalaf';
import { YGPIE1_HELP } from './ygpie1';
import type { OpaleSourceHelp, OpaleSourceId } from '../types';

export const OPALE_HELP_REGISTRY: Record<OpaleSourceId, OpaleSourceHelp> = {
  YBALAC: YBALAC_HELP,
  YBALAF: YBALAF_HELP,
  YGPIE1: YGPIE1_HELP,
};
