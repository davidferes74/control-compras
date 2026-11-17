import {NextRequest,after} from 'next/server';
import {z} from 'zod';
import {handle,uuid} from '@/lib/api';
import {decide,getDocument} from '@/lib/documents';
import {refreshSheet} from '@/lib/archive';
export const runtime='nodejs';
// Aceptar una diferencia (motivo obligatorio) o reabrirla (reason=null).
export async function POST(req:NextRequest,ctx:{params:Promise<{id:string}>}){return handle(req,async()=>{const id=uuid((await ctx.params).id);
 const b=z.object({key:z.string().min(1).max(1000),reason:z.string().trim().min(3,'escribe el motivo').max(500).nullable()}).parse(await req.json());
 await decide(id,b.key,b.reason);after(async()=>{await refreshSheet();});return getDocument(id);});}
