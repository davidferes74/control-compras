import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcile,type Doc,type DocLine,type Decisions} from '../lib/matching';
import {refMatches,supplierKey,similarity,normTaxId} from '../lib/normalize';

let n=0;
const line=(p:Partial<DocLine>):DocLine=>({id:'l'+(++n),position:n,code:'',description:'',quantity:null,unit:'ud',unitPrice:null,discountPct:null,amount:null,deliveryRef:'',...p});
const doc=(p:Partial<Doc>&Pick<Doc,'kind'|'number'>):Doc=>({id:'d'+(++n),supplier:'Frutas Pérez S.L.',supplierTaxId:'',date:'2026-11-10',deliveryRefs:[],subtotal:null,tax:null,total:null,lines:[],...p});
const kinds=(r:ReturnType<typeof reconcile>,id:string)=>r.invoices.get(id)!.discrepancies.map(d=>d.kind).sort();

test('normalización de referencias, proveedores y NIF',()=>{
 assert.ok(refMatches('ALB-00123','alb 123'));
 assert.ok(refMatches('A-123','123'));
 assert.ok(!refMatches('A-123','B-123'));
 assert.ok(!refMatches('12','A12'),'menos de 3 dígitos no se compara solo por números');
 assert.equal(supplierKey('Frutas Pérez, S.L.'),supplierKey('FRUTAS PEREZ SL'));
 assert.equal(normTaxId('ES B12345678'),'B12345678');
 assert.ok(similarity('Tomate pera 5 kg','Tomate pera caja 5 kg')>=0.6);
});

test('factura que cuadra exactamente con su albarán: Conforme',()=>{
 const a=doc({kind:'delivery_note',number:'ALB-1',lines:[line({code:'T01',description:'Tomate',quantity:'10',unitPrice:'1.20'}),line({code:'L02',description:'Lechuga',quantity:'5',unitPrice:'0.80'})]});
 const f=doc({kind:'invoice',number:'F-1',deliveryRefs:['ALB-1'],subtotal:'16.00',tax:'1.60',total:'17.60',lines:[line({code:'T01',description:'Tomate',quantity:'10',unitPrice:'1.20',amount:'12.00'}),line({code:'L02',description:'Lechuga',quantity:'5',unitPrice:'0.80',amount:'4.00'})]});
 const r=reconcile([a,f]);
 assert.equal(r.invoices.get(f.id)!.status,'ok');
 assert.deepEqual(kinds(r,f.id),[]);
 assert.equal(r.invoices.get(f.id)!.prices,'ok');
 assert.equal(r.deliveries.get(a.id)!.status,'invoiced');
});

test('cantidad facturada mayor que la entregada y precio distinto',()=>{
 const a=doc({kind:'delivery_note',number:'ALB-2',lines:[line({code:'T01',description:'Tomate',quantity:'10',unitPrice:'1.20'})]});
 const f=doc({kind:'invoice',number:'F-2',deliveryRefs:['ALB-2'],lines:[line({code:'T01',description:'Tomate',quantity:'12',unitPrice:'1.25',amount:'15.00'})]});
 const r=reconcile([a,f]);
 assert.equal(r.invoices.get(f.id)!.status,'diff');
 assert.deepEqual(kinds(r,f.id),['over_invoiced','price']);
});

test('albarán citado que no existe y línea sin albarán: Falta albarán',()=>{
 const f=doc({kind:'invoice',number:'F-3',deliveryRefs:['ALB-99'],lines:[line({code:'X',description:'Patata',quantity:'3'})]});
 const r=reconcile([f]);
 assert.equal(r.invoices.get(f.id)!.status,'missing');
 assert.deepEqual(kinds(r,f.id),['missing_delivery','no_delivery']);
});

test('una factura con dos albaranes y un albarán repartido en dos facturas',()=>{
 const a1=doc({kind:'delivery_note',number:'A-100',date:'2026-11-01',lines:[line({code:'P',description:'Pan',quantity:'60'})]});
 const a2=doc({kind:'delivery_note',number:'A-101',date:'2026-11-02',lines:[line({code:'P',description:'Pan',quantity:'40'})]});
 const a3=doc({kind:'delivery_note',number:'A-102',date:'2026-11-03',lines:[line({code:'P',description:'Pan',quantity:'50'})]});
 const f1=doc({kind:'invoice',number:'F-10',date:'2026-11-05',deliveryRefs:['A-100','A-101','A-102'],lines:[line({code:'P',description:'Pan',quantity:'120'})]});
 const f2=doc({kind:'invoice',number:'F-11',date:'2026-11-06',deliveryRefs:['A-102'],lines:[line({code:'P',description:'Pan',quantity:'30'})]});
 const r=reconcile([a1,a2,a3,f1,f2]);
 assert.equal(r.invoices.get(f1.id)!.status,'ok');
 assert.equal(r.invoices.get(f2.id)!.status,'ok');
 assert.equal(r.deliveries.get(a3.id)!.status,'invoiced');
 assert.deepEqual(r.deliveries.get(a3.id)!.invoiceIds.sort(),[f1.id,f2.id].sort());
});

