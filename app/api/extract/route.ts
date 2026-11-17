import {NextRequest,NextResponse} from 'next/server';
import {PDFDocument} from 'pdf-lib';
import {authorized,sameOrigin} from '@/lib/auth';
import {detectType,extractionSchema,outputSchema,extractionSystem,extractionTask} from '@/lib/extraction';
import {readDocument,ReadError,readerModel} from '@/lib/ai-reader';
export const runtime='nodejs';
export const maxDuration=60;
const reply=(error:string,status:number)=>NextResponse.json({error},{status});
export async function GET(req:NextRequest){if(!authorized(req))return reply('Inicia sesión.',401);return NextResponse.json({configured:Boolean(process.env.ANTHROPIC_API_KEY),model:readerModel()},{headers:{'Cache-Control':'no-store'}});}
export async function POST(req:NextRequest){
 if(!authorized(req))return reply('Inicia sesión.',401);
 if(!sameOrigin(req))return reply('Origen no permitido.',403);
 if(!process.env.ANTHROPIC_API_KEY)return reply('Falta ANTHROPIC_API_KEY en Production. Guarda la variable y vuelve a desplegar.',503);
 if(Number(req.headers.get('content-length'))>3400000)return reply('Máximo 3 MB por documento.',413);
 let bytes:Buffer,mime:string,name:string,kind:'receipt'|'invoice';
 try{const form=await req.formData();const file=form.get('file');const k=String(form.get('kind'));if(!(file instanceof File)||(k!=='receipt'&&k!=='invoice'))return reply('Adjunta un documento e indica su tipo.',400);kind=k;if(file.size===0||file.size>3*1024*1024)return reply('El archivo debe tener entre 1 byte y 3 MB.',413);bytes=Buffer.from(await file.arrayBuffer());mime=detectType(bytes);name=file.name.slice(0,150);if(mime==='application/pdf'){const pdf=await PDFDocument.load(bytes);if(pdf.getPageCount()>10)return reply('Máximo 10 páginas por PDF.',422);}}catch{return reply('Archivo no válido o PDF protegido. Usa JPG, PNG, WebP o PDF sin contraseña.',422);}
 try{const r=await readDocument({bytes,mime,name,scope:'extract-v2:'+kind,system:extractionSystem,task:extractionTask(kind),schema:outputSchema,maxTokens:6000,parse:raw=>extractionSchema.parse(raw)});return NextResponse.json(r,{headers:{'Cache-Control':'no-store'}});}
 catch(e){return e instanceof ReadError?reply(e.message,e.status):reply('No se completó la lectura.',502);}
}
