import {resolve4} from 'node:dns/promises';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {z} from 'zod';
import {getPool,org} from './server-store';
import {allowedHost,publicIPv4,seal,unseal,encryptionReady} from './mail-config';
import {maxOdooProducts,type OdooPackagingRow,type OdooProductRow} from './odoo-products';
import {availableFields,normalizeBills,normalizeOrders,normalizeReceipts,normalizeSuppliers,pendingOrders,type OdooKind} from './odoo-data';
// Conexión de SOLO LECTURA con Odoo mediante clave API, compatible con la app Sentidiño BI:
// mismas variables de entorno (ODOO_URL, ODOO_DB, ODOO_LOGIN, ODOO_API_KEY, ODOO_COMPANY_ID) y mismos
// transportes (/jsonrpc clásico y /json/2 de Odoo 19+). Si la app principal ya tiene acceso, se hereda.
export type OdooConfig={url:string;db:string;login:string;apiKey:string;companyId:number|null};
export type OdooSource='inherited'|'own';
export class OdooError extends Error{constructor(message:string,public status=502){super(message);}}
export const odooConfigSchema=z.object({url:z.string().trim().max(300).transform(v=>v.replace(/\/+$/,'')).pipe(z.url({protocol:/^https$/})),db:z.string().trim().min(1).max(120),login:z.string().trim().min(1).max(254),apiKey:z.string().min(1).max(400),companyId:z.number().int().positive().nullable().default(null)});
const READ_ONLY=new Set(['search_read','search_count','fields_get']);
// Accesos de la app principal, con su misma precedencia: primero su fichero de configuración (el que crea el
// asistente de Sentidiño BI en data/config.json) y, para lo que falte, sus variables de entorno.
// El fichero se localiza con SENTIDINO_BI_CONFIG (ruta completa) o con DATA_DIR, la variable que ya usa el BI.
function parentFile():{url?:unknown;db?:unknown;login?:unknown;apiKey?:unknown;companyId?:unknown}{
 const file=process.env.SENTIDINO_BI_CONFIG||(process.env.DATA_DIR?join(process.env.DATA_DIR,'config.json'):'');if(!file)return {};
 try{const parsed=JSON.parse(readFileSync(file,'utf8'));return parsed&&typeof parsed.odoo==='object'&&parsed.odoo?parsed.odoo:{};}catch{return {};}
}
export function inheritedConfig():OdooConfig|null{const f=parentFile(),e=process.env,pick=(a:unknown,b?:string)=>(typeof a==='string'&&a.trim()?a.trim():b||'');
 const url=pick(f.url,e.ODOO_URL).replace(/\/+$/,''),db=pick(f.db,e.ODOO_DB),login=pick(f.login,e.ODOO_LOGIN),apiKey=pick(f.apiKey,e.ODOO_API_KEY);
 if(!url||!db||!login||!apiKey)return null;return {url,db,login,apiKey,companyId:Number(f.companyId)||Number(e.ODOO_COMPANY_ID)||null};}
type Row={config:{url?:string;db?:string;login?:string;companyId?:number|null;lastSync?:string;lastResult?:unknown};secret:string|null};
async function row():Promise<Row|null>{const r=await getPool().query("SELECT config,secret FROM ria_integrations WHERE organization_id=$1 AND kind='odoo'",[org()]);return r.rows[0]||null;}
// Los accesos de la app principal mandan; si no existen, se usan los guardados en esta app (cifrados).
export async function resolveOdoo():Promise<{config:OdooConfig;source:OdooSource}|null>{
 const inherited=inheritedConfig();if(inherited)return {config:inherited,source:'inherited'};
 const r=await row();if(!r?.secret||!r.config.url||!r.config.db||!r.config.login)return null;
 return {config:{url:r.config.url,db:r.config.db,login:r.config.login,apiKey:unseal(r.secret,org()),companyId:r.config.companyId||null},source:'own'};
}
export async function odooStatus(){const inherited=inheritedConfig(),r=await row().catch(()=>null);const own=Boolean(r?.secret&&r.config.url);const c=inherited||(own?r!.config:null);
 return {connected:Boolean(c),source:inherited?'inherited' as const:own?'own' as const:null,host:c?.url?new URL(c.url).host:null,db:c?.db||null,login:c?.login||null,companyId:c?.companyId||null,lastSync:r?.config.lastSync||null,lastResult:r?.config.lastResult||null,encryptionReady:encryptionReady()};}
