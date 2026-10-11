# PrismSense — simple local start and one-service deploy

PrismSense brings Agent Query, Agent Desk, Agent Research, and Agent Graph together in the Progga workspace, alongside the evidence library. This package gives you one Windows launcher for local use and one combined service for cloud deployment. The model runs through OpenRouter in the cloud; your PC does not need a GPU.

## Start on Windows

Install Python 3.11+ and Node.js 22.12+ once. Then extract the ZIP, open the extracted folder, and double-click **Start-PrismSense.bat**. The first run creates a project-only Python virtual environment, installs the packages, asks for your OpenRouter key without showing what you type, starts Django and the frontend, then opens the site at `http://127.0.0.1:5173`.

To stop both servers, double-click **Stop-PrismSense.bat**. Startup and error logs are saved in `run/`.

You can also start it from PowerShell opened in the project folder:

```powershell
.\Start-PrismSense.ps1
```

The key is saved in the private, Git-ignored file `backend/config/local_secrets.py`. You can skip the prompt and add a key later in that file. To check it, open PowerShell in `backend/` and run:

```powershell
.venv\Scripts\python.exe check_openrouter.py
```

Keep the API key out of frontend files, screenshots, GitHub, and chat messages. If a key has been shared in a chat or screenshot, revoke it in OpenRouter and create a replacement.

## Deploy to a public URL

This project includes Render and Vercel deployment settings. Both deploy the React frontend and Django API from one repository. Render builds the root `Dockerfile` remotely; Docker Desktop is not required on your computer. Vercel detects the Django entrypoint and builds the Vite frontend as part of deployment.

### Render

1. Create a private GitHub repository and upload the extracted project. Do not upload `backend/config/local_secrets.py` or any key.
2. In Render, choose **New → Blueprint**, connect that GitHub repository, and select the `render.yaml` Blueprint.
3. When Render prompts for `OPENROUTER_API_KEY`, enter a newly created OpenRouter inference key in its secret field. Render generates the Django secret automatically.
4. Create the service, wait for the build and deploy to finish, then open the `.onrender.com` URL shown on the service page.

The Blueprint selects Render's free web-service plan. Render lists its current compute limits and free-plan restrictions in its dashboard and docs; availability, sleep behavior, and limits can change. OpenRouter's free model catalog and request quotas can also change. A free model API and free hosting are subject to those providers' policies; neither this project nor PrismSense controls those limits. The demo lasts ten minutes. Without Redis, its signed browser cookie stores the demo timer, so clearing browser cookies can restart a demo; add shared Redis later if you need server-enforced trials across users and instances.

### Vercel

1. Push the project to a private GitHub repository. Keep `backend/config/local_secrets.py` and all `.env` files out of Git.
2. In Vercel, choose **Add New → Project**, import the repository, and leave the project root at `.` (the repository root). Vercel reads `pyproject.toml`, builds `frontend/`, and includes the Django app and its knowledge JSON files in the function.
3. Open **Project Settings → Environment Variables**. Add these for **Production** and **Preview** (and **Development** if you use Vercel's local tooling):
   - `DJANGO_DEBUG` = `0`
   - `DJANGO_ALLOWED_HOSTS` = `.vercel.app,localhost,127.0.0.1`
   - `DJANGO_SECRET_KEY` = a long, randomly generated Django secret; choose Vercel's **Secret** type
   - `PPRC_LLM` = `openrouter`
   - `OPENROUTER_API_KEY` = your replacement OpenRouter inference key; choose Vercel's **Secret** type for it
   - `OPENROUTER_MODEL` = `apodex/apodex-1.1-mini:free` (optional; this is the default)
4. Save each variable once, then deploy. Vercel stores project environment variables and injects them into future deployments, so you do not need to enter the key on every deploy. If you rotate or change a variable, trigger a new deployment for it to take effect. For a custom domain, add its hostname to `DJANGO_ALLOWED_HOSTS`.

Never paste an API key into source code, a frontend `VITE_*` variable, Git, screenshots, or chat. If a key was exposed, revoke it with OpenRouter and create a replacement before deployment. The app reads Vercel's environment first, so a deployment secret takes precedence over any ignored local settings file.

Vercel's Python runtime is currently documented as Beta and uses its Functions/Fluid Compute billing model. Check your account's current usage and limits before sharing the app; Vercel hosting is separate from OpenRouter's model charges and free-model quotas.

## Choose the OpenRouter model

The starting model is `apodex/apodex-1.1-mini:free`. Change `OPENROUTER_MODEL` in `backend/config/local_secrets.py` for local use, or in the selected hosting provider's environment settings for deployment. Keep `PPRC_LLM` set to `openrouter`. The model slug, free access, and rate limits are controlled by OpenRouter and can change over time.

The application sends requests from Django to OpenRouter. The browser never receives the secret key. If OpenRouter is unavailable or rejects the key, the UI reports that model synthesis was not used and shows retrieved evidence rather than pretending the model answered.

## How research answers are produced

PrismSense searches the project JSON knowledge base using the question, then sends the matching source passages and numeric facts to the configured model as its evidence packet. The model must synthesize that evidence and return citation IDs; the app checks the result against the retrieved records. It does not send the entire JSON corpus on every request or let the model fill evidence gaps from general knowledge. If nothing relevant is retrieved, the model is not asked to guess.

The answer view renders Markdown-style headings and lists, reveals the completed answer with a typing animation, and shows a research-progress indicator while the request is running. Open **Issues / Run activity** to inspect the actual model-use status, quality warnings, evidence limitations, and workflow stages. The typing animation begins after the server has returned the completed response; the loading panel remains visible while retrieval and model generation are in progress.

## Project layout

- `Start-PrismSense.bat` / `Stop-PrismSense.bat`: one-click local startup and shutdown.
- `backend/`: Django API, research workflows, evidence corpus, and private local model settings.
- `frontend/`: React application and Vite development server.
- `Dockerfile`: combined production image for a cloud host that builds Dockerfiles.
- `render.yaml`: Render's one-service deployment configuration.
- `vercel.json` / `pyproject.toml`: Vercel's Django entrypoint and build configuration.
- `docs/`: architecture, research workflows, citations, and quality-gate notes.

## API endpoints

- `GET /api/health/`
- `POST /api/model-check/`
- `GET /api/access/status/`
- `POST /api/demo/start/`
- `POST /api/ask/`
- `POST /api/orchestrate/`
- `POST /api/graph-agent/`
- `GET /api/library/?q=...&limit=100`
