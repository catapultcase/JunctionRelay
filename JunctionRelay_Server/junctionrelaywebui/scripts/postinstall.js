/**
 * Post-install script for JunctionRelay Server
 * Copies vendored packages (compiled/closed-source) to node_modules
 */

const fs = require('fs');
const path = require('path');

const junctionrelayDir = path.join(__dirname, '../node_modules/@junctionrelay');

/**
 * Install a vendored package from vendor/ to node_modules/
 */
function installVendoredPackage(packageName) {
    const vendorSrc = path.join(__dirname, `../vendor/@junctionrelay/${packageName}`);
    const nodeModulesDest = path.join(junctionrelayDir, packageName);

    // Skip if vendor source doesn't exist (package may not be deployed yet)
    if (!fs.existsSync(vendorSrc)) {
        console.log(`⏭  Skipping @junctionrelay/${packageName} (not in vendor/)`);
        return;
    }

    // Remove existing if present (handles symlinks, dangling symlinks, and directories)
    try {
        const stat = fs.lstatSync(nodeModulesDest);
        if (stat.isSymbolicLink()) {
            fs.unlinkSync(nodeModulesDest);
        } else {
            fs.rmSync(nodeModulesDest, { recursive: true, force: true });
        }
    } catch (e) {
        // ENOENT — doesn't exist, nothing to remove
    }

    // Copy vendor files to node_modules
    fs.cpSync(vendorSrc, nodeModulesDest, { recursive: true });
    console.log(`✓ @junctionrelay/${packageName} installed from vendor/`);
}

console.log('📦 Installing vendored @junctionrelay packages...');

try {
    // Create @junctionrelay directory if it doesn't exist
    if (!fs.existsSync(junctionrelayDir)) {
        fs.mkdirSync(junctionrelayDir, { recursive: true });
    }

    // Install all vendored packages
    installVendoredPackage('styles');
    installVendoredPackage('frameengine');

    console.log('  → node_modules/@junctionrelay/');
} catch (error) {
    console.error('❌ Failed to install vendored packages:', error.message);
    process.exit(1);
}
