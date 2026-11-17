import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {authorized} from '@/lib/auth';
import {getPool,org,audit} from '@/lib/server-store';
import {hashState,exchangeCode,gmail,saveConnection,missingScopes,appUrl} from '@/lib/google';
export const runtime='nodejs';export const maxDuration=60;
function finish(status:string){const r=NextResponse.redirect(new URL('/?google='+status+'#ajustes',appUrl()));r.headers.set('Cache-Control','no-store');r.headers.set('Referrer-Policy','no-referrer');return r;}
// Vuelta de Google tras autorizar. Comprueba el «state», guarda los tokens cifrados y la cuenta.
export async function GET(req:NextRequest){if(!authorized(req))return finish('session');const state=req.nextUrl.searchParams.get('state')||'';if(!/^[a-f0-9]{64}$/.test(state))return finish('invalid');
 try{const consumed=await getPool().query('DELETE FROM cc_oauth_states WHERE state_hash=$1 AND organization_id=$2 AND session_hash=$3 AND expires_at>now() RETURNING 1',[hashState(state),org(),hashState(req.cookies.get('ria_session')!.value)]);if(!consumed.rowCount)return finish('invalid');
  if(req.nextUrl.searchParams.has('error'))return finish('cancelled');const code=req.nextUrl.searchParams.get('code');if(!code||code.length>4096)return finish('invalid');
  const tokens=await exchangeCode(code);if(missingScopes(tokens.scope).length)return finish('scopes');
  const profile=await gmail('/profile',tokens.access_token);const email=z.email().parse(profile.emailAddress).toLowerCase();
  await saveConnection(email,tokens);await audit('google',`Cuenta de Google conectada: ${email}.`);return finish('connected');}
 catch{return finish('failed');}}
