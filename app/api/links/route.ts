import {NextRequest,after} from 'next/server';
import {z} from 'zod';
import {handle,uuid} from '@/lib/api';
import {linkNotes,unlinkNote,getDocument} from '@/lib/documents';
import {refreshSheet} from '@/lib/archive';
export const runtime='nodejs';
// Vínculos manuales factura ↔ albarán: los crea y deshace una persona.
export async function POST(req:NextRequest){return handle(req,async()=>{
 const b=z.object({invoiceId:z.string(),noteIds:z.array(z.string()).min(1).max(20),pct:z.number().int().min(0).max(100).nullable().default(null)}).parse(await req.json());
 const id=uuid(b.invoiceId);await linkNotes(id,b.noteIds.map(uuid),b.pct);after(async()=>{await refreshSheet();});return getDocument(id);});}
export async function DELETE(req:NextRequest){return handle(req,async()=>{
 const b=z.object({invoiceId:z.string(),noteId:z.string()}).parse(await req.json());
 const id=uuid(b.invoiceId);await unlinkNote(id,uuid(b.noteId));after(async()=>{await refreshSheet();});return getDocument(id);});}
