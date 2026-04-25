import { createDefaultAmu } from './factory/createAmu.js';

const amu = createDefaultAmu();

export { Amu } from './client/AmuClient.js';
export { createInstance } from './factory/createAmu.js';
export type { AmuHybrid } from './factory/createAmu.js';
export type { AmuConfig, AmuPromise } from './types/public.js';
export { amu };
export default amu;