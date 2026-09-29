/**
 * Manual run of the reminder mailing, ignoring the sending hours: `pnpm bot:remind`.
 * `--dry-run` prints what would be sent today and changes nothing (no MAX token needed).
 */
import { connectDatabase } from '../../api/src/db/client.js';
import { previewReminders, runReminders } from '../../api/src/features/reminders/delivery.js';
import { maxMessenger } from '../../api/src/features/reminders/max.js';

const dryRun = process.argv.includes('--dry-run');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('Укажите DATABASE_URL');
const includeEstimated = process.env.BOT_REMIND_ESTIMATED !== 'false';
const { db, pool } = connectDatabase(databaseUrl);
try {
  if (dryRun) {
    const preview = await previewReminders(db, { includeEstimated });
    if (!preview.length) console.log('Сегодня отправлять нечего.');
    for (const item of preview) console.log(`\n=== MAX user ${item.maxUserId}: сроков ${item.reminders.length}, изменений ${item.changes.length} ===\n${item.text.replace(/<\/?[bi]>/g, '')}`);
  } else {
    const token = process.env.MAX_BOT_TOKEN;
    if (!token) throw new Error('Укажите MAX_BOT_TOKEN или запустите с --dry-run');
    const stats = await runReminders(db, maxMessenger(token), { includeEstimated, log: (message, extra) => console.log(message, extra ?? '') });
    console.log('Готово:', stats);
  }
} finally { await pool.end(); }
