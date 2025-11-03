# ethical-health-ai-agent

Core logic for an ethical, safety-first AI Health Advisor. Implements risk-based protocols, multi-modal guardrails (OCR, voice), and "Green AI" principles.

IMPORTANT: This repository is for information only and must NOT be used for diagnosis or treatment.

## Run locally
1. Install dependencies:
   - Node: `npm install`
   - or Yarn: `yarn`
2. Add secrets in a local `.env` (do NOT commit)
3. Start for development:
   - `npm run dev` or `yarn dev`

## Deployment
This project is deployed to Google Cloud Run. Deployment artifacts:
- Dockerfile (if containerized)
- cloudbuild.yaml (if using Cloud Build)
- other infra (Terraform / gcloud commands)

## CI/CD (example)
To auto-deploy from GitHub Actions to Cloud Run:
- Create a GCP service account with least privilege (Cloud Run Admin, Cloud Build Editor, Storage Admin).
- Download a JSON key and store it in GitHub Secrets as `GCP_SA_KEY`.
- Add `GCP_PROJECT`, `SERVICE_NAME`, and `GCP_REGION` as repo secrets.
- Use the workflow in `.github/workflows/deploy-gcloud.yml` (example provided).

## Security
- Never commit keys or secrets.
- Use GitHub Secrets for CI/CD.
