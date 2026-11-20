export type D1Result<T = unknown> = { results: T[]; success: boolean; meta: { changes: number } };
export type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
};
export type D1DatabaseBinding = {
  prepare(sql: string): D1Statement;
  batch<T = unknown>(statements: D1Statement[]): Promise<D1Result<T>[]>;
};

let database: D1DatabaseBinding | null = null;

export function configureCloudflareDatabase(binding: D1DatabaseBinding) {
  database = binding;
}

export function getCloudflareDatabase() {
  if (!database) throw new Error("Cloudflare D1 binding DB chưa được gắn vào Worker.");
  return database;
}

export function hasCloudflareDatabase() {
  return database !== null;
}
