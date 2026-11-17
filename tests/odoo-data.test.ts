import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOrders,pendingOrders,normalizeReceipts,normalizeBills,normalizeSuppliers,availableFields,fixed,odooDate,demoOdoo} from '../lib/odoo-data';
test('purchase order lines keep ordered, received and pending apart, and skip notes and sections',()=>{
 const [o]=normalizeOrders([{id:5,name:'P00010',partner_id:[3,'Proveedor'],partner_ref:'REF-1',date_order:'2026-11-10 09:14:00',date_planned:'2026-11-14 08:00:00',amount_total:412.5,currency_id:[1,'EUR'],receipt_status:'partial',invoice_status:'no'}],
  [{id:1,order_id:[5,'P00010'],product_id:[9,'[ARR-001] Arroz redondo'],name:'Arroz',product_qty:200,qty_received:120,qty_invoiced:0,price_unit:1.25,product_uom_id:[1,'Unidades']},
   {id:2,order_id:[5,'P00010'],product_id:false,name:'Sección',display_type:'line_section'},
   {id:3,order_id:[99,'OTRO'],product_id:[9,'x'],product_qty:1,qty_received:0}]);
 assert.equal(o.lines.length,1);assert.deepEqual([o.lines[0].product,o.lines[0].ordered,o.lines[0].received,o.lines[0].pending,o.lines[0].price,o.lines[0].uom],['Arroz redondo','200','120','80','1.25','Unidades']);
 assert.deepEqual([o.supplier,o.supplierRef,o.total,o.currency,o.receiptStatus,o.pending,o.date,o.planned],['Proveedor','REF-1','412.50','EUR','partial','80','2026-11-10T09:14:00Z','2026-11-14T08:00:00Z']);});
test('receipt status is deduced from the lines when Odoo does not expose it; over-receipt never shows negative pending',()=>{
 const line=(id:number,order:number,q:number,r:number)=>({id,order_id:[order,'x'],product_id:[1,'P'],product_qty:q,qty_received:r});
 const os=normalizeOrders([{id:1,name:'A'},{id:2,name:'B'},{id:3,name:'C'},{id:4,name:'D'}],[line(1,1,10,0),line(2,2,10,4),line(3,3,10,12),line(4,2,0.1,0.2)]);
 assert.deepEqual(os.map(o=>o.receiptStatus),['pending','partial','full','full']);assert.equal(os[2].pending,'0');assert.equal(os[1].pending,'6');
 assert.deepEqual(pendingOrders(os).map(o=>o.name),['A','B']);          // el completo y el que no tiene líneas no son «por recibir»
 assert.equal(os[0].supplier,'');assert.equal(os[0].date,null);});
test('older and newer Odoo unit-of-measure field names are both understood',()=>{
 const o=normalizeOrders([{id:1,name:'A'}],[{id:1,order_id:[1,'A'],product_id:[1,'P'],product_qty:1,qty_received:0,product_uom:[4,'kg']}])[0];assert.equal(o.lines[0].uom,'kg');
 assert.deepEqual(availableFields(['name','product_uom_id','product_uom','no_existe'],['id','name','product_uom']),['name','product_uom']);});
test('numbers from Odoo become fixed decimals without float noise or scientific notation',()=>{
 assert.equal(fixed(0.1+0.2,3),'0.3');assert.equal(fixed(1e-7,3),'0');assert.equal(fixed(120,3),'120');assert.equal(fixed('abc',3),'0');assert.equal(fixed(1234567.8916,3),'1234567.892');
 assert.equal(odooDate('2026-11-14'),'2026-11-14');assert.equal(odooDate(false),null);assert.equal(odooDate('no es fecha'),null);});
test('receipts, bills and suppliers are normalised with safe defaults',()=>{
 const r=normalizeReceipts([{id:1,name:'WH/IN/1',partner_id:false,origin:false,state:'done',scheduled_date:'2026-11-14 08:00:00',date_done:false,purchase_id:false}])[0];
 assert.deepEqual([r.supplier,r.origin,r.done,r.orderId,r.scheduled],['','',null,null,'2026-11-14T08:00:00Z']);
 const [draft,refund]=normalizeBills([{id:1,name:'/',ref:'A-1',partner_id:[2,'P'],invoice_date:'2026-11-15',state:'draft',amount_total:10,amount_untaxed:8.26,currency_id:false,move_type:'in_invoice'},{id:2,name:'RF/1',move_type:'in_refund',amount_total:'x'}]);
 assert.deepEqual([draft.name,draft.ref,draft.total,draft.untaxed,draft.currency,draft.type],['','A-1','10.00','8.26','EUR','invoice']);assert.equal(refund.type,'refund');assert.equal(refund.total,'0.00');
 assert.deepEqual(normalizeSuppliers([{id:1,name:' Uno ',vat:false},{id:2,name:false}]),[{id:1,name:'Uno',vat:'',ref:''}]);});
test('demo data is consistent and clearly not from a real Odoo',()=>{const d=demoOdoo();assert.equal(d.orders.length,3);assert.ok(d.orders.every(o=>o.lines.length>0));assert.equal(d.orders[0].pending,'80');assert.ok(d.bills.some(b=>b.type==='refund'));assert.ok(d.receipts.some(r=>r.state!=='done'));});
