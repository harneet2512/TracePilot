# Run all 10 demo queries - diagnosis only
$queries = @(
    "What are our Q4 OKRs for the AI search project?",
    "Are there any blockers for the AI search launch?",
    "What vector database are we using and why?",
    "Who is responsible for fixing the AWS blocker and when is the deadline?",
    "What's our 2025 product roadmap?",
    "Who should I contact about infrastructure issues?",
    "How much is the AI search project costing us?",
    "What's the biggest risk to our November 15 launch?",
    "Why did we choose Claude over GPT-4?",
    "I'm new to the team - what should I know about Project Phoenix?"
)

$login = Invoke-WebRequest -Uri 'http://localhost:5000/api/auth/login' -Method POST -ContentType 'application/json' -Body '{"email":"admin@tracepilot.com","password":"admin123"}' -SessionVariable sess -UseBasicParsing
$loginJson = $login.Content | ConvertFrom-Json
$csrf = $loginJson.csrfToken
Write-Host "Logged in. Running 10 queries..."

$results = @()
for ($i = 0; $i -lt $queries.Length; $i++) {
    $q = $queries[$i]
    $num = $i + 1
    $conv = (Invoke-WebRequest -Uri 'http://localhost:5000/api/conversations' -Method POST -ContentType 'application/json' -Body "{`"title`":`"demo-q$num`"}" -WebSession $sess -Headers @{"x-csrf-token"=$csrf} -UseBasicParsing).Content | ConvertFrom-Json
    $body = @{message=$q; conversationId=$conv.id} | ConvertTo-Json
    try {
        $resp = Invoke-WebRequest -Uri 'http://localhost:5000/api/chat' -Method POST -ContentType 'application/json' -Body $body -WebSession $sess -Headers @{"x-csrf-token"=$csrf} -UseBasicParsing -TimeoutSec 120
        $json = $resp.Content | ConvertFrom-Json
        $ans = $json.answer_text
        if (-not $ans) { $ans = $json.answer }
        $first80 = if ($ans) { $ans.Substring(0, [Math]::Min(80, $ans.Length)) } else { "(none)" }
        $markers = ([regex]::Matches($ans, '\[\d+\]')).Count
        $srcCount = 0
        if ($json.sources) { $srcCount = $json.sources.Count }
        elseif ($json.sources_used) { $srcCount = $json.sources_used.Count }
        $traceId = $json.debug.traceId
        $results += [PSCustomObject]@{Q=$num; first80=$first80; markers=$markers; sources=$srcCount; traceId=$traceId}
    } catch {
        $results += [PSCustomObject]@{Q=$num; first80="ERROR: $($_.Exception.Message)"; markers=0; sources=0; traceId=""}
    }
    Write-Host "  Q$num done"
}

$results | Export-Csv -Path "demo-query-results.csv" -NoTypeInformation
Write-Host "Results saved to demo-query-results.csv"
$results | Format-Table -AutoSize