test('el mismo albarán facturado dos veces se detecta',()=>{
 const a=doc({kind:'delivery_note',number:'A-200',lines:[line({code:'P',description:'Pan',quantity:'10'})]});
 const f1=doc({kind:'invoice',number:'F-20',date:'2026-11-11',deliveryRefs:['A-200'],lines:[line({code:'P',description:'Pan',quantity:'10'})]});
 const f2=doc({kind:'invoice',number:'F-21',date:'2026-11-12',deliveryRefs:['A-200'],lines:[line({code:'P',description:'Pan',quantity:'10'})]});
 const r=reconcile([a,f1,f2]);
 assert.equal(r.invoices.get(f1.id)!.status,'ok');
 assert.equal(r.invoices.get(f2.id)!.status,'diff');
 assert.ok(kinds(r,f2.id).includes('already_invoiced'));
});

test('lo entregado y no facturado se avisa sin cambiar el estado de la factura',()=>{
 const a=doc({kind:'delivery_note',number:'A-300',lines:[line({code:'P',description:'Pan',quantity:'10'}),line({code:'Q',description:'Queso',quantity:'2'})]});
 const f=doc({kind:'invoice',number:'F-30',deliveryRefs:['A-300'],lines:[line({code:'P',description:'Pan',quantity:'10'})]});
 const r=reconcile([a,f]);
 assert.equal(r.invoices.get(f.id)!.status,'ok');
 assert.deepEqual(kinds(r,f.id),['not_invoiced']);
 assert.equal(r.deliveries.get(a.id)!.status,'partial');
});

test('sin referencias se proponen albaranes por proveedor y fecha, y queda para revisar',()=>{
 const a=doc({kind:'delivery_note',number:'A-400',date:'2026-11-01',lines:[line({description:'Aceite oliva 5L',quantity:'4'})]});
 const old=doc({kind:'delivery_note',number:'A-001',date:'2026-01-01',lines:[line({description:'Aceite oliva 5L',quantity:'4'})]});
 const f=doc({kind:'invoice',number:'F-40',date:'2026-11-20',lines:[line({description:'Aceite oliva 5L',quantity:'4'})]});
 const r=reconcile([a,old,f]);
 const m=r.invoices.get(f.id)!;
 assert.equal(m.status,'review');
 assert.deepEqual(m.deliveryNoteIds,[a.id],'el albarán de hace más de 90 días no se propone');
});

test('otro proveedor nunca se mezcla, aunque coincida el número de albarán',()=>{
 const a=doc({kind:'delivery_note',number:'A-500',supplier:'Otro proveedor SA',lines:[line({code:'P',description:'Pan',quantity:'10'})]});
 const f=doc({kind:'invoice',number:'F-50',deliveryRefs:['A-500'],lines:[line({code:'P',description:'Pan',quantity:'10'})]});
 assert.equal(reconcile([a,f]).invoices.get(f.id)!.status,'missing');
});

test('mismo proveedor reconocido por NIF aunque el nombre cambie',()=>{
 const a=doc({kind:'delivery_note',number:'A-600',supplier:'Distribuciones García',supplierTaxId:'B11111111',lines:[line({code:'P',description:'Pan',quantity:'1'})]});
 const f=doc({kind:'invoice',number:'F-60',supplier:'García Distribuciones SL',supplierTaxId:'ES-B11111111',deliveryRefs:['A-600'],lines:[line({code:'P',description:'Pan',quantity:'1'})]});
 assert.equal(reconcile([a,f]).invoices.get(f.id)!.status,'ok');
});

