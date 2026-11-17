import {NextRequest,NextResponse} from 'next/server';
import {authorized,sameOrigin} from '@/lib/auth';
import {readWorkspace,transact} from '@/lib/server-store';
import {DomainError,envelopeSchema} from '@/lib/domain';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){if(!authorized(req))return NextResponse.json({error:'Inicia sesión para acceder.'},{status:401});try{return NextResponse.json(await readWorkspace(),{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({error:'Base de datos no disponible. Comprueba la conexión y migraciones.'},{status:503});}}
export async function POST(req:NextRequest){if(!authorized(req))return NextResponse.json({error:'Inicia sesión para acceder.'},{status:401});if(!sameOrigin(req))return NextResponse.json({error:'Origen no permitido.'},{status:403});
 const body=await req.text();if(body.length>1500000)return NextResponse.json({error:'Solicitud demasiado grande.'},{status:413});let parsed;try{parsed=envelopeSchema.safeParse(JSON.parse(body));}catch{return NextResponse.json({error:'Solicitud no válida.'},{status:400});}if(!parsed.success)return NextResponse.json({error:'Datos no válidos. Revisa los campos.'},{status:422});
 try{return NextResponse.json(await transact(parsed.data),{headers:{'Cache-Control':'no-store'}});}catch(e){return NextResponse.json({error:e instanceof DomainError?e.message:'No se ha guardado el cambio. Revisa los datos o reintenta.'},{status:e instanceof DomainError?e.code:503});}}
