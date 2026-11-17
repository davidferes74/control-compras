import type ExcelJS from 'exceljs';
import {productInputSchema,type ProductInput} from './products';
export const headers=['Nombre','Referencia','Código de producto','Unidad','Seguimiento','Código de caja','Unidades por caja'];
export function parseProductSheet(book:ExcelJS.Workbook):{products:ProductInput[];errors:string[];rowNumbers?:number[]}{
 const sheet=book.getWorksheet('Productos');if(!sheet)return {products:[],errors:['Falta la hoja Productos. Utiliza la plantilla descargable.']};
 if(sheet.rowCount>1001||sheet.columnCount>7)return {products:[],errors:['Máximo 1000 productos y las 7 columnas de la plantilla.']};
 const errors:string[]=[],products:ProductInput[]=[],rowNumbers:number[]=[];
 if(headers.some((h,i)=>sheet.getRow(1).getCell(i+1).text.trim()!==h))return {products:[],errors:['Las cabeceras no coinciden con la plantilla. No cambies sus nombres ni orden.']};
 for(let i=2;i<=sheet.rowCount;i++){const row=sheet.getRow(i);const cells=headers.map((_,j)=>row.getCell(j+1));if(cells.every(c=>c.value===null||c.value===undefined||c.value===''))continue;
 if(cells.some(c=>c.value!==null&&c.value!==undefined&&typeof c.value!=='string'&&typeof c.value!=='number')){errors.push(`Fila ${i}: usa valores, no fórmulas, fechas ni enlaces.`);continue;}
 if([1,2,5].some(j=>typeof cells[j].value==='number')){errors.push(`Fila ${i}: referencia y códigos deben ser texto para conservar ceros y dígitos.`);continue;}
 const v=cells.map(c=>String(c.value??'').trim());const tracking=({'sin seguimiento':'none','lote':'lot','serie':'serial'} as Record<string,string>)[v[4].toLowerCase()||'sin seguimiento'];
 const p=productInputSchema.safeParse({name:v[0],sku:v[1],code:v[2],unit:v[3]||'ud',tracking,packCode:v[5]||undefined,packQuantity:v[6]?v[6].replace(',','.'):undefined});
 if(!p.success){errors.push(`Fila ${i}: revisa nombre, referencia, código, unidad (ud), seguimiento y cantidad positiva (hasta 3 decimales).`);continue;}products.push(p.data);rowNumbers.push(i);
 }
 if(!products.length&&!errors.length)errors.push('El archivo no contiene productos. Rellena la hoja Productos desde la fila 2.');return {products,errors,rowNumbers};
}