test('descuento, importe mal calculado y totales',()=>{
 const a=doc({kind:'delivery_note',number:'A-700',lines:[line({code:'C',description:'Café',quantity:'10',unitPrice:'10',discountPct:'10'})]});
 const f=doc({kind:'invoice',number:'F-70',deliveryRefs:['A-700'],subtotal:'95.00',tax:'9.00',total:'100.00',lines:[line({code:'C',description:'Café',quantity:'10',unitPrice:'10',discountPct:'10',amount:'95.00'})]});
 const r=reconcile([a,f]);
 assert.deepEqual(kinds(r,f.id),['amount','totals']);
 assert.equal(r.invoices.get(f.id)!.prices,'ok','precio neto 9 € igual en ambos');
});

test('albarán sin precios: precio no verificable, no se da por bueno ni malo',()=>{
 const a=doc({kind:'delivery_note',number:'A-800',lines:[line({code:'P',description:'Pan',quantity:'1'})]});
 const f=doc({kind:'invoice',number:'F-80',deliveryRefs:['A-800'],lines:[line({code:'P',description:'Pan',quantity:'1',unitPrice:'2',amount:'2'})]});
 const m=reconcile([a,f]).invoices.get(f.id)!;
 assert.equal(m.status,'ok');assert.equal(m.prices,'unverifiable');
});

test('descripción parecida empareja pero pide revisión; portes no se comparan',()=>{
 const a=doc({kind:'delivery_note',number:'A-900',lines:[line({description:'Tomate pera caja 5 kg',quantity:'2'})]});
 const f=doc({kind:'invoice',number:'F-90',deliveryRefs:['A-900'],lines:[line({description:'Tomate pera 5 kg',quantity:'2'}),line({description:'Portes',amount:'6.00'})]});
 const r=reconcile([a,f]);
 assert.equal(r.invoices.get(f.id)!.status,'review');
 assert.deepEqual(kinds(r,f.id),['charge','similar']);
});

test('una diferencia aceptada con motivo deja de contar; si cambian los datos vuelve a contar',()=>{
 const a=doc({kind:'delivery_note',number:'A-1000',lines:[line({code:'T',description:'Tomate',quantity:'10',unitPrice:'1'})]});
 const f=doc({kind:'invoice',number:'F-100',deliveryRefs:['A-1000'],lines:[line({code:'T',description:'Tomate',quantity:'10',unitPrice:'1.10'})]});
 const first=reconcile([a,f]).invoices.get(f.id)!;assert.equal(first.status,'diff');
 const decisions:Decisions=new Map([[f.id,new Map([[first.discrepancies[0].key,{reason:'Subida de tarifa pactada',at:'2026-11-17'}]])]]);
 assert.equal(reconcile([a,f],decisions).invoices.get(f.id)!.status,'ok');
 f.lines[0].unitPrice='1.30';
 assert.equal(reconcile([a,f],decisions).invoices.get(f.id)!.status,'diff');
});

test('la línea indica su albarán y se consume primero ese',()=>{
 const a1=doc({kind:'delivery_note',number:'A-1',date:'2026-11-01',lines:[line({code:'P',description:'Pan',quantity:'5'})]});
 const a2=doc({kind:'delivery_note',number:'A-2',date:'2026-11-02',lines:[line({code:'P',description:'Pan',quantity:'5'})]});
 const f=doc({kind:'invoice',number:'F-1',deliveryRefs:['A-1','A-2'],lines:[line({code:'P',description:'Pan',quantity:'5',deliveryRef:'A-2'})]});
 const r=reconcile([a1,a2,f]);
 assert.equal(r.invoices.get(f.id)!.pairs[0].deliveryNoteId,a2.id);
 assert.equal(r.deliveries.get(a1.id)!.status,'pending');
});

test('ceros a la izquierda en cualquier tramo del número: F-2026-77 es F-2026-0077',()=>{
 assert.ok(refMatches('F-2026-77','F-2026-0077'));
 assert.ok(refMatches('ALB-0100','ALB 100'));
 assert.ok(!refMatches('F-2026-77','F-2026-770'));
});

