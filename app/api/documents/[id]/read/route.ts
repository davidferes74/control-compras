import {NextRequest,after} from 'next/server';
import {archivePending,refreshSheet} from '@/lib/archive';
import {handle,uuid} from '@/lib/api';
import {getDocument} from '@/lib/documents';
import {releer} from '@/lib/intake';
export const runtime='nodejs';export const maxDuration=120;
export async function POST(req:NextRequest,ctx:{params:Promise<{id:string}>}){return handle(req,async()=>{const id=uuid((await ctx.params).id);await releer(id);after(async()=>{await archivePending(20_000,id);await refreshSheet();});return getDocument(id);});}
