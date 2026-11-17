import {NextRequest,NextResponse} from 'next/server';
import {createHash,timingSafeEqual} from 'node:crypto';
import {runMailJob} from '@/lib/mail-auto';
export const runtime='nodejs';export const maxDuration=60;export const dynamic='force-dynamic';
// Revisión programada del correo. Vercel Cron llama por GET con «Authorization: Bearer CRON_SECRET»;
// también se admite POST con JOB_TRIGGER_SECRET para lanzarla desde otro programador. Sin secreto, no hace nada.
const same=(a:string,b:string)=>timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());
function allowed(req:NextRequest,secret:string|undefined){const supplied=req.headers.get('authorization')||'';return Boolean(secret&&secret.length>=16&&same(supplied,'Bearer '+secret));}
async function run(){try{return NextResponse.json(await runMailJob(),{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({error:'Revisión incompleta; revisar cuentas y conexión.'},{status:502});}}
export async function GET(req:NextRequest){if(!allowed(req,process.env.CRON_SECRET))return NextResponse.json({error:'No autorizado.'},{status:401});return run();}
export async function POST(req:NextRequest){if(!allowed(req,process.env.JOB_TRIGGER_SECRET)&&!allowed(req,process.env.CRON_SECRET))return NextResponse.json({error:'No autorizado.'},{status:401});return run();}
