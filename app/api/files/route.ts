import {NextRequest} from 'next/server';
import {PDFDocument} from 'pdf-lib';
import {handle} from '@/lib/api';
import {detectType} from '@/lib/extraction';
import {storeFile,draftFromFile,AppError} from '@/lib/documents';
export const runtime='nodejs';export const maxDuration=120;
// Sube un archivo (PDF o foto), lo guarda y crea su borrador leído con IA.
export async function POST(req:NextRequest){return handle(req,async()=>{
 if(Number(req.headers.get('content-length'))>4_400_000)throw new AppError('Máximo 4 MB por archivo.',413);
 const form=await req.formData().catch(()=>null);const file=form?.get('file');const read=form?.get('read')!=='false';
 if(!(file instanceof File)||!file.size)throw new AppError('Adjunta un archivo.',400);if(file.size>4*1024*1024)throw new AppError('Máximo 4 MB por archivo.',413);
 const bytes=Buffer.from(await file.arrayBuffer());let mime:string;try{mime=detectType(bytes);}catch{throw new AppError('Formato no admitido. Usa PDF, factura electrónica (XML, UBL o EDIFACT), JPG, PNG o WebP.',415);}
 if(mime==='application/pdf'){let pages=0;try{pages=(await PDFDocument.load(bytes,{updateMetadata:false})).getPageCount();}catch{throw new AppError('PDF dañado o protegido con contraseña.',422);}if(pages>20)throw new AppError('Máximo 20 páginas por PDF.',422);}
 const stored=await storeFile({bytes,filename:file.name||'documento',mime,source:'upload'});
 const draft=await draftFromFile(stored.id,{read});return {id:draft.id,duplicate:stored.duplicate,readError:draft.readError||null};});}
