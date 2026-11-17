import Decimal from 'decimal.js';
import type {OrderLine,PurchaseOrder} from './odoo-data';
import type {Product,Receipt,Workspace} from './types';
// Recepción contra un pedido de compra de Odoo. Todo aquí es cálculo exacto y sin red.
// Odoo no sabe lo que se ha recibido en la app hasta que se escriba la entrada, así que lo pendiente real
// de cada producto es: pendiente en Odoo − lo ya recibido (o en curso) en la app para ese pedido.
/** Producto del catálogo que corresponde a una línea del pedido: por su id de Odoo o, si no, por referencia exacta. */
export function productForLine(line:Pick<OrderLine,'productId'|'productRef'>,products:Product[]):Product|null{
 const active=products.filter(p=>!p.archived);
 if(line.productId!==null){const linked=active.find(p=>p.source==='odoo'&&p.externalId===String(line.productId));if(linked)return linked;}
 if(line.productRef){const same=active.filter(p=>p.sku===line.productRef);if(same.length===1)return same[0];}
 return null;
}
/** Cantidad que una recepción de la app ya cubre de un producto: lo recibido si está cerrada; lo esperado si sigue abierta. */
const covered=(r:Receipt,productId:string)=>r.lines.filter(l=>l.productId===productId).reduce((a,l)=>a.plus(r.status==='confirmed'||r.status==='exceptions'?l.received:Decimal.max(l.expected,l.received)),new Decimal(0));
export const receiptsForOrder=(state:Pick<Workspace,'receipts'>,orderId:number)=>state.receipts.filter(r=>r.order?.id===orderId);
export type ReceivableLine={key:string;product:Product|null;name:string;orderLineIds:number[];price:string;uom:string;ordered:string;pendingInOdoo:string;inApp:string;pending:string};
/** Líneas que se pueden recibir de un pedido, agrupadas por producto (un pedido puede repetir un producto en varias líneas). */
export function receivableLines(order:PurchaseOrder,state:Pick<Workspace,'products'|'receipts'>):ReceivableLine[]{
 const groups=new Map<string,{product:Product|null;lines:OrderLine[]}>();
 for(const l of order.lines){const product=productForLine(l,state.products),key=product?product.id:'odoo-line-'+l.id;const g=groups.get(key)||{product,lines:[]};g.lines.push(l);groups.set(key,g);}
 const mine=receiptsForOrder(state,order.id);
 return [...groups.entries()].map(([key,g])=>{const sum=(f:(l:OrderLine)=>string)=>g.lines.reduce((a,l)=>a.plus(f(l)),new Decimal(0));
  const pendingInOdoo=sum(l=>l.pending),inApp=g.product?mine.reduce((a,r)=>a.plus(covered(r,g.product!.id)),new Decimal(0)):new Decimal(0);
  return {key,product:g.product,name:g.product?.name||g.lines[0].product,orderLineIds:g.lines.map(l=>l.id),price:g.lines[0].price,uom:g.lines[0].uom,ordered:sum(l=>l.ordered).toString(),pendingInOdoo:pendingInOdoo.toString(),inApp:inApp.toString(),pending:Decimal.max(0,pendingInOdoo.minus(inApp)).toString()};});
}
