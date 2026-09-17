param([ValidateSet('start','serve','stop')][string]$Action='start')
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$node=Join-Path $root '.runtime\node\node.exe'
if(!(Test-Path -LiteralPath $node)){$node=(Get-Command node -ErrorAction Stop).Source}
Push-Location -LiteralPath $root
try {
    $major=[int]((& $node --version).TrimStart('v').Split('.')[0])
    if($major -lt 22){throw 'Stremio Watch Sync & Repair requires Node 22 or newer.'}
    $configPath=if($env:STREMIO_WATCH_SYNC_REPAIR_CONFIG){$env:STREMIO_WATCH_SYNC_REPAIR_CONFIG}elseif($env:STREMIO_GUARD_CONFIG){$env:STREMIO_GUARD_CONFIG}else{Join-Path $root 'config.json'}
    $dataSetting='./data'
    if(Test-Path -LiteralPath $configPath){$cfg=Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json;if($cfg.server.dataDir){$dataSetting=[string]$cfg.server.dataDir}}
    if([IO.Path]::IsPathRooted($dataSetting)){$data=[IO.Path]::GetFullPath($dataSetting)}else{$data=[IO.Path]::GetFullPath((Join-Path $root $dataSetting))}
    $rootPrefix=[IO.Path]::GetFullPath($root).TrimEnd('\')+'\'
    if(!$data.StartsWith($rootPrefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Data directory must stay inside the project folder.'}
    if($Action -ne 'stop'){
        if(!(Test-Path -LiteralPath $data)){New-Item -ItemType Directory -Path $data | Out-Null}
        if((Get-Item -LiteralPath $data).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Watch Sync & Repair data cannot be a linked directory.'}
        $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
        $systemSid=New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
        $acl=Get-Acl -LiteralPath $data
        $allowed=@($sid.Value,$systemSid.Value)
        $secure=$acl.AreAccessRulesProtected
        foreach($rule in @($acl.Access)){
            try{$ruleSid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value}catch{$secure=$false;continue}
            if($allowed -notcontains $ruleSid -or $rule.AccessControlType -ne 'Allow' -or ($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -ne [Security.AccessControl.FileSystemRights]::FullControl){$secure=$false}
        }
        if(!$secure){
            $acl.SetAccessRuleProtection($true,$false)
            foreach($rule in @($acl.Access)){$acl.RemoveAccessRuleSpecific($rule)}
            foreach($id in @($sid,$systemSid)){
                $rule=New-Object Security.AccessControl.FileSystemAccessRule($id,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
                $acl.AddAccessRule($rule)
            }
            Set-Acl -LiteralPath $data -AclObject $acl
        }
    }
    & $node (Join-Path $PSScriptRoot 'launch.mjs') $Action
    if($LASTEXITCODE -ne 0){throw 'Stremio Watch Sync & Repair could not start or stop. Check data\runtime\server-error.log and docs\RECOVERY.md.'}
} catch {
    if($Action -eq 'serve'){[Console]::Error.WriteLine($_.Exception.Message);exit 1}
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'Stremio Watch Sync & Repair') | Out-Null
    exit 1
} finally {Pop-Location}
