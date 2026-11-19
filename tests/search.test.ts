import test from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import {searchMatches,type NoteCandidate} from '../lib/search';
import {reconcile,type Doc,type DocLine} from '../lib/matching';
import {ocrRef,fuzzyRefMatches} from '../lib/normalize';
// «Buscar coincidencias» (fase 2): propone albaranes con todas las variables, solo con datos guardados.

let n=0;
const line=(p:Partial<DocLine>):DocLine=>({id:'l'+(++n),position:n,code:'',description:'',quantity:null,unit:'ud',unitPrice:null,discountPct:null,amount:null,deliveryRef:'',...p});
const doc=(p:Partial<Doc>&Pick<Doc,'kind'|'number'>):Doc=>({id:'d'+(++n),supplier:'Frutas Pérez S.L.',supplierTaxId:'B12345678',date:'2026-11-10',deliveryRefs:[],subtotal:null,tax:null,total:null,lines:[],...p});
const full=(...docs:Doc[])=>new Map(docs.flatMap(d=>d.lines.map(l=>[l.id,new Decimal(l.quantity||0)] as [string,Decimal])));
const cand=(d:Doc,confirmed=true):NoteCandidate=>({doc:d,confirmed});

test('números mal leídos: O/0, I/1, Z/2, S/5, ceros a la izquierda',()=>{
 assert.equal(ocrRef('A-1Z3'),ocrRef('A-123'));assert.ok(fuzzyRefMatches('ALB-0O45','ALB-45'));assert.ok(fuzzyRefMatches('A-123','A-1Z3'));
 assert.ok(fuzzyRefMatches('ALB 2026/0148','ALB-2026-148'));assert.ok(fuzzyRefMatches('2026/O148','ALB-2026-148'));assert.ok(!fuzzyRefMatches('A-123','A-124'));
});

test('propone la combinación al 100 %, aunque el proveedor esté escrito distinto o falte, y marca los no confirmados',()=>{
 const f=doc({kind:'invoice',number:'F-1',lines:[line({code:'T01',description:'Tomate',quantity:'10'}),line({code:'L02',description:'Lechuga',quantity:'5'})]});
 const a=doc({kind:'delivery_note',number:'A-1',supplier:'FRUTAS PEREZ',supplierTaxId:'',lines:[line({code:'T01',description:'Tomate',quantity:'10'})]});
 const b=doc({kind:'delivery_note',number:'A-2',supplier:'',supplierTaxId:'',date:'2026-11-20',lines:[line({code:'L02',description:'Lechuga',quantity:'5'})]});
 const s=searchMatches(f,[cand(a),cand(b,false)],full(a,b));
 assert.equal(s[0].exact,true);assert.equal(s[0].pct,100);assert.deepEqual([...s[0].noteIds].sort(),[a.id,b.id].sort());assert.deepEqual(s[0].unconfirmed,[b.id]);
 assert.ok(s[0].reasons.some(r=>/sin proveedor/.test(r)));
});

test('parcial con porcentaje; otro NIF se descarta; número citado mal leído se propone',()=>{
 const f=doc({kind:'invoice',number:'F-2',deliveryRefs:['A-1Z3'],lines:[line({code:'T01',description:'Tomate',quantity:'10'})]});
 const parcial=doc({kind:'delivery_note',number:'A-9',lines:[line({code:'T01',description:'Tomate',quantity:'8'})]});
 const otro=doc({kind:'delivery_note',number:'X-1',supplierTaxId:'B99999999',lines:[line({code:'T01',description:'Tomate',quantity:'10'})]});
 const citado=doc({kind:'delivery_note',number:'A-123',lines:[line({code:'Z9',description:'Otra cosa',quantity:'1'})]});
 const s=searchMatches(f,[cand(parcial),cand(otro),cand(citado)],full(parcial,otro,citado));
 assert.ok(!s.some(x=>x.noteIds.includes(otro.id)),'otro proveedor (NIF distinto) no se propone');
 const p=s.find(x=>x.noteIds[0]===parcial.id)!;assert.equal(p.exact,false);assert.ok(p.pct>0&&p.pct<100);
 assert.ok(s.find(x=>x.noteIds[0]===citado.id)!.reasons.some(r=>/posible error de lectura/.test(r)));
});

test('fechas fuera de margen y albaranes ya asociados no se proponen',()=>{
 const f=doc({kind:'invoice',number:'F-3',date:'2026-11-10',lines:[line({code:'T01',description:'Tomate',quantity:'10'})]});
 const viejo=doc({kind:'delivery_note',number:'A-1',date:'2026-01-01',lines:[line({code:'T01',description:'Tomate',quantity:'10'})]});
 const ya=doc({kind:'delivery_note',number:'A-2',lines:[line({code:'T01',description:'Tomate',quantity:'10'})]});
 assert.deepEqual(searchMatches(f,[cand(viejo),cand(ya)],full(viejo,ya),new Set([ya.id])),[]);
});

test('vínculo manual: cuenta como citado, aunque el proveedor se leyera distinto y el número citado esté mal leído',()=>{
 const a=doc({kind:'delivery_note',number:'A-123',supplier:'Frutas P.',supplierTaxId:'',lines:[line({code:'T01',description:'Tomate',quantity:'10'})]});
 const f=doc({kind:'invoice',number:'F-4',deliveryRefs:['A-1Z3'],lines:[line({code:'T01',description:'Tomate',quantity:'10'})]});
 assert.equal(reconcile([a,f]).invoices.get(f.id)!.status,'missing','sin vínculo: falta el albarán citado');
 const m=reconcile([a,{...f,links:[a.id]}]).invoices.get(f.id)!;
 assert.equal(m.status,'ok');assert.deepEqual(m.linkedIds,[a.id]);assert.deepEqual(m.deliveryNoteIds,[a.id]);
 // Vínculo parcial: la factura queda con sus diferencias visibles.
 const b=doc({kind:'delivery_note',number:'B-1',lines:[line({code:'T01',description:'Tomate',quantity:'8'})]});
 const g=doc({kind:'invoice',number:'F-5',lines:[line({code:'T01',description:'Tomate',quantity:'10'})],links:[b.id]});
 const mg=reconcile([b,g]).invoices.get(g.id)!;assert.equal(mg.proposed,false);assert.ok(mg.discrepancies.some(d=>d.kind==='over_invoiced'));
});
