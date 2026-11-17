import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {applyCommand,invoiceSummary,priceCheck,reconcile,type Command} from '../lib/domain';
import {seedWorkspace} from '../lib/seed';
import type {Workspace} from '../lib/types';
const exec=(s:Workspace,c:Command)=>applyCommand(s,{id:randomUUID(),version:s.version,command:c});
// Proveedor con tres entregas confirmadas del mismo producto, en fechas distintas y con precio acordado 2,50.
function world(){let s=seedWorkspace();s.profiles[0]={...s.profiles[0],state:'validated',quantity:'10'};
 const deliver=(reference:string,date:string,units:number,price='2.50')=>{s=exec(s,{type:'createReceipt',supplier:'Mayorista',reference,date,fileIds:[],lines:[{productId:'p2',expected:String(units),price}]});const id=s.receipts[0].id;for(let i=0;i<units/10;i++)s=exec(s,{type:'scan',receiptId:id,profileId:'lector-1',raw:'8423456789015'});s=exec(s,{type:'confirm',receiptId:id});};
 deliver('ALB-OCT','2026-10-20',60);deliver('ALB-NOV-1','2026-11-05',40);deliver('ALB-NOV-2','2026-11-25',50);return s;}
const invoice=(reference:string,quantity:string,o:{refs?:string[];date?:string;price?:string;supplier?:string}={})=>({type:'createInvoice' as const,supplier:o.supplier||'Mayorista',reference,date:o.date||'2026-11-30',receiptRefs:o.refs||[],lines:[{productId:'p2',quantity,price:o.price}]});
const of=(s:Workspace,reference:string)=>s.invoices.find(f=>f.reference===reference)!;
const alloc=(s:Workspace,reference:string)=>s.allocations.filter(a=>a.invoiceId===of(s,reference).id).map(a=>[s.receipts.find(r=>r.id===a.receiptId)!.reference,a.quantity,a.basis||'reference']);

test('monthly invoice without delivery notes is proposed against that supplier deliveries, oldest first',()=>{
 const s=exec(world(),invoice('F-MES','130'));
 assert.deepEqual(alloc(s,'F-MES'),[['ALB-OCT','60','product'],['ALB-NOV-1','40','product'],['ALB-NOV-2','30','product']]);
 const sum=invoiceSummary(s,of(s,'F-MES'));assert.deepEqual([sum.matched,sum.proposed,sum.complete,sum.proposalComplete],['0','130',false,true]);});
test('a proposal never uses deliveries after the invoice date, other suppliers or unconfirmed receipts',()=>{
 let s=exec(world(),invoice('F-PRONTO','130',{date:'2026-11-10'}));assert.deepEqual(alloc(s,'F-PRONTO'),[['ALB-OCT','60','product'],['ALB-NOV-1','40','product']]);assert.equal(invoiceSummary(s,of(s,'F-PRONTO')).proposalComplete,false);
 s=exec(world(),invoice('F-OTRO','10',{supplier:'Otro mayorista'}));assert.deepEqual(alloc(s,'F-OTRO'),[]);
 s=exec(world(),{type:'createReceipt',supplier:'Mayorista',reference:'ABIERTA',date:'2026-10-01',fileIds:[],lines:[{productId:'p2',expected:'500'}]});s=exec(s,invoice('F-X','200'));
 assert.ok(alloc(s,'F-X').every(a=>a[0]!=='ABIERTA'));assert.equal(invoiceSummary(s,of(s,'F-X')).proposed,'150');});
test('invoices that cite delivery notes are served first; a proposal only gets what is left',()=>{
 let s=exec(world(),invoice('F-SIN-REFS','100'));s=exec(s,invoice('F-CON-REFS','60',{refs:['ALB-OCT']}));
 assert.deepEqual(alloc(s,'F-CON-REFS'),[['ALB-OCT','60','reference']]);
 assert.deepEqual(alloc(s,'F-SIN-REFS'),[['ALB-NOV-1','40','product'],['ALB-NOV-2','50','product']]);   // registrada antes, pero no le quita nada a la que cita albarán
 const total=s.allocations.filter(x=>s.receipts.find(r=>r.id===x.receiptId)!.supplier==='Mayorista').reduce((a,x)=>a+Number(x.quantity),0);assert.equal(total,150);});            // nunca se reparte más de lo recibido
