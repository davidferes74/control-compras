import {NextRequest} from 'next/server';
import {z} from 'zod';
import {handle} from '@/lib/api';
import {createManual} from '@/lib/documents';
export const runtime='nodejs';
// Documento sin archivo, para introducirlo a mano.
export async function POST(req:NextRequest){return handle(req,async()=>{const {kind}=z.object({kind:z.enum(['invoice','delivery_note','credit_note'])}).parse(await req.json());return {id:await createManual(kind)};});}
