# Chroma Sync 🚗

 > **👀 README Preview:** If you are viewing this file in VS Code, right-click `README.md` and select **Open Preview** (or press `Ctrl + Shift + V`) to see the formatted version.

 ## Welcome to Chroma Sync!

 Hi! We are **Aditya and Venky**, and we built **Chroma Sync** for the 2026 Hackathon.

 Chroma Sync helps different automotive teams work together on colour, material, engineering, procurement, and quality decisions.

 This README explains how to get the project running on your computer.

---

 # 1\. What is inside the project?

 Chroma Sync has 3 main parts:

 1. **Frontend** — React + Vite
   - Runs on port `5173`
2. **AI Service** — FastAPI + Python
   - Runs on port `8000`
3. **Database** — Supabase
   - PostgreSQL
   - Authentication
   - Row Level Security (RLS)

 For local development, we run Supabase using the **Supabase CLI + Podman**.

---

 # 2\. What do I need to install?

 Before starting the project, please install these:

 ## Node.js

 Download Node.js:

 https://nodejs.org/

 Check that it is installed:

```
node --version
npm --version
```

---

 ## Python

 Download Python:

 https://www.python.org/downloads/

 Check:

```
python --version
```

---

 ## Supabase CLI

 Download/install the Supabase CLI using the official guide:

 https://supabase.com/docs/guides/cli

 Check:

```
supabase --version
```

---

 ## Podman

 Download Podman:

 https://podman.io/get-started

 Check:

```
podman --version
```

 We are using **Podman** for the local Supabase setup.

 ### Why Podman?

 Supabase needs a container runtime when running locally.

 You can use:

 - **Podman** — this is what we use.
- **Docker** — you can use Docker instead if you already have it installed.

 We used Podman because it does not require the Docker daemon to continuously listen for requests.

 If you already have Docker working, you can use Docker instead.

---

 # 3\. Start Podman

 After installing Podman, open **PowerShell**.

 Run:

```
podman machine start
```

 Then check that Podman is working:

```
podman info
```

 If you get an error saying that no Podman machine exists, run this once:

```
podman machine init
podman machine start
```

 Then check again:

```
podman info
```

---

 # 4\. Connect Supabase CLI to Podman

 Supabase CLI needs to know where the Podman container socket is.

 In PowerShell, run:

```
$env:DOCKER_HOST = (podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}')
```

 You can check it with:

```
$env:DOCKER_HOST
```

 ## Make it permanent

 You can save this setting so you don't have to enter it every time:

```
[Environment]::SetEnvironmentVariable("DOCKER_HOST", $env:DOCKER_HOST, "User")
```

 After doing this, restart PowerShell if needed.

---

 # 5\. Start Supabase

 Now go to the **main Chroma Sync project folder**.

 You should be in the folder that contains the `supabase` directory.

 For example:

```
cd "C:\path\to\Chroma-Sync"
```

 Then run:

```
supabase start
```

 That's it.

 Supabase will start the local database and other required services using Podman.

 The project migrations and seed data will also be loaded.

 When Supabase finishes starting, it will show information including the API URL and keys.

 **Copy the `anon key` because we need it for the frontend.**

---

 # 6\. Local Supabase URLs

 After running:

```
supabase start
```

 the important local URLs are:

 | Service | URL |
| --- | --- |
| Supabase API | http://localhost:54321 |
| Supabase Studio | http://localhost:54323 |
| PostgreSQL | `postgresql://postgres:postgres@localhost:54322/postgres` |
| Inbucket / Email | http://localhost:54324 |

### Supabase Studio

 You can open the database UI here:

 http://localhost:54323

 Supabase Studio is useful for looking at the database and checking data.

---

 # 7\. Connect the Frontend to Supabase

 Go into the `frontend` folder.

 Create:

```
frontend/.env
```

 Add:

```
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=<paste-your-anon-key-here>
```

 Replace:

```
<paste-your-anon-key-here>
```

 with the `anon key` shown when you run:

```
supabase start
```

---

 # 8\. Start the AI Service

 Open a **new terminal**.

 From the project folder:

```
cd ai-service
```

 Install the Python packages:

```
pip install -r requirements.txt
```

 Start the AI service:

```
uvicorn app.main:app --reload
```

 The AI service will run here:

 http://localhost:8000

---

 # 9\. Start the Frontend

 Open another terminal.

 Run:

```
cd frontend
```

 Install the frontend packages:

```
npm install
```

 Then start the frontend:

```
npm run dev
```

 The application will run here:

 http://localhost:5173

 Open that URL in your browser.

---

 # 10\. Quick Start

 If everything is already installed, the basic startup is:

 ## Terminal 1 — Podman + Supabase

```
podman machine start

$env:DOCKER_HOST = (podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}')

cd "C:\path\to\Chroma-Sync"

supabase start
```

 ## Terminal 2 — AI Service