export async function saveOdoo(config:OdooConfig){const {apiKey,...safe}=config;await getPool().query("INSERT INTO ria_integrations(organization_id,kind,config,secret) VALUES($1,'odoo',$2,$3) ON CONFLICT(organization_id,kind) DO UPDATE SET config=EXCLUDED.config,secret=EXCLUDED.secret,updated_at=now()",[org(),JSON.stringify(safe),seal(apiKey,org())]);}
export async function forgetOdoo(){await getPool().query("UPDATE ria_integrations SET secret=NULL,config=config-'url'-'db'-'login'-'companyId',updated_at=now() WHERE organization_id=$1 AND kind='odoo'",[org()]);}
export async function recordSync(result:unknown){await getPool().query("INSERT INTO ria_integrations(organization_id,kind,config) VALUES($1,'odoo',$2) ON CONFLICT(organization_id,kind) DO UPDATE SET config=ria_integrations.config||EXCLUDED.config,updated_at=now()",[org(),JSON.stringify({lastSync:new Date().toISOString(),lastResult:result})]);}

// Una URL escrita por el usuario solo puede apuntar a un servidor público por HTTPS. La heredada de la app
// principal la fija quien despliega, así que no se restringe (permite instancias internas o de pruebas).
async function assertPublic(url:string){const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||!allowedHost(u.hostname))throw new OdooError('La dirección de Odoo debe ser pública y empezar por https://',422);
 const ips=await resolve4(u.hostname).catch(()=>[] as string[]);if(!ips.length||ips.some(ip=>!publicIPv4(ip)))throw new OdooError('No encontramos ese servidor de Odoo. Revisa la dirección.',422);}
async function post(url:string,headers:Record<string,string>,body:unknown){
 let res:Response;try{res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(20000),cache:'no-store',redirect:'error'});}catch{throw new OdooError('No se pudo conectar con Odoo. Revisa la dirección e inténtalo de nuevo.');}
 const textBody=await res.text();let data:unknown=null,parsed=false;try{data=textBody?JSON.parse(textBody):null;parsed=true;}catch{/* cuerpo no JSON */}
 return {res,data:data as Record<string,any>|null,parsed};
}
const NOT_JSON='respuesta no JSON';
async function jsonRpc(c:OdooConfig,service:string,method:string,args:unknown[]){
 const {res,data,parsed}=await post(c.url+'/jsonrpc',{}, {jsonrpc:'2.0',method:'call',params:{service,method,args},id:Date.now()});
 if(!parsed||!data)throw new OdooError(NOT_JSON);if(!res.ok)throw new OdooError('Odoo respondió con un error (HTTP '+res.status+').');
 if(data.error)throw new OdooError('Odoo: '+String(data.error.data?.message||data.error.message||'error').slice(0,200));
 return data.result;
}
const withCompany=(c:OdooConfig,kwargs:Record<string,unknown>)=>c.companyId?{...kwargs,context:{allowed_company_ids:[c.companyId],company_id:c.companyId}}:kwargs;
async function json2(c:OdooConfig,model:string,method:string,kwargs:Record<string,unknown>){
 const {res,data,parsed}=await post(`${c.url}/json/2/${model}/${method}`,{Authorization:'Bearer '+c.apiKey,'X-Odoo-Database':c.db},withCompany(c,kwargs));
 if(!res.ok)throw new OdooError(res.status===401||res.status===403?'Odoo no acepta la clave API. Revisa usuario, base de datos y clave.':'Odoo: '+String((parsed&&data&&(data.message||data.name))||'HTTP '+res.status).slice(0,200));
 if(!parsed)throw new OdooError('Odoo devolvió una respuesta no válida.');
 return data as unknown;
}
const transportGone=(e:unknown)=>e instanceof OdooError&&(e.message===NOT_JSON||/credential/i.test(e.message));
// Lectura con el transporte clásico y, si la instancia ya lo retiró (Odoo 19+), con /json/2.
export async function searchRead<T>(c:OdooConfig,model:string,domain:unknown[],fields:string[],opts:{limit:number;offset?:number;order?:string}):Promise<T[]>{
 const method='search_read';if(!READ_ONLY.has(method))throw new OdooError('Método bloqueado por seguridad.');
 try{const uid=await jsonRpc(c,'common','authenticate',[c.db,c.login,c.apiKey,{}]);if(!uid)throw new OdooError('Odoo no acepta la clave API. Revisa usuario, base de datos y clave.',401);
  return await jsonRpc(c,'object','execute_kw',[c.db,uid,c.apiKey,model,method,[domain],withCompany(c,{fields,...opts})]) as T[];}
 catch(e){if(!transportGone(e))throw e;return await json2(c,model,method,{domain,fields,...opts}) as T[];}
}
export async function testOdoo(c:OdooConfig,userSupplied:boolean){if(userSupplied)await assertPublic(c.url);
 let version:string|null=null;try{const v=await jsonRpc(c,'common','version',[]);version=String(v?.server_version||'')||null;}catch(e){if(!transportGone(e))throw e;}
 // Lectura mínima real: confirma clave, base de datos y permiso de lectura de productos.
 const sample=await searchRead<{id:number}>(c,'product.product',[],['id'],{limit:1});
 return {version,readable:Array.isArray(sample)};
}
// Productos que se pueden comprar y están activos. El embalaje es opcional: si el modelo no existe en esa versión, se ignora.
export async function fetchOdooProducts(c:OdooConfig){
 const rows:OdooProductRow[]=[],page=500;let truncated=false;
 for(let offset=0;;offset+=page){const batch=await searchRead<OdooProductRow>(c,'product.product',[['purchase_ok','=',true],['active','=',true]],['name','default_code','barcode','uom_id','tracking'],{limit:page,offset,order:'id'});rows.push(...batch);if(batch.length<page)break;if(rows.length>=maxOdooProducts){truncated=true;break;}}
 const packaging=await searchRead<OdooPackagingRow>(c,'product.packaging',[['barcode','!=',false]],['product_id','barcode','qty'],{limit:5000,order:'id'}).catch(()=>[] as OdooPackagingRow[]);
 return {rows:rows.slice(0,maxOdooProducts),packaging,truncated};
}

