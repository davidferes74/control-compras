import {NextRequest,NextResponse} from 'next/server';
import {handle,uuid} from '@/lib/api';
import {readOriginal} from '@/lib/documents';
import {isEInvoice} from '@/lib/extraction';
export const runtime='nodejs';
// Original del documento, para verlo junto a los datos leídos.
export async function GET(req:NextRequest,ctx:{params:Promise<{id:string}>}){return handle(req,async()=>{const f=await readOriginal(uuid((await ctx.params).id));
 return new NextResponse(new Uint8Array(f.bytes),{headers:{'Content-Type':isEInvoice(f.mime)?'text/plain; charset=utf-8':f.mime, // XML y EDIFACT se muestran como texto: nunca se interpretan en el navegador
  'Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(f.filename)}`,'Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN'}});});}
