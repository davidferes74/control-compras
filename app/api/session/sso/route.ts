import {NextRequest,NextResponse} from 'next/server';
import {configured,token} from '@/lib/auth';
import {getPool} from '@/lib/server-store';
import {ssoSecret,verifyModuleToken} from '@/lib/sso';
export const runtime='nodejs';export const dynamic='force-dynamic';
// GET /api/session/sso?token=… — llega por redirección desde Sentidiño BI. Valida el pase firmado, lo consume
// (un solo uso) y abre la sesión normal de esta app. Cualquier fallo lleva a la pantalla de acceso habitual.
function go(req:NextRequest,query:string){const r=NextResponse.redirect(new URL('/'+query,req.url));r.headers.set('Cache-Control','no-store');r.headers.set('Referrer-Policy','no-referrer');return r;}
export async function GET(req:NextRequest){
 const secret=ssoSecret();if(!configured()||!secret)return go(req,'?sso=off');
 const check=verifyModuleToken(req.nextUrl.searchParams.get('token')||'',secret);if(!check.ok)return go(req,'?sso=invalid');
 try{const pool=getPool();await pool.query('DELETE FROM ria_sso_nonces WHERE expires_at<now()');
  const used=await pool.query('INSERT INTO ria_sso_nonces(nonce,expires_at) VALUES($1,to_timestamp($2/1000.0)) ON CONFLICT DO NOTHING',[check.nonce,check.expires]);
  if(!used.rowCount)return go(req,'?sso=invalid');
 }catch{return go(req,'?sso=invalid');}
 const res=go(req,'');res.cookies.set('ria_session',token(),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:8*60*60});return res;
}
