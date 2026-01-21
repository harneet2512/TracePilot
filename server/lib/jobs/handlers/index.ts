import "./syncHandler";
import { registerIngestHandler } from "./ingestHandler";
import { registerIngestCallTranscriptHandler } from "./ingestCallTranscriptHandler";

registerIngestHandler();
registerIngestCallTranscriptHandler();