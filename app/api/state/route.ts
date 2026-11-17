import {NextRequest} from 'next/server';
import {handle} from '@/lib/api';
import {listDocuments} from '@/lib/documents';
import {connection,googleReady,missingScopes,pickerConfig,googleRedirect} from '@/lib/google';
import {driveSetting} from '@/lib/archive';
import {gmailSetting} from '@/lib/gmail-capture';
import {getPool,org} from '@/lib/server-store';
import {dailyLimit,readerModel} from '@/lib/ai-reader';
import {encryptionReady} from '@/lib/crypto';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:NextRequest){return handle(req,async()=>{const [documents,g,drive,gmail,used]=await Promise.all([listDocuments(),connection(),driveSetting(),gmailSetting(),getPool().query('SELECT calls FROM cc_ai_daily WHERE organization_id=$1 AND day=CURRENT_DATE',[org()])]);
 return {documents,
  google:{configured:googleReady()&&encryptionReady(),picker:Boolean(pickerConfig()),redirect:googleRedirect(),connected:Boolean(g),email:g?.email||null,lastSync:g?.last_sync||null,lastError:g?.last_error||null,missingScopes:g?missingScopes(g.scopes):[]},
  drive,gmail,ai:{configured:Boolean(process.env.ANTHROPIC_API_KEY),model:readerModel(),used:used.rows[0]?.calls||0,limit:dailyLimit()}};});}
