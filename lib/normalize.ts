// Normalización de textos para comparar documentos de distintos orígenes (IA, tecleo, distintos proveedores).
const accents=(s:string)=>s.normalize('NFD').replace(/[̀-ͯ]/g,'');
export const normText=(s:string)=>accents(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export const normCode=(s:string)=>accents(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
/** Referencia de documento: sin separadores y sin ceros a la izquierda en los tramos numéricos. «ALB-00123» → «ALB123». */
export const normRef=(s:string)=>normCode((s||'').replace(/\d+/g,d=>d.replace(/^0+(?=\d)/,'')));
const digits=(s:string)=>normRef(s).replace(/\D/g,'');
/** Dos referencias son la misma si coinciden normalizadas, o si solo difieren en un prefijo de letras («A-123» y «123»). */
export function refMatches(a:string,b:string){const x=normRef(a),y=normRef(b);if(!x||!y)return false;if(x===y)return true;const dx=digits(a),dy=digits(b);return dx.length>=3&&dx===dy&&(x===dx||y===dy);}
export const normTaxId=(s:string)=>{const c=normCode(s);return c.length>9&&c.startsWith('ES')?c.slice(2):c;};
const legal=/\b(s ?l ?u?|s ?a ?u?|s ?l ?l|s ?c ?o ?o ?p|c ?b|sociedad (limitada|anonima)( unipersonal)?|ltd|gmbh|sas|srl)\b/g;
export const supplierKey=(name:string)=>normText(name).replace(legal,' ').replace(/\s+/g,'');
const tokens=(s:string)=>new Set(normText(s).split(' ').filter(t=>t.length>=2));
/** Parecido entre descripciones (coeficiente de Dice sobre palabras). 1 = mismas palabras. */
export function similarity(a:string,b:string){const x=tokens(a),y=tokens(b);if(!x.size||!y.size)return 0;let common=0;for(const t of x)if(y.has(t))common++;return 2*common/(x.size+y.size);}
/** Dirección del remitente en minúsculas: «Nombre <a@b.c>» → «a@b.c». Vacío si no se reconoce. */
export const senderAddress=(from:string)=>(from.match(/<([^<>\s]+@[^<>\s]+)>/)?.[1]||from.match(/[^\s<>"',;:()]+@[^\s<>"',;:()]+/)?.[0]||'').toLowerCase();
