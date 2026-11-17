import {NextRequest} from 'next/server';
import {handle} from '@/lib/api';
import {history} from '@/lib/documents';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:NextRequest){return handle(req,async()=>({events:await history()}));}
