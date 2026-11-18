// Detección del tipo de archivo por su contenido. El prompt y el esquema de lectura con IA viven en un único sitio:
// lib/prompts/clasificador-documentos.ts (R6).
export const XML='application/xml',EDIFACT='application/edifact';
/** Factura electrónica en texto: XML (UBL, Facturae, CII…) o EDIFACT. */
export const isEInvoice=(mime:string|null|undefined)=>mime===XML||mime===EDIFACT;
/** Texto de una factura electrónica, o null si el contenido no lo es. XML: empieza por «<?xml» o por una etiqueta; EDIFACT: segmentos UNA/UNB. Nunca HTML. */
function eInvoiceType(b:Buffer){let head=b.subarray(0,4096);if(head[0]===0xEF&&head[1]===0xBB&&head[2]===0xBF)head=head.subarray(3);if(head.includes(0))return null;const t=head.toString('utf8').trimStart();
 if(/^UNA.{6}\s*UNB\+|^UNB\+/.test(t))return EDIFACT;
 if(/^<\?xml\b/i.test(t)||/^<[A-Za-z_][\w.-]*(:[A-Za-z_][\w.-]*)?[\s>\/]/.test(t))return /^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<(!doctype\s+html|html|svg|body|head|script)\b/i.test(t)?null:XML;
 return null;}
export function detectType(b:Buffer){if(b.subarray(0,5).toString()==='%PDF-')return 'application/pdf';const e=eInvoiceType(b);if(e)return e;if(b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';if(b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP')return 'image/webp';throw new Error('Formato no admitido. Usa PDF, factura electrónica (XML, UBL o EDIFACT), JPG, PNG o WebP.');}
