import { YBALAC_HELP } from './ybalac';
import { YBALAF_HELP } from './ybalaf';
import type { OpaleSourceHelp, OpaleSourceId } from '../types';

export const OPALE_HELP_REGISTRY: Record<OpaleSourceId, OpaleSourceHelp> = {
  YBALAC: YBALAC_HELP,
  YBALAF: YBALAF_HELP,
};
