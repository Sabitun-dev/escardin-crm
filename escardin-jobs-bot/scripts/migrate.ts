// Creates or updates the database tables:  npm run migrate
import { closeDb, migrate } from "../src/db";

const applied = await migrate();
console.log(applied.length ? `Applied migrations: ${applied.join(", ")}` : "Database is up to date.");
await closeDb();
