import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {normalizeOdooProducts,mergeOdooProducts,type SyncedProduct} from '../lib/odoo-products';
import {odooConfigSchema,inheritedConfig} from '../lib/odoo';
import {applyCommand,type Command} from '../lib/domain';
import {seedWorkspace} from '../lib/seed';
import type {Workspace} from '../lib/types';
const exec=(s:Workspace,c:Command)=>applyCommand(s,{id:randomUUID(),version:s.version,command:c});
const row=(id:number,o:Record<string,unknown>={})=>({id,name:'Producto '+id,default_code:'REF-'+id,barcode:'000'+id,uom_id:[1,'Unidades'],tracking:'none',...o});
test('Odoo products keep leading zeros, map tracking and unit, and fall back to the internal reference',()=>{
 const {products,skipped}=normalizeOdooProducts([row(1,{barcode:'0012345',tracking:'lot'}),row(2,{barcode:false,tracking:'serial',uom_id:[5,'kg']}),row(3,{default_code:false})]);
 assert.equal(skipped.length,0);assert.deepEqual(products[0],{externalId:'1',name:'Producto 1',sku:'REF-1',code:'0012345',unit:'Unidades',tracking:'lot'});
 assert.equal(products[1].code,'REF-2');assert.equal(products[1].tracking,'serial');assert.equal(products[1].unit,'kg');assert.equal(products[2].sku,'ODOO-3');});
test('Odoo products without any identifier or with repeated codes are skipped with a reason, never guessed',()=>{
 const {products,skipped}=normalizeOdooProducts([row(1),row(2,{barcode:false,default_code:false}),row(3,{barcode:'0001'}),row(4,{name:false,display_name:false})]);
 assert.deepEqual(products.map(p=>p.externalId),['1']);assert.deepEqual(skipped.map(s=>s.reason.split(':')[0]),['sin código de barras ni referencia interna','código repetido en Odoo','sin nombre']);});
test('Odoo packaging becomes the box code with its exact quantity',()=>{
 const {products}=normalizeOdooProducts([row(1),row(2)],[{product_id:[1,'x'],barcode:'CAJA-1',qty:12},{product_id:[1,'x'],barcode:'PALET-1',qty:480},{product_id:[2,'x'],barcode:'0001',qty:6},{product_id:[2,'x'],barcode:'CAJA-2',qty:0}]);
 assert.equal(products[0].packCode,'CAJA-1');assert.equal(products[0].packQuantity,'12');assert.equal(products[1].packCode,undefined);});
const inc=(externalId:string,o:Partial<SyncedProduct>={}):SyncedProduct=>({externalId,name:'Odoo '+externalId,sku:'O-'+externalId,code:'C-'+externalId,unit:'Unidades',tracking:'none',...o});
test('sync links manual products by reference or code and keeps their id, so existing receipts stay valid',()=>{
 let s=seedWorkspace();s=exec(s,{type:'syncProducts',products:[inc('10',{sku:'ARR-001',code:'8412345678905',name:'Arroz redondo 1 kg (Odoo)',tracking:'lot'}),inc('11')]});
 const rice=s.products.find(p=>p.id==='p1')!;assert.equal(rice.source,'odoo');assert.equal(rice.externalId,'10');assert.equal(rice.name,'Arroz redondo 1 kg (Odoo)');
 assert.ok(s.products.some(p=>p.id==='odoo-11'));assert.equal(s.receipts[0].lines[0].productId,'p1');
 assert.equal(s.products.find(p=>p.id==='p2')!.source,undefined);            // producto manual no presente en Odoo: se conserva
 assert.match(s.audit[0].message,/1 nuevos, 0 actualizados, 1 enlazados/);});
test('sync is repeatable: a second run updates in place and archives what left Odoo without deleting it',()=>{
 let s=exec(seedWorkspace(),{type:'syncProducts',products:[inc('1'),inc('2')]});const count=s.products.length;
 s=exec(s,{type:'syncProducts',products:[inc('1',{name:'Nombre nuevo'})]});
 assert.equal(s.products.length,count);assert.equal(s.products.find(p=>p.externalId==='1')!.name,'Nombre nuevo');assert.equal(s.products.find(p=>p.externalId==='2')!.archived,true);
 s=exec(s,{type:'syncProducts',products:[inc('1'),inc('2')]});assert.equal(s.products.find(p=>p.externalId==='2')!.archived,undefined);assert.equal(s.products.length,count);});
