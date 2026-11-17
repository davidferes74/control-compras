import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {applyCommand,noAuthority,invoiceConforming,type Command} from '../lib/domain';
import {inboxItems,validatedItems,inboxCount} from '../lib/inbox';
import {seedWorkspace} from '../lib/seed';
import type {AgentAuthority,Workspace} from '../lib/types';
const exec=(s:Workspace,c:Command)=>applyCommand(s,{id:randomUUID(),version:s.version,command:c});
const grant=(s:Workspace,a:Partial<AgentAuthority>)=>exec(s,{type:'agentAuthority',authority:{...noAuthority,...a}});
// Mundo: proveedor «Mayorista», dos entregas confirmadas de 10 ud de aceite a 2,50; r1 del seed sigue abierta.
function world(){let s=seedWorkspace();s.profiles[0]={...s.profiles[0],state:'validated',quantity:'10'};
 for(const [reference,date] of [['ALB-1','2026-11-03'],['ALB-2','2026-11-10']] as const){s=exec(s,{type:'createReceipt',supplier:'Mayorista',reference,date,fileIds:[],lines:[{productId:'p2',expected:'10',price:'2.50'}]});const id=s.receipts[0].id;s=exec(s,{type:'scan',receiptId:id,profileId:'lector-1',raw:'8423456789015'});s=exec(s,{type:'confirm',receiptId:id});}return s;}
const invoice=(reference:string,quantity:string,o:{refs?:string[];price?:string}={})=>({type:'createInvoice' as const,supplier:'Mayorista',reference,date:'2026-11-30',receiptRefs:o.refs||[],lines:[{productId:'p2',quantity,price:o.price}]});
const inv=(s:Workspace,reference:string)=>s.invoices.find(f=>f.reference===reference)!;
const rec=(s:Workspace,reference:string)=>s.receipts.find(r=>r.reference===reference)!;
const item=(s:Workspace,reference:string)=>inboxItems(s).find(i=>i.reference===reference);

test('the inbox sorts what needs a decision, what is ready and what must wait',()=>{
 let s=world();s=exec(s,invoice('F-OK','20',{refs:['ALB-1','ALB-2'],price:'2.50'}));
 assert.deepEqual([item(s,'F-OK')!.bucket,item(s,'F-OK')!.action],['ready','validate']);
 assert.deepEqual([item(s,'ALB-1')!.bucket,item(s,'ALB-1')!.kind],['ready','receipt']);
 assert.equal(item(s,'ALB-2026-0148'),undefined);                                     // recepción aún abierta: no está en la bandeja
 assert.deepEqual([item(s,'F-2026-0312')!.bucket,item(s,'F-2026-0312')!.tone],['decide','danger']);   // precio distinto (seed)
 assert.deepEqual([item(s,'A-771')!.bucket,item(s,'A-771')!.action],['decide','accept']);             // propuesta (seed)
 const buckets=inboxItems(s).map(i=>i.bucket);assert.deepEqual(buckets,[...buckets].sort((a,b)=>['decide','ready','wait'].indexOf(a)-['decide','ready','wait'].indexOf(b)));
 let w=exec(world(),invoice('F-FALTA','30',{refs:['ALB-1','ALB-2'],price:'2.50'}));assert.deepEqual([item(w,'F-FALTA')!.bucket,item(w,'F-FALTA')!.action],['wait','open']);
 w=exec(world(),invoice('F-SIN-PRECIO','20',{refs:['ALB-1','ALB-2']}));assert.deepEqual([item(w,'F-SIN-PRECIO')!.bucket,item(w,'F-SIN-PRECIO')!.action],['decide','exception']);
 assert.equal(inboxCount(w),inboxItems(w).filter(i=>i.bucket!=='wait').length);});
