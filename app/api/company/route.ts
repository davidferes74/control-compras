import {NextRequest} from 'next/server';
import {handle} from '@/lib/api';
import {setSetting,audit} from '@/lib/server-store';
import {empresaSchema} from '@/lib/classify-rules';
export const runtime='nodejs';export const dynamic='force-dynamic';
// Ajustes → «Datos de mi empresa»: nombre, NIF y otros nombres con los que se comprueba el destinatario de cada documento.
export async function POST(req:NextRequest){return handle(req,async()=>{const e=empresaSchema.parse(await req.json());
 await setSetting('empresa',e);await audit('settings',e.name||e.taxIds||e.aliases?`Datos de mi empresa: ${[e.name,e.taxIds&&'NIF '+e.taxIds,e.aliases&&'otros nombres: '+e.aliases].filter(Boolean).join('; ')}.`:'Datos de mi empresa borrados.');return {saved:true};});}
