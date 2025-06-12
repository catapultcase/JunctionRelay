# === CONFIGURATION ===
$stashDir        = "C:\Dev\JunctionRelay_Dev\Stash"
$publicDir       = "C:\Dev\JunctionRelay"
$tempSourceDir   = "C:\Dev\_temp_sync"
$publicRepo      = "https://github.com/catapultcase/JunctionRelay.git"
$privateRepo     = "https://github.com/catapultcase/JunctionRelay_Server.git"

# === Save current working folder ===
Push-Location

# === STEP 1: Clone public repo ===
if (Test-Path $publicDir) {
    Write-Host "[INFO] Removing existing public repo folder..."
    Remove-Item $publicDir -Recurse -Force
}
Write-Host "[INFO] Cloning public repo into $publicDir..."
git clone $publicRepo $publicDir
if (!(Test-Path "$publicDir\.git")) {
    Write-Error "[ERROR] Failed to clone public repo. Exiting."
    Pop-Location
    exit 1
}

Set-Location $publicDir

# === STEP 2: Create new rcN branch ===
git fetch --all --quiet
$existingBranches = git ls-remote --heads origin | ForEach-Object { ($_ -split "refs/heads/")[1] } | Where-Object { $_ -like "rc*" }
$nextIndex = 1
while ($existingBranches -contains "rc$nextIndex") { $nextIndex++ }
$branchName = "rc$nextIndex"
Write-Host "[INFO] Creating new branch: $branchName"
git checkout -b $branchName

# === STEP 3: Clone private repo to temp folder ===
if (Test-Path $tempSourceDir) {
    Write-Host "[INFO] Cleaning temp folder: $tempSourceDir"
    Remove-Item $tempSourceDir -Recurse -Force
}
Write-Host "[INFO] Cloning private repo into temp folder..."
git clone $privateRepo $tempSourceDir
if (!(Test-Path "$tempSourceDir\.git")) {
    Write-Error "[ERROR] Failed to clone private repo. Exiting."
    Pop-Location
    exit 1
}

# === STEP 4: Clear contents of publicDir except .git ===
Write-Host "[INFO] Clearing contents of public repo folder (excluding .git)..."
Get-ChildItem -Path $publicDir -Force | Where-Object { $_.Name -ne ".git" } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

# === STEP 5: Copy contents from private repo (EXCLUDING .git) ===
Write-Host "[INFO] Copying all files from private repo into public repo folder..."
Get-ChildItem "$tempSourceDir" -Force | Where-Object { $_.Name -ne ".git" } | ForEach-Object {
    Copy-Item $_.FullName -Destination $publicDir -Recurse -Force
}

# === STEP 6: Replace ignore files from stash ===
Write-Host "[INFO] Replacing .gitignore and .dockerignore from stash..."
Copy-Item "$stashDir\.gitignore" -Destination "$publicDir\.gitignore" -Force
Copy-Item "$stashDir\.dockerignore" -Destination "$publicDir\.dockerignore" -Force

# === STEP 7: Ensure correct remote and push ===
Write-Host "[INFO] Staging and committing changes..."
git add .
git commit -m "Public release candidate $branchName"

Write-Host "[INFO] Forcing remote to point to public repo..."
git remote set-url origin $publicRepo

Write-Host "[INFO] Pushing to public remote branch $branchName..."
git push -u origin $branchName

# === STEP 8: Cleanup ===
Pop-Location
Remove-Item $tempSourceDir -Recurse -Force

Write-Host "`n✅ DONE. Review the new branch at:"
Write-Host "https://github.com/catapultcase/JunctionRelay/tree/$branchName"
