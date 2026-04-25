import { createDefaultAmu } from './amu-factory.js';

const amu = createDefaultAmu();

export { Amu } from './amu-client.js';
export { createInstance } from './amu-factory.js';
export type { AmuHybrid } from './amu-factory.js';
export type { AmuConfig, AmuPromise } from './types.js';
export { amu };
export default amu;