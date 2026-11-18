import {NextRequest} from 'next/server';
import {z} from 'zod';
import {handle} from '@/lib/api';
import {setSetting,audit} from '@/lib/server-store';
import {gmailSettingSchema} from '@/lib/gmail-capture';
export const runtime='nodejs';
// Ajustes de Gmail (etiquetas, fecha y lectura automática). Drive se configura en /api/drive.
const body=z.object({gmail:gmailSettingSchema});
export async function PUT(req:NextRequest){return handle(req,async()=>{const b=body.parse(await req.json());
 await setSetting('gmail',b.gmail);await audit('settings',`Gmail: ${b.gmail.labels.length?'etiquetas '+b.gmail.labels.map(l=>l.name).join(', '):'sin etiquetas'} desde ${b.gmail.since}; lectura automática ${b.gmail.autoRead?'activada':'desactivada'}.`);
 return {ok:true};});}
