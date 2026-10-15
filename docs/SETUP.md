# Setup — your steps, in detail

Everything that could be built for you is built. These are the parts that need your accounts.

About 25 minutes. Steps 2–3 are HubSpot admin, 4–8 are n8n.

---

## 1. Start n8n

Double-click **`start-n8n.bat`** in the project folder.

Wait for **"Editor is now accessible via http://localhost:5678"** — about a minute on first run.
Leave that console window open; closing it stops n8n.

Open **http://localhost:5678** and create the owner account if asked. It's local only.

> Seeing a *"Failed to start Python task runner"* message and a list of deprecation warnings is
> normal. The line that matters is **`Registered runner "JS Task Runner"`** — that's the one the
> workflow needs.
>
> If n8n offers to configure a **sandbox service** asking for a URL and API key: **skip it.** It
> needs Docker and is optional.

---

## 2. HubSpot — create a Service Key

> **HubSpot changed this in late 2026.** Private apps were consolidated into a "Legacy Apps" page
> and then removed for newer accounts. The replacement for "I just want a token to call the API
> from my own code" is a **Service Key**. If your account offers Legacy Apps, that still works; if
> it says *"Legacy apps aren't available on this account"*, use a Service Key as below.
>
> Service Keys are the right fit here: they're for data-only, system-to-system access, which is
> exactly what this workflow does. They don't support webhooks or UI extensions — we don't need
> either. The alternative, a project-based app, needs the HubSpot CLI and is far more setup than
> this warrants.

1. Go to **https://app.hubspot.com** and log in.
2. Click the **gear icon** ⚙ in the top-right of the blue navigation bar.
3. In the **left sidebar** go to **Integrations → Service Keys**.
   - Depending on the account, it may sit under a **Development** section instead.
   - Fastest route either way: the **search box at the top of the settings sidebar** — type
     `service`.
4. Click **Create a service key**.
5. Give it a name: `Lead Triage`.
6. Add **scopes**. Search for `contacts` and select:
   - `crm.objects.contacts.read`
   - `crm.objects.contacts.write`

   Grant only these two. Least privilege — a key that can only read and write contacts can't do
   damage elsewhere if it leaks.
7. Review, then **Create**.
8. **Copy the key immediately** and paste it into Notepad. HubSpot may not show it again.

> Needs **Super Admin** or Developer tools access. On your own developer account you have it.
>
> If the key is ever exposed, there's a **Rotate** button — use that rather than deleting and
> rebuilding the integration.

