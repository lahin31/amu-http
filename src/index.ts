import { createDefaultAmu } from '@/factory/createAmu';

const amu = createDefaultAmu();

export { Amu } from '@/client/AmuClient';
export { AmuError } from '@/errors/AmuError';
export { AmuNetworkError } from '@/errors/AmuNetworkError';
export { AmuUrlError } from '@/errors/AmuUrlError';
export { AmuValidationError } from '@/errors/AmuValidationError';
export type { AmuHybrid } from '@/factory/createAmu';
export { createInstance } from '@/factory/createAmu';
export type {
  AmuConfig,
  AmuPromise,
  AmuRawResponse,
  AmuRetryConfig,
  AmuSchema,
} from '@/types/public';
export { amu };
export default amu;
