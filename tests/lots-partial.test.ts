import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {applyCommand,invoiceSummary,lotBreakdown,DomainError,type Command} from '../lib/domain';
import {seedWorkspace} from '../lib/seed';
import type {Workspace} from '../lib/types';
const exec=(s:Workspace,c:Command)=>applyCommand(s,{id:randomUUID(),version:s.version,command:c});
function ready(tracking=false){let s=seedWorkspace();s.profiles[0].state='validated';if(tracking)s=exec(s,{type:'tracking',enabled:true});return s;}
const rice='8412345678905',oil='8423456789015';
const scan=(receiptId:string,raw:string,lot?:string)=>({type:'scan' as const,receiptId,profileId:'lector-1',raw,lot});
const received=(s:Workspace,rid:string)=>s.receipts.find(r=>r.id===rid)!.lines.map(l=>l.received);
function twoLots(){return exec(ready(true),{type:'createReceipt',supplier:'Distribuciones Atlántico',reference:'ALB-LOTES',date:'2026-11-17',fileIds:[],lines:[{productId:'p1',expected:'3',lot:'LOTE-A'},{productId:'p1',expected:'2',lot:'LOTE-B'}]});}

// ---- Varios lotes del mismo producto ----
test('a product can be declared in several lots; each lot keeps its own quantity',()=>{let s=twoLots();const id=s.receipts[0].id;
 s=exec(s,scan(id,rice,'LOTE-A'));s=exec(s,scan(id,rice,'LOTE-B'));s=exec(s,scan(id,rice,'LOTE-A'));
 assert.deepEqual(received(s,id),['2','1']);
 assert.deepEqual(lotBreakdown(s,id).map(x=>[x.lot,x.quantity,x.verifiable,x.matches]),[['LOTE-A','2',true,true],['LOTE-B','1',true,true]]);});
test('multi-lot product needs the lot and never guesses a similar one',()=>{const s=twoLots(),id=s.receipts[0].id;
 assert.throws(()=>exec(s,scan(id,rice)),/varios lotes|requiere lote/);
 assert.throws(()=>exec(s,scan(id,rice,'LOTE-C')),(e:unknown)=>e instanceof DomainError&&/no figura/.test(e.message));
 assert.throws(()=>exec(s,scan(id,rice,'lote-a')),/no figura/);
 assert.deepEqual(received(s,id),['0','0']);});
test('GS1 label lot routes the scan to its own line',()=>{let s=twoLots();const id=s.receipts[0].id;s.profiles[0]={...s.profiles[0],parser:'gs1'};
 s=exec(s,scan(id,'(01)08412345678905(10)LOTE-B'));assert.deepEqual(received(s,id),['0','1']);});
test('repeating a product requires lot tracking and distinct lots',()=>{const lines=(a?:string,b?:string)=>({type:'createReceipt' as const,supplier:'P',reference:'R',date:'2026-11-17',fileIds:[],lines:[{productId:'p1',expected:'1',lot:a},{productId:'p1',expected:'1',lot:b}]});
 assert.throws(()=>exec(ready(false),lines('A','B')),/lotes/);            // seguimiento desactivado
 assert.throws(()=>exec(ready(true),lines('A','A')),/lote distinto/);     // mismo lote dos veces
 assert.throws(()=>exec(ready(true),lines('A',undefined)),/lote distinto/); // falta un lote
 assert.throws(()=>exec(ready(true),{type:'createReceipt',supplier:'P',reference:'R',date:'2026-11-17',fileIds:[],lines:[{productId:'p2',expected:'1',lot:'A'},{productId:'p2',expected:'1',lot:'B'}]}),/lotes/); // producto sin seguimiento por lote
 assert.equal(exec(ready(true),lines('A','B')).receipts[0].lines.length,2);});
test('lot absent from the delivery note is recorded as observed but not verifiable',()=>{let s=exec(ready(true),{type:'createReceipt',supplier:'P',reference:'SIN-LOTE',date:'2026-11-17',fileIds:[],lines:[{productId:'p1',expected:'5'}]});const id=s.receipts[0].id;
 s=exec(s,scan(id,rice,'X1'));s=exec(s,scan(id,rice,'X2'));s=exec(s,scan(id,rice,'X1'));
 assert.deepEqual(lotBreakdown(s,id).map(x=>[x.lot,x.quantity,x.verifiable]),[['X1','2',false],['X2','1',false]]);});
test('undo reverses the right lot line',()=>{let s=twoLots();const id=s.receipts[0].id;s=exec(s,scan(id,rice,'LOTE-A'));s=exec(s,scan(id,rice,'LOTE-B'));s=exec(s,{type:'undo',receiptId:id});
 assert.deepEqual(received(s,id),['1','0']);assert.deepEqual(lotBreakdown(s,id).map(x=>x.lot),['LOTE-A']);});

// ---- Recepción parcial y faltantes ----
function tenOfTwelve(){let s=ready();for(let i=0;i<10;i++)s=exec(s,scan('r1',rice));for(let i=0;i<6;i++)s=exec(s,scan('r1',oil));return s;}
test('12 declared, 10 arrive: partial confirmation backs the invoice with 10, never 12',()=>{let s=tenOfTwelve();s=exec(s,{type:'confirm',receiptId:'r1',shortage:'pending'});
 const r=s.receipts.find(x=>x.id==='r1')!;assert.equal(r.status,'partial');assert.equal(r.closedAt,undefined);assert.ok(r.partialAt);
 const sum=invoiceSummary(s,s.invoices[0]);assert.equal(sum.matched,'24');assert.equal(sum.pending,'2');assert.equal(sum.complete,false); // 8 (r2) + 10 arroz + 6 aceite
});
test('goods scanned after a partial confirmation do not back invoices until confirmed again',()=>{let s=exec(tenOfTwelve(),{type:'confirm',receiptId:'r1',shortage:'pending'});
 s=exec(s,scan('r1',rice));assert.equal(invoiceSummary(s,s.invoices[0]).matched,'24');
 s=exec(s,scan('r1',rice));s=exec(s,{type:'confirm',receiptId:'r1'});
 assert.equal(s.receipts.find(x=>x.id==='r1')!.status,'confirmed');assert.equal(invoiceSummary(s,s.invoices[0]).complete,true);});
