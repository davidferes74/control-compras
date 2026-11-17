import {captureGmail,gmailSetting} from './gmail-capture';
import {readPending} from './documents';
import {archivePending,refreshSheet,driveSetting} from './archive';
import {connection} from './google';
// Revisión completa: correo nuevo → lectura con IA (si está activada) → reintentos de Drive → hoja de registro.
// Cada fase respeta el tiempo disponible; lo que no da tiempo queda para la siguiente ejecución.
export async function runSync(totalMs:number){const end=Date.now()+totalMs,out:Record<string,unknown>={};
 if(!(await connection()))return {skipped:'Google no conectado.'};
 const gmail=await gmailSetting();
 if(gmail?.labels.length){try{out.gmail=await captureGmail(Math.min(40_000,totalMs/3));}catch(e){out.gmailError=e instanceof Error?e.message:'Error en Gmail.';}}
 if(gmail?.autoRead)out.read=await readPending(end-60_000);
 if(await driveSetting()){out.drive=await archivePending(10);out.sheet=await refreshSheet();}
 return out;}
