import "./syncHandler";
import "./scoreReplyHandler";
import { registerIngestHandler } from "./ingestHandler";
import { registerIngestCallTranscriptHandler } from "./ingestCallTranscriptHandler";

registerIngestHandler();
registerIngestCallTranscriptHandler();