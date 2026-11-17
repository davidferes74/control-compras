import {NextRequest,NextResponse} from 'next/server';
import {ZodError} from 'zod';
import {authorized,sameOrigin} from './auth';
import {AppError} from './documents';
import {GoogleError} from './google';
import {ReadError} from './ai-reader';
export const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
export const uuid=(id:string)=>{if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))throw new AppError('No encontrado.',404);return id;};
/** Ejecuta un manejador con sesión obligatoria (y mismo origen si modifica datos) y traduce los errores conocidos. */
export async function handle(req:NextRequest,fn:()=>Promise<unknown>){
 if(!authorized(req))return json({error:'Inicia sesión.'},401);
 if(req.method!=='GET'&&!sameOrigin(req))return json({error:'Origen no permitido.'},403);
 try{const r=await fn();return r instanceof NextResponse?r:json(r??{ok:true});}
 catch(e){if(e instanceof AppError||e instanceof GoogleError||e instanceof ReadError)return json({error:e.message},e.status);
  if(e instanceof ZodError)return json({error:'Datos no válidos: '+e.issues.slice(0,3).map(i=>i.path.join('.')+' '+i.message).join('; ')},400);
  console.error(e);return json({error:'Error interno. Reintenta; si persiste, revisa los registros de Vercel.'},500);}}
