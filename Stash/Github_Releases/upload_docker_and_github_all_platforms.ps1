
# Path to your .csproj file
$csprojPath = "C:\Dev\JunctionRelay_Dev\JunctionRelay_Server\JunctionRelay_Server.csproj"

# Extract <Version> from .csproj
try {
    [xml]$projXml = Get-Content $csprojPath
    $version = $projXml.Project.PropertyGroup.Version
    if (-not $version) {
        Write-Host "[ERROR] Could not find <Version> in $csprojPath"
        exit 1
    }
    $version = $version.Trim()
    if (-not $version) {
        Write-Host "[ERROR] Version string is empty after trimming."
        exit 1
    }
} catch {
    Write-Host "[ERROR] Failed to read version from .csproj: $_"
    exit 1
}

# Configuration
$repo = "catapultcase/JunctionRelay_Server"
$dockerImage = "catapultcase/junctionrelay"
$publishFolder = "C:\Dev\JunctionRelay_Dev\JunctionRelay_Server\bin\Release\net8.0\publish"
$zipName = "junctionrelay__v${version}.zip"
$releaseTitle = "Junction Relay v${version}"
$dockerfilePath = "C:\Dev\JunctionRelay_Dev\JunctionRelay_Server\Dockerfile"
$contextPath = "C:\Dev\JunctionRelay_Dev\JunctionRelay_Server"

# Release notes
$releaseNotes = @"
This release contains the portable .NET 8 backend build (Any CPU). It requires the .NET 8 runtime to be installed on the target machine.

The same version is also available as a Docker image.

To run using Docker:

  docker pull ${dockerImage}:$version
  docker run -p 7180:80 ${dockerImage}:$version

To use the latest version:

  docker pull ${dockerImage}:latest
  docker run -p 7180:80 ${dockerImage}:latest

Docker Hub: https://hub.docker.com/r/$dockerImage
"@

# Diagnostics
Write-Host "[INFO] Version: $version"
Write-Host "[INFO] Repository: $repo"
Write-Host "[INFO] Docker Image: $dockerImage"
Write-Host "[INFO] Publish folder: $publishFolder"

# Check publish output
if (-not (Test-Path $publishFolder)) {
    Write-Host "[ERROR] Publish folder not found. Run: dotnet publish -c Release"
    exit 1
}

# Clean old zip if needed
if (Test-Path $zipName) {
    Write-Host "[CLEANUP] Removing old zip: $zipName"
    Remove-Item $zipName -Force
}

# Create ZIP of published output
Write-Host "[ZIP] Creating zip: $zipName"
Compress-Archive -Path "$publishFolder\*" -DestinationPath $zipName

# GitHub CLI check
try {
    $ghVersion = gh --version
    Write-Host "[INFO] GitHub CLI found: $($ghVersion[0])"
} catch {
    Write-Host "[ERROR] GitHub CLI not found. Install: https://cli.github.com/"
    exit 1
}

# GitHub authentication check
function Test-GitHubAuth {
    gh auth status 2>&1
    return $LASTEXITCODE -eq 0
}
if (-not (Test-GitHubAuth)) {
    Write-Host "[ERROR] Not authenticated with GitHub. Run: gh auth login"
    exit 1
}

# GitHub release: create or update
$releaseExists = gh release view "v$version" --repo $repo 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[GITHUB] Creating new release v$version..."
    gh release create "v$version" $zipName `
        --title "$releaseTitle" `
        --notes "$releaseNotes" `
        --repo $repo
} else {
    Write-Host "[GITHUB] Updating release v$version..."
    $assets = gh release view "v$version" --repo $repo --json assets | ConvertFrom-Json
    $existingAsset = $assets.assets | Where-Object { $_.name -eq $zipName }

    if ($existingAsset) {
        Write-Host "[GITHUB] Removing existing asset: $zipName"
        gh release delete-asset "v$version" $zipName --repo $repo -y
    }

    Write-Host "[GITHUB] Uploading asset: $zipName"
    gh release upload "v$version" $zipName --repo $repo --clobber
}

# Tag current commit as 'server' (GitHub only)
Write-Host "[GIT] Tagging current commit as 'server'"
git tag -f server
git push origin -f server

# Ensure buildx is enabled
docker buildx version > $null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Docker Buildx is not available. Install Docker Desktop or enable BuildKit support."
    exit 1
}

# Create a new builder if necessary
$builderName = "junctionrelay-builder"
$builderExists = docker buildx inspect $builderName 2>&1 | Select-String $builderName
if (-not $builderExists) {
    Write-Host "[DOCKER] Creating buildx builder: $builderName"
    docker buildx create --name $builderName --use
} else {
    Write-Host "[DOCKER] Using existing builder: $builderName"
    docker buildx use $builderName
}

# Build multi-arch Docker image (for x86_64 and ARM64)
Write-Host "[DOCKER] Building multi-architecture Docker image..."
docker buildx build `
    --platform linux/amd64,linux/arm64 `
    --tag "${dockerImage}:$version" `
    --tag "${dockerImage}:latest" `
    --build-arg VERSION=$version `
    --file $dockerfilePath `
    --push `
    $contextPath

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Multi-arch Docker build failed."
    exit 1
}

Write-Host "`n✅ [DONE] GitHub release and Docker image published for v$version"