test('shortage that will not arrive closes with exceptions and requires a reason',()=>{const s=tenOfTwelve();
 assert.throws(()=>exec(s,{type:'confirm',receiptId:'r1',shortage:'missing'}),/motivo/);
 const closed=exec(s,{type:'confirm',receiptId:'r1',shortage:'missing',reason:'Faltan 2 unidades; el proveedor no las repone'});
 const r=closed.receipts.find(x=>x.id==='r1')!;assert.equal(r.status,'exceptions');assert.ok(r.closedAt);assert.equal(invoiceSummary(closed,closed.invoices[0]).matched,'24');
 assert.throws(()=>exec(closed,scan('r1',rice)),/cerrada/);});
test('partial confirmation needs a real shortage and newly received goods',()=>{let full=ready();full=exec(full,scan('r1','CAJA-ARROZ'));for(let i=0;i<6;i++)full=exec(full,scan('r1',oil));
 assert.throws(()=>exec(full,{type:'confirm',receiptId:'r1',shortage:'pending'}),/No quedan cantidades pendientes/);
 assert.throws(()=>exec(ready(),{type:'confirm',receiptId:'r1',shortage:'pending'}),/No hay mercancía nueva/);
 const partial=exec(tenOfTwelve(),{type:'confirm',receiptId:'r1',shortage:'pending'});
 assert.throws(()=>exec(partial,{type:'confirm',receiptId:'r1',shortage:'pending'}),/No hay mercancía nueva/);});
test('readings sealed by a partial confirmation cannot be undone; later ones can',()=>{let s=exec(tenOfTwelve(),{type:'confirm',receiptId:'r1',shortage:'pending'});
 assert.throws(()=>exec(s,{type:'undo',receiptId:'r1'}),/ya está confirmada/);
 s=exec(s,scan('r1',rice));s=exec(s,{type:'undo',receiptId:'r1'});assert.equal(received(s,'r1')[0],'10');});

// ---- Criterios de aceptación de la conciliación ----
function threeDeliveries(){let s=ready();const mk=(reference:string,expected:string)=>{s=exec(s,{type:'createReceipt',supplier:'Proveedor Tres',reference,date:'2026-11-17',fileIds:[],lines:[{productId:'p2',expected}]});return s.receipts[0].id;};
 const ids={A:mk('A','60'),B:mk('B','40'),C:mk('C','50')};const p=s.profiles[0];s.profiles[0]={...p,quantity:'10'};
 const fill=(id:string,times:number)=>{for(let i=0;i<times;i++)s=exec(s,scan(id,oil));s=exec(s,{type:'confirm',receiptId:id});};
 return {get s(){return s;},set s(v){s=v;},ids,fill};}
const invoice=(reference:string,quantity:string)=>({type:'createInvoice' as const,supplier:'Proveedor Tres',reference,date:'2026-11-17',receiptRefs:['A','B','C'],lines:[{productId:'p2',quantity}]});
test('invoice of 150 over three delivery notes is split 60 + 40 + 50 and cannot be reused',()=>{const t=threeDeliveries();t.fill(t.ids.A,6);t.fill(t.ids.B,4);t.fill(t.ids.C,5);
 t.s=exec(t.s,invoice('F-150','150'));const f=t.s.invoices.find(x=>x.reference==='F-150')!;
 assert.deepEqual(t.s.allocations.filter(a=>a.invoiceId===f.id).map(a=>a.quantity),['60','40','50']);assert.equal(invoiceSummary(t.s,f).complete,true);
 t.s=exec(t.s,invoice('F-OTRA','20'));const other=t.s.invoices.find(x=>x.reference==='F-OTRA')!;
 assert.equal(invoiceSummary(t.s,other).matched,'0');assert.equal(invoiceSummary(t.s,t.s.invoices.find(x=>x.reference==='F-150')!).complete,true);});
test('invoice of 160 leaves 10 unbacked; invoice before delivery C waits and is recalculated on arrival',()=>{const t=threeDeliveries();t.fill(t.ids.A,6);t.fill(t.ids.B,4);
 t.s=exec(t.s,invoice('F-160','160'));const f=()=>t.s.invoices.find(x=>x.reference==='F-160')!;
 assert.equal(invoiceSummary(t.s,f()).matched,'100');assert.equal(invoiceSummary(t.s,f()).pending,'60');
 t.fill(t.ids.C,5);assert.equal(invoiceSummary(t.s,f()).matched,'150');assert.equal(invoiceSummary(t.s,f()).pending,'10');assert.equal(invoiceSummary(t.s,f()).complete,false);});
test('label photo evidence stays attached to the reading and its lot',()=>{let s=twoLots();const id=s.receipts[0].id,photo=randomUUID();
 s=exec(s,{...scan(id,rice,'LOTE-A'),evidenceId:photo});s=exec(s,scan(id,rice,'LOTE-A'));
 assert.equal(s.scans[0].evidenceId,photo);assert.equal(s.scans[1].evidenceId,undefined);
 assert.deepEqual(lotBreakdown(s,id)[0].evidenceIds,[photo]);
 assert.throws(()=>exec(s,{...scan(id,rice,'LOTE-A'),evidenceId:'no-es-uuid'}));});
