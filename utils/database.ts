import { DB } from "https://deno.land/x/sqlite/mod.ts";
import { fromFileUrl } from "https://deno.land/std/path/mod.ts";

const dbPath = fromFileUrl(import.meta.resolve('../../nebula-data/data/nebula.db'));

const db = new DB(dbPath);
export default db;