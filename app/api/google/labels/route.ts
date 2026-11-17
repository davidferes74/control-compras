import {NextRequest} from 'next/server';
import {handle} from '@/lib/api';
import {gmailLabels} from '@/lib/gmail-capture';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:NextRequest){return handle(req,async()=>({labels:await gmailLabels()}));}
