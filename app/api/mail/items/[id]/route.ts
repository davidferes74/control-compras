import {NextRequest,NextResponse} from 'next/server';
import {authorized} from '@/lib/auth';
import {getPool,org} from '@/lib/server-store';
import {z} from 'zod';
export const runtime='nodejs';
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){if(!authorized(req))return NextResponse.json({error:'Inicia sesión.'},{status:401});const {id}=await params;if(!z.uuid().safeParse(id).success)return new NextResponse(null,{status:404});const r=await getPool().query('SELECT original,mime,filename FROM ria_mail_items WHERE id=$1 AND organization_id=$2 AND original IS NOT NULL',[id,org()]);if(!r.rowCount)return new NextResponse(null,{status:404});const item=r.rows[0];return new NextResponse(new Uint8Array(item.original),{headers:{'Content-Type':item.mime,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(item.filename)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
