// Datos de compras leídos de Odoo, traducidos a una forma estable para la app. Sin red ni dependencias:
// lo usan el servidor (lib/odoo.ts), las vistas y las pruebas. Las cantidades y los importes viajan como texto
// con decimales fijos para no arrastrar errores de coma flotante hasta la conciliación.
export type OdooKind='orders'|'receipts'|'bills'|'suppliers';
export type OrderLine={id:number;productId:number|null;productRef:string;product:string;description:string;ordered:string;received:string;invoiced:string;pending:string;price:string;uom:string};
export type PurchaseOrder={id:number;name:string;supplierId:number|null;supplier:string;supplierRef:string;date:string|null;planned:string|null;total:string;currency:string;receiptStatus:'pending'|'partial'|'full';invoiceStatus:string;ordered:string;received:string;pending:string;lines:OrderLine[]};
export type OdooReceipt={id:number;name:string;supplierId:number|null;supplier:string;origin:string;state:string;scheduled:string|null;done:string|null;orderId:number|null};
export type OdooBill={id:number;name:string;ref:string;supplierId:number|null;supplier:string;date:string|null;due:string|null;state:string;paymentState:string;total:string;untaxed:string;currency:string;origin:string;type:'invoice'|'refund'};
export type OdooSupplier={id:number;name:string;vat:string;ref:string};
type Row=Record<string,unknown>;
const text=(v:unknown)=>typeof v==='string'?v.trim():'';
const m2o=(v:unknown)=>Array.isArray(v)&&v.length?{id:Number(v[0])||null,name:text(v[1])}:{id:null,name:''};
// Odoo antepone la referencia interna al nombre: «[REF] Nombre». Aquí solo interesa el nombre.
const productName=(v:unknown)=>m2o(v).name.replace(/^\[[^\]]*\]\s*/,'');
const productRef=(v:unknown)=>/^\[([^\]]+)\]/.exec(m2o(v).name)?.[1].trim()||'';
/** Número de Odoo → texto con decimales fijos, sin notación científica. */
export function fixed(v:unknown,decimals:number){const raw=typeof v==='number'?v:Number(v),n=Number.isFinite(raw)?raw:0;const s=n.toFixed(decimals);return decimals?s.replace(/0+$/,'').replace(/\.$/,'')||'0':s;}
const money=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?n.toFixed(2):'0.00';};
/** Fecha u hora de Odoo (UTC, «YYYY-MM-DD[ HH:MM:SS]») → ISO, o null si no hay. */
export function odooDate(v:unknown):string|null{const s=text(v);if(!s)return null;if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;const m=/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(s);return m?`${m[1]}T${m[2]}Z`:null;}
const sum=(values:string[])=>fixed(values.reduce((a,v)=>a+Number(v),0),3);
export function normalizeOrders(orders:Row[],lines:Row[]):PurchaseOrder[]{
 const byOrder=new Map<number,OrderLine[]>();
 for(const l of lines){
  if(l.display_type)continue;                       // secciones y notas del pedido: no son mercancía
  const orderId=m2o(l.order_id).id;if(!orderId)continue;
  const ordered=Number(l.product_qty)||0,received=Number(l.qty_received)||0;
  const line:OrderLine={id:Number(l.id),productId:m2o(l.product_id).id,productRef:productRef(l.product_id),product:productName(l.product_id)||text(l.name),description:text(l.name),ordered:fixed(ordered,3),received:fixed(received,3),invoiced:fixed(l.qty_invoiced,3),pending:fixed(Math.max(0,ordered-received),3),price:fixed(l.price_unit,4),uom:m2o(l.product_uom_id).name||m2o(l.product_uom).name};
  byOrder.set(orderId,[...(byOrder.get(orderId)||[]),line]);
 }
 return orders.map(o=>{const id=Number(o.id),ls=byOrder.get(id)||[],pending=sum(ls.map(l=>l.pending)),received=sum(ls.map(l=>l.received));
  // Si Odoo no expone el estado de recepción, se deduce de las líneas.
  const declared=text(o.receipt_status),status=declared==='pending'||declared==='partial'||declared==='full'?declared:Number(pending)===0?'full':Number(received)>0?'partial':'pending';
  return {id,name:text(o.name),supplierId:m2o(o.partner_id).id,supplier:m2o(o.partner_id).name,supplierRef:text(o.partner_ref),date:odooDate(o.date_order),planned:odooDate(o.date_planned),total:money(o.amount_total),currency:m2o(o.currency_id).name||'EUR',receiptStatus:status,invoiceStatus:text(o.invoice_status),ordered:sum(ls.map(l=>l.ordered)),received,pending,lines:ls};});
}
export const pendingOrders=(orders:PurchaseOrder[])=>orders.filter(o=>o.receiptStatus!=='full'&&o.lines.length>0);
export function normalizeReceipts(rows:Row[]):OdooReceipt[]{return rows.map(r=>({id:Number(r.id),name:text(r.name),supplierId:m2o(r.partner_id).id,supplier:m2o(r.partner_id).name,origin:text(r.origin),state:text(r.state),scheduled:odooDate(r.scheduled_date),done:odooDate(r.date_done),orderId:m2o(r.purchase_id).id}));}
export function normalizeBills(rows:Row[]):OdooBill[]{return rows.map(r=>({id:Number(r.id),name:text(r.name)==='/'?'':text(r.name),ref:text(r.ref),supplierId:m2o(r.partner_id).id,supplier:m2o(r.partner_id).name,date:odooDate(r.invoice_date),due:odooDate(r.invoice_date_due),state:text(r.state),paymentState:text(r.payment_state),total:money(r.amount_total),untaxed:money(r.amount_untaxed),currency:m2o(r.currency_id).name||'EUR',origin:text(r.invoice_origin),type:r.move_type==='in_refund'?'refund' as const:'invoice' as const}));}
export function normalizeSuppliers(rows:Row[]):OdooSupplier[]{return rows.map(r=>({id:Number(r.id),name:text(r.name),vat:text(r.vat),ref:text(r.ref)})).filter(s=>s.name);}
/** De los campos que queremos leer, los que existen en esa versión de Odoo (los nombres cambian entre versiones). */
export const availableFields=(wanted:string[],existing:Iterable<string>)=>{const have=new Set(existing);return wanted.filter(f=>have.has(f));};
export const receiptStateLabel:Record<string,string>={draft:'Borrador',waiting:'Esperando',confirmed:'En espera',assigned:'Preparada',done:'Hecha',cancel:'Cancelada'};
export const billStateLabel:Record<string,string>={draft:'Borrador',posted:'Publicada',cancel:'Cancelada'};
export const paymentLabel:Record<string,string>={not_paid:'Sin pagar',in_payment:'En proceso de pago',paid:'Pagada',partial:'Pago parcial',reversed:'Revertida',blocked:'Bloqueada'};
// ---- Datos de ejemplo para la demostración (no proceden de ningún Odoo real) ----
export function demoOdoo(){
 const orders=normalizeOrders([
  {id:1,name:'P00412',partner_id:[7,'Distribuciones Atlántico'],partner_ref:'OF-8841',date_order:'2026-11-10 09:14:00',date_planned:'2026-11-14 08:00:00',amount_total:412.5,currency_id:[1,'EUR'],receipt_status:'partial',invoice_status:'no'},
  {id:2,name:'P00418',partner_id:[7,'Distribuciones Atlántico'],partner_ref:'',date_order:'2026-11-13 11:02:00',date_planned:'2026-11-19 08:00:00',amount_total:186,currency_id:[1,'EUR'],receipt_status:'pending',invoice_status:'no'},
  {id:3,name:'P00421',partner_id:[9,'Equipamiento Norte'],partner_ref:'EN-2026-311',date_order:'2026-11-15 16:40:00',date_planned:'2026-11-24 08:00:00',amount_total:1290,currency_id:[1,'EUR'],receipt_status:'pending',invoice_status:'no'},
 ],[
  {id:11,order_id:[1,'P00412'],product_id:[1,'[ARR-001] Arroz redondo · 1 kg'],name:'Arroz redondo 1 kg',product_qty:200,qty_received:120,qty_invoiced:0,price_unit:1.25,product_uom_id:[1,'Unidades']},
  {id:12,order_id:[1,'P00412'],product_id:[2,'[ACE-001] Aceite de oliva · 1 l'],name:'Aceite de oliva 1 l',product_qty:30,qty_received:30,qty_invoiced:0,price_unit:5.9,product_uom_id:[1,'Unidades']},
  {id:21,order_id:[2,'P00418'],product_id:[2,'[ACE-001] Aceite de oliva · 1 l'],name:'Aceite de oliva 1 l',product_qty:24,qty_received:0,qty_invoiced:0,price_unit:5.9,product_uom_id:[1,'Unidades']},
  {id:22,order_id:[2,'P00418'],product_id:false,name:'Envío',display_type:'line_note'},
  {id:31,order_id:[3,'P00421'],product_id:[3,'[BAL-001] Balanza de sobremesa'],name:'Balanza de sobremesa',product_qty:6,qty_received:0,qty_invoiced:0,price_unit:215,product_uom_id:[1,'Unidades']},
 ]);
 const receipts=normalizeReceipts([
  {id:1,name:'WH/IN/00231',partner_id:[7,'Distribuciones Atlántico'],origin:'P00412',state:'done',scheduled_date:'2026-11-14 08:00:00',date_done:'2026-11-14 10:21:00',purchase_id:[1,'P00412']},
  {id:2,name:'WH/IN/00236',partner_id:[7,'Distribuciones Atlántico'],origin:'P00412',state:'assigned',scheduled_date:'2026-11-18 08:00:00',date_done:false,purchase_id:[1,'P00412']},
  {id:3,name:'WH/IN/00238',partner_id:[7,'Distribuciones Atlántico'],origin:'P00418',state:'assigned',scheduled_date:'2026-11-19 08:00:00',date_done:false,purchase_id:[2,'P00418']},
  {id:4,name:'WH/IN/00225',partner_id:[9,'Equipamiento Norte'],origin:'P00399',state:'done',scheduled_date:'2026-11-06 08:00:00',date_done:'2026-11-06 12:02:00',purchase_id:[8,'P00399']},
 ]);
 const bills=normalizeBills([
  {id:1,name:'FACTU/2026/11/0031',ref:'F-2026-0298',partner_id:[7,'Distribuciones Atlántico'],invoice_date:'2026-11-12',invoice_date_due:'2026-12-12',state:'posted',payment_state:'not_paid',amount_total:320.4,amount_untaxed:264.8,currency_id:[1,'EUR'],invoice_origin:'P00399',move_type:'in_invoice'},
  {id:2,name:'/',ref:'A-771',partner_id:[9,'Equipamiento Norte'],invoice_date:'2026-11-15',invoice_date_due:'2026-12-15',state:'draft',payment_state:'not_paid',amount_total:1290,amount_untaxed:1066.12,currency_id:[1,'EUR'],invoice_origin:'P00421',move_type:'in_invoice'},
  {id:3,name:'RFACTU/2026/11/0004',ref:'AB-118',partner_id:[7,'Distribuciones Atlántico'],invoice_date:'2026-11-09',invoice_date_due:false,state:'posted',payment_state:'paid',amount_total:36.3,amount_untaxed:30,currency_id:[1,'EUR'],invoice_origin:'',move_type:'in_refund'},
 ]);
 const suppliers=normalizeSuppliers([{id:7,name:'Distribuciones Atlántico',vat:'ESB00000000',ref:''},{id:9,name:'Equipamiento Norte',vat:'',ref:'EN'}]);
 return {orders,receipts,bills,suppliers};
}