test('sin albaranes citados: propone solo la combinación que cuadra al 100 % y queda «Lista para validar»',()=>{
 const a1=doc({kind:'delivery_note',number:'A-1',date:'2026-11-02',lines:[line({code:'T01',description:'Tomate',quantity:'10'})]});
 const a2=doc({kind:'delivery_note',number:'A-2',date:'2026-11-05',lines:[line({code:'L02',description:'Lechuga',quantity:'5'})]});
 const otro=doc({kind:'delivery_note',number:'A-3',date:'2026-11-06',lines:[line({code:'P03',description:'Pepino',quantity:'7'})]});
 const f=doc({kind:'invoice',number:'F-9',date:'2026-11-10',lines:[line({code:'T01',description:'Tomate',quantity:'10'}),line({code:'L02',description:'Lechuga',quantity:'5'})]});
 const m=reconcile([a1,a2,otro,f]).invoices.get(f.id)!;
 assert.deepEqual(m.deliveryNoteIds,[a1.id,a2.id],'el albarán que no casa no se propone');
 assert.equal(m.exact,true);assert.equal(m.ready,true);assert.equal(m.status,'review');
 const p=m.discrepancies.find(d=>d.kind==='proposed')!;assert.match(p.message,/cuadra al 100 %.*A-1, A-2/);
 // Al validar la propuesta (aceptarla con motivo) queda Conforme y deja de estar «lista».
 const decisions:Decisions=new Map([[f.id,new Map([[p.key,{reason:'Validado',at:'2026-11-19'}]])]]);
 const v=reconcile([a1,a2,otro,f],decisions).invoices.get(f.id)!;assert.equal(v.status,'ok');assert.equal(v.ready,false);
});

test('la factura llega antes que el albarán: se propone un albarán de hasta 15 días después',()=>{
 const f=doc({kind:'invoice',number:'F-10',date:'2026-11-10',lines:[line({code:'T01',description:'Tomate',quantity:'10'})]});
 const tarde=doc({kind:'delivery_note',number:'A-7',date:'2026-11-20',lines:[line({code:'T01',description:'Tomate',quantity:'10'})]});
 assert.equal(reconcile([f]).invoices.get(f.id)!.status,'missing','sin albarán todavía');
 const m=reconcile([f,tarde]).invoices.get(f.id)!;assert.equal(m.ready,true);assert.deepEqual(m.deliveryNoteIds,[tarde.id]);
 const muyTarde=doc({kind:'delivery_note',number:'A-8',date:'2026-12-20',lines:[line({code:'T01',description:'Tomate',quantity:'10'})]});
 assert.equal(reconcile([f,muyTarde]).invoices.get(f.id)!.proposed,false,'más de 15 días después no se propone');
});

test('propuesta que no cuadra al 100 %: no queda lista para validar',()=>{
 const a=doc({kind:'delivery_note',number:'A-1',date:'2026-11-02',lines:[line({code:'T01',description:'Tomate',quantity:'8'})]});
 const f=doc({kind:'invoice',number:'F-11',date:'2026-11-10',lines:[line({code:'T01',description:'Tomate',quantity:'10'})]});
 const m=reconcile([a,f]).invoices.get(f.id)!;assert.equal(m.exact,false);assert.equal(m.ready,false);assert.notEqual(m.status,'ok');
 // Albarán con más de lo facturado: tampoco es 100 %.
 const b=doc({kind:'delivery_note',number:'A-2',date:'2026-11-02',lines:[line({code:'T01',description:'Tomate',quantity:'12'})]});
 assert.equal(reconcile([b,f]).invoices.get(f.id)!.ready,false);
 // Precio distinto (ambos valorados): tampoco.
 const c=doc({kind:'delivery_note',number:'A-3',date:'2026-11-02',lines:[line({code:'T01',description:'Tomate',quantity:'10',unitPrice:'1.00'})]});
 const fp=doc({kind:'invoice',number:'F-12',date:'2026-11-10',lines:[line({code:'T01',description:'Tomate',quantity:'10',unitPrice:'1.50',amount:'15.00'})]});
 assert.equal(reconcile([c,fp]).invoices.get(fp.id)!.ready,false);
 // Emparejamiento solo por descripción parecida: no es 100 %.
 const s=doc({kind:'delivery_note',number:'A-4',date:'2026-11-02',lines:[line({description:'Tomate pera caja 5 kg',quantity:'10'})]});
 const fs=doc({kind:'invoice',number:'F-13',date:'2026-11-10',lines:[line({description:'Tomate pera 5 kg',quantity:'10'})]});
 assert.equal(reconcile([s,fs]).invoices.get(fs.id)!.ready,false);
});

test('factura que cita sus albaranes: no cambia (Conforme sin validar propuesta)',()=>{
 const a=doc({kind:'delivery_note',number:'A-1',lines:[line({code:'T01',description:'Tomate',quantity:'10'})]});
 const f=doc({kind:'invoice',number:'F-14',deliveryRefs:['A-1'],lines:[line({code:'T01',description:'Tomate',quantity:'10'})]});
 const m=reconcile([a,f]).invoices.get(f.id)!;assert.equal(m.status,'ok');assert.equal(m.proposed,false);assert.equal(m.ready,false);
});
