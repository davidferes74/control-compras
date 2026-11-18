import {captureGmail,gmailSetting} from './gmail-capture';
import {clasificarPendientes} from './intake';
import {pendingCount} from './documents';
import {archivePending,refreshSheet} from './archive';
import {connection} from './google';
import {driveRow,driveConnected} from './drive';
// Revisión completa: correo nuevo → clasificación con IA de lo pendiente → reintentos de Drive → hoja de registro.
// Gmail y Drive son independientes: cada fase corre si su conexión existe. Lo que no da tiempo queda para la siguiente.
export async function runSync(totalMs:number){const end=Date.now()+totalMs,out:Record<string,unknown>={};
 const g=await connection();if(g&&!g.paused){const gmail=await gmailSetting();
  if(gmail){try{out.gmail=await captureGmail(Math.min(40_000,totalMs/3));}catch(e){out.gmailError=e instanceof Error?e.message:'Error en Gmail.';}}
  }
 // Lo pendiente de clasificar se procesa aunque Gmail esté pausado o desconectado: nada debe quedarse oculto.
 if(((await gmailSetting())?.autoRead??true)&&await pendingCount())out.read=await clasificarPendientes(end-60_000);
 if(driveConnected(await driveRow())){out.drive=await archivePending(Math.max(10_000,end-Date.now()-20_000));out.sheet=await refreshSheet();}
 if(!Object.keys(out).length)out.skipped=g?.paused?'La captura de Gmail está pausada. Habilítala en Ajustes.':'Ni Gmail ni Drive están conectados.';
 return out;}
