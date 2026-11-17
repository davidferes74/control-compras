import pg from 'pg';
import {readFile,readdir} from 'node:fs/promises';
if(!process.env.DATABASE_URL){console.log('DATABASE_URL ausente: migración omitida.');process.exit(0);}
const dir=new URL('../migrations/',import.meta.url);
const files=(await readdir(dir)).filter(f=>/^\d{3}_.*\.sql$/.test(f)).sort();
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
await client.connect();
try{for(const f of files)await client.query(await readFile(new URL(f,dir),'utf8'));console.log('Migraciones aplicadas: '+files.join(', '));}
finally{await client.end();}
