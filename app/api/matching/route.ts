import {NextRequest} from 'next/server';
import {handle} from '@/lib/api';
import {searchSuggestions} from '@/lib/documents';
export const runtime='nodejs';export const dynamic='force-dynamic';
// «Buscar coincidencias» en Diferencias: recalcula y propone albaranes. Solo base de datos, sin IA. No vincula nada.
export async function POST(req:NextRequest){return handle(req,async()=>searchSuggestions());}
