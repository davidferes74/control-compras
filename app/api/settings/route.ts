import {NextRequest,after} from 'next/server';
import {z} from 'zod';
import {handle} from '@/lib/api';
import {setSetting,audit} from '@/lib/server-store';
import {folderInfo,GoogleError} from '@/lib/google';
import {driveSetting,refreshSheet,archivePending} from '@/lib/archive';
import {gmailSettingSchema} from '@/lib/gmail-capture';
export const runtime='nodejs';export const maxDuration=60;
const body=z.object({driveFolderId:z.string().regex(/^[A-Za-z0-9_-]{10,200}$/).optional(),gmail:gmailSettingSchema.optional()});
export async function PUT(req:NextRequest){return handle(req,async()=>{const b=body.parse(await req.json());
 if(b.driveFolderId){const f=await folderInfo(b.driveFolderId);if(f.mimeType!=='application/vnd.google-apps.folder'||f.trashed)throw new GoogleError('Elige una carpeta de Drive (no un archivo ni la papelera).',422);
  const prev=await driveSetting();await setSetting('drive',{folderId:f.id,folderName:f.name,...(prev?.folderId===f.id&&prev.sheetId?{sheetId:prev.sheetId}:{})});await audit('settings',`Carpeta de Drive para el archivo: ${f.name}.`);
  after(async()=>{await archivePending(20);await refreshSheet();});}
 if(b.gmail){await setSetting('gmail',b.gmail);await audit('settings',`Gmail: ${b.gmail.labels.length?'etiquetas '+b.gmail.labels.map(l=>l.name).join(', '):'sin etiquetas'} desde ${b.gmail.since}; lectura automática ${b.gmail.autoRead?'activada':'desactivada'}.`);}
 return {ok:true};});}