**Sources:** [Service Keys announcement](https://developers.hubspot.com/blog/hubspot-service-keys-the-right-api-credential-for-data-integrations) ·
[Legacy private apps](https://developers.hubspot.com/docs/apps/legacy-apps/private-apps/overview) ·
[Developer platform overview](https://developers.hubspot.com/docs/apps/developer-platform/overview)

---

## 3. HubSpot — add two contact properties

The workflow writes the tier onto the contact record, so the fields have to exist first.

1. Still in **Settings** (⚙).
2. Left sidebar → **Data Management** → **Properties**.
   - Or type `properties` in that sidebar search box.
3. At the top there's a dropdown reading **"Select an object"**. Choose **Contact properties**.
4. Click **Create property** (top right).
5. Fill in:

   | field | value |
   |---|---|
   | Object type | Contact |
   | Group | Contact information (any group is fine) |
   | Label | `Lead Triage Tier` |

6. **Check the internal name.** Under the Label box there's small grey text showing the internal
   name HubSpot generated, with an edit (pencil) icon. It must read exactly:

   ```
   lead_triage_tier
   ```

   If it reads anything else, click the pencil and correct it. **This is the one thing that must
   match exactly** — it's what the API writes to.

7. Click **Next**. For **Field type** choose **Single-line text**.
8. Click **Create**.

Now repeat steps 4–8 for the second property:

| field | value |
|---|---|
| Label | `Lead Triage Reason` |
| Internal name | `lead_triage_reason` |
| Field type | Single-line text |

---

## 4. n8n — create two credentials

n8n stores secrets separately from workflows, which is why importing the workflow doesn't bring
them along.

1. In n8n, find **Credentials** in the left sidebar. In this version it may be a **tab** at the top
   of the **Overview** page rather than its own sidebar item — look for *Workflows | Credentials |
   Executions*.
2. Click **Add credential** (or **Create Credential**).
3. In the search box type **`Header Auth`** and pick **Header Auth**.

**Credential one — Anthropic:**

| field | value |
|---|---|
| Name | `x-api-key` |
| Value | your Anthropic key — it's in `C:\Users\nchen\Downloads\lead-triage\.anthropic_key` |

Rename the credential itself to **`Anthropic API`** — click the credential's title at the top of
the dialog (it'll say something like *Header Auth account*) and type over it. Click **Save**.

**Credential two — HubSpot:** repeat, new Header Auth credential:

| field | value |
|---|---|
| Name | `Authorization` |
| Value | `Bearer <your service key>` |

The value is the literal word **`Bearer`**, then **one space**, then the Service Key from step 2.
Rename the credential to **`HubSpot Private App`** (the workflow expects that name) and Save.

> Service Keys authenticate exactly like the old private-app tokens — same `Authorization: Bearer`
> header — so nothing else in the workflow changes.

> Open `.anthropic_key` with Notepad to copy the key. Don't paste either secret into a chat window
> or a file in the repo.

---

## 5. n8n — import the workflow

1. Left sidebar → **Workflows** → **Create Workflow** (this opens a blank canvas).
2. In the **top-right of the canvas**, click the **⋯** (three dots) menu.
3. Choose **Import from File…**
4. Select:

   ```
   C:\Users\nchen\Downloads\lead-triage\workflows\lead-triage.json
   ```

Five nodes should appear, left to right:

```
Webhook → Claude — extract facts → Apply rubric (code) → HubSpot — create contact → Respond
```

Press **Ctrl+S** to save. Name it anything.

---

## 6. n8n — attach the credentials to the nodes

Two nodes need a credential selected. Importing never carries secrets.

1. **Double-click** the node **Claude — extract facts**.
2. Near the top there's **Credential for Header Auth** with a dropdown. Choose **Anthropic API**.
3. Close the node (click the canvas, or **Back to canvas** top-left).
4. **Double-click** **HubSpot — create contact**.
5. Same dropdown → choose **HubSpot Private App**.
6. Close it, then **Ctrl+S** to save.

---

## 7. Test it

1. In n8n, click **Test workflow** at the bottom of the canvas. It now waits for one request.
2. In Explorer, **right-click `test-webhook.ps1`** → **Run with PowerShell**.
3. The script pauses and tells you to press Enter — press it. It sends the first lead.
4. Watch the n8n canvas: each node should turn green in turn.
5. The script prints the response.

**Expected first result — tier D:**

```json
{ "tier": "D", "reason": "Rule 1 — job seeker overrides fit.", "facts": { "disqualifier": "job_seeker", ... } }
```

That's a support team lead at an **ideal customer** — and the correct answer is still D, because
he's asking for a job. That's the whole point of the project.

6. The script then waits again. **Click "Test workflow" in n8n once more** (it only listens for one
   request at a time), then press Enter in the script window.

**Expected second result — tier A:** same company, a VP with budget and a three-week deadline.

7. Check HubSpot: **Contacts** → you should see both people, with **Lead Triage Tier** set to D
   and A. If the column isn't shown, use **Edit columns** to add it.

---

## 8. Activate — optional

Toggle **Active** in the top right to make the webhook live at
`http://localhost:5678/webhook/lead-triage` — note `/webhook/`, not `/webhook-test/`.

Only useful if something real is posting to it. For a demo video, **Test workflow** is better
anyway: it animates each node as data flows through, which shows the architecture on screen.

---

## If something fails

| symptom | cause |
|---|---|
| Script says *connection refused* | n8n isn't running — run `start-n8n.bat` |
| Script says **404** | n8n isn't listening — click **Test workflow** first; it only accepts one request per click |
| **Claude** node red, 401 | the `x-api-key` credential — check the header Name is exactly `x-api-key` |
| **HubSpot** node red, 401 | the Authorization value needs `Bearer ` before the service key |
| **HubSpot** node red, 400 | property name mismatch — internal names must be `lead_triage_tier` and `lead_triage_reason` |
| **Apply rubric** node red | open it and copy the error — the Code node body is also in `workflows/code-node.js` |
| Import fails / node unrecognised | n8n version drift. Rebuild by hand — see the table below |

### Rebuilding by hand

Five nodes, if import won't take:

| node | settings |
|---|---|
| **Webhook** | POST, path `lead-triage`, Respond = *Using Respond to Webhook node* |
| **HTTP Request** | POST `https://api.anthropic.com/v1/messages`, Header Auth → Anthropic API, add header `anthropic-version: 2023-06-01`, JSON body from the JSON file |
| **Code** | paste all of `workflows/code-node.js` |
| **HTTP Request** | POST `https://api.hubapi.com/crm/v3/objects/contacts`, Header Auth → HubSpot Private App, JSON body from the JSON file |
| **Respond to Webhook** | respond with JSON |

---

## Tell me

Whatever happens — working, or the exact error. If a node goes red, open it and copy the message;
n8n names the node and the HTTP status, which is usually enough to pinpoint it.
