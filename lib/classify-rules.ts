import Decimal from 'decimal.js';
import {z} from 'zod';
import type {Clasificacion} from './prompts/clasificador-documentos';
// Reglas deterministas del clasificador (R3 y R4, docs/requisitos-clasificacion.md). Sin base de datos ni red:
// la IA propone y estas reglas deciden el estado final. Ante la duda, DUDOSO.
export const estados=['PENDIENTE_CLASIFICACION','FACTURA','ALBARAN','DUDOSO','DESCARTADO'] as const;
export type Estado=typeof estados[number];
export type Kind='invoice'|'delivery_note'|'credit_note';
/** Estados que la interfaz puede listar: todo menos lo que aún no ha pasado por el clasificador. */
export const estadosVisibles=estados.filter(e=>e!=='PENDIENTE_CLASIFICACION');
/** Único estado con el que un documento puede contar para conciliar. */
export const concilia=(estado:Estado)=>estado==='FACTURA'||estado==='ALBARAN';
export const estadoDe=(kind:Kind):Estado=>kind==='delivery_note'?'ALBARAN':'FACTURA';

export const umbralesSchema=z.object({factura:z.number().min(0.5).max(1),albaran:z.number().min(0.5).max(1),descartado:z.number().min(0.5).max(1)});
export type Umbrales=z.infer<typeof umbralesSchema>;
export const umbralesIniciales:Umbrales={factura:0.85,albaran:0.85,descartado:0.85};

export type Decision={estado:Exclude<Estado,'PENDIENTE_CLASIFICACION'>;kind:Kind;motivo:string;faltan:string[]};
const kindDe=(c:Clasificacion):Kind=>c.clase==='albaran'||(c.clase==='ninguna'&&c.estado==='ALBARAN')?'delivery_note':c.clase==='abono'?'credit_note':'invoice';
const D=(v:string|null)=>{try{return v===null?null:new Decimal(v);}catch{return null;}};

/** Estado final de un documento a partir de la respuesta (ya validada) de la IA. */
export function decidirEstado(c:Clasificacion,u:Umbrales=umbralesIniciales):Decision{
 const d=c.datos,kind=kindDe(c),motivo=c.motivo.trim()||'Sin motivo indicado.';
 const dudoso=(why:string,faltan:string[]=c.campos_faltantes):Decision=>({estado:'DUDOSO',kind,motivo:why,faltan});
 if(c.partes.length>1)return dudoso('El archivo contiene varios documentos.');
 if(c.estado==='DESCARTADO')return c.confianza>=u.descartado?{estado:'DESCARTADO',kind,motivo,faltan:[]}:dudoso(`Podría no ser una factura ni un albarán, pero no es seguro: ${motivo}`);
 if(c.estado==='DUDOSO')return dudoso(motivo);
 if(/pro[\s-]?forma/i.test(c.tipo_documento))return dudoso('Es una factura proforma: no es una factura definitiva.');
 if(c.coincide_con_plantilla==='no')return dudoso('El formato no coincide con la plantilla guardada de este proveedor. Revísalo: al validarlo se actualizará la plantilla.');
 if(c.estado==='FACTURA'){
  if(kind==='delivery_note')return dudoso('La IA lo da por factura pero lo describe como albarán.');
  const faltan=[!d.number&&'número de factura',!d.date&&'fecha',!d.supplier&&'emisor',!d.supplierTaxId&&'NIF del emisor',!d.total&&'total',kind==='invoice'&&!d.lines.length&&'líneas'].filter(Boolean) as string[];
  if(faltan.length)return dudoso('Faltan datos esenciales de la factura: '+faltan.join(', ')+'.',faltan);
  const sub=D(d.subtotal),tax=D(d.tax),total=D(d.total);
  if(sub&&tax&&total&&sub.plus(tax).minus(total).abs().gt('0.02'))return dudoso('Los importes no cuadran: base más impuestos no da el total.');
  if(c.confianza<u.factura)return dudoso(`Parece una factura, pero con poca seguridad: ${motivo}`);
  return {estado:'FACTURA',kind,motivo,faltan:[]};}
 // ALBARAN
 if(kind!=='delivery_note')return dudoso('La IA lo da por albarán pero lo describe como factura.');
 const faltan=[!d.number&&'número de albarán',!d.date&&'fecha',!d.supplier&&'proveedor',!d.lines.length&&'líneas con cantidades'].filter(Boolean) as string[];
 if(faltan.length)return dudoso('Faltan datos esenciales del albarán: '+faltan.join(', ')+'.',faltan);
 if(c.confianza<u.albaran)return dudoso(`Parece un albarán, pero con poca seguridad: ${motivo}`);
 return {estado:'ALBARAN',kind,motivo,faltan:[]};}

/** Tipos de fallo de la lectura con IA. «budget» (límite diario), «config» (clave) y «busy» no son errores de clasificación. */
export type ReadFailure='budget'|'config'|'busy'|'ai';
export const maxIntentos=2;
/**
 * Estado tras un fallo de la IA. Nunca FACTURA, ALBARAN ni DESCARTADO: o sigue pendiente (oculto, con contador)
 * o, agotados los reintentos de un error real, queda DUDOSO con motivo «error de clasificación».
 */
export function estadoTrasError(failure:ReadFailure,intentos:number):'PENDIENTE_CLASIFICACION'|'DUDOSO'{
 return failure==='ai'&&intentos>=maxIntentos?'DUDOSO':'PENDIENTE_CLASIFICACION';}
export const motivoError='Error de clasificación';
