import {NextRequest,NextResponse,after} from 'next/server';
import {z} from 'zod';
import {authorized} from '@/lib/auth';
import {getPool,org,audit} from '@/lib/server-store';
import {hashState,exchangeCode,gmail,saveConnection,appUrl,driveScope,OAuthError} from '@/lib/google';
import {connectDrive,folderNameSchema,DriveError} from '@/lib/drive';
import {archivePending,refreshSheet} from '@/lib/archive';
export const runtime='nodejs';export const maxDuration=60;
// La misma dirección de retorno sirve para Gmail y para Drive; la finalidad va guardada con el «state».
function finish(status:string,param='google'){const r=NextResponse.redirect(new URL('/?'+param+'='+status+'#ajustes',appUrl()));r.headers.set('Cache-Control','no-store');r.headers.set('Referrer-Policy','no-referrer');return r;}
export async function GET(req:NextRequest){if(!authorized(req))return finish('session');const state=req.nextUrl.searchParams.get('state')||'';if(!/^[a-f0-9]{64}$/.test(state))return finish('invalid');let param='google';
 try{const consumed=await getPool().query('DELETE FROM cc_oauth_states WHERE state_hash=$1 AND organization_id=$2 AND session_hash=$3 AND expires_at>now() RETURNING purpose,data',[hashState(state),org(),hashState(req.cookies.get('ria_session')!.value)]);if(!consumed.rowCount)return finish('invalid');
  if(consumed.rows[0].purpose==='drive')param='drive';
  if(req.nextUrl.searchParams.has('error'))return finish('cancelled',param);const code=req.nextUrl.searchParams.get('code');if(!code||code.length>4096)return finish('invalid',param);
  if(param==='drive'){const folderName=folderNameSchema.parse(consumed.rows[0].data?.folderName);await connectDrive(await exchangeCode(code,driveScope),folderName);
   await audit('drive',`Google Drive conectado. Carpeta creada: ${folderName}.`);after(async()=>{await archivePending(45_000);await refreshSheet();});return finish('connected','drive');}
  const tokens=await exchangeCode(code);const profile=await gmail('/profile',tokens.access_token);const email=z.email().parse(profile.emailAddress).toLowerCase();
  await saveConnection(email,tokens);await audit('google',`Gmail conectado: ${email}.`);return finish('connected');
 }catch(e){
  // Motivo concreto para el usuario y para los registros (sin datos privados ni respuestas de Google).
  const code=(e as {code?:string})?.code;
  const reason=e instanceof OAuthError?e.kind:e instanceof DriveError?e.kind:code==='42P01'||code==='42703'?'database':'failed';
  console.error('[google callback]',param,reason,e instanceof Error?e.name:'');return finish(param==='drive'?reason:reason==='scope'?'scopes':'failed',param);}}
