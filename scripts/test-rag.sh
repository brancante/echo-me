#!/bin/bash
# Test script for RAG ingestion pipeline

set -e

echo "🧪 Echo Me RAG Pipeline Test"
echo "=============================="
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

if ! docker-compose ps | grep -q "chroma.*Up"; then
  echo "❌ ChromaDB is not running. Start with: docker-compose up -d chroma"
  exit 1
fi

echo "✅ All services running"
echo

# Create test data directory
TEST_DIR="$(pwd)/data/test-rag"
mkdir -p "$TEST_DIR"

# Create sample CSV file
echo "Creating sample product catalog..."
cat > "$TEST_DIR/products.csv" << 'EOF'
id,name,price,description,category
P001,Premium Coffee Beans,24.99,Arabica beans from Colombia with notes of chocolate and caramel,Coffee
P002,Espresso Machine,399.99,Professional-grade espresso machine with 15-bar pressure,Equipment
P003,Milk Frother,49.99,Electric milk frother for perfect foam every time,Accessories
P004,Coffee Grinder,89.99,Burr grinder with 40 grind settings,Equipment
P005,French Press,34.99,Borosilicate glass French press 34oz capacity,Equipment
EOF

echo "✅ Created sample CSV with 5 products"
echo

# Create sample PDF info
echo "Creating sample product guide..."
cat > "$TEST_DIR/guide.txt" << 'EOF'
Coffee Equipment Care Guide
===========================

Espresso Machine Maintenance:
- Clean the portafilter after each use
- Backflush weekly with cleaning powder
- Descale monthly using citric acid solution
- Replace water filter every 2-3 months

Grinder Tips:
- Clean burrs monthly to prevent oil buildup
- Use rice to absorb old coffee oils
- Calibrate grind size based on extraction time
- Store in a dry location

French Press Best Practices:
- Use coarse grind (size of sea salt)
- Water temperature: 195-205°F (90-96°C)
- Steep time: 4 minutes
- Clean mesh filter after every use

Common Issues:
- Bitter coffee: grind too fine or over-extraction
- Sour coffee: grind too coarse or under-extraction
- Weak coffee: insufficient coffee-to-water ratio
EOF

echo "✅ Created sample product guide"
echo

# Simulate database insertion (in a real test, you'd use the API)
echo "📝 Test files created in: $TEST_DIR"
echo
echo "To test the full pipeline:"
echo "1. Start the RAG worker:"
echo "   cd engine && python -m rag.worker"
echo
echo "2. Upload via API (requires auth):"
echo "   curl -X POST http://localhost:3000/api/products/upload \\"
echo "     -H 'Cookie: next-auth.session-token=YOUR_TOKEN' \\"
echo "     -F 'file=@$TEST_DIR/products.csv' \\"
echo "     -F 'name=Product Catalog'"
echo
echo "3. Watch the worker logs for processing status"
echo
echo "4. Check ChromaDB collections:"
echo "   curl http://localhost:8000/api/v1/collections"
echo
echo "✅ Test preparation complete!"
