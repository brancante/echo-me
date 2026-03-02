#!/bin/bash
# Test script for Persona Extraction pipeline

set -e

echo "🧪 Echo Me Persona Extraction Pipeline Test"
echo "============================================="
echo

# Check if required services are running
echo "Checking services..."
if ! docker-compose ps | grep -q "db.*Up"; then
  echo "❌ PostgreSQL is not running. Start with: docker-compose up -d db"
  exit 1
fi

if ! docker-compose ps | grep -q "redis.*Up"; then
  echo "❌ Redis is not running. Start with: docker-compose up -d redis"
  exit 1
fi

echo "✅ Services running"
echo

# 1. Create a dummy user and persona in DB directly using psql via docker
echo "Setting up dummy user and persona..."
USER_ID=$(docker-compose exec -T db psql -U echo -d echome -t -A -c "INSERT INTO users (email, name) VALUES ('test_persona@example.com', 'Persona Tester') RETURNING id;" | xargs)

if [ -z "$USER_ID" ]; then
    # Maybe user already exists, let's select it
    USER_ID=$(docker-compose exec -T db psql -U echo -d echome -t -A -c "SELECT id FROM users WHERE email='test_persona@example.com';" | xargs)
fi

PERSONA_ID=$(docker-compose exec -T db psql -U echo -d echome -t -A -c "INSERT INTO personas (user_id, name) VALUES ('$USER_ID', 'Test Persona') RETURNING id;" | xargs)

echo "User ID: $USER_ID"
echo "Persona ID: $PERSONA_ID"

# 2. Setup mock audio/video in the path
DEMO_DIR="$(pwd)/data/video/$USER_ID/test_job_123"
mkdir -p "$DEMO_DIR"

echo "Creating dummy mp4 file (just a 5-second silence for testing)..."
# Create a 5-second silent mp4 video
ffmpeg -y -f lavfi -i anullsrc=r=16000:cl=mono -t 5 -c:a aac "$DEMO_DIR/prepared.mp4" >/dev/null 2>&1
echo "✅ Dummy video created at data/video/$USER_ID/test_job_123/prepared.mp4"

# 3. Insert job into database and queue
echo "Creating persona_extract job..."

JOB_ID=$(docker-compose exec -T db psql -U echo -d echome -t -A -c "INSERT INTO jobs (user_id, type, status, input) VALUES ('$USER_ID', 'persona_extract', 'pending', '{\"persona_id\": \"$PERSONA_ID\"}') RETURNING id;" | xargs)

echo "Job ID: $JOB_ID"
echo "Pushing job to Redis queue: queue:persona_extract"
docker-compose exec -T redis redis-cli RPUSH "queue:persona_extract" "$JOB_ID" >/dev/null

echo
echo "✅ Job queued! Watch the persona worker logs:"
echo "docker-compose logs -f engine-persona"
echo
echo "To clean up after testing:"
echo "rm -rf $(pwd)/data/video/$USER_ID"