test('sync never overwrites another product that already owns the code',()=>{
 const m=mergeOdooProducts(seedWorkspace().products,[inc('1'),inc('2',{code:'C-1'})]);assert.equal(m.created,1);assert.equal(m.conflicts,1);assert.equal(m.products.filter(p=>p.code==='C-1').length,1);
 const pack=mergeOdooProducts(seedWorkspace().products,[inc('3',{code:'CAJA-ARROZ'})]);assert.equal(pack.conflicts,1);});
test('archived products are not matched by the scanner',()=>{
 let s=seedWorkspace();s.profiles[0].state='validated';s=exec(s,{type:'syncProducts',products:[inc('1',{sku:'ARR-001',code:'8412345678905'})]});s=exec(s,{type:'syncProducts',products:[inc('2')]});
 assert.equal(s.products.find(p=>p.id==='p1')!.archived,true);
 assert.throws(()=>exec(s,{type:'scan',receiptId:'r1',profileId:'lector-1',raw:'8412345678905'}),/desconocido/);});
test('Odoo address must be https and the config is complete',()=>{
 const ok={url:'https://empresa.odoo.com/',db:'empresa',login:'u@empresa.com',apiKey:'k',companyId:null};assert.equal(odooConfigSchema.parse(ok).url,'https://empresa.odoo.com');
 for(const patch of [{url:'http://empresa.odoo.com'},{url:'empresa.odoo.com'},{url:'javascript:alert(1)'},{db:''},{login:''},{apiKey:''}])assert.equal(odooConfigSchema.safeParse({...ok,...patch}).success,false,JSON.stringify(patch));});
test('parent app credentials are inherited only when the four variables are present',()=>{
 const keys=['ODOO_URL','ODOO_DB','ODOO_LOGIN','ODOO_API_KEY','ODOO_COMPANY_ID'] as const,old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{for(const k of keys)delete process.env[k];assert.equal(inheritedConfig(),null);
  Object.assign(process.env,{ODOO_URL:'https://bi.odoo.com/',ODOO_DB:'bi',ODOO_LOGIN:'lector'});assert.equal(inheritedConfig(),null);
  process.env.ODOO_API_KEY='clave';process.env.ODOO_COMPANY_ID='3';assert.deepEqual(inheritedConfig(),{url:'https://bi.odoo.com',db:'bi',login:'lector',apiKey:'clave',companyId:3});
 }finally{for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}}});
test('parent app config file is inherited first, completed with its environment variables',()=>{
 const keys=['ODOO_URL','ODOO_DB','ODOO_LOGIN','ODOO_API_KEY','ODOO_COMPANY_ID','DATA_DIR','SENTIDINO_BI_CONFIG'] as const,old=Object.fromEntries(keys.map(k=>[k,process.env[k]])),dir=mkdtempSync(join(tmpdir(),'ria-bi-'));
 try{for(const k of keys)delete process.env[k];
  writeFileSync(join(dir,'config.json'),JSON.stringify({odoo:{url:'https://fichero.odoo.com/',db:'fichero',login:'lector',apiKey:'clave-fichero',companyId:2},claude:{apiKey:'no-se-usa'}}));
  process.env.DATA_DIR=dir;assert.deepEqual(inheritedConfig(),{url:'https://fichero.odoo.com',db:'fichero',login:'lector',apiKey:'clave-fichero',companyId:2});
  Object.assign(process.env,{ODOO_URL:'https://entorno.odoo.com',ODOO_DB:'entorno',ODOO_LOGIN:'otro',ODOO_API_KEY:'clave-entorno'});assert.equal(inheritedConfig()?.apiKey,'clave-fichero'); // el fichero manda, como en el BI
  writeFileSync(join(dir,'config.json'),JSON.stringify({odoo:{url:'https://fichero.odoo.com'}}));assert.deepEqual(inheritedConfig(),{url:'https://fichero.odoo.com',db:'entorno',login:'otro',apiKey:'clave-entorno',companyId:null});
  writeFileSync(join(dir,'config.json'),'{no es json');assert.equal(inheritedConfig()?.url,'https://entorno.odoo.com');   // fichero ilegible: se ignora
  delete process.env.DATA_DIR;process.env.SENTIDINO_BI_CONFIG=join(dir,'no-existe.json');assert.equal(inheritedConfig()?.db,'entorno');
 }finally{rmSync(dir,{recursive:true,force:true});for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}}});
