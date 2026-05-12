import { Amu } from '../client/AmuClient.js';
import { AmuConfig } from '../types/public.js';

export function createInstance(baseOrConfig?: string | AmuConfig, config: AmuConfig = {}): Amu {
  if (typeof baseOrConfig === 'string') {
    return new Amu({ ...config, baseURL: baseOrConfig });
  }
  return new Amu(baseOrConfig);
}

export type AmuHybrid = typeof createInstance &
  Pick<Amu, 'request' | 'get' | 'head' | 'post' | 'put' | 'patch' | 'delete'>;

export function createDefaultAmu(): AmuHybrid {
  const defaultInstance = new Amu();
  const amu = createInstance as AmuHybrid;

  amu.request = defaultInstance.request.bind(defaultInstance);
  amu.get = defaultInstance.get.bind(defaultInstance);
  amu.head = defaultInstance.head.bind(defaultInstance);
  amu.post = defaultInstance.post.bind(defaultInstance);
  amu.put = defaultInstance.put.bind(defaultInstance);
  amu.patch = defaultInstance.patch.bind(defaultInstance);
  amu.delete = defaultInstance.delete.bind(defaultInstance);

  return amu;
}
