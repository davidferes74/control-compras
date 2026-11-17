import {NextRequest} from 'next/server';
import {handle} from '@/lib/api';
import {runSync} from '@/lib/jobs';
export const runtime='nodejs';export const maxDuration=300;
// Botón «Revisar correo ahora».
export async function POST(req:NextRequest){return handle(req,()=>runSync(240_000));}