// ---------- Compras: pedidos pendientes, entradas, facturas y proveedores (solo lectura) ----------
type Rec=Record<string,unknown>;
// Los nombres de algunos campos cambian entre versiones de Odoo: se pregunta una vez qué campos existen
// en cada modelo y solo se piden esos. Caché en memoria por instancia y base de datos.
const fieldCache=new Map<string,Set<string>>();
async function modelFields(c:OdooConfig,model:string):Promise<Set<string>>{
 const key=c.url+'|'+c.db+'|'+model,hit=fieldCache.get(key);if(hit)return hit;
 let raw:unknown;
 try{const uid=await jsonRpc(c,'common','authenticate',[c.db,c.login,c.apiKey,{}]);if(!uid)throw new OdooError('Odoo no acepta la clave API. Revisa usuario, base de datos y clave.',401);
  raw=await jsonRpc(c,'object','execute_kw',[c.db,uid,c.apiKey,model,'fields_get',[],{attributes:['type']}]);}
 catch(e){if(!transportGone(e))throw e;raw=await json2(c,model,'fields_get',{attributes:['type']});}
 const names=new Set(Object.keys((raw&&typeof raw==='object'?raw:{}) as Rec));fieldCache.set(key,names);return names;
}
async function read(c:OdooConfig,model:string,domain:unknown[],wanted:string[],opts:{limit:number;order?:string}){const have=await modelFields(c,model);return {rows:await searchRead<Rec>(c,model,domain,availableFields(wanted,have),opts),have};}
const chunk=<T,>(items:T[],size:number)=>Array.from({length:Math.ceil(items.length/size)},(_,i)=>items.slice(i*size,(i+1)*size));
export const odooLimits={orders:300,receipts:200,bills:200,suppliers:1000};
export async function fetchOdooData(c:OdooConfig,kind:OdooKind){
 if(kind==='orders'){
  // Pedidos confirmados que aún no se han recibido del todo.
  const have=await modelFields(c,'purchase.order');const domain:unknown[]=[['state','in',['purchase','done']]];if(have.has('receipt_status'))domain.push(['receipt_status','in',['pending','partial']]);
  const {rows}=await read(c,'purchase.order',domain,['name','partner_id','partner_ref','date_order','date_planned','amount_total','currency_id','receipt_status','invoice_status'],{limit:odooLimits.orders,order:'date_planned asc, id asc'});
  const ids=rows.map(r=>Number(r.id)).filter(Boolean);const lines:Rec[]=[];
  for(const part of chunk(ids,100)){const r=await read(c,'purchase.order.line',[['order_id','in',part]],['order_id','product_id','name','product_qty','qty_received','qty_invoiced','price_unit','product_uom_id','product_uom','display_type'],{limit:5000,order:'order_id, sequence, id'});lines.push(...r.rows);}
  return {items:pendingOrders(normalizeOrders(rows,lines)),truncated:rows.length>=odooLimits.orders};
 }
 if(kind==='receipts'){const {rows}=await read(c,'stock.picking',[['picking_type_code','=','incoming'],['state','!=','cancel']],['name','partner_id','origin','state','scheduled_date','date_done','purchase_id'],{limit:odooLimits.receipts,order:'id desc'});return {items:normalizeReceipts(rows),truncated:rows.length>=odooLimits.receipts};}
 if(kind==='bills'){const {rows}=await read(c,'account.move',[['move_type','in',['in_invoice','in_refund']],['state','!=','cancel']],['name','ref','partner_id','invoice_date','invoice_date_due','state','payment_state','amount_total','amount_untaxed','currency_id','invoice_origin','move_type'],{limit:odooLimits.bills,order:'id desc'});return {items:normalizeBills(rows),truncated:rows.length>=odooLimits.bills};}
 const {rows}=await read(c,'res.partner',[['supplier_rank','>',0],['active','=',true]],['name','vat','ref'],{limit:odooLimits.suppliers,order:'name'});return {items:normalizeSuppliers(rows),truncated:rows.length>=odooLimits.suppliers};
}
