import {NextRequest,NextResponse} from 'next/server';
import {authorized} from '@/lib/auth';
import {org} from '@/lib/server-store';
import {OdooError,resolveOdoo,fetchOdooData} from '@/lib/odoo';
import type {OdooKind} from '@/lib/odoo-data';
export const runtime='nodejs';export const maxDuration=60;export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
const kinds:OdooKind[]=['orders','receipts','bills','suppliers'];
// Lectura en vivo de Odoo con una caché corta en memoria: evita repetir la consulta al cambiar de pestaña.
// No se guarda nada en la base de datos de la app; «refresh=1» fuerza una lectura nueva.
const cache=new Map<string,{at:number;body:unknown}>(),ttl=60_000;
export async function GET(req:NextRequest){if(!authorized(req))return json({error:'Inicia sesión.'},401);
 const kind=req.nextUrl.searchParams.get('kind') as OdooKind;if(!kinds.includes(kind))return json({error:'Consulta no válida.'},400);
 try{const resolved=await resolveOdoo();if(!resolved)return json({error:'Odoo no está conectado.',connected:false},409);
  const key=org()+'|'+resolved.config.url+'|'+resolved.config.db+'|'+kind,hit=cache.get(key);
  if(hit&&Date.now()-hit.at<ttl&&!req.nextUrl.searchParams.has('refresh'))return json(hit.body);
  const data=await fetchOdooData(resolved.config,kind);const body={...data,readAt:new Date().toISOString(),source:resolved.source};cache.set(key,{at:Date.now(),body});return json(body);
 }catch(e){return e instanceof OdooError?json({error:e.message},e.status):json({error:'No se pudo leer de Odoo.'},502);}
}
