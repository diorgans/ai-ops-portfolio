# Sends test leads to the n8n webhook, one at a time, and checks each result
# against the human label it should reproduce.
#
# Right-click this file -> "Run with PowerShell".
#
# n8n accepts ONE request per click of "Test workflow". The script therefore
# pauses before each send and tells you to click it again. It also prints which
# lead it is sending and whether the answer matched, so the sequence cannot
# silently slip out of step.

$ErrorActionPreference = "Stop"
$url = "http://localhost:5678/webhook-test/lead-triage"

$leads = @(
  @{
    id = "L04"; expect = "D"
    why = "support team lead at a PERFECT-fit company - but he is asking for a JOB"
    body = @{
      first_name = "Tobias"; last_name = "Lindqvist"
      email = "tobias@ravensbourne-logistics.example"
      company = "Ravensbourne Logistics"
      submitted_at = "2026-09-03T08:05:00Z"
      message = "Hi there, I'm a support team lead at Ravensbourne. I saw you're hiring a solutions engineer - I've been in CX tooling for six years and would love to be considered. Is there someone on the talent side I can send my CV to?"
    }
  },
  @{
    id = "L01"; expect = "A"
    why = "SAME company - VP with 60 agents, a named deadline and exec pressure"
    body = @{
      first_name = "Marguerite"; last_name = "Okonkwo"
      email = "m.okonkwo@ravensbourne-logistics.example"
      company = "Ravensbourne Logistics"
      submitted_at = "2026-09-02T09:14:00Z"
      message = "I'm the VP of Customer Experience here. We run about 60 support agents across two sites and our current reporting is a weekly CSV someone builds by hand. I need to show the exec team resolution time by queue before our Q4 planning offsite, which is in three weeks. Can we get a demo this week?"
    }
  }
)

Write-Host ""
Write-Host "Posting to $url" -ForegroundColor Cyan

$pass = 0; $fail = 0

foreach ($lead in $leads) {
  Write-Host ""
  Write-Host ("=" * 68)
  Write-Host ("SENDING {0}  -  {1} {2}" -f $lead.id, $lead.body.first_name, $lead.body.last_name) -ForegroundColor Yellow
  Write-Host ("  {0}" -f $lead.why)
  Write-Host ("  expected tier: {0}" -f $lead.expect)
  Write-Host ""
  Write-Host "  >> Click 'Test workflow' in n8n NOW, then press Enter here." -ForegroundColor Cyan
  Read-Host | Out-Null

  try {
    $resp = Invoke-RestMethod -Uri $url -Method Post -ContentType "application/json" `
              -Body ($lead.body | ConvertTo-Json -Depth 5) -TimeoutSec 120

    $got = $resp.tier
    Write-Host ""
    if ($got -eq $lead.expect) {
      Write-Host ("  PASS  {0}: expected {1}, got {1}" -f $lead.id, $lead.expect) -ForegroundColor Green
      $pass++
    } else {
      Write-Host ("  FAIL  {0}: expected {1}, got {2}" -f $lead.id, $lead.expect, $got) -ForegroundColor Red
      $fail++
      Write-Host "        If the evidence quote below is from the OTHER lead, the"
      Write-Host "        sequence slipped - n8n takes one request per click."
    }
    Write-Host ("  reason: {0}" -f $resp.reason)
    if ($resp.facts.evidence) { Write-Host ("  evidence: `"{0}`"" -f $resp.facts.evidence) }
    Write-Host ""
    Write-Host "  facts returned:"
    $resp.facts | ConvertTo-Json -Depth 5 | Write-Host
  }
  catch {
    $fail++
    Write-Host ""
    Write-Host ("  FAILED to call the webhook for {0}" -f $lead.id) -ForegroundColor Red
    Write-Host ("  {0}" -f $_.Exception.Message)
    if ($_.ErrorDetails.Message) { Write-Host ("  {0}" -f $_.ErrorDetails.Message) }
    Write-Host ""
    Write-Host "  404                 n8n is not listening - click 'Test workflow' first"
    Write-Host "  500                 a node errored - open it in n8n to see which"
    Write-Host "  connection refused  n8n is not running - run start-n8n.bat"
  }
}

Write-Host ""
Write-Host ("=" * 68)
if ($fail -eq 0) {
  Write-Host ("ALL PASSED  ({0}/{0})" -f $pass) -ForegroundColor Green
  Write-Host ""
  Write-Host "Same company, opposite outcomes - one is a job seeker. That contrast"
  Write-Host "is the demo."
} else {
  Write-Host ("{0} passed, {1} failed" -f $pass, $fail) -ForegroundColor Yellow
}
Write-Host ""
Read-Host "Press Enter to close"
