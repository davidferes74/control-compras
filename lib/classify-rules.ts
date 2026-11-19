import Decimal from 'decimal.js';
import {z} from 'zod';
import type {Clasificacion} from './prompts/clasificador-documentos';
import {normTaxId,supplierKey} from './normalize';
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

// «plantilla»: umbral de FACTURA para un proveedor conocido (plantilla validada por una persona, documento que coincide
// con ella y mismo NIF). Decisión del propietario, 19-11-2026. Nunca puede ser más exigente que «factura».
export const umbralesSchema=z.object({factura:z.number().min(0.5).max(1),albaran:z.number().min(0.5).max(1),descartado:z.number().min(0.5).max(1),plantilla:z.number().min(0.5).max(1)});
export type Umbrales=z.infer<typeof umbralesSchema>;
export const umbralesIniciales:Umbrales={factura:0.85,albaran:0.85,descartado:0.85,plantilla:0.70};
/** Plantilla validada del proveedor, tal como la necesitan las reglas (solo tipo y NIF). */
export type PlantillaRef={kind:string;supplierTaxId:string};

export type Decision={estado:Exclude<Estado,'PENDIENTE_CLASIFICACION'>;kind:Kind;motivo:string;faltan:string[]};
const kindDe=(c:Clasificacion):Kind=>c.clase==='albaran'||(c.clase==='ninguna'&&c.estado==='ALBARAN')?'delivery_note':c.clase==='abono'?'credit_note':'invoice';
const D=(v:string|null)=>{try{return v===null?null:new Decimal(v);}catch{return null;}};

/**
 * Proveedor conocido: hay una plantilla validada por una persona del mismo tipo de documento, la IA confirma que el
 * documento coincide con ella y el NIF leído es el de la plantilla. Solo entonces se aplica el umbral «plantilla».
 */
export function proveedorConocido(c:Clasificacion,kind:Kind,plantillas:PlantillaRef[]):boolean{
 const nif=normTaxId(c.datos.supplierTaxId||'');
 return c.coincide_con_plantilla==='si'&&nif.length>=8&&plantillas.some(t=>t.kind===kind&&normTaxId(t.supplierTaxId||'')===nif);}

// Datos de mi empresa (Ajustes → «Datos de mi empresa»). Decisión del propietario, 19-11-2026: un documento dirigido
// a otra empresa no es una compra propia y va a Descartados (recuperable); si solo hay indicios, queda DUDOSO.
export const empresaSchema=z.object({name:z.string().trim().max(150),taxIds:z.string().trim().max(200),aliases:z.string().trim().max(500)});
export type Empresa=z.infer<typeof empresaSchema>;
const lista=(s:string)=>s.split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean);
export type Destino={resultado:'sin_datos'|'ok'|'otra'|'incierto';motivo:string};
/**
 * ¿El documento va dirigido a mi empresa? Compara el destinatario leído con los datos de Ajustes.
 * «otra»: el NIF del destinatario se lee y no es ninguno de los míos (ni el nombre). «incierto»: indicios que una
 * persona debe mirar (NIF distinto con nombre igual, solo el nombre distinto, o mi empresa figura como emisor).
 * «sin_datos»: no hay datos de empresa guardados o el documento no indica destinatario: no se comprueba nada.
 */
export function comprobarDestinatario(d:{supplierTaxId:string|null;recipient:string|null;recipientTaxId:string|null},e:Empresa|null):Destino{
 const nifs=e?lista(e.taxIds).map(normTaxId).filter(n=>n.length>=8):[],nombres=e?[e.name,...lista(e.aliases)].map(supplierKey).filter(n=>n.length>=3):[];
 if(!nifs.length&&!nombres.length)return {resultado:'sin_datos',motivo:''};
 const rNif=normTaxId(d.recipientTaxId||''),sNif=normTaxId(d.supplierTaxId||''),rNombre=supplierKey(d.recipient||'');
 const nombreOk=Boolean(rNombre)&&nombres.some(n=>rNombre.includes(n)||(rNombre.length>=4&&n.includes(rNombre)));
 const quien=[d.recipient&&`«${d.recipient.trim().slice(0,80)}»`,d.recipientTaxId&&`NIF ${d.recipientTaxId.trim()}`].filter(Boolean).join(', ');
 if(nifs.length&&rNif.length>=8&&nifs.includes(rNif))return {resultado:'ok',motivo:''};
 if(sNif.length>=8&&nifs.includes(sNif))return {resultado:'incierto',motivo:'Tu empresa figura como emisor, no como destinatario: puede ser una factura de venta o una lectura con emisor y destinatario cambiados.'};
 if(nifs.length&&rNif.length>=8)return nombreOk
  ?{resultado:'incierto',motivo:`El nombre del destinatario coincide con tu empresa, pero su NIF (${d.recipientTaxId!.trim()}) no es el que tienes en Ajustes.`}
  :{resultado:'otra',motivo:`No va dirigido a tu empresa: el destinatario es ${quien}.`};
 if(!rNombre)return {resultado:'sin_datos',motivo:''};
 if(nombreOk)return {resultado:'ok',motivo:''};
 return nombres.length?{resultado:'incierto',motivo:`El destinatario (${quien}) no coincide con el nombre de tu empresa y el documento no indica su NIF.`}:{resultado:'sin_datos',motivo:''};}

/**
 * Estado final de un documento a partir de la respuesta (ya validada) de la IA. Con los datos de mi empresa, además
 * comprueba el destinatario: dirigido a otra empresa → DESCARTADO (si la lectura es segura; si no, DUDOSO);
 * indicios → DUDOSO. La comprobación solo puede restar: nunca convierte nada en FACTURA ni en ALBARAN.
 */
export function decidirEstado(c:Clasificacion,u:Umbrales=umbralesIniciales,plantillas:PlantillaRef[]=[],empresa:Empresa|null=null):Decision{
 const base=decidirSinEmpresa(c,u,plantillas);
 if(base.estado==='DESCARTADO'||c.partes.length>1)return base;
 const dest=comprobarDestinatario(c.datos,empresa);
 if(dest.resultado==='otra')return c.confianza>=u.descartado?{estado:'DESCARTADO',kind:base.kind,motivo:dest.motivo+' Si es un error, recupéralo desde Descartados.',faltan:[]}:{...base,estado:'DUDOSO',motivo:dest.motivo+' Revísalo: la lectura no es del todo segura.'};
 if(dest.resultado==='incierto')return base.estado==='DUDOSO'?{...base,motivo:base.motivo+' Además: '+dest.motivo}:{...base,estado:'DUDOSO',motivo:dest.motivo};
 return base;}
function decidirSinEmpresa(c:Clasificacion,u:Umbrales,plantillas:PlantillaRef[]):Decision{
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
  if(c.confianza<u.factura){
   // Proveedor conocido: basta el umbral «plantilla» (todas las comprobaciones anteriores se han pasado igual).
   if(c.confianza>=Math.min(u.plantilla,u.factura)&&proveedorConocido(c,kind,plantillas))return {estado:'FACTURA',kind,motivo:`Proveedor conocido: coincide con su plantilla validada y con el mismo NIF. ${motivo}`,faltan:[]};
   return dudoso(`Parece una factura, pero con poca seguridad: ${motivo}`);}
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
