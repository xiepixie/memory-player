#!/bin/bash
# Setup Android signing configuration for Tauri
# Usage: ./setup-android-signing.sh <keystore_base64> <key_alias> <key_password>

set -e

ANDROID_KEY_BASE64="$1"
ANDROID_KEY_ALIAS="$2"
ANDROID_KEY_PASSWORD="$3"

if [ -z "$ANDROID_KEY_BASE64" ]; then
    echo "❌ No signing configuration provided, skipping..."
    exit 0
fi

cd src-tauri/gen/android

# Decode keystore
echo "$ANDROID_KEY_BASE64" | base64 -d > release.keystore
KEYSTORE_PATH="$(pwd)/release.keystore"

# Create keystore.properties
cat > keystore.properties << EOF
keyAlias=$ANDROID_KEY_ALIAS
password=$ANDROID_KEY_PASSWORD
storeFile=$KEYSTORE_PATH
EOF

# Check if signing config already exists
if grep -q "signingConfigs.create" app/build.gradle.kts; then
    echo "⚠️ Signing config already exists, skipping..."
    exit 0
fi

# Append signing configuration using fully qualified class names (no imports needed)
cat >> app/build.gradle.kts << 'SIGNING_CONFIG'

// === Release Signing Configuration ===
val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = java.util.Properties().apply {
    if (keystorePropertiesFile.exists()) {
        load(java.io.FileInputStream(keystorePropertiesFile))
    }
}

if (keystorePropertiesFile.exists()) {
    android.signingConfigs.create("release") {
        keyAlias = keystoreProperties.getProperty("keyAlias")
        keyPassword = keystoreProperties.getProperty("password")
        storeFile = file(keystoreProperties.getProperty("storeFile"))
        storePassword = keystoreProperties.getProperty("password")
    }
    android.buildTypes.getByName("release") {
        signingConfig = android.signingConfigs.getByName("release")
    }
}
SIGNING_CONFIG

echo "✅ Android signing configured"
echo "=== keystore.properties ==="
cat keystore.properties
echo "=== build.gradle.kts (last 20 lines) ==="
tail -20 app/build.gradle.kts
