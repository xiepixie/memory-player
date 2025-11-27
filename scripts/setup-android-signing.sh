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

# Insert import statements at the top of build.gradle.kts
sed -i '1s/^/import java.util.Properties\nimport java.io.FileInputStream\n\n/' app/build.gradle.kts

# Append signing configuration at the end
cat >> app/build.gradle.kts << 'EOF'

val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

android.signingConfigs.create("release") {
    keyAlias = keystoreProperties.getProperty("keyAlias")
    keyPassword = keystoreProperties.getProperty("password")
    storeFile = file(keystoreProperties.getProperty("storeFile"))
    storePassword = keystoreProperties.getProperty("password")
}

android.buildTypes.getByName("release") {
    signingConfig = android.signingConfigs.getByName("release")
}
EOF

echo "✅ Android signing configured"
echo "=== keystore.properties ==="
cat keystore.properties
echo "=== build.gradle.kts (first 10 lines) ==="
head -10 app/build.gradle.kts
