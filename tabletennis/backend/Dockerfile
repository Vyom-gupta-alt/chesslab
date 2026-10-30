# Build context: the tabletennis/ directory (see docker-compose.yml)
FROM python:3.12-slim

# ffmpeg for audio extraction / cutting; libegl1 + libgles2 are needed by MediaPipe Tasks
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg libegl1 libgles2 libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv
COPY ml_pipeline /srv/ml_pipeline
RUN pip install --no-cache-dir -e "/srv/ml_pipeline[pose]"
COPY backend /srv/backend
WORKDIR /srv/backend
RUN pip install --no-cache-dir -e .

ENV TT_STORAGE_DIR=/data TTVISION_CACHE=/data/models
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
