# TrojanHub AI service (FastAPI). Build from the REPO ROOT so the shared mocks are included:
#   docker build -f services/ai/Dockerfile -t trojanhub-ai .
#   docker run -p 8000:8000 --env-file services/ai/.env.deploy trojanhub-ai
# Works on Render, Railway, Fly.io, or any host that runs a container. See DEPLOY.md.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    HF_HOME=/opt/hf-cache PORT=8000

WORKDIR /app/services/ai

# CPU-only PyTorch first: the default Linux wheels pull ~2.5 GB of GPU libraries we don't use.
RUN pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu

COPY services/ai/requirements.txt .
RUN grep -v '^pytest' requirements.txt > /tmp/req.txt && pip install -r /tmp/req.txt

# Bake the text-embedding model into the image so the first question isn't slow.
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')"

COPY packages/shared/mocks /app/packages/shared/mocks
COPY services/ai /app/services/ai

# Never run as root in a public container.
RUN useradd --create-home trojan && chown -R trojan /app /opt/hf-cache
USER trojan

EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
