import {NextRequest} from 'next/server';
import {handle,uuid} from '@/lib/api';
import {rereadDraft,getDocument} from '@/lib/documents';
export const runtime='nodejs';export const maxDuration=120;
export async function POST(req:NextRequest,ctx:{params:Promise<{id:string}>}){return handle(req,async()=>{const id=uuid((await ctx.params).id);await rereadDraft(id);return getDocument(id);});}
