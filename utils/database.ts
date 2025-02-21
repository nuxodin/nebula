import { DB } from "https://deno.land/x/sqlite/mod.ts";
import { dirname, fromFileUrl, join } from "https://deno.land/std/path/mod.ts";

console.log('create database');

const dbPath = fromFileUrl(import.meta.resolve('../../nebula-data/data/nebula.db'));

const db = new DB(dbPath);
export default db;