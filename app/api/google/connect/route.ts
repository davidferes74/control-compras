import {NextRequest} from 'next/server';
import {handle} from '@/lib/api';
import {getPool,org} from '@/lib/server-store';
import {encryptionReady} from '@/lib/crypto';
import {authorizationUrl,newState,hashState,googleReady,appUrl,GoogleError} from '@/lib/google';
export const runtime='nodejs';
// Inicia la autorización de Google con un «state» de un solo uso ligado a la sesión.
export async function POST(req:NextRequest){return handle(req,async()=>{
 if(new URL(req.url).origin!==appUrl())throw new GoogleError(`Conecta Google desde ${appUrl()}.`,403);
 if(!googleReady()||!encryptionReady())throw new GoogleError('Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en Vercel (o TOKEN_ENCRYPTION_KEY).',503);
 const state=newState(),session=hashState(req.cookies.get('ria_session')!.value);
 await getPool().query('DELETE FROM cc_oauth_states WHERE expires_at<now() OR (organization_id=$1 AND session_hash=$2)',[org(),session]);
 await getPool().query("INSERT INTO cc_oauth_states(state_hash,organization_id,session_hash,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')",[hashState(state),org(),session]);
 return {url:authorizationUrl(state)};});}
