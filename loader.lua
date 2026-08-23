-- Airesz Script Hub public loader
-- Usage: getgenv().AIRESZ_KEY = "YOUR-KEY"; then run the copied loadstring.
local RuntimeEnv = type(getgenv) == "function" and getgenv() or _G
local key = RuntimeEnv.AIRESZ_KEY
if type(key) ~= "string" or key == "" then
    error("[AIRESZ] Set getgenv().AIRESZ_KEY to your valid Airesz key before running the loader.")
end

local CLIENT_URL = "https://wayhead26-ops.github.io/airesz-key-system/roblox-client.lua"
local ok, source = pcall(function()
    return game:HttpGet(CLIENT_URL, true)
end)
if not ok or type(source) ~= "string" or source == "" then
    error("[AIRESZ] Unable to download the authorization client.")
end

local compileOk, startAireszSession = pcall(function()
    return assert(loadstring(source), "Authorization client could not compile.")
end)
if not compileOk or type(startAireszSession) ~= "function" then
    error("[AIRESZ] Authorization client could not compile.")
end

local session, resultOrError = startAireszSession(key, function(reason)
    warn("[AIRESZ] Protected script stopped:", reason)
end)
if not session then
    error(tostring(resultOrError or "Airesz authorization failed."))
end

local loaded, loadError = session:LoadLatestScript()
if not loaded then
    session:Stop()
    error(tostring(loadError or "Airesz script failed to load."))
end
