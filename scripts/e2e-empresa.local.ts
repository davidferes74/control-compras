// Prueba local de «Datos de mi empresa»: un documento dirigido a otra empresa va a Descartados (solo base de datos local).
import {getPool} from '../lib/server-store';
import {setSetting} from '../lib/server-store';
import {procesarAdjuntoEntrante,clasificarDocumento} from '../lib/intake';
import {recoverDocument} from '../lib/documents';
import {PROMPT_VERSION} from '../lib/prompts/clasificador-documentos';
if(!/127\.0\.0\.1|localhost/.test(process.env.DATABASE_URL||''))throw new Error('Solo contra una base de datos local.');
const run=Date.now().toString(36);
const lectura=(recipient:string,recipientTaxId:string,number:string)=>({estado:'FACTURA',confianza:0.96,tipo_documento:'factura',clase:'factura',motivo:'Factura completa.',coincide_con_plantilla:'sin_plantilla',campos_faltantes:[],partes:[],formato:{etiquetas:'',numeracion:'',fecha:'',importes:''},
 datos:{supplier:'Frutas Prueba SL',supplierTaxId:'B12345678',recipient,recipientTaxId,number,date:'2026-11-12',orderNumber:'',currency:'EUR',deliveryRefs:[],subtotal:'12.00',tax:'1.20',total:'13.20',warnings:[],
  lines:[{code:'T01',description:'Tomate',quantity:'10',unit:'kg',unitPrice:'1.20',discountPct:'',amount:'12.00',deliveryRef:'',page:1}]}});
async function main(){const pool=getPool();process.env.ANTHROPIC_API_KEY='clave-de-prueba-local';
 await setSetting('empresa',{name:'Empresa de Prueba SL',taxIds:'B87654321',aliases:'Bar Prueba'});
 const casos:[string,string,string][]=[['Empresa de Prueba SL','B87654321','mia'],['Restaurante Ajeno SL','A99999999','ajena'],['Restaurante Ajeno','','nombre']];
 for(const [rec,nif,tag] of casos){
  const a=await procesarAdjuntoEntrante({bytes:Buffer.from(`%PDF-1.7 empresa ${tag} ${run}`),filename:`factura-${tag}.pdf`,mime:'application/pdf',messageId:`emp-${tag}-${run}`,sender:'facturas@frutasprueba.test',subject:'Factura'});
  await pool.query("UPDATE cc_files SET read_state='ready',read_result=$2,prompt_version=$3 WHERE id=$1",[a.fileId,JSON.stringify(lectura(rec,nif,`E-${tag}-${run}`)),PROMPT_VERSION]);
  const r=await clasificarDocumento(a.id!);const row=(await pool.query('SELECT class_state,status,class_reason,number,supplier FROM cc_documents WHERE id=$1',[a.id])).rows[0];
  console.log(tag,'→',JSON.stringify(r),JSON.stringify(row));
  if(tag==='ajena'){await recoverDocument(a.id!,'invoice');console.log(' recuperado →',JSON.stringify((await pool.query('SELECT class_state,status,number FROM cc_documents WHERE id=$1',[a.id])).rows[0]));}}
 await pool.end();}
main().catch(e=>{console.error(e);process.exit(1);});
