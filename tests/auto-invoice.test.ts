import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {autoInvoice,resolveSupplier,supplierKey} from '../lib/auto-invoice';
import {applyCommand,commandSchema,noAuthority} from '../lib/domain';
import {seedWorkspace} from '../lib/seed';
import type {Extraction} from '../lib/extraction';
const doc=randomUUID();
const reading=(o:Partial<Extraction>={}):Extraction=>({documentType:'invoice',typeEvidence:'FACTURA',supplier:'DISTRIBUCIONES ATLÁNTICO, S.L.',reference:'F-2026-0400',date:'2026-11-20',receiptRefs:['ALB-2026-0147'],warnings:[],lines:[{description:'Arroz redondo 1kg',code:'8412345678905',quantity:'8',unit:'ud',lot:null,price:'1.25',page:1,evidence:'8412345678905 Arroz 8 1,25'}],...o});
const known=['Distribuciones Atlántico','Equipamiento Norte'];
const reasons=(r:Extraction,suppliers=known)=>{const a=autoInvoice(r,seedWorkspace(),suppliers,doc);return a.ok?[]:a.reasons;};
test('supplier names are compared ignoring case, accents, punctuation and legal form, but never by similarity',()=>{
 assert.equal(supplierKey('DISTRIBUCIONES ATLÁNTICO, S.L.'),supplierKey('Distribuciones Atlantico SL'));assert.equal(supplierKey('Equipamiento Norte S.A.U.'),'equipamiento norte');
 assert.equal(resolveSupplier('DISTRIBUCIONES ATLÁNTICO, S.L.',known),'Distribuciones Atlántico');
 assert.equal(resolveSupplier('Distribuciones Atlantic',known),null);                                   // parecido no basta
 assert.equal(resolveSupplier('Distribuciones Atlántico',[...known,'Distribuciones Atlantico SA']),null); // dos candidatos: no se elige
 assert.equal(resolveSupplier(null,known),null);assert.equal(resolveSupplier(' , ',known),null);});
test('an invoice with no doubts becomes a createInvoice command that the domain accepts',()=>{
 const a=autoInvoice(reading(),seedWorkspace(),[],doc);assert.ok(a.ok);if(!a.ok)return;
 assert.deepEqual(a.command,{type:'createInvoice',auto:true,supplier:'Distribuciones Atlántico',reference:'F-2026-0400',date:'2026-11-20',receiptRefs:['ALB-2026-0147'],fileIds:[doc],lines:[{productId:'p1',quantity:'8',price:'1.25'}]});
 assert.ok(commandSchema.safeParse(a.command).success);
 const s0=seedWorkspace(),s=applyCommand(s0,{id:randomUUID(),version:s0.version,command:a.command});const f=s.invoices.find(x=>x.reference==='F-2026-0400')!;
 assert.equal(f.supplier,'Distribuciones Atlántico');assert.equal((f as unknown as {auto?:boolean}).auto,undefined);
 assert.deepEqual([s.audit[0].by,s.audit[0].message],['agent','Agente · factura registrada desde el correo · F-2026-0400']);});
test('any doubt keeps the invoice for a person, with the reason',()=>{
 assert.match(reasons(reading({documentType:'delivery_note'}))[0],/No es una factura/);
 assert.match(reasons(reading({warnings:['Línea truncada']}))[0],/advertencias/);
 assert.match(reasons(reading({supplier:'Proveedor Nuevo SL'}))[0],/Proveedor no reconocido/);
 assert.match(reasons(reading({reference:null}))[0],/Sin número/);assert.match(reasons(reading({date:null}))[0],/Sin fecha/);
 assert.match(reasons(reading({reference:'F-2026-0312'}))[0],/ya registrada/);
 const line=reading().lines[0];
 assert.match(reasons(reading({lines:[{...line,code:null}]}))[0],/sin código/);
 assert.match(reasons(reading({lines:[{...line,code:'0000000000000'}]}))[0],/no identifica un único producto/);
 assert.match(reasons(reading({lines:[{...line,code:'CAJA-ARROZ'}]}))[0],/no identifica un único producto/);   // código de caja: no se convierte solo
 assert.match(reasons(reading({lines:[{...line,quantity:null}]}))[0],/cantidad no válida/);assert.match(reasons(reading({lines:[{...line,quantity:'0'}]}))[0],/cantidad no válida/);
 assert.match(reasons(reading({lines:[{...line,price:'1.123456'}]}))[0],/precio no válido/);
 assert.equal(reasons(reading({supplier:'x',reference:null,date:null,lines:[{...line,code:null}]})).length,4);});   // se informan todas las dudas
test('products are matched by exact unit code or reference; archived products and missing prices are handled',()=>{
 const line=reading().lines[0];let a=autoInvoice(reading({lines:[{...line,code:'ARR-001',price:null}]}),seedWorkspace(),[],doc);assert.ok(a.ok);if(a.ok)assert.deepEqual(a.command.lines,[{productId:'p1',quantity:'8'}]);
 const s=seedWorkspace();s.products[0].archived=true;a=autoInvoice(reading(),s,[],doc);assert.equal(a.ok,false);});
test('mail permissions are off by default and older stored authority still parses',()=>{
 assert.deepEqual([noAuthority.readMail,noAuthority.registerInvoices],[false,false]);
 const parsed=commandSchema.parse({type:'agentAuthority',authority:{validateReceipts:true,acceptProposals:false,validateInvoices:false,allowUnverifiedPrice:false}});
 assert.ok(parsed.type==='agentAuthority'&&parsed.authority.readMail===false&&parsed.authority.registerInvoices===false);});
