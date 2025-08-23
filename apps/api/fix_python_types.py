#!/usr/bin/env python3
"""Fix Python 3.9 incompatible type annotations"""
import os
import re

def fix_file(filepath):
    """Fix type annotations in a single file"""
    with open(filepath, 'r') as f:
        content = f.read()
    
    original = content
    
    # Add import if needed
    if '| None' in content and 'from typing import' not in content:
        content = 'from typing import Optional\n' + content
    elif '| None' in content and 'Optional' not in content:
        # Add Optional to existing import
        content = re.sub(
            r'from typing import ([^)]+)',
            r'from typing import \1, Optional',
            content
        )
    
    # Replace type | None with Optional[type]
    content = re.sub(r'\bstr\s*\|\s*None\b', 'Optional[str]', content)
    content = re.sub(r'\bint\s*\|\s*None\b', 'Optional[int]', content)
    content = re.sub(r'\bfloat\s*\|\s*None\b', 'Optional[float]', content)
    content = re.sub(r'\bbool\s*\|\s*None\b', 'Optional[bool]', content)
    content = re.sub(r'\bdict\s*\|\s*None\b', 'Optional[dict]', content)
    content = re.sub(r'\blist\s*\|\s*None\b', 'Optional[list]', content)
    content = re.sub(r'\bdatetime\s*\|\s*None\b', 'Optional[datetime]', content)
    content = re.sub(r'\bDict\s*\|\s*None\b', 'Optional[Dict]', content)
    content = re.sub(r'\bList\s*\|\s*None\b', 'Optional[List]', content)
    
    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Fixed: {filepath}")
        return True
    return False

# Fix all Python files in app directory
app_dir = '/Users/2a/Desktop/Claudable/.conductor/karachi/apps/api/app'
fixed_count = 0

for root, dirs, files in os.walk(app_dir):
    # Skip .venv directory
    if '.venv' in root:
        continue
    
    for file in files:
        if file.endswith('.py'):
            filepath = os.path.join(root, file)
            if fix_file(filepath):
                fixed_count += 1

print(f"\nFixed {fixed_count} files")