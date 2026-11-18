// Prueba local de «Reclasificar con IA» sobre documentos anteriores al clasificador (solo base de datos local).
import {getPool} from '../lib/server-store';
import {procesarAdjuntoEntrante,clasificarPendientes} from '../lib/intake';
import {PROMPT_VERSION} from '../lib/prompts/clasificador-documentos';
if(!/127\.0\.0\.1|localhost/.test(process.env.DATABASE_URL||''))throw new Error('Solo contra una base de datos local.');
const run=Date.now().toString(36);
const lectura={estado:'DESCARTADO',confianza:0.97,tipo_documento:'recibo de pago',clase:'ninguna',motivo:'Es un recibo de pago, no una factura de proveedor con líneas.',coincide_con_plantilla:'sin_plantilla',campos_faltantes:[],partes:[],formato:{etiquetas:'',numeracion:'',fecha:'',importes:''},
 datos:{supplier:'',supplierTaxId:'',recipient:'',recipientTaxId:'',number:'',date:'',orderNumber:'',currency:'',deliveryRefs:[],subtotal:'',tax:'',total:'',warnings:[],lines:[]}};
async function main(){const pool=getPool();
 const a=await procesarAdjuntoEntrante({bytes:Buffer.from('%PDF-1.7 anterior '+run),filename:'recibo.pdf',mime:'application/pdf',messageId:'old-'+run,sender:'billing@servicio.test',subject:'Your receipt'});
 // Se deja como lo dejó la migración: borrador del correo, DUDOSO, «anterior».
 await pool.query("UPDATE cc_documents SET class_state='DUDOSO',class_by='anterior',class_reason='Documento anterior al clasificador: todavía sin clasificar.' WHERE id=$1",[a.id]);
 const estado=async()=>JSON.stringify((await pool.query('SELECT class_state,class_by,class_reason FROM cc_documents WHERE id=$1',[a.id])).rows[0]);
 delete process.env.ANTHROPIC_API_KEY;console.log('sin clave →',JSON.stringify(await clasificarPendientes(Date.now()+10_000,true)),await estado());
 process.env.ANTHROPIC_API_KEY='clave-de-prueba-local';await pool.query("UPDATE cc_files SET read_state='ready',read_result=$2,prompt_version=$3 WHERE id=$1",[a.fileId,JSON.stringify(lectura),PROMPT_VERSION]);
 console.log('con lectura →',JSON.stringify(await clasificarPendientes(Date.now()+10_000,true)),await estado());
 await pool.end();}
main().catch(e=>{console.error(e);process.exit(1);});
