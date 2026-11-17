import {NextRequest,NextResponse} from 'next/server';
import {checkCredentials,configured,token,sameOrigin} from '@/lib/auth';
export const runtime='nodejs';
export async function POST(req:NextRequest){if(!configured())return NextResponse.json({error:'Acceso privado pendiente de configuración.'},{status:503});if(!sameOrigin(req))return NextResponse.json({error:'Origen no permitido.'},{status:403});
 const body=await req.json().catch(()=>null);if(typeof body?.username!=='string'||body.username.length>100||typeof body?.password!=='string'||body.password.length>200||!checkCredentials(body.username,body.password)){await new Promise(r=>setTimeout(r,800));return NextResponse.json({error:'Usuario o contraseña incorrectos.'},{status:401});}
 const res=NextResponse.json({ok:true});res.cookies.set('ria_session',token(),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:8*60*60});return res;}
export async function DELETE(req:NextRequest){if(!sameOrigin(req))return NextResponse.json({error:'Origen no permitido.'},{status:403});const res=NextResponse.json({ok:true});res.cookies.delete('ria_session');return res;}
