import {Pool,types,type PoolClient} from 'pg';
// Fechas (tipo DATE) como texto «AAAA-MM-DD», sin conversiones de zona horaria.
types.setTypeParser(1082,(v:string)=>v);
let pool:Pool|undefined;
export function getPool(){if(!process.env.DATABASE_URL)throw new Error('Base de datos no configurada.');return pool??=new Pool({connectionString:process.env.DATABASE_URL,max:3});}
export const org=()=>process.env.ORGANIZATION_ID||'control-compras';
export async function tx<T>(fn:(c:PoolClient)=>Promise<T>):Promise<T>{const c=await getPool().connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}}
export async function audit(action:string,message:string,documentId?:string|null,c?:PoolClient){await (c||getPool()).query('INSERT INTO cc_audit(organization_id,action,message,document_id) VALUES($1,$2,$3,$4)',[org(),action,message.slice(0,500),documentId||null]);}
export async function getSetting<T>(key:string):Promise<T|null>{const r=await getPool().query('SELECT value FROM cc_settings WHERE organization_id=$1 AND key=$2',[org(),key]);return r.rows[0]?.value??null;}
export async function setSetting(key:string,value:unknown){await getPool().query('INSERT INTO cc_settings(organization_id,key,value) VALUES($1,$2,$3) ON CONFLICT(organization_id,key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()',[org(),key,JSON.stringify(value)]);}
