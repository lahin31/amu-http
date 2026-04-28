export { amu, createClient } from '@/client';

export { AmuError } from '@/errors/AmuError';
export type { AmuNetworkErrorKind } from '@/errors/AmuNetworkError';
export { AmuNetworkError } from '@/errors/AmuNetworkError';
export { AmuUnknownError } from '@/errors/AmuUnknownError';
export { AmuUrlError } from '@/errors/AmuUrlError';
export { AmuValidationError } from '@/errors/AmuValidationError';
export type { NdjsonErrorMode, NdjsonItem, NdjsonOptions } from '@/streaming/ndjson';
export { parseNDJSON } from '@/streaming/ndjson';
export type { SSEEvent } from '@/streaming/sse';
// Streaming protocol parsers — tree-shaken when not imported.
export { parseSSE } from '@/streaming/sse';
export type {
  HttpMethod,
  Middleware,
  RequestContext,
  ResponseContext,
} from '@/types/middleware';
export { defineMiddleware } from '@/types/middleware';
export type {
  Client,
  ClientConfig,
  FetchImpl,
  InferRequestBody,
  InferResponse,
  QuerySerializer,
  RequestOptions,
  RequestSchema,
  RetryAttemptInfo,
  RetryConfig,
  RouteParams,
  Schema,
  StreamMethod,
  StreamOptions,
} from '@/types/public';
export type { AmuAnyError, Result } from '@/types/result';
export type { StandardSchemaV1 } from '@/types/standard-schema';
