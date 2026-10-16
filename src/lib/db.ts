import "server-only";
import dns from "node:dns";
import mongoose from "mongoose";

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

// Reuse the connection across hot reloads in dev and across invocations in prod.
const globalForMongoose = globalThis as unknown as { mongoose?: MongooseCache };
const cache: MongooseCache = (globalForMongoose.mongoose ??= {
  conn: null,
  promise: null,
});

/**
 * Some local DNS proxies refuse the SRV lookups that mongodb+srv:// needs, and
 * overriding Node's global resolver is unreliable inside Next.js. When DNS_SERVERS
 * (comma-separated) is set, resolve the SRV/TXT records with a dedicated resolver
 * and hand the driver an equivalent plain mongodb:// URI instead.
 */
async function resolveSrvUri(uri: string) {
  const servers = process.env.DNS_SERVERS?.split(",").map((s) => s.trim()).filter(Boolean);
  if (!servers?.length || !uri.startsWith("mongodb+srv://")) return uri;

  const url = new URL(uri);
  const resolver = new dns.promises.Resolver();
  resolver.setServers(servers);

  const [srv, txt] = await Promise.all([
    resolver.resolveSrv(`_mongodb._tcp.${url.hostname}`),
    resolver.resolveTxt(url.hostname).catch(() => [] as string[][]),
  ]);
  if (srv.length === 0) throw new Error(`No SRV records for ${url.hostname}`);

  // TXT records carry defaults (e.g. authSource, replicaSet); explicit URI options win.
  const params = new URLSearchParams(txt.map((chunks) => chunks.join("")).join("&"));
  url.searchParams.forEach((value, key) => params.set(key, value));
  if (!params.has("tls") && !params.has("ssl")) params.set("tls", "true");

  const auth = url.username ? `${url.username}${url.password ? `:${url.password}` : ""}@` : "";
  const hosts = srv.map((r) => `${r.name}:${r.port}`).join(",");
  return `mongodb://${auth}${hosts}${url.pathname}?${params}`;
}

export async function connectDB() {
  if (cache.conn) return cache.conn;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set in .env.local");

  cache.promise ??= resolveSrvUri(uri).then((resolved) =>
    mongoose.connect(resolved, { bufferCommands: false }),
  );
  try {
    cache.conn = await cache.promise;
  } catch (err) {
    cache.promise = null;
    throw err;
  }
  return cache.conn;
}
