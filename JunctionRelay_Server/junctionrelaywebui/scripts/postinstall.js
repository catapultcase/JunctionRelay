/**
 * Post-install script for JunctionRelay Server
 * Copies vendored FrameEngine (compiled/closed-source) to node_modules
 */

const fs = require('fs');
const path = require('path');

const vendorSrc = path.join(__dirname, '../vendor/@junctionrelay/frameengine');
const nodeModulesDest = path.join(__dirname, '../node_modules/@junctionrelay/frameengine');

console.log('📦 Installing vendored FrameEngine...');

try {
    // Create @junctionrelay directory if it doesn't exist
    const junctionrelayDir = path.join(__dirname, '../node_modules/@junctionrelay');
    if (!fs.existsSync(junctionrelayDir)) {
        fs.mkdirSync(junctionrelayDir, { recursive: true });
    }

    // Remove existing FrameEngine if present
    if (fs.existsSync(nodeModulesDest)) {
        fs.rmSync(nodeModulesDest, { recursive: true, force: true });
    }

    // Copy vendor files to node_modules
    fs.cpSync(vendorSrc, nodeModulesDest, { recursive: true });

    console.log('✓ FrameEngine installed successfully from vendor/');
    console.log('  → node_modules/@junctionrelay/frameengine/');
} catch (error) {
    console.error('❌ Failed to install FrameEngine:', error.message);
    process.exit(1);
}
