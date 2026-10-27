export interface ResponseMeta {
  total?: number;
  page?: number;
  limit?: number;
  [key: string]: unknown;
}

export interface ResponseEnvelope<T> {
  data: T;
  meta: ResponseMeta;
}
