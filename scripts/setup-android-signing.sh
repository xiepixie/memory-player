#!/bin/bash
# Setup Android signing configuration for Tauri
# Usage: ./setup-android-signing.sh <keystore_base64> <key_alias> <key_password>
# 
# Per Tauri docs: https://v2.tauri.app/distribute/sign/android/

set -e

ANDROID_KEY_BASE64="$1"
ANDROID_KEY_ALIAS="$2"
ANDROID_KEY_PASSWORD="$3"

if [ -z "$ANDROID_KEY_BASE64" ]; then
    echo "❌ No signing configuration provided, skipping..."
    exit 0
fi

cd src-tauri/gen/android

# Decode keystore to temp directory (avoids path issues)
KEYSTORE_PATH="$RUNNER_TEMP/release.keystore"
echo "$ANDROID_KEY_BASE64" | base64 -d > "$KEYSTORE_PATH"

# Create keystore.properties (per Tauri docs)
cat > keystore.properties << EOF
keyAlias=$ANDROID_KEY_ALIAS
password=$ANDROID_KEY_PASSWORD
storeFile=$KEYSTORE_PATH
EOF

BUILD_FILE="app/build.gradle.kts"

# Check if signing config already exists
if grep -q 'create("release")' "$BUILD_FILE"; then
    echo "⚠️ Signing config already exists, skipping..."
    exit 0
fi

echo "📝 Modifying $BUILD_FILE for release signing..."

# Step 1: Add imports at the very top of the file
# Create temp file with imports prepended
{
    echo 'import java.io.FileInputStream'
    echo 'import java.util.Properties'
    echo ''
    cat "$BUILD_FILE"
} > "${BUILD_FILE}.tmp"
mv "${BUILD_FILE}.tmp" "$BUILD_FILE"

# Step 2: Replace the empty signingConfigs {} block with our release config
# Use Python for reliable multi-line replacement (available on GitHub runners)
python3 << 'PYTHON_SCRIPT'
import re

with open('app/build.gradle.kts', 'r') as f:
    content = f.read()

# Pattern to match signingConfigs { } or signingConfigs { ... }
# Tauri typically generates: signingConfigs {}
signing_config_block = '''signingConfigs {
        create("release") {
            val keystorePropertiesFile = rootProject.file("keystore.properties")
            val keystoreProperties = Properties()
            if (keystorePropertiesFile.exists()) {
                keystoreProperties.load(FileInputStream(keystorePropertiesFile))
            }
            keyAlias = keystoreProperties["keyAlias"] as String
            keyPassword = keystoreProperties["password"] as String
            storeFile = file(keystoreProperties["storeFile"] as String)
            storePassword = keystoreProperties["password"] as String
        }
    }'''

# Replace empty signingConfigs block
content = re.sub(r'signingConfigs\s*\{\s*\}', signing_config_block, content)

# Add signingConfig to the release buildType
# Match: getByName("release") { ... } and inject signingConfig after the opening brace
def add_signing_to_release(match):
    indent = match.group(1)
    return f'{indent}getByName("release") {{\n{indent}    signingConfig = signingConfigs.getByName("release")'

content = re.sub(
    r'(\s*)getByName\("release"\)\s*\{',
    add_signing_to_release,
    content,
    count=1  # Only replace the first occurrence in buildTypes
)

with open('app/build.gradle.kts', 'w') as f:
    f.write(content)

print("✅ build.gradle.kts modified successfully")
PYTHON_SCRIPT

echo "✅ Android signing configured"
echo ""
echo "=== keystore.properties ==="
cat keystore.properties
echo ""
echo "=== Signing config in build.gradle.kts ==="
grep -A 12 "signingConfigs {" "$BUILD_FILE" | head -15 || true
