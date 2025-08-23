#!/bin/bash
# Script to push to KnowAll-AI organization

# Update remote URL
git remote set-url origin https://github.com/KnowAll-AI/mcp-neo4j-agent-memory.git

# Verify the change
echo "New remote URL:"
git remote -v

# Push all branches and tags
git push -u origin main
git push --tags

echo "✅ Repository pushed to KnowAll-AI/mcp-neo4j-agent-memory"