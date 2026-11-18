import {NextRequest,after} from 'next/server';
import {handle} from '@/lib/api';
import {clasificarPendientes} from '@/lib/intake';
import {archivePending,refreshSheet} from '@/lib/archive';
import {driveRow,driveConnected} from '@/lib/drive';
export const runtime='nodejs';export const maxDuration=300;export const dynamic='force-dynamic';
// «Clasificar ahora»: pasa por el clasificador los documentos del correo que siguen pendientes.
export async function POST(req:NextRequest){return handle(req,async()=>{const r=await clasificarPendientes(Date.now()+200_000);
 if(r.facturas||r.albaranes)after(async()=>{if(driveConnected(await driveRow())){await archivePending(40_000);await refreshSheet();}});
 return r;});}