test('accepting a proposal turns it into explicit delivery notes and a confirmed backing',()=>{
 let s=exec(world(),invoice('F-MES','100'));s=exec(s,{type:'acceptMatch',invoiceId:of(s,'F-MES').id});
 assert.deepEqual(of(s,'F-MES').receiptRefs,['ALB-OCT','ALB-NOV-1']);assert.deepEqual(alloc(s,'F-MES'),[['ALB-OCT','60','reference'],['ALB-NOV-1','40','reference']]);
 assert.equal(invoiceSummary(s,of(s,'F-MES')).complete,true);assert.match(s.audit[0].message,/Emparejamiento aceptado/);
 assert.throws(()=>exec(s,{type:'acceptMatch',invoiceId:of(s,'F-MES').id}),/No hay ninguna propuesta/);
 assert.throws(()=>exec(s,{type:'acceptMatch',invoiceId:'no-existe'}),/no encontrada/);});
test('delivery notes can be corrected by hand; clearing them brings the proposal back',()=>{
 let s=exec(world(),invoice('F-MES','50',{refs:['ALB-NO-EXISTE']}));assert.deepEqual(alloc(s,'F-MES'),[]);
 s=exec(s,{type:'setInvoiceRefs',invoiceId:of(s,'F-MES').id,receiptRefs:[' ALB-NOV-2 ','ALB-NOV-2']});assert.deepEqual(of(s,'F-MES').receiptRefs,['ALB-NOV-2']);assert.deepEqual(alloc(s,'F-MES'),[['ALB-NOV-2','50','reference']]);
 s=exec(s,{type:'setInvoiceRefs',invoiceId:of(s,'F-MES').id,receiptRefs:[]});assert.deepEqual(alloc(s,'F-MES'),[['ALB-OCT','50','product']]);});
test('price equal to the agreed one is conforming; a different price raises an alert with its exact impact',()=>{
 let s=exec(world(),invoice('F-OK','100',{refs:['ALB-OCT','ALB-NOV-1'],price:'2.5'}));let p=priceCheck(s,of(s,'F-OK'));assert.deepEqual([p.status,p.impact,p.lines[0].agreed],['ok','0',['2.5']]);
 s=exec(world(),invoice('F-CARA','100',{refs:['ALB-OCT','ALB-NOV-1'],price:'2.57'}));p=priceCheck(s,of(s,'F-CARA'));assert.deepEqual([p.status,p.impact,p.lines[0].checkedQuantity],['discrepancy','7','100']);
 s=exec(world(),invoice('F-BARATA','60',{refs:['ALB-OCT'],price:'2.4999'}));p=priceCheck(s,of(s,'F-BARATA'));assert.deepEqual([p.status,p.impact],['discrepancy','-0.01']);});   // 0,0001 × 60 = 0,006 → 0,01
test('price cannot be checked without an invoice price, without an agreed price or without full backing; it is never assumed correct',()=>{
 let s=exec(world(),invoice('F-SIN-PRECIO','60',{refs:['ALB-OCT']}));assert.equal(priceCheck(s,of(s,'F-SIN-PRECIO')).status,'unverifiable');
 s=exec(world(),invoice('F-MITAD','100',{refs:['ALB-OCT'],price:'2.50'}));const p=priceCheck(s,of(s,'F-MITAD'));assert.deepEqual([p.status,p.lines[0].checkedQuantity],['unverifiable','60']);
 const seed=seedWorkspace();seed.allocations=reconcile(seed);seed.receipts.find(r=>r.id==='r2')!.lines[0].price=undefined;assert.equal(priceCheck(seed,seed.invoices[0]).status,'unverifiable');});
test('different agreed prices across deliveries are compared delivery by delivery',()=>{
 let s=world();s=exec(s,{type:'createReceipt',supplier:'Mayorista',reference:'ALB-DIC',date:'2026-11-28',fileIds:[],lines:[{productId:'p2',expected:'10',price:'3'}]});const id=s.receipts[0].id;s=exec(s,{type:'scan',receiptId:id,profileId:'lector-1',raw:'8423456789015'});s=exec(s,{type:'confirm',receiptId:id});
 s=exec(s,invoice('F-MIXTA','70',{refs:['ALB-OCT','ALB-DIC'],price:'2.50'}));const p=priceCheck(s,of(s,'F-MIXTA'));
 assert.deepEqual([p.status,p.impact,p.lines[0].agreed.sort()],['discrepancy','-5',['2.5','3']]);});   // 10 ud a 2,50 en vez de 3,00
test('demo data shows a price alert and a pending proposal',()=>{const s=seedWorkspace();s.allocations=reconcile(s);
 assert.equal(priceCheck(s,s.invoices[0]).status,'discrepancy');assert.equal(priceCheck(s,s.invoices[0]).impact,'0.4');
 const sum=invoiceSummary(s,s.invoices[1]);assert.deepEqual([sum.proposed,sum.proposalComplete],['1',true]);});
