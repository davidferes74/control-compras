import {NextRequest,after} from 'next/server';
import {z} from 'zod';
import {handle,uuid} from '@/lib/api';
import {getDocument,saveDocument,discardDocument,recoverDocument,documentInput} from '@/lib/documents';
import {archiveDocument,refreshSheet} from '@/lib/archive';
export const runtime='nodejs';export const maxDuration=60;
type Ctx={params:Promise<{id:string}>};
export async function GET(req:NextRequest,ctx:Ctx){return handle(req,async()=>getDocument(uuid((await ctx.params).id)));}
export async function PUT(req:NextRequest,ctx:Ctx){return handle(req,async()=>{const id=uuid((await ctx.params).id);const body=z.object({document:documentInput,confirm:z.boolean()}).parse(await req.json());
 const r=await saveDocument(id,body.document,body.confirm);
 // Archivo en Drive y hoja de registro, después de responder (la persona no espera).
 if(r.status==='confirmed')after(async()=>{if(r.newlyConfirmed)await archiveDocument(id);await refreshSheet();});
 return getDocument(id);});}
// Nunca se borra nada: «eliminar» es mover a Descartados, y desde allí se puede recuperar.
export async function DELETE(req:NextRequest,ctx:Ctx){return handle(req,async()=>{await discardDocument(uuid((await ctx.params).id));after(async()=>{await refreshSheet();});return {ok:true};});}
export async function POST(req:NextRequest,ctx:Ctx){return handle(req,async()=>{const id=uuid((await ctx.params).id);const b=z.object({action:z.literal('recover'),kind:z.enum(['invoice','delivery_note'])}).parse(await req.json());await recoverDocument(id,b.kind);return getDocument(id);});}
