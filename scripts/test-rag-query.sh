#!/bin/bash
# Test script for RAG query endpoint

set -e

echo "🔍 Echo Me RAG Query Test"
echo "=========================="
echo

# Check if RAG query service is running
echo "Checking RAG query service health..."
if ! curl -s http://localhost:8001/health > /dev/null; then
  echo "❌ RAG query service is not running on port 8001"
  echo "Start it with: cd engine && python -m rag.query_service"
  exit 1
fi

echo "✅ RAG query service is running"
echo

# Create test user ID (use a fixed one for testing)
TEST_USER_ID="test-user-123"

echo "Testing query endpoint..."
echo "Query: 'What coffee products do you have?'"
echo

# Test query
RESPONSE=$(curl -s -X POST http://localhost:8001/query \
  -H "Content-Type: application/json" \
  -d "{
    \"user_id\": \"$TEST_USER_ID\",
    \"query\": \"What coffee products do you have?\",
    \"top_k\": 3,
    \"min_score\": 0.3
  }")

echo "Response:"
echo "$RESPONSE" | python3 -m json.tool

echo
echo "Explanation:"
echo "- documents: The actual text chunks that match your query"
echo "- metadatas: Metadata about each chunk (product_id, chunk_index)"
echo "- distances: Lower is better (cosine distance from query embedding)"
echo "- ids: ChromaDB document IDs"
echo
echo "✅ Query test complete!"
echo
echo "Next steps:"
echo "1. Upload some product data via the web UI first"
echo "2. Try different queries to test semantic search"
echo "3. Adjust min_score and top_k parameters"
