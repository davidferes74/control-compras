import {NextRequest,after} from 'next/server';
import {handle} from '@/lib/api';
import {clasificarPendientes} from '@/lib/intake';
import {archivePending,refreshSheet} from '@/lib/archive';
import {driveRow,driveConnected} from '@/lib/drive';
export const runtime='nodejs';export const maxDuration=300;export const dynamic='force-dynamic';
// «Clasificar ahora»: pasa por el clasificador los documentos del correo que siguen pendientes.
// Con {previous:true}: los capturados antes de que existiera el clasificador (lo pide el usuario desde la Bandeja).
export async function POST(req:NextRequest){return handle(req,async()=>{const body=await req.json().catch(()=>({}));const r=await clasificarPendientes(Date.now()+200_000,body?.previous===true);
 if(r.facturas||r.albaranes)after(async()=>{if(driveConnected(await driveRow())){await archivePending(40_000);await refreshSheet();}});
 return r;});}
