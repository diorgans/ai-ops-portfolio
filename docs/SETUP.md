# Setup — your steps

Everything that could be built for you is built. These are the parts that need your accounts.

Budget roughly 25 minutes. Steps 1–3 are account admin; step 4 onwards is n8n.

---

## 1. Start n8n (1 min)

Open a terminal — **your own terminal, not inside Claude Code**, or a background process reaper may
kill it:

```
n8n start
```

Leave that window open. Then go to **http://localhost:5678**. Create the owner account if you
haven't already — it's local only, nothing is sent anywhere.

---

## 2. HubSpot: create a private app token (5 min)

1. In HubSpot: **Settings** (gear icon) → **Integrations** → **Private Apps**
2. **Create a private app**. Name it `Lead Triage`.
3. **Scopes** tab → search for and tick:
   - `crm.objects.contacts.write`
   - `crm.objects.contacts.read`
4. **Create app** → copy the **access token**. It starts with `pat-`.
   Keep this tab open; you'll paste it in step 4.

> HubSpot shows the token only once, same as an API key. Put it in a password manager if you want
> it later.

---

## 3. HubSpot: add two contact properties (4 min)

The workflow writes the tier onto the contact, which needs somewhere to go.

**Settings** → **Properties** → **Create property**, with object type **Contact**:

| field | value |
|---|---|
| Label | `Lead Triage Tier` |
| **Internal name** | **`lead_triage_tier`** ← must match exactly |
| Field type | Single-line text (or Dropdown with A, B, C, D) |

Repeat for the second:

| field | value |
|---|---|
| Label | `Lead Triage Reason` |
| **Internal name** | **`lead_triage_reason`** |
| Field type | Single-line text |

> The internal name is what the API uses. HubSpot auto-generates it from the label, so check it and
> correct it if it came out as something else.

---

## 4. n8n: create two credentials (4 min)

In n8n, left sidebar → **Credentials** → **Add credential** → search **"Header Auth"**.

**Credential one — Anthropic**

| field | value |
|---|---|
| Credential name | `Anthropic API` |
| Name | `x-api-key` |
| Value | your Anthropic key (the one in `.anthropic_key`) |

**Credential two — HubSpot**

| field | value |
|---|---|
| Credential name | `HubSpot Private App` |
| Name | `Authorization` |
| Value | `Bearer pat-xxxxx` ← the word `Bearer`, a space, then your token |

---

## 5. Import the workflow (1 min)

In n8n: **Workflows** → the **…** menu (top right) → **Import from File** → choose

```
C:\Users\nchen\Downloads\lead-triage\workflows\lead-triage.json
```

You should see five nodes left to right:

```
Webhook → Claude — extract facts → Apply rubric (code) → HubSpot — create contact → Respond
```

---

## 6. Attach the credentials (2 min)

Importing brings the nodes but **not** the credential links — n8n never exports secrets.

- Open **Claude — extract facts** → *Credential for Header Auth* → pick **Anthropic API**
- Open **HubSpot — create contact** → *Credential for Header Auth* → pick **HubSpot Private App**

Save the workflow.

---

## 7. Test it (5 min)

Click **Test workflow** (bottom of the canvas). n8n now waits for one request.

Open a **second** terminal and send a lead. This is `L04` from the eval set — the support team lead
at a perfect-fit company who is actually asking about jobs:

```bash
curl -X POST http://localhost:5678/webhook-test/lead-triage ^
  -H "Content-Type: application/json" ^
  -d "{\"first_name\":\"Tobias\",\"last_name\":\"Lindqvist\",\"email\":\"tobias@ravensbourne-logistics.example\",\"company\":\"Ravensbourne Logistics\",\"message\":\"Hi there, I am a support team lead at Ravensbourne. I saw you are hiring a solutions engineer - I have been in CX tooling for six years and would love to be considered. Is there someone on the talent side I can send my CV to?\"}"
```

(In PowerShell the line-continuation character is `` ` `` rather than `^`; or just paste it as one
long line.)

**Expected response:**

```json
{ "tier": "D", "reason": "Rule 1 — job seeker overrides fit.", "facts": { "disqualifier": "job_seeker", ... } }
```

A **D** is the correct answer and the whole point — the company is an ideal customer, the person is
not a buyer. Check HubSpot: the contact should exist with `Lead Triage Tier = D`.

Try a second one to see the other end — this is `L01`, which should come back **A**:

```bash
curl -X POST http://localhost:5678/webhook-test/lead-triage ^
  -H "Content-Type: application/json" ^
  -d "{\"first_name\":\"Marguerite\",\"last_name\":\"Okonkwo\",\"email\":\"m.okonkwo@ravensbourne-logistics.example\",\"company\":\"Ravensbourne Logistics\",\"message\":\"I am the VP of Customer Experience here. We run about 60 support agents across two sites and our current reporting is a weekly CSV someone builds by hand. I need to show the exec team resolution time by queue before our Q4 planning offsite, which is in three weeks. Can we get a demo this week?\"}"
```

Same company, opposite outcome. That contrast is your demo.

---

## 8. Activate (optional)

Toggle **Active** (top right) to make the webhook live at the production path
`http://localhost:5678/webhook/lead-triage` — note `/webhook/` rather than `/webhook-test/`.

Only meaningful if something real is posting to it; for the demo video, **Test workflow** is fine
and shows the data flowing node by node, which looks better on screen anyway.

---

## If the import fails

The workflow JSON was written against n8n's standard format but **could not be verified against
your exact version (2.42.7)** — node `typeVersion` numbers do drift between releases. If import
errors or a node shows as unrecognised, build it by hand; it's five nodes:

| node | key settings |
|---|---|
| **Webhook** | POST, path `lead-triage`, Respond = *Using Respond to Webhook node* |
| **HTTP Request** | POST `https://api.anthropic.com/v1/messages`, Header Auth → Anthropic API, header `anthropic-version: 2023-06-01`, JSON body (copy from the imported node or the JSON file) |
| **Code** | paste the whole of `workflows/code-node.js` |
| **HTTP Request** | POST `https://api.hubapi.com/crm/v3/objects/contacts`, Header Auth → HubSpot Private App, JSON body as in the file |
| **Respond to Webhook** | respond with JSON |

`workflows/code-node.js` exists precisely for this — it's the Code node body on its own.

---

## What to tell me

Whatever happens — working, or the exact error text. If a node errors, open it and copy the
message; n8n's errors name the node and the HTTP status, which is usually enough to pinpoint it.
