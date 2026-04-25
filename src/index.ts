import { createDefaultAmu } from './factory/createAmu.js';

const amu = createDefaultAmu();

export { Amu } from './client/AmuClient.js';
export { createInstance } from './factory/createAmu.js';
export { AmuError } from './errors/AmuError.js';
export { AmuValidationError } from './errors/AmuValidationError.js';
export type { AmuHybrid } from './factory/createAmu.js';
export type { AmuConfig, AmuPromise, AmuSchema, AmuRetryConfig } from './types/public.js';
export { amu };
export default amu;