test('a person validates what is conforming with one command; anything else needs a reason and is kept as an exception',()=>{
 let s=exec(world(),invoice('F-OK','20',{refs:['ALB-1','ALB-2'],price:'2.50'}));s=exec(s,{type:'validate',kind:'invoice',id:inv(s,'F-OK').id});
 assert.deepEqual([inv(s,'F-OK').validation!.by,inv(s,'F-OK').validation!.exception],['human',undefined]);assert.equal(item(s,'F-OK'),undefined);assert.equal(validatedItems(s)[0].reference,'F-OK');
 assert.throws(()=>exec(s,{type:'validate',kind:'invoice',id:inv(s,'F-OK').id}),/ya está validada/);
 let c=exec(world(),invoice('F-CARA','20',{refs:['ALB-1','ALB-2'],price:'2.60'}));assert.throws(()=>exec(c,{type:'validate',kind:'invoice',id:inv(c,'F-CARA').id}),/motivo/);
 c=exec(c,{type:'validate',kind:'invoice',id:inv(c,'F-CARA').id,note:'Subida de tarifa aceptada por Compras'});
 assert.deepEqual([inv(c,'F-CARA').validation!.exception,inv(c,'F-CARA').validation!.note],[true,'Subida de tarifa aceptada por Compras']);assert.equal(invoiceConforming(c,inv(c,'F-CARA')),false);   // la diferencia no desaparece
 assert.throws(()=>exec(world(),{type:'validate',kind:'receipt',id:'r1'}),/ya confirmada o cerrada/);                                        // recepción abierta
 const r=exec(world(),{type:'validate',kind:'receipt',id:rec(world(),'ALB-2026-0147').id});assert.equal(rec(r,'ALB-2026-0147').validation!.by,'human');});
test('a validation stops being valid when the data it covered changes',()=>{
 let s=exec(world(),invoice('F-OK','20',{refs:['ALB-1','ALB-2'],price:'2.50'}));s=exec(s,{type:'validate',kind:'invoice',id:inv(s,'F-OK').id});
 s=exec(s,{type:'issue',receiptId:'r1',message:'Otra cosa sin relación'});assert.ok(inv(s,'F-OK').validation);                                // cambios ajenos no la tocan
 s=exec(s,{type:'setInvoiceRefs',invoiceId:inv(s,'F-OK').id,receiptRefs:['ALB-1']});
 assert.equal(inv(s,'F-OK').validation,undefined);assert.ok(s.audit.some(a=>/Validación retirada · F-OK/.test(a.message)));assert.equal(item(s,'F-OK')!.bucket,'wait');});
test('with no authority the agent does nothing',()=>{
 const s=exec(world(),invoice('F-OK','20',{refs:['ALB-1','ALB-2'],price:'2.50'}));assert.equal(s.agent,undefined);
 assert.ok(s.receipts.every(r=>!r.validation));assert.ok(s.invoices.every(f=>!f.validation));assert.ok(s.audit.every(a=>a.by!=='agent'));
 const off=grant(s,{});assert.ok(off.invoices.every(f=>!f.validation));assert.match(off.audit[0].message,/todo pasa por una persona/);});
test('authorised agent validates only what matches exactly and records every action as its own',()=>{
 let s=exec(world(),invoice('F-OK','20',{refs:['ALB-1','ALB-2'],price:'2.50'}));s=exec(s,invoice('F-CARA','8',{refs:['ALB-2026-0147'],price:'9'}));
 s=grant(s,{validateReceipts:true,validateInvoices:true});
 assert.deepEqual(['ALB-1','ALB-2','ALB-2026-0147','ALB-2026-0071'].map(r=>rec(s,r).validation?.by),['agent','agent','agent','agent']);
 assert.equal(rec(s,'ALB-2026-0148').validation,undefined);                                 // abierta
 assert.equal(inv(s,'F-OK').validation!.by,'agent');
 assert.equal(inv(s,'F-2026-0312').validation,undefined);                                   // precio distinto: nunca solo
 assert.equal(inv(s,'A-771').validation,undefined);                                         // propuesta: no tiene permiso para aceptarla
 const mine=s.audit.filter(a=>a.by==='agent');assert.equal(mine.length,5);assert.ok(mine.every(a=>a.message.startsWith('Agente · ')));assert.equal(new Set(s.audit.map(a=>a.id)).size,s.audit.length);});
