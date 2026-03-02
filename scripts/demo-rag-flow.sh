#!/bin/bash
# Full RAG Pipeline Demo - Ingestion + Query

set -e

echo "🚀 Echo Me RAG Pipeline Demo"
echo "=============================="
echo
echo "This script demonstrates the full RAG flow:"
echo "1. Create sample product data"
echo "2. Simulate ingestion (normally via web UI)"
echo "3. Query the RAG system"
echo "4. Show retrieved context"
echo

# Check services
echo "Checking services..."
if ! docker-compose ps | grep -q "db.*Up"; then
  echo "❌ PostgreSQL not running. Start with: docker-compose up -d db"
  exit 1
fi

if ! docker-compose ps | grep -q "redis.*Up"; then
  echo "❌ Redis not running. Start with: docker-compose up -d redis"
  exit 1
fi

if ! docker-compose ps | grep -q "chroma.*Up"; then
  echo "❌ ChromaDB not running. Start with: docker-compose up -d chroma"
  exit 1
fi

echo "✅ All services running"
echo

# Sample data
DEMO_USER_ID="demo-user-$(date +%s)"
DEMO_DIR="$(pwd)/data/demo-rag"
mkdir -p "$DEMO_DIR"

echo "Creating sample product catalog..."
cat > "$DEMO_DIR/products.csv" << 'EOF'
id,name,price,description,category,stock
P001,Arabica Coffee Beans,24.99,Premium single-origin Arabica beans from Colombia with notes of chocolate and caramel,Coffee,50
P002,Espresso Machine Pro,399.99,Professional-grade espresso machine with 15-bar pressure and built-in grinder,Equipment,12
P003,Milk Frother Deluxe,49.99,Electric milk frother for perfect microfoam every time,Accessories,30
P004,Burr Coffee Grinder,89.99,Precision burr grinder with 40 grind settings from Turkish to French press,Equipment,25
P005,French Press 34oz,34.99,Borosilicate glass French press with stainless steel filter and heat-resistant handle,Equipment,40
P006,Pour Over Dripper,28.99,Ceramic pour-over coffee dripper with spiral ribs for optimal extraction,Equipment,35
P007,Cold Brew Maker,45.99,Large capacity cold brew coffee maker with built-in filtration system,Equipment,20
P008,Coffee Scale,32.99,Digital coffee scale with built-in timer accurate to 0.1g,Accessories,45
P009,Latte Art Pitcher,24.99,Stainless steel milk pitcher with precision spout for latte art,Accessories,55
P010,Coffee Storage Canister,19.99,Airtight coffee canister with CO2 valve keeps beans fresh for weeks,Accessories,60
EOF

echo "✅ Created sample catalog with 10 products"
echo

# Simulate ingestion
echo "📥 Simulating document ingestion..."
echo "(In production, this happens via web UI upload)"
echo

# For demo, we'll use a Python script to directly call the RAG worker logic
cat > "$DEMO_DIR/ingest.py" << 'PYTHON'
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../engine'))

from rag.worker import parse_document, embed_texts, get_chroma_client
from pathlib import Path
import json

# Demo settings
user_id = sys.argv[1]
file_path = sys.argv[2]
product_id = "demo-product-catalog"

print(f"Parsing {file_path}...")
text = parse_document(Path(file_path))

print("Chunking document...")
from langchain.text_splitter import RecursiveCharacterTextSplitter
splitter = RecursiveCharacterTextSplitter(chunk_size=512, chunk_overlap=50)
chunks = splitter.split_text(text)
print(f"Created {len(chunks)} chunks")

print("Generating embeddings...")
embeddings = embed_texts(chunks)

print("Storing in ChromaDB...")
chroma = get_chroma_client()
collection = chroma.get_or_create_collection(f"product_embeddings_{user_id}")

ids = [f"{product_id}_{i}" for i in range(len(chunks))]
metadatas = [{"product_id": product_id, "chunk_index": i} for i in range(len(chunks))]

collection.add(
    ids=ids,
    embeddings=embeddings,
    documents=chunks,
    metadatas=metadatas
)

print(f"✅ Ingested {len(chunks)} chunks into collection product_embeddings_{user_id}")
PYTHON

cd engine
python3 "$DEMO_DIR/ingest.py" "$DEMO_USER_ID" "$DEMO_DIR/products.csv"
cd ..

echo
echo "🔍 Testing RAG queries..."
echo

# Query 1
echo "Query 1: 'What coffee grinders do you have?'"
curl -s -X POST http://localhost:8001/query \
  -H "Content-Type: application/json" \
  -d "{
    \"user_id\": \"$DEMO_USER_ID\",
    \"query\": \"What coffee grinders do you have?\",
    \"top_k\": 2
  }" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print('Top Results:')
for i, doc in enumerate(data['documents'][:2], 1):
    print(f'{i}. {doc[:200]}...')
    print(f'   Distance: {data[\"distances\"][i-1]:.3f}')
    print()
"

echo
echo "Query 2: 'Which products are good for making latte art?'"
curl -s -X POST http://localhost:8001/query \
  -H "Content-Type: application/json" \
  -d "{
    \"user_id\": \"$DEMO_USER_ID\",
    \"query\": \"Which products are good for making latte art?\",
    \"top_k\": 2
  }" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print('Top Results:')
for i, doc in enumerate(data['documents'][:2], 1):
    print(f'{i}. {doc[:200]}...')
    print(f'   Distance: {data[\"distances\"][i-1]:.3f}')
    print()
"

echo
echo "Query 3: 'What's your most expensive item?'"
curl -s -X POST http://localhost:8001/query \
  -H "Content-Type: application/json" \
  -d "{
    \"user_id\": \"$DEMO_USER_ID\",
    \"query\": \"What's your most expensive item?\",
    \"top_k\": 2
  }" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print('Top Results:')
for i, doc in enumerate(data['documents'][:2], 1):
    print(f'{i}. {doc[:200]}...')
    print(f'   Distance: {data[\"distances\"][i-1]:.3f}')
    print()
"

echo
echo "✅ RAG Pipeline Demo Complete!"
echo
echo "Summary:"
echo "- Ingested 10 products from CSV"
echo "- Created chunks and embeddings"
echo "- Stored in ChromaDB collection: product_embeddings_$DEMO_USER_ID"
echo "- Ran 3 semantic search queries"
echo "- Retrieved relevant context based on query meaning"
echo
echo "Next steps:"
echo "1. Use retrieved chunks as context for LLM chat"
echo "2. Combine with persona voice for complete Echo Me experience"
echo "3. Deploy to production with Telegram bot integration"
