import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate as drizzleMigrate } from 'drizzle-orm/postgres-js/migrator';

export default async function migrate() {
  const client = postgres(process.env.YTAI_DATABASE_URL, { max: 1 });
  const db = drizzle(client);
  await drizzleMigrate(db, { migrationsFolder: './src/api/drizzle' });
  await client.end();
}

migrate().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
