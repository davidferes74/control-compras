import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {applyCommand,type Command} from '../lib/domain';
import {seedWorkspace} from '../lib/seed';
import {demoOdoo,normalizeOrders} from '../lib/odoo-data';
import {productForLine,receivableLines,receiptsForOrder} from '../lib/order-receive';
import type {Workspace} from '../lib/types';
const exec=(s:Workspace,c:Command)=>applyCommand(s,{id:randomUUID(),version:s.version,command:c});
const order=()=>demoOdoo().orders[0];   // P00412: arroz 200 pedidas / 120 recibidas en Odoo; aceite 30 / 30
const open=(s:Workspace,reference:string,expected:string)=>exec(s,{type:'createReceipt',supplier:'Distribuciones Atlántico',reference,date:'2026-11-17',fileIds:[],order:{id:1,name:'P00412'},lines:[{productId:'p1',expected,price:'1.25',orderLineIds:[11]}]});
const rice=(s:Workspace)=>receivableLines(order(),s).find(l=>l.product?.id==='p1')!;
test('order lines map to catalogue products by Odoo id first, then by exact reference; never by name',()=>{
 const products=seedWorkspace().products;
 assert.equal(productForLine({productId:999,productRef:'ARR-001'},products)?.id,'p1');
 assert.equal(productForLine({productId:999,productRef:'arr-001'},products),null);
 assert.equal(productForLine({productId:null,productRef:''},products),null);
 const linked=[...products,{...products[1],id:'x',sku:'OTRA',code:'X',source:'odoo' as const,externalId:'999'}];
 assert.equal(productForLine({productId:999,productRef:'ARR-001'},linked)?.id,'x');                        // el enlace por id manda sobre la referencia
 assert.equal(productForLine({productId:999,productRef:'ARR-001'},[{...linked[3],archived:true},...products])?.id,'p1'); // un archivado no cuenta
 assert.equal(productForLine({productId:5,productRef:'ARR-001'},[...products,{...products[0],id:'dup'}]),null);});       // referencia ambigua: no se adivina
test('pending per product is what Odoo still expects minus what the app already holds for that order',()=>{
 let s=seedWorkspace();assert.deepEqual([rice(s).ordered,rice(s).pendingInOdoo,rice(s).inApp,rice(s).pending],['200','80','0','80']);
 s=open(s,'ALB-A','50');assert.deepEqual([rice(s).inApp,rice(s).pending],['50','30']);       // recepción abierta: reserva lo esperado
 s=open(s,'ALB-B','40');assert.equal(rice(s).pending,'0');                                     // nunca negativo
 assert.equal(receiptsForOrder(s,1).length,2);assert.equal(receiptsForOrder(s,2).length,0);});
test('a closed receipt covers only what really arrived, releasing the rest of the order',()=>{
 let s=open(seedWorkspace(),'ALB-A','50');s.profiles[0].state='validated';const id=s.receipts[0].id;
 for(let i=0;i<3;i++)s=exec(s,{type:'scan',receiptId:id,profileId:'lector-1',raw:'CAJA-ARROZ'});       // 36 de 50
 assert.equal(rice(s).pending,'30');                                                                   // abierta: sigue reservando 50
 s=exec(s,{type:'confirm',receiptId:id,shortage:'missing',reason:'Faltan 14; no se reponen'});
 assert.deepEqual([rice(s).inApp,rice(s).pending],['36','44']);});
test('the receipt keeps its order, order lines and agreed price for later validation',()=>{
 const s=open(seedWorkspace(),'ALB-A','50'),r=s.receipts[0];
 assert.deepEqual(r.order,{id:1,name:'P00412'});assert.deepEqual(r.lines[0].orderLineIds,[11]);assert.equal(r.lines[0].price,'1.25');assert.match(s.audit[0].message,/pedido P00412/);
 assert.equal(exec(seedWorkspace(),{type:'createReceipt',supplier:'P',reference:'R',date:'2026-11-17',fileIds:[],lines:[{productId:'p1',expected:'1'}]}).receipts[0].order,undefined);
 assert.throws(()=>exec(seedWorkspace(),{type:'createReceipt',supplier:'P',reference:'R',date:'2026-11-17',fileIds:[],order:{id:0,name:'X'},lines:[{productId:'p1',expected:'1'}]}));});
test('an order repeating a product in two lines is received as one line with both order lines',()=>{
 const [o]=normalizeOrders([{id:9,name:'P9',partner_id:[1,'Prov']}],[{id:1,order_id:[9,'P9'],product_id:[50,'[ARR-001] Arroz'],product_qty:10,qty_received:0,price_unit:1},{id:2,order_id:[9,'P9'],product_id:[50,'[ARR-001] Arroz'],product_qty:5,qty_received:2,price_unit:1},{id:3,order_id:[9,'P9'],product_id:[77,'Sin referencia'],product_qty:1,qty_received:0}]);
 const lines=receivableLines(o,seedWorkspace());assert.equal(lines.length,2);
 assert.deepEqual([lines[0].orderLineIds,lines[0].ordered,lines[0].pending],[[1,2],'15','13']);
 assert.equal(lines[1].product,null);assert.equal(lines[1].name,'Sin referencia');});
