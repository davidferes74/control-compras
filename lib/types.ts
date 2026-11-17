export type Tracking = 'none'|'lot'|'serial';
export type Product = {id:string; name:string; sku:string; code:string; unit:string; tracking:Tracking; packCode?:string; packQuantity?:string; source?:'odoo'; externalId?:string; archived?:boolean};
export type Line = {id:string; productId:string; expected:string; received:string; lot?:string; price?:string; confirmed?:string; orderLineIds?:number[]};
export type Receipt = {id:string; supplier:string; reference:string; date:string; status:'open'|'partial'|'confirmed'|'exceptions'; tracking:boolean; lines:Line[]; createdAt:string; closedAt?:string; closeReason?:string; partialAt?:string; fileIds:string[]; order?:{id:number;name:string}; validation?:Validation; agentHold?:boolean};
export type Invoice = {id:string; supplier:string; reference:string; date:string; receiptRefs:string[]; fileIds?:string[]; validation?:Validation; agentHold?:boolean; lines:{id:string; productId:string; quantity:string; price?:string}[]};
export type Scan = {id:string; receiptId:string; lineId:string; raw:string; quantity:string; lot?:string; serial?:string; profileId?:string; profileVersion?:number; reversed:boolean; confirmed?:boolean; evidenceId?:string; at:string};
export type Profile = {id:string; name:string; version:number; prefix:string; suffix:string; terminator:'Enter'|'Tab'; parser:'plain'|'gs1'|'delimited'; delimiter:string; codePosition:number; lotPosition:number; serialPosition:number; quantity:string; state:'draft'|'validated'; validatedDevice?:string; testedVersion?:number; testedCode?:string};
export type Allocation = {invoiceId:string; invoiceLineId:string; receiptId:string; lineId:string; quantity:string; basis?:'product'};
export type Audit = {id:string; at:string; action:string; message:string; by?:'agent'};
// Validación de una recepción o factura: quién la dio por buena y sobre qué datos. «signature» retrata lo validado;
// si esos datos cambian después, la validación deja de valer. «exception» = validada a pesar de una diferencia, con motivo.
export type Validation = {at:string; by:'human'|'agent'; note?:string; exception?:boolean; signature?:string};
// Lo que el agente puede hacer sin esperar a una persona. Todo apagado por defecto.
export type AgentAuthority = {validateReceipts:boolean; acceptProposals:boolean; validateInvoices:boolean; allowUnverifiedPrice:boolean; readMail?:boolean; registerInvoices?:boolean};
export type Issue = {id:string;receiptId:string;message:string;at:string;resolved:boolean;resolution?:string};
export type Workspace = {version:number; organization:string; tracking:boolean; products:Product[]; receipts:Receipt[]; invoices:Invoice[]; scans:Scan[]; profiles:Profile[]; allocations:Allocation[]; audit:Audit[]; issues:Issue[]; processed:string[]; agent?:AgentAuthority};
export type ParsedCode = {code:string; lot?:string; serial?:string; expiry?:string};
