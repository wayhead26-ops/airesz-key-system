-- Airesz Key System GUI bootstrap
-- Loads the known-good GUI Loader v6.1.1, which then downloads the latest roblox-client.lua.

local GUI_LOADER_URL = "https://raw.githubusercontent.com/wayhead26-ops/airesz-key-system/26481c10231b7f4bcbc97dcc17e8f727e40df24a/examples/key-system-gui.lua"

local ok, source = pcall(function()
    return game:HttpGet(GUI_LOADER_URL, true)
end)

if not ok or type(source) ~= "string" or source == "" then
    error("[AIRESZ] Unable to download the Key System GUI.")
end

local chunk, compileError = loadstring(source)
if not chunk then
    error("[AIRESZ] Key System GUI compile failed: " .. tostring(compileError))
end

return chunk()
