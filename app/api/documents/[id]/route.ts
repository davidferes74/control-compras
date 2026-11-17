import {NextRequest,after} from 'next/server';
import {z} from 'zod';
import {handle,uuid} from '@/lib/api';
import {getDocument,saveDocument,deleteDocument,documentInput} from '@/lib/documents';
import {archiveDocument,refreshSheet} from '@/lib/archive';
export const runtime='nodejs';export const maxDuration=60;
type Ctx={params:Promise<{id:string}>};
export async function GET(req:NextRequest,ctx:Ctx){return handle(req,async()=>getDocument(uuid((await ctx.params).id)));}
export async function PUT(req:NextRequest,ctx:Ctx){return handle(req,async()=>{const id=uuid((await ctx.params).id);const body=z.object({document:documentInput,confirm:z.boolean()}).parse(await req.json());
 const r=await saveDocument(id,body.document,body.confirm);
 // Archivo en Drive y hoja de registro, después de responder (la persona no espera).
 if(r.status==='confirmed')after(async()=>{if(r.newlyConfirmed)await archiveDocument(id);await refreshSheet();});
 return getDocument(id);});}
export async function DELETE(req:NextRequest,ctx:Ctx){return handle(req,async()=>{await deleteDocument(uuid((await ctx.params).id));after(async()=>{await refreshSheet();});return {ok:true};});}
