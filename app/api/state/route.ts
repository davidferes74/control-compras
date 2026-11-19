import {NextRequest} from 'next/server';
import {handle} from '@/lib/api';
import {listDocuments,pendingCount,empresa} from '@/lib/documents';
import {connection,googleReady,missingScopes,googleRedirect} from '@/lib/google';
import {driveStatus} from '@/lib/drive';
import {gmailSetting} from '@/lib/gmail-capture';
import {getPool,org} from '@/lib/server-store';
import {dailyLimit,readerModel} from '@/lib/ai-reader';
import {encryptionReady} from '@/lib/crypto';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:NextRequest){return handle(req,async()=>{const [company,pending,documents,g,drive,gmail,used]=await Promise.all([empresa(),pendingCount(),listDocuments(),connection(),driveStatus(),gmailSetting(),getPool().query('SELECT calls FROM cc_ai_daily WHERE organization_id=$1 AND day=CURRENT_DATE',[org()])]);
 return {documents,pending,company,
  google:{configured:googleReady()&&encryptionReady(),redirect:googleRedirect(),connected:Boolean(g),paused:g?g.paused:true,email:g?.email||null,lastSync:g?.last_sync||null,lastError:g?.last_error||null,missingScopes:g?missingScopes(g.scopes):[]},
  drive,gmail,ai:{configured:Boolean(process.env.ANTHROPIC_API_KEY),model:readerModel(),used:used.rows[0]?.calls||0,limit:dailyLimit()}};});}
