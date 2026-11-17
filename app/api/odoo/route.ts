import {NextRequest,NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {authorized,sameOrigin} from '@/lib/auth';
import {readWorkspace,transact} from '@/lib/server-store';
import {DomainError} from '@/lib/domain';
import {encryptionReady} from '@/lib/mail-config';
import {OdooError,odooConfigSchema,odooStatus,resolveOdoo,inheritedConfig,saveOdoo,forgetOdoo,testOdoo,fetchOdooProducts,recordSync} from '@/lib/odoo';
import {normalizeOdooProducts,mergeOdooProducts} from '@/lib/odoo-products';
export const runtime='nodejs';export const maxDuration=60;
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:NextRequest){if(!authorized(req))return json({error:'Inicia sesión.'},401);try{return json(await odooStatus());}catch{return json({error:'No se pudo consultar la conexión con Odoo. Comprueba la migración de base de datos.'},503);}}
export async function POST(req:NextRequest){if(!authorized(req))return json({error:'Inicia sesión.'},401);if(!sameOrigin(req))return json({error:'Origen no permitido.'},403);try{
 const text=await req.text();if(text.length>5000)return json({error:'Solicitud demasiado grande.'},413);const body=JSON.parse(text);
 if(body.action==='test'||body.action==='save'){
  if(inheritedConfig())return json({error:'Esta instalación usa la conexión de Odoo de la app principal; se gestiona allí.'},409);
  const config=odooConfigSchema.parse(body.config);const result=await testOdoo(config,true);
  if(body.action==='test')return json({ok:true,version:result.version});
  if(!encryptionReady())return json({error:'Falta TOKEN_ENCRYPTION_KEY en el servidor para guardar la clave cifrada.'},503);
  await saveOdoo(config);return json({saved:true,version:result.version});
 }
 if(body.action==='disconnect'){if(inheritedConfig())return json({error:'La conexión es de la app principal; no se puede quitar desde aquí.'},409);await forgetOdoo();return json({saved:true});}
 if(body.action==='check'){const resolved=await resolveOdoo();if(!resolved)return json({error:'Odoo no está conectado.'},409);const r=await testOdoo(resolved.config,false);return json({ok:true,version:r.version});}
 if(body.action==='sync'){
  const resolved=await resolveOdoo();if(!resolved)return json({error:'Odoo no está conectado.'},409);
  const fetched=await fetchOdooProducts(resolved.config);const {products,skipped}=normalizeOdooProducts(fetched.rows,fetched.packaging);
  if(!products.length)return json({error:'Odoo no ha devuelto productos comprables con código o referencia. No se ha cambiado el catálogo.'},422);
  // La fusión real ocurre dentro de la transacción; aquí solo se calcula el resumen. Un cambio simultáneo se reintenta una vez.
  for(let attempt=0;;attempt++){const current=await readWorkspace();const m=mergeOdooProducts(current.products,products);
   try{const workspace=await transact({id:randomUUID(),version:current.version,command:{type:'syncProducts',products}});
    const summary={received:fetched.rows.length,created:m.created,updated:m.updated,linked:m.linked,archived:m.archived,conflicts:m.conflicts,skipped:skipped.length,skippedSample:skipped.slice(0,20),truncated:fetched.truncated};
    await recordSync(summary).catch(()=>{});return json({workspace,summary});}
   catch(e){if(e instanceof DomainError&&e.code===409&&attempt===0)continue;throw e;}}
 }
 return json({error:'Acción no válida.'},400);
 }catch(e){if(e instanceof OdooError)return json({error:e.message},e.status);if(e instanceof z.ZodError)return json({error:'Revisa la dirección (debe empezar por https://), la base de datos, el usuario y la clave API.'},422);if(e instanceof DomainError)return json({error:e.message},e.code);return json({error:'No se completó la operación con Odoo.'},502);}}
