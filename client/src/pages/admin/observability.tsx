import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell
} from "recharts";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, RefreshCw, BarChart3, Database, MessageSquare, Link, Calendar } from "lucide-react";

// Types for API responses
interface ObservabilityChat {
  metrics: {
    totalConversations: number;
    activeUsers: number;
    avgResponseTime: number;
    tokenUsage: number;
  };
  timeseries: Array<{ timestamp: string; value: number }>;
  topErrors: Array<{ code: string; count: number; lastOccurred: string }>;
}

interface ObservabilityRetrieval {
  metrics: {
    totalSearches: number;
    avgLatency: number;
    recallAt5: number;
    indexSize: number;
  };
  timeseries: Array<{ timestamp: string; value: number }>;
}

interface ObservabilityCitations {
  metrics: {
    totalCitations: number;
    integrityRate: number;
    avgCitationsPerChat: number;
    clickThroughRate: number;
  };
  timeseries: Array<{ timestamp: string; value: number }>;
}

interface ObservabilitySync {
  metrics: {
    totalSyncs: number;
    successRate: number;
    avgDuration: number;
    docsProcessed: number;
  };
  channelStatus: Array<{ channelId: string; lastSync: string; status: string; stalenessMs: number }>;
}

export default function ObservabilityPage() {
  const [timeRange, setTimeRange] = useState("24h");
  const [connector, setConnector] = useState("all");

  const { data: chatData, isLoading: chatLoading } = useQuery<ObservabilityChat>({
    queryKey: ["/api/admin/observability/chat", timeRange, connector]
  });

  const { data: retrievalData, isLoading: retrievalLoading } = useQuery<ObservabilityRetrieval>({
    queryKey: ["/api/admin/observability/retrieval", timeRange]
  });

  const { data: citationsData, isLoading: citationsLoading } = useQuery<ObservabilityCitations>({
    queryKey: ["/api/admin/observability/citations", timeRange]
  });

  const { data: syncData, isLoading: syncLoading } = useQuery<ObservabilitySync>({
    queryKey: ["/api/admin/observability/sync", connector]
  });

  if (chatLoading || retrievalLoading || citationsLoading || syncLoading) {
    return (
      <Layout title="Observability">
        <div className="flex items-center justify-center h-[calc(100vh-100px)]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

  return (
    <Layout title="Observability">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">System Observability</h1>
            <p className="text-muted-foreground">Monitor chat performance, retrieval quality, citations, and sync status.</p>
          </div>

          <div className="flex items-center gap-2">
            <Select value={connector} onValueChange={setConnector}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Connectors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Connectors</SelectItem>
                <SelectItem value="slack">Slack</SelectItem>
                <SelectItem value="google">Google Drive</SelectItem>
                <SelectItem value="atlassian">Confluence/Jira</SelectItem>
              </SelectContent>
            </Select>

            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Time Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24 Hours</SelectItem>
                <SelectItem value="7d">Last 7 Days</SelectItem>
                <SelectItem value="30d">Last 30 Days</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" size="icon">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Tabs defaultValue="chat" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 lg:w-[400px]">
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="retrieval">Retrieval</TabsTrigger>
            <TabsTrigger value="citations">Citations</TabsTrigger>
            <TabsTrigger value="sync">Sync</TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <KpiCard title="Total Conversations" value={chatData?.metrics.totalConversations} icon={MessageSquare} />
              <KpiCard title="Active Users" value={chatData?.metrics.activeUsers} icon={AlertCircle} />
              <KpiCard title="Avg Response (ms)" value={`${Math.round(chatData?.metrics.avgResponseTime || 0)}ms`} icon={BarChart3} />
              <KpiCard title="Token Usage" value={chatData?.metrics.tokenUsage.toLocaleString()} icon={Database} />
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
              <Card className="col-span-4">
                <CardHeader>
                  <CardTitle>Chat Volume</CardTitle>
                  <CardDescription>Conversations over the selected period</CardDescription>
                </CardHeader>
                <CardContent className="pl-2">
                  <ResponsiveContainer width="100%" height={350}>
                    <AreaChart data={chatData?.timeseries || []}>
                      <XAxis dataKey="timestamp" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                      <Tooltip />
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <Area type="monotone" dataKey="value" stroke="#8884d8" fillOpacity={1} fill="url(#colorUv)" />
                      <defs>
                        <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="col-span-3">
                <CardHeader>
                  <CardTitle>Top Errors</CardTitle>
                  <CardDescription>Most frequent error codes</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-8">
                    {chatData?.topErrors.map((error, i) => (
                      <div key={i} className="flex items-center">
                        <div className="ml-4 space-y-1">
                          <p className="text-sm font-medium leading-none">{error.code}</p>
                          <p className="text-sm text-muted-foreground">{new Date(error.lastOccurred).toLocaleTimeString()}</p>
                        </div>
                        <div className="ml-auto font-medium">{error.count}</div>
                      </div>
                    )) || <div className="text-sm text-muted-foreground">No errors recorded</div>}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="retrieval" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <KpiCard title="Total Searches" value={retrievalData?.metrics.totalSearches} icon={MessageSquare} />
              <KpiCard title="Avg Latency (ms)" value={`${Math.round(retrievalData?.metrics.avgLatency || 0)}ms`} icon={BarChart3} />
              <KpiCard title="Recall@5" value={`${((retrievalData?.metrics.recallAt5 || 0) * 100).toFixed(1)}%`} icon={AlertCircle} />
              <KpiCard title="Index Size" value={retrievalData?.metrics.indexSize} icon={Database} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Retrieval Latency</CardTitle>
                <CardDescription>Average latency over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={retrievalData?.timeseries || []}>
                    <XAxis dataKey="timestamp" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <Line type="monotone" dataKey="value" stroke="#82ca9d" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="citations" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <KpiCard title="Total Citations" value={citationsData?.metrics.totalCitations} icon={Link} />
              <KpiCard title="Integrity Rate" value={`${((citationsData?.metrics.integrityRate || 0) * 100).toFixed(1)}%`} icon={AlertCircle} />
              <KpiCard title="Avg per Chat" value={citationsData?.metrics.avgCitationsPerChat?.toFixed(1)} icon={BarChart3} />
              <KpiCard title="CTR" value={`${((citationsData?.metrics.clickThroughRate || 0) * 100).toFixed(1)}%`} icon={MessageSquare} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Citation Integrity Over Time</CardTitle>
                <CardDescription>Percentage of valid citations</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <AreaChart data={citationsData?.timeseries || []}>
                    <XAxis dataKey="timestamp" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} />
                    <Tooltip />
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <Area type="monotone" dataKey="value" stroke="#82ca9d" fill="#82ca9d" fillOpacity={0.3} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sync" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <KpiCard title="Total Syncs" value={syncData?.metrics.totalSyncs} icon={RefreshCw} />
              <KpiCard title="Success Rate" value={`${((syncData?.metrics.successRate || 0) * 100).toFixed(1)}%`} icon={AlertCircle} />
              <KpiCard title="Avg Duration (s)" value={`${((syncData?.metrics.avgDuration || 0) / 1000).toFixed(1)}s`} icon={BarChart3} />
              <KpiCard title="Docs Processed" value={syncData?.metrics.docsProcessed} icon={Database} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Channel Staleness</CardTitle>
                <CardDescription>Time since last successful sync per channel</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {syncData?.channelStatus.map((channel, i) => (
                    <div key={i} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                      <div>
                        <p className="font-medium">{channel.channelId}</p>
                        <p className="text-sm text-muted-foreground">Last sync: {new Date(channel.lastSync).toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`text-sm font-medium ${channel.stalenessMs > 3600000 ? "text-red-500" : "text-green-500"
                          }`}>
                          {Math.round(channel.stalenessMs / 60000)}m ago
                        </div>
                        <div className={`px-2 py-1 rounded text-xs ${channel.status === "success" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                          }`}>
                          {channel.status}
                        </div>
                      </div>
                    </div>
                  )) || <div className="text-sm text-muted-foreground w-full text-center py-4">No sync data available</div>}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

function KpiCard({ title, value, icon: Icon }: { title: string, value: any, icon: any }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value ?? "-"}</div>
      </CardContent>
    </Card>
  );
}
