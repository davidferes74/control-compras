import {NextRequest} from 'next/server';
import {handle} from '@/lib/api';
import {getPool,org,audit} from '@/lib/server-store';
import {connection} from '@/lib/google';
import {unseal} from '@/lib/crypto';
export const runtime='nodejs';
// Desconecta Google: revoca el permiso en Google y borra los tokens guardados. Los documentos no se tocan.
export async function DELETE(req:NextRequest){return handle(req,async()=>{const c=await connection();if(!c)return {ok:true};
 try{const t=JSON.parse(unseal(c.secret,org()));await fetch('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:t.refresh_token}),signal:AbortSignal.timeout(8000)});}catch{/* se borra igualmente */}
 await getPool().query('DELETE FROM cc_google WHERE organization_id=$1',[org()]);await audit('google',`Cuenta de Google desconectada: ${c.email}.`);return {ok:true};});}