```
cd ai-service
pip install -r requirements.txt
uvicorn app.main:app --reload
```

 ## Terminal 3 — Frontend

```
cd frontend
npm install
npm run dev
```

 Then open:

```
http://localhost:5173
```

---

 # 11\. Useful Supabase Commands

 ## Check Supabase

```
supabase status
```

 This shows the running Supabase services and URLs.

 ## Reset the database

```
supabase db reset
```

 Use this when you change migrations or `seed.sql` and want to recreate the local database.

 ## Stop Supabase

```
supabase stop
```

 ## Start Supabase again

```
supabase start
```

 ## Stop Podman

 When you are completely finished, you can stop the Podman machine:

```
podman machine stop
```

---

 # 12\. Demo Login

 The application uses **Row Level Security (RLS)**.

 This means different users can see and edit different things depending on their team and role.

 For the demo, we also have a simple PKI PIN simulation.

 **Password for all users:**

```
chroma-demo
```

 ## Design Team

 - Editor: `design.editor@chroma.test` — PIN `1001`
- Approver: `design.approver@chroma.test` — PIN `1002`
- Viewer: `design.viewer@chroma.test` — PIN `1003`

 ## Engineering Team

 - Editor: `engineering.editor@chroma.test` — PIN `1004`
- Approver: `engineering.approver@chroma.test` — PIN `1005`
- Viewer: `engineering.viewer@chroma.test` — PIN `1006`

 ## Procurement Team

 - Editor: `procurement.editor@chroma.test` — PIN `1007`
- Approver: `procurement.approver@chroma.test` — PIN `1008`
- Viewer: `procurement.viewer@chroma.test` — PIN `1009`

 ## Quality Team

 - Editor: `quality.editor@chroma.test` — PIN `1010`
- Approver: `quality.approver@chroma.test` — PIN `1011`
- Viewer: `quality.viewer@chroma.test` — PIN `1012`

 ## Project Admin

 - Admin: `project.admin@chroma.test` — PIN `1013`

---

 # 13\. Things to Try in the Demo

 ## A. Approval Flow and RLS

 1. Log in as:

```
design.editor@chroma.test
```

 2. Create a new decision.
3. Notice that the Design user can edit Design fields.
4. Log out.
5. Log in as:

```
engineering.approver@chroma.test
```

 6. Notice that the Engineering user has different permissions.

 The important part is that permissions are also protected by PostgreSQL RLS, not only by the frontend.

---

 ## B. AI Conflict Detection

 Go to the **Conflicts** tab.

 The AI checks decisions and looks for possible conflicts.

 For example, it can find a:

 **Gloss Level Mismatch**

 One decision may specify Gloss `45`, while another related decision specifies Gloss `60`.

 The system highlights this as a conflict so the teams can check it.

---

 ## C. Material Intelligence

 Open a decision and look at the **Material Preview**.

 You can see the material information together with the 3D/VRED preview.

 For example:

 - Material maximum temperature: `80°C`
- Required temperature: `90°C`

 The system can identify that the material does not meet the requirement.

---

 ## D. Enterprise Reports

 Log in as:

```
project.admin@chroma.test
```

 PIN:

```
1013
```

 Then open the **Reports** section.

 You can view the **MySummaryReport** with information about portfolio health, risks, and supply-chain information.

---

 # 14\. Future Deployment

 Right now, we are running Supabase locally.

 The setup is:

```
Your Computer
│
├── React Frontend
│   └── localhost:5173
│
├── FastAPI AI Service
│   └── localhost:8000
│
└── Podman
    │
    └── Supabase
        ├── PostgreSQL
        ├── Authentication
        ├── API
        └── Supabase Studio
```

 In the future, Supabase can also be **self-hosted on AWS EC2**.

 For example:

```
Users
  │
  ▼
Application
  │
  ▼
AWS EC2
  │
  └── Self-hosted Supabase
       ├── PostgreSQL
       ├── Auth
       ├── API
       └── Other Supabase Services
```

 We are **not using EC2 for this hackathon setup**.

 For now, the simple local setup is:

 **Podman → Supabase CLI → `supabase start`**

---

 # 15\. If Something Does Not Work

 ### Podman error

 Try:

```
podman machine start
podman info
```

 If there is no machine:

```
podman machine init
podman machine start
```

 ### Supabase cannot start

 Set the Podman socket again:

```
$env:DOCKER_HOST = (podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}')
```

 Then:

```
supabase start
```

 ### Check Supabase

```
supabase status
```

 ### Start everything again

```
supabase start
```

```
cd ai-service
uvicorn app.main:app --reload
```

```
cd frontend
npm run dev
```

---

 # Made by Aditya & Venky (Team Maximus AI)

 We built **Chroma Sync** for the **2026 Hackathon**.

 Thanks for checking out our project!

 **Aditya & Venky**