test('the agent keeps working as new data arrives, and chains accept → validate',()=>{
 let s=grant(world(),{validateReceipts:true,acceptProposals:true,validateInvoices:true});
 assert.deepEqual(inv(s,'A-771').receiptRefs,['ALB-2026-0071']);assert.equal(inv(s,'A-771').validation!.by,'agent');           // aceptó la propuesta completa y validó
 s=exec(s,invoice('F-MES','20',{price:'2.50'}));assert.deepEqual(inv(s,'F-MES').receiptRefs,['ALB-1','ALB-2']);assert.equal(inv(s,'F-MES').validation!.by,'agent');
 s=exec(s,invoice('F-A-MEDIAS','5',{price:'2.50'}));assert.equal(inv(s,'F-A-MEDIAS').validation,undefined);                    // ya no quedan unidades: nada que proponer
 let p=grant(world(),{acceptProposals:true});p=exec(p,invoice('F-GRANDE','25',{price:'2.50'}));assert.deepEqual(inv(p,'F-GRANDE').receiptRefs,[]);});   // propuesta incompleta: no se acepta sola
test('unverifiable prices need their own permission; a different price is never validated by the agent',()=>{
 const base=exec(world(),invoice('F-SIN-PRECIO','20',{refs:['ALB-1','ALB-2']}));
 assert.equal(inv(grant(base,{validateInvoices:true}),'F-SIN-PRECIO').validation,undefined);
 assert.equal(inv(grant(base,{validateInvoices:true,allowUnverifiedPrice:true}),'F-SIN-PRECIO').validation!.by,'agent');
 const cara=exec(world(),invoice('F-CARA','20',{refs:['ALB-1','ALB-2'],price:'2.51'}));assert.equal(inv(grant(cara,{validateInvoices:true,allowUnverifiedPrice:true}),'F-CARA').validation,undefined);});
test('receipts closed with differences or with open issues always wait for a person',()=>{
 let s=world();s=exec(s,{type:'createReceipt',supplier:'Mayorista',reference:'ALB-CORTO',date:'2026-11-12',fileIds:[],lines:[{productId:'p2',expected:'20'}]});const id=s.receipts[0].id;
 s=exec(s,{type:'scan',receiptId:id,profileId:'lector-1',raw:'8423456789015'});s=exec(s,{type:'confirm',receiptId:id,shortage:'missing',reason:'Faltan 10'});
 s=exec(s,{type:'issue',receiptId:rec(s,'ALB-1').id,message:'Caja dañada'});s=grant(s,{validateReceipts:true});
 assert.equal(rec(s,'ALB-CORTO').validation,undefined);assert.equal(rec(s,'ALB-1').validation,undefined);assert.equal(rec(s,'ALB-2').validation!.by,'agent');
 assert.deepEqual([item(s,'ALB-CORTO')!.bucket,item(s,'ALB-CORTO')!.action],['decide','exception']);
 assert.throws(()=>exec(s,{type:'validate',kind:'receipt',id:rec(s,'ALB-CORTO').id}),/motivo/);});
test('what a person undoes, the agent does not validate again on its own',()=>{
 let s=grant(exec(world(),invoice('F-OK','20',{refs:['ALB-1','ALB-2'],price:'2.50'})),{validateReceipts:true,validateInvoices:true});
 s=exec(s,{type:'unvalidate',kind:'invoice',id:inv(s,'F-OK').id});s=exec(s,{type:'unvalidate',kind:'receipt',id:rec(s,'ALB-1').id});
 s=exec(s,{type:'issue',receiptId:'r1',message:'Cualquier cambio posterior'});
 assert.equal(inv(s,'F-OK').validation,undefined);assert.equal(rec(s,'ALB-1').validation,undefined);assert.equal(item(s,'F-OK')!.bucket,'ready');
 s=exec(s,{type:'validate',kind:'invoice',id:inv(s,'F-OK').id});assert.equal(inv(s,'F-OK').validation!.by,'human');
 assert.throws(()=>exec(s,{type:'unvalidate',kind:'receipt',id:rec(s,'ALB-1').id}),/No está validada/);});
test('agent rules are replay-safe: the same command twice changes nothing more',()=>{
 const s=exec(world(),invoice('F-OK','20',{refs:['ALB-1','ALB-2'],price:'2.50'})),id=randomUUID(),cmd={id,version:s.version,command:{type:'agentAuthority' as const,authority:{...noAuthority,validateInvoices:true,validateReceipts:true}}};
 const once=applyCommand(s,cmd),twice=applyCommand(once,cmd);assert.equal(twice,once);});
