// Prueba local de extremo a extremo del clasificador contra la base de datos de pruebas (nunca producción).
// Simula las respuestas de la IA guardándolas como lectura ya hecha del archivo. Uso: DATABASE_URL=… npx tsx scripts/e2e-clasificador.local.ts
import {randomUUID} from 'node:crypto';
import {getPool,org} from '../lib/server-store';
import {procesarAdjuntoEntrante,clasificarDocumento,clasificarPendientes} from '../lib/intake';
import {listDocuments,pendingCount,discardDocument,recoverDocument,getDocument} from '../lib/documents';
import {PROMPT_VERSION} from '../lib/prompts/clasificador-documentos';
if(!/127\.0\.0\.1|localhost/.test(process.env.DATABASE_URL||''))throw new Error('Solo contra una base de datos local.');
const run=randomUUID().slice(0,8),nif='B'+run.replace(/\D/g,'').padEnd(8,'7').slice(0,8);
const linea={code:'T01',description:'Tomate',quantity:'10',unit:'kg',unitPrice:'1.20',discountPct:'',amount:'12.00',deliveryRef:'',page:1};
const base={confianza:0.95,coincide_con_plantilla:'sin_plantilla',campos_faltantes:[] as string[],partes:[] as unknown[]};
const datos={supplier:'Proveedor '+run,supplierTaxId:nif,recipient:'Sentidiño',recipientTaxId:'B00000000',number:'',date:'2026-11-10',orderNumber:'',currency:'EUR',deliveryRefs:[] as string[],subtotal:'',tax:'',total:'',warnings:[] as string[],lines:[linea]};
const albaran={...base,estado:'ALBARAN',tipo_documento:'albarán',clase:'albaran',motivo:'Albarán de entrega.',datos:{...datos,number:'ALB-'+run}};
const factura={...base,estado:'FACTURA',tipo_documento:'factura',clase:'factura',motivo:'Factura completa.',datos:{...datos,number:'F-'+run,deliveryRefs:['ALB-'+run],subtotal:'12.00',tax:'1.20',total:'13.20',lines:[{...linea,deliveryRef:'ALB-'+run}]}};
const publi={...base,estado:'DESCARTADO',tipo_documento:'publicidad',clase:'ninguna',motivo:'Folleto publicitario sin datos de factura.',datos:{...datos,supplier:'',supplierTaxId:'',date:'',lines:[]}};
const dudosa={...factura,confianza:0.6,motivo:'Escaneo borroso.',datos:{...factura.datos,number:'F2-'+run,deliveryRefs:[]}};
async function entra(name:string,reading:unknown|null){const r=await procesarAdjuntoEntrante({bytes:Buffer.from('%PDF-1.7 '+name+' '+run),filename:name+'.pdf',mime:'application/pdf',messageId:'msg-'+run,sender:'Ventas <ventas@proveedor.test>',subject:'Envío '+name,receivedAt:new Date()});
 if(reading)await getPool().query("UPDATE cc_files SET read_state='ready',read_result=$2,prompt_version=$3 WHERE id=$1",[r.fileId,JSON.stringify(reading),PROMPT_VERSION]);return r.id!;}
const estado=async(id:string)=>(await getPool().query('SELECT class_state,status,match_status,duplicate_of IS NOT NULL AS dup,class_reason FROM cc_documents WHERE id=$1',[id])).rows[0];
async function main(){
 process.env.ANTHROPIC_API_KEY='clave-de-prueba-local';
 const ids={albaran:await entra('albaran',albaran),factura:await entra('factura',factura),publi:await entra('publicidad',publi),dudosa:await entra('dudosa',dudosa),repetido:await entra('albaran-repetido',albaran)};
 console.log('pendientes tras la entrada:',await pendingCount(),'| visibles de esta tanda:',(await listDocuments()).filter(d=>Object.values(ids).includes(d.id)).length);
 for(const [k,id] of Object.entries(ids))console.log(k,'→',JSON.stringify(await clasificarDocumento(id)),JSON.stringify(await estado(id)));
 console.log('factura tras conciliar:',JSON.stringify(await estado(ids.factura)),'| albarán:',JSON.stringify(await estado(ids.albaran)));
 // Sin clave: no es un error de clasificación; el documento sigue pendiente y oculto.
 delete process.env.ANTHROPIC_API_KEY;const sinLeer=await entra('sin-leer',null);
 console.log('sin clave →',JSON.stringify(await clasificarPendientes(Date.now()+10_000)),JSON.stringify(await estado(sinLeer)),'| ¿visible?',(await listDocuments()).some(d=>d.id===sinLeer));
 await discardDocument(ids.factura);console.log('factura descartada:',JSON.stringify(await estado(ids.factura)),'| albarán:',(await estado(ids.albaran)).match_status);
 await recoverDocument(ids.publi,'invoice');console.log('publicidad recuperada:',JSON.stringify(await estado(ids.publi)),(await getDocument(ids.publi)).classBy);
 console.log('filas de auditoría:',(await getPool().query('SELECT count(*)::int n FROM cc_classifications WHERE document_id=ANY($1)',[Object.values(ids)])).rows[0].n,'| org',org());
 // El documento sin leer se deja descartable: se marca dudoso para no dejar pendientes en la base local.
 await getPool().query("UPDATE cc_documents SET class_state='DUDOSO',class_reason='Prueba local' WHERE id=$1",[sinLeer]);
 await getPool().end();}
main().catch(e=>{console.error(e);process.exit(1);});
