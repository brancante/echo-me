#!/bin/bash
# Test Echo Me Chat Engine end-to-end

set -e

echo "🧪 Testing Echo Me Chat Engine"
echo "================================"

# Configuration
BASE_URL="http://localhost:3000"
MESSAGE="What products do you have for small businesses?"

echo ""
echo "📝 Creating chat job..."
echo "Message: $MESSAGE"

# Create job
JOB_RESPONSE=$(curl -s -X POST $BASE_URL/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"$MESSAGE\", \"generate_audio\": false}")

# Extract job ID
JOB_ID=$(echo $JOB_RESPONSE | jq -r '.job_id')

if [ "$JOB_ID" = "null" ] || [ -z "$JOB_ID" ]; then
  echo "❌ Failed to create job"
  echo $JOB_RESPONSE | jq
  exit 1
fi

echo "✅ Job created: $JOB_ID"
echo ""
echo "⏳ Polling for completion..."

# Poll for completion
MAX_ATTEMPTS=30
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  STATUS_RESPONSE=$(curl -s $BASE_URL/api/chat/$JOB_ID)
  STATUS=$(echo $STATUS_RESPONSE | jq -r '.status')
  
  echo "  [$ATTEMPT/$MAX_ATTEMPTS] Status: $STATUS"
  
  if [ "$STATUS" = "completed" ]; then
    echo ""
    echo "✅ Chat completed!"
    echo ""
    echo "📄 Result:"
    echo $STATUS_RESPONSE | jq '.result_data'
    echo ""
    echo "💬 Response Text:"
    echo $STATUS_RESPONSE | jq -r '.result_data.response_text'
    exit 0
  elif [ "$STATUS" = "failed" ]; then
    echo ""
    echo "❌ Chat failed!"
    echo ""
    echo "Error:"
    echo $STATUS_RESPONSE | jq '.error_message'
    exit 1
  fi
  
  ATTEMPT=$((ATTEMPT + 1))
  sleep 2
done

echo ""
echo "⏰ Timeout waiting for job completion"
exit 1
