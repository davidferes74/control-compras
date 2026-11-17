import WorkspaceApp from '@/components/workspace-app';
import {configured} from '@/lib/auth';
import {parentAppUrl} from '@/lib/sso';
export const dynamic='force-dynamic';
export default function Page(){return <WorkspaceApp serverConfigured={configured()} databaseConfigured={Boolean(process.env.DATABASE_URL)} parentUrl={parentAppUrl()}/>;}
