import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Phone, PhoneOff, Mic, MicOff } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
  citations?: Array<{ sourceId: string; sourceVersionId?: string; chunkId: string }>;
}

interface LatencyMetrics {
  eouToFirstDelta?: number;
  eouToFinal?: number;
}

export default function VoicePage() {
  const [connected, setConnected] = useState(false);
  const [callId, setCallId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentInput, setCurrentInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [latencyMetrics, setLatencyMetrics] = useState<LatencyMetrics>({});
  const wsRef = useRef<WebSocket | null>(null);
  const eouTimeRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const connect = () => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/voice?userId=test-user`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("[Voice] WebSocket connected");
      setConnected(true);
      
      // Send start message
      ws.send(JSON.stringify({
        type: "start",
        callerNumber: "+1234567890",
        metadata: { source: "web" },
      }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleServerMessage(message);
    };

    ws.onerror = (error) => {
      console.error("[Voice] WebSocket error:", error);
    };

    ws.onclose = () => {
      console.log("[Voice] WebSocket closed");
      setConnected(false);
      setCallId(null);
    };

    wsRef.current = ws;
  };

  const handleServerMessage = (message: any) => {
    switch (message.type) {
      case "started":
        setCallId(message.callId);
        break;
        
      case "ack":
        // Keep-alive message
        break;
        
      case "assistant_delta":
        setIsStreaming(true);
        if (eouTimeRef.current && !latencyMetrics.eouToFirstDelta) {
          const latency = Date.now() - eouTimeRef.current;
          setLatencyMetrics(prev => ({ ...prev, eouToFirstDelta: latency }));
        }
        // Append to last assistant message or create new
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.role === "assistant" && !last.text.includes(message.textChunk)) {
            return [...prev.slice(0, -1), { ...last, text: last.text + message.textChunk }];
          }
          return [...prev, { role: "assistant", text: message.textChunk, timestamp: new Date() }];
        });
        break;
        
      case "assistant_final":
        setIsStreaming(false);
        if (eouTimeRef.current) {
          const latency = Date.now() - eouTimeRef.current;
          setLatencyMetrics(prev => ({ ...prev, eouToFinal: latency }));
          eouTimeRef.current = null;
        }
        // Update last message with full text and citations
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.role === "assistant") {
            return [...prev.slice(0, -1), {
              ...last,
              text: message.fullText || last.text,
              citations: message.citations,
            }];
          }
          return prev;
        });
        break;
        
      case "tts_stop":
        setIsStreaming(false);
        break;
        
      case "error":
        console.error("[Voice] Error:", message.message);
        break;
    }
  };

  const sendUserMessage = (text: string, isFinal: boolean) => {
    if (!wsRef.current || !callId) return;
    
    if (isFinal) {
      eouTimeRef.current = Date.now();
      wsRef.current.send(JSON.stringify({
        type: "user_final",
        callId,
        text,
        tsMs: Date.now(),
      }));
      
      setMessages(prev => [...prev, {
        role: "user",
        text,
        timestamp: new Date(),
      }]);
      setCurrentInput("");
    } else {
      wsRef.current.send(JSON.stringify({
        type: "user_partial",
        callId,
        text,
        tsMs: Date.now(),
      }));
    }
  };

  const sendBargeIn = () => {
    if (!wsRef.current || !callId) return;
    wsRef.current.send(JSON.stringify({
      type: "barge_in",
      callId,
      tsMs: Date.now(),
    }));
  };

  const disconnect = () => {
    if (wsRef.current && callId) {
      wsRef.current.send(JSON.stringify({
        type: "end",
        callId,
      }));
      wsRef.current.close();
    }
    setConnected(false);
    setCallId(null);
    setMessages([]);
    setLatencyMetrics({});
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentInput.trim()) {
      sendUserMessage(currentInput, true);
    }
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Voice Agent</h1>
            <p className="text-muted-foreground">Real-time voice assistant with low-latency responses</p>
          </div>
          <div className="flex items-center gap-2">
            {!connected ? (
              <Button onClick={connect} className="gap-2">
                <Phone className="w-4 h-4" />
                Connect
              </Button>
            ) : (
              <Button onClick={disconnect} variant="destructive" className="gap-2">
                <PhoneOff className="w-4 h-4" />
                Disconnect
              </Button>
            )}
          </div>
        </div>

        {latencyMetrics.eouToFirstDelta && (
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">EOU → First Delta</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{latencyMetrics.eouToFirstDelta}ms</p>
              </CardContent>
            </Card>
            {latencyMetrics.eouToFinal && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">EOU → Final</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{latencyMetrics.eouToFinal}ms</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Transcript</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]" ref={scrollRef}>
                <div className="space-y-4">
                  {messages.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">
                      {connected ? "Start a conversation..." : "Connect to start"}
                    </p>
                  ) : (
                    messages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg p-3 ${
                            msg.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                          {msg.citations && msg.citations.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {msg.citations.map((citation, cIdx) => (
                                <Badge key={cIdx} variant="secondary" className="text-xs">
                                  Source {citation.sourceId.slice(0, 8)}
                                  {citation.sourceVersionId && ` v${citation.sourceVersionId.slice(0, 8)}`}
                                </Badge>
                              ))}
                            </div>
                          )}
                          <p className="text-xs opacity-70 mt-1">
                            {msg.timestamp.toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                  {isStreaming && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-lg p-3">
                        <span className="animate-pulse">●</span>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleSubmit} className="space-y-2">
                <textarea
                  value={currentInput}
                  onChange={(e) => setCurrentInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e);
                    }
                  }}
                  placeholder="Type your message..."
                  className="w-full min-h-[100px] p-2 border rounded-md"
                  disabled={!connected}
                />
                <div className="flex gap-2">
                  <Button type="submit" disabled={!connected || !currentInput.trim()}>
                    Send
                  </Button>
                  {isStreaming && (
                    <Button type="button" variant="outline" onClick={sendBargeIn}>
                      <MicOff className="w-4 h-4 mr-2" />
                      Interrupt
                    </Button>
                  )}
                </div>
              </form>
              
              {connected && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Call ID: <code className="text-xs">{callId}</code>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}


