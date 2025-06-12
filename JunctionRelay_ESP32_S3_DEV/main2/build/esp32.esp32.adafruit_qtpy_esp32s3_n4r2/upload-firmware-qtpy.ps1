$version = "0.7.8"
$target = "adafruit_qt_py_esp32_s3"
$repo = "catapultcase/JunctionRelay"

$newName = "junctionrelay_${target}_v${version}.bin"

# ALWAYS delete the target file first if it exists
if (Test-Path $newName) {
    Remove-Item $newName -Force
    Write-Host "Deleted existing $newName"
}

# Now find the source .bin file (excluding the target we just deleted)
$bin = Get-ChildItem *.bin | Where-Object { 
    $_.Name -notlike "*bootloader*" -and 
    $_.Name -notlike "*partitions*" -and 
    $_.Name -ne $newName 
} | Select-Object -First 1

if (-not $bin) {
    Write-Host "No source .bin file found (excluding target file)."
    exit 1
}

# Copy source to target
Copy-Item $bin.FullName -Destination $newName -Force
Write-Host "Created $newName from $($bin.Name)"

# Verify the file exists before proceeding
if (-not (Test-Path $newName)) {
    Write-Host "Error: $newName was not created successfully"
    exit 1
}

# Check if the release exists
$existingRelease = gh release view "v$version" --repo $repo 2>$null
if (-not $?) {
    Write-Host "Release v$version not found. Creating it..."
    gh release create "v$version" $newName `
        --title "ESP32 S3 OTA Firmware v$version" `
        --notes "Latest OTA Firmware for Junction Relay ESP32 S3 Devices" `
        --repo $repo
} else {
    Write-Host "Uploading to existing release..."
    gh release upload "v$version" $newName --repo $repo --clobber
}