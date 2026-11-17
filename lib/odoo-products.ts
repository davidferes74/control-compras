import {z} from 'zod';
import type {Product} from './types';
// Traducción pura de productos de Odoo al catálogo de la app. Sin red: se puede probar con datos de ejemplo.
export const maxOdooProducts=3000;
export type OdooProductRow={id:number;name?:unknown;display_name?:unknown;default_code?:unknown;barcode?:unknown;uom_id?:unknown;tracking?:unknown};
export type OdooPackagingRow={product_id?:unknown;barcode?:unknown;qty?:unknown};
export const syncedProductSchema=z.object({externalId:z.string().min(1).max(40),name:z.string().min(1).max(160),sku:z.string().min(1).max(160),code:z.string().min(1).max(100),unit:z.string().min(1).max(30),tracking:z.enum(['none','lot','serial']),packCode:z.string().min(1).max(100).optional(),packQuantity:z.string().regex(/^\d{1,9}(\.\d{1,3})?$/).optional()});
export type SyncedProduct=z.infer<typeof syncedProductSchema>;
const text=(v:unknown)=>typeof v==='string'?v.trim():'';
const many2one=(v:unknown)=>Array.isArray(v)?{id:Number(v[0]),name:text(v[1])}:null;
// Odoo devuelve cantidades como número; se conservan hasta 3 decimales sin notación científica.
const decimal=(v:unknown)=>{const n=Number(v);if(!Number.isFinite(n)||n<=0||n>=1e9)return null;return String(Math.round(n*1000)/1000);};
export function normalizeOdooProducts(rows:OdooProductRow[],packaging:OdooPackagingRow[]=[]){
 const packs=new Map<number,{barcode:string;qty:string}>();
 for(const p of packaging){const pid=many2one(p.product_id)?.id,barcode=text(p.barcode),qty=decimal(p.qty);if(pid&&barcode&&qty&&!packs.has(pid))packs.set(pid,{barcode,qty});}
 const products:SyncedProduct[]=[],skipped:{name:string;reason:string}[]=[],codes=new Set<string>(),skus=new Set<string>();
 for(const r of rows){
  const name=(text(r.name)||text(r.display_name)).slice(0,160),ref=text(r.default_code),barcode=text(r.barcode),label=name||'Producto '+r.id;
  // Sin código de barras se usa la referencia interna como código; sin ninguno de los dos no se puede escanear ni identificar.
  const code=barcode||ref,sku=ref||'ODOO-'+r.id;
  if(!name){skipped.push({name:label,reason:'sin nombre'});continue;}
  if(!code){skipped.push({name:label,reason:'sin código de barras ni referencia interna'});continue;}
  if(code.length>100||sku.length>160){skipped.push({name:label,reason:'código o referencia demasiado largos'});continue;}
  if(codes.has(code)){skipped.push({name:label,reason:'código repetido en Odoo: '+code});continue;}
  if(skus.has(sku)){skipped.push({name:label,reason:'referencia repetida en Odoo: '+sku});continue;}
  const tracking=r.tracking==='lot'?'lot':r.tracking==='serial'?'serial':'none';
  const pack=packs.get(r.id),usePack=pack&&pack.barcode!==code&&!codes.has(pack.barcode)&&pack.barcode.length<=100;
  codes.add(code);skus.add(sku);if(usePack)codes.add(pack.barcode);
  products.push({externalId:String(r.id),name,sku,code,unit:(many2one(r.uom_id)?.name||'ud').slice(0,30),tracking,...(usePack?{packCode:pack.barcode,packQuantity:pack.qty}:{})});
 }
 return {products,skipped};
}
// Fusiona el catálogo con lo recibido de Odoo sin romper recepciones existentes:
// 1) producto ya enlazado → se actualiza; 2) producto manual con la misma referencia o código → se enlaza y conserva su id;
// 3) nuevo → se crea; 4) enlazado que ya no viene de Odoo → se archiva (no se borra: puede estar en recepciones).
export function mergeOdooProducts(existing:Product[],incoming:SyncedProduct[]){
 const next=existing.map(p=>({...p})),byExternal=new Map(next.filter(p=>p.source==='odoo'&&p.externalId).map(p=>[p.externalId!,p]));
 const seen=new Set<string>();let created=0,updated=0,linked=0,conflicts=0;
 for(const inc of incoming){
  let target=byExternal.get(inc.externalId);
  if(!target){target=next.find(p=>p.source!=='odoo'&&(p.sku===inc.sku||p.code===inc.code));if(target)linked++;}else updated++;
  const fields={name:inc.name,sku:inc.sku,code:inc.code,unit:inc.unit,tracking:inc.tracking,packCode:inc.packCode,packQuantity:inc.packQuantity,source:'odoo' as const,externalId:inc.externalId,archived:undefined};
  // Otro producto distinto ya usa ese código o referencia: no se pisa; queda para revisión.
  const clash=next.some(p=>p!==target&&!p.archived&&(p.code===inc.code||p.sku===inc.sku||(inc.packCode&&(p.code===inc.packCode||p.packCode===inc.packCode))||(p.packCode&&p.packCode===inc.code)));
  if(clash){conflicts++;if(target&&target.source==='odoo')seen.add(inc.externalId);continue;}
  if(target)Object.assign(target,fields);else{next.push({id:'odoo-'+inc.externalId,...fields});created++;}
  seen.add(inc.externalId);
 }
 let archived=0;for(const p of next)if(p.source==='odoo'&&p.externalId&&!seen.has(p.externalId)&&!p.archived){p.archived=true;archived++;}
 for(const p of next){if(p.archived===undefined)delete p.archived;if(p.packCode===undefined){delete p.packCode;delete p.packQuantity;}}
 return {products:next,created,updated,linked,archived,conflicts};
}
