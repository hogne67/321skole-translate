import { generateStartListening } from "@/lib/listeningTests/startGeneration.server";
export const runtime="nodejs";
export const maxDuration=120;
export async function POST(req:Request){return generateStartListening(req);}
