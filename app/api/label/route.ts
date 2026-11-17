import {NextRequest,NextResponse} from 'next/server';
import {authorized,sameOrigin} from '@/lib/auth';
import {detectType,labelSchema,labelOutputSchema,labelSystem,labelTask} from '@/lib/extraction';
import {readDocument,ReadError} from '@/lib/ai-reader';
export const runtime='nodejs';
export const maxDuration=60;
const reply=(error:string,status:number)=>NextResponse.json({error},{status});
// Foto de etiqueta de lote o serie → «Enviar y verificar». Solo transcribe; la comparación con el albarán
// se hace después con reglas exactas al registrar la lectura. La foto se conserva como original privado.
export async function POST(req:NextRequest){
 if(!authorized(req))return reply('Inicia sesión.',401);
 if(!sameOrigin(req))return reply('Origen no permitido.',403);
 if(Number(req.headers.get('content-length'))>3400000)return reply('Máximo 3 MB por foto.',413);
 let bytes:Buffer,mime:string,mode:'lot'|'serial';
 try{const form=await req.formData();const file=form.get('file');const m=String(form.get('mode'));if(!(file instanceof File)||(m!=='lot'&&m!=='serial'))return reply('Adjunta la foto e indica si el producto va por lote o por serie.',400);mode=m;if(file.size===0||file.size>3*1024*1024)return reply('La foto debe ocupar entre 1 byte y 3 MB.',413);bytes=Buffer.from(await file.arrayBuffer());mime=detectType(bytes);if(mime==='application/pdf')return reply('La etiqueta debe ser una foto JPG, PNG o WebP.',422);}catch{return reply('Foto no válida. Usa JPG, PNG o WebP.',422);}
 try{const r=await readDocument({bytes,mime,name:'etiqueta-'+mode,scope:'label-v1:'+mode,system:labelSystem,task:labelTask(mode),schema:labelOutputSchema,maxTokens:800,parse:raw=>labelSchema.parse(raw)});return NextResponse.json(r,{headers:{'Cache-Control':'no-store'}});}
 catch(e){return e instanceof ReadError?reply(e.message,e.status):reply('No se completó la lectura.',502);}
}
