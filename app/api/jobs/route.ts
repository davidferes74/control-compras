import {NextRequest,NextResponse} from 'next/server';
import {createHash,timingSafeEqual} from 'node:crypto';
import {runSync} from '@/lib/jobs';
export const runtime='nodejs';export const maxDuration=300;export const dynamic='force-dynamic';
// Tarea programada (Vercel Cron, «Authorization: Bearer CRON_SECRET»). Sin secreto válido no hace nada.
const same=(a:string,b:string)=>timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());
export async function GET(req:NextRequest){const secret=process.env.CRON_SECRET;if(!secret||secret.length<16||!same(req.headers.get('authorization')||'','Bearer '+secret))return NextResponse.json({error:'No autorizado.'},{status:401});
 try{return NextResponse.json(await runSync(240_000),{headers:{'Cache-Control':'no-store'}});}catch(e){console.error(e);return NextResponse.json({error:'Revisión incompleta.'},{status:502});}}
