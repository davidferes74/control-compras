import {NextRequest} from 'next/server';
import {handle} from '@/lib/api';
import {accessToken,pickerConfig,GoogleError} from '@/lib/google';
export const runtime='nodejs';export const dynamic='force-dynamic';
// Datos para abrir el selector de carpetas de Google en el navegador (token de corta duración).
export async function GET(req:NextRequest){return handle(req,async()=>{const p=pickerConfig();if(!p)throw new GoogleError('Falta GOOGLE_API_KEY en Vercel para abrir el selector de carpetas.',503);return {accessToken:await accessToken(),...p};});}
