# Sends two test leads to the n8n webhook and prints what comes back.
#
# Double-click won't run a .ps1 — right-click this file and choose
# "Run with PowerShell". Or from a PowerShell window:  .\test-webhook.ps1
#
# Before running: in n8n, click "Test workflow" so it is listening.
# Run this script, and it sends the FIRST lead. n8n stops listening after one
# request, so click "Test workflow" again before the script sends the second —
# the script pauses and waits for you.

$ErrorActionPreference = "Stop"
$url = "http://localhost:5678/webhook-test/lead-triage"

$leads = @(
  @{
    label = "L04 - job seeker at a PERFECT-fit company (expect tier D)"
    body  = @{
      first_name = "Tobias"; last_name = "Lindqvist"
      email = "tobias@ravensbourne-logistics.example"
      company = "Ravensbourne Logistics"
      submitted_at = "2026-09-03T08:05:00Z"
      message = "Hi there, I'm a support team lead at Ravensbourne. I saw you're hiring a solutions engineer - I've been in CX tooling for six years and would love to be considered. Is there someone on the talent side I can send my CV to?"
    }
  },
  @{
    label = "L01 - VP with budget and a deadline, SAME company (expect tier A)"
    body  = @{
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
Write-Host ""

for ($i = 0; $i -lt $leads.Count; $i++) {
  $lead = $leads[$i]
  Write-Host ("-" * 68)
  Write-Host $lead.label -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Make sure you have clicked 'Test workflow' in n8n, then press Enter."
  Read-Host | Out-Null

  try {
    $resp = Invoke-RestMethod -Uri $url -Method Post -ContentType "application/json" `
              -Body ($lead.body | ConvertTo-Json -Depth 5) -TimeoutSec 120
    Write-Host "RESPONSE:" -ForegroundColor Green
    $resp | ConvertTo-Json -Depth 8 | Write-Host
  }
  catch {
    Write-Host "FAILED" -ForegroundColor Red
    Write-Host $_.Exception.Message
    if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message }
    Write-Host ""
    Write-Host "Common causes:"
    Write-Host "  404  - n8n is not listening. Click 'Test workflow' in n8n first."
    Write-Host "  500  - a node errored. Open the node in n8n to see which."
    Write-Host "  connection refused - n8n is not running. Run start-n8n.bat."
  }
  Write-Host ""
}

Write-Host ("-" * 68)
Write-Host "Done. The first lead should be tier D, the second tier A." -ForegroundColor Cyan
Write-Host "Same company, opposite outcomes - that contrast is the demo."
Write-Host ""
Read-Host "Press Enter to close"
