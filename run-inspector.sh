#!/bin/bash

# Load environment variables from .env file
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Check if required environment variables are set
if [ -z "$NEO4J_URI" ] || [ -z "$NEO4J_USERNAME" ] || [ -z "$NEO4J_PASSWORD" ]; then
  echo "❌ Missing required environment variables!"
  echo "Please ensure your .env file contains:"
  echo "  NEO4J_URI"
  echo "  NEO4J_USERNAME"
  echo "  NEO4J_PASSWORD"
  exit 1
fi

echo "🔑 Environment variables loaded:"
echo "  NEO4J_URI=$NEO4J_URI"
echo "  NEO4J_USERNAME=$NEO4J_USERNAME"
echo "  NEO4J_DATABASE=${NEO4J_DATABASE:-neo4j}"
echo ""

# Run the inspector with environment variables
npx @modelcontextprotocol/inspector build/index.js