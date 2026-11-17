import {Pool} from 'pg';
import {applyCommand,type Envelope} from './domain';
import {emptyWorkspace} from './seed';
import type {Workspace} from './types';
let pool:Pool|undefined;
export function getPool(){if(!process.env.DATABASE_URL)throw new Error('Base de datos no configurada.');return pool??=new Pool({connectionString:process.env.DATABASE_URL,max:3});}
export const org=()=>process.env.ORGANIZATION_ID||'recepciones-ia';
export async function readWorkspace():Promise<Workspace>{const p=getPool();const r=await p.query('SELECT state FROM ria_workspaces WHERE organization_id=$1',[org()]);return r.rows[0]?.state||emptyWorkspace();}
export async function transact(e:Envelope):Promise<Workspace>{const client=await getPool().connect();try{
 await client.query('BEGIN');await client.query('INSERT INTO ria_workspaces(organization_id,state) VALUES($1,$2) ON CONFLICT DO NOTHING',[org(),JSON.stringify(emptyWorkspace())]);
 const result=await client.query('SELECT state FROM ria_workspaces WHERE organization_id=$1 FOR UPDATE',[org()]);
 const state=applyCommand(result.rows[0].state,e);
 await client.query('UPDATE ria_workspaces SET state=$2,version=$3,updated_at=now() WHERE organization_id=$1',[org(),JSON.stringify(state),state.version]);
 await client.query('INSERT INTO ria_command_log(organization_id,command_id,applied_version) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[org(),e.id,state.version]);
 await client.query('COMMIT');return state;
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
