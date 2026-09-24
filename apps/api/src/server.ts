import { buildApp } from './app.js';
import { connectDatabase } from './db/client.js';
import { readConfig } from './config.js';
const config = readConfig();
const { db, pool } = connectDatabase(config.databaseUrl);
const app = await buildApp({ ...config, db, logger: true });
app.addHook('onClose', async () => { await pool.end(); });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); });
try { await app.listen({ host: config.host, port: config.port }); }
catch (error) { app.log.error(error); await app.close(); process.exitCode = 1; }
