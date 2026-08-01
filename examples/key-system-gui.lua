--[[
    Airesz Key System GUI v1.5 (Auto Login + Auto Re-Key)
    Uses the Airesz authorization client with protected-payload cleanup.

    Public client:
    https://raw.githubusercontent.com/wayhead26-ops/airesz-key-system/main/examples/roblox-client.lua

    Key page:
    https://wayhead26-ops.github.io/airesz-key-system/
]]

local WORKER_URL = "https://airesz-key-api.airesz-key-system.workers.dev"
local AUTH_CLIENT_URL = "https://raw.githubusercontent.com/wayhead26-ops/airesz-key-system/main/examples/roblox-client.lua"
local GET_KEY_URL = "https://wayhead26-ops.github.io/airesz-key-system/"

local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")
local StarterGui = game:GetService("StarterGui")

local LocalPlayer = Players.LocalPlayer
local KEY_FOLDER = "AireszHub"
local KEY_FILE = KEY_FOLDER .. "/saved-key.txt"
local FALLBACK_KEY_FILE = "AireszHub_saved-key.txt"
local RuntimeEnv = type(getgenv) == "function" and getgenv() or _G

local function notify(title, text)
    pcall(function()
        StarterGui:SetCore("SendNotification", {
            Title = title,
            Text = text,
            Duration = 5
        })
    end)
end

local function getGuiParent()
    if type(gethui) == "function" then
        local ok, result = pcall(gethui)
        if ok and result then
            return result
        end
    end

    local ok, coreGui = pcall(function()
        return game:GetService("CoreGui")
    end)
    if ok and coreGui then
        return coreGui
    end

    return LocalPlayer:WaitForChild("PlayerGui")
end

local guiParent = getGuiParent()

-- Stop an older loader session cleanly when this loader is executed again.
local previousSession = RuntimeEnv.AIRESZ_SESSION
if type(previousSession) == "table" and type(previousSession.Stop) == "function" then
    pcall(function()
        previousSession:Stop("Loader restarted.")
    end)
end

local oldGui = guiParent:FindFirstChild("AireszKeySystem")
if oldGui then
    oldGui:Destroy()
end

local ScreenGui = Instance.new("ScreenGui")
ScreenGui.Name = "AireszKeySystem"
ScreenGui.ResetOnSpawn = false
ScreenGui.IgnoreGuiInset = true
ScreenGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
-- Keep the GUI hidden while a saved key is checked.
ScreenGui.Enabled = false
ScreenGui.Parent = guiParent
RuntimeEnv.AIRESZ_KEY_GUI = ScreenGui

local Dim = Instance.new("Frame")
Dim.Name = "Dim"
Dim.BackgroundColor3 = Color3.fromRGB(0, 0, 0)
Dim.BackgroundTransparency = 1
Dim.BorderSizePixel = 0
Dim.Size = UDim2.fromScale(1, 1)
Dim.Parent = ScreenGui

local Main = Instance.new("Frame")
Main.Name = "Main"
Main.AnchorPoint = Vector2.new(0.5, 0.5)
Main.BackgroundColor3 = Color3.fromRGB(16, 18, 27)
Main.BorderSizePixel = 0
Main.Position = UDim2.fromScale(0.5, 0.48)
Main.Size = UDim2.fromOffset(430, 270)
Main.ClipsDescendants = true
Main.Parent = ScreenGui

local MainCorner = Instance.new("UICorner")
MainCorner.CornerRadius = UDim.new(0, 16)
MainCorner.Parent = Main

local MainStroke = Instance.new("UIStroke")
MainStroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
MainStroke.Color = Color3.fromRGB(91, 103, 255)
MainStroke.Transparency = 0.15
MainStroke.Thickness = 1.5
MainStroke.Parent = Main

local MainGradient = Instance.new("UIGradient")
MainGradient.Color = ColorSequence.new({
    ColorSequenceKeypoint.new(0, Color3.fromRGB(117, 83, 255)),
    ColorSequenceKeypoint.new(1, Color3.fromRGB(51, 190, 255))
})
MainGradient.Rotation = 35
MainGradient.Parent = MainStroke

local TopBar = Instance.new("Frame")
TopBar.Name = "TopBar"
TopBar.BackgroundTransparency = 1
TopBar.Size = UDim2.new(1, 0, 0, 62)
TopBar.Parent = Main

local Logo = Instance.new("Frame")
Logo.Name = "Logo"
Logo.BackgroundColor3 = Color3.fromRGB(91, 103, 255)
Logo.BorderSizePixel = 0
Logo.Position = UDim2.fromOffset(20, 16)
Logo.Size = UDim2.fromOffset(32, 32)
Logo.Parent = TopBar

local LogoCorner = Instance.new("UICorner")
LogoCorner.CornerRadius = UDim.new(0, 9)
LogoCorner.Parent = Logo

local LogoGradient = Instance.new("UIGradient")
LogoGradient.Color = ColorSequence.new({
    ColorSequenceKeypoint.new(0, Color3.fromRGB(127, 90, 255)),
    ColorSequenceKeypoint.new(1, Color3.fromRGB(57, 194, 255))
})
LogoGradient.Rotation = 45
LogoGradient.Parent = Logo

local LogoText = Instance.new("TextLabel")
LogoText.BackgroundTransparency = 1
LogoText.Font = Enum.Font.GothamBold
LogoText.Text = "A"
LogoText.TextColor3 = Color3.fromRGB(255, 255, 255)
LogoText.TextSize = 18
LogoText.Size = UDim2.fromScale(1, 1)
LogoText.Parent = Logo

local Title = Instance.new("TextLabel")
Title.BackgroundTransparency = 1
Title.Font = Enum.Font.GothamBold
Title.Position = UDim2.fromOffset(64, 13)
Title.Size = UDim2.new(1, -150, 0, 23)
Title.Text = "AIRESZ KEY SYSTEM"
Title.TextColor3 = Color3.fromRGB(245, 247, 255)
Title.TextSize = 17
Title.TextXAlignment = Enum.TextXAlignment.Left
Title.Parent = TopBar

local Subtitle = Instance.new("TextLabel")
Subtitle.BackgroundTransparency = 1
Subtitle.Font = Enum.Font.Gotham
Subtitle.Position = UDim2.fromOffset(64, 35)
Subtitle.Size = UDim2.new(1, -150, 0, 18)
Subtitle.Text = "Secure access verification"
Subtitle.TextColor3 = Color3.fromRGB(135, 142, 166)
Subtitle.TextSize = 11
Subtitle.TextXAlignment = Enum.TextXAlignment.Left
Subtitle.Parent = TopBar

local function makeTopButton(name, text, xOffset)
    local button = Instance.new("TextButton")
    button.Name = name
    button.AnchorPoint = Vector2.new(1, 0)
    button.BackgroundColor3 = Color3.fromRGB(27, 30, 43)
    button.BorderSizePixel = 0
    button.Position = UDim2.new(1, xOffset, 0, 17)
    button.Size = UDim2.fromOffset(28, 28)
    button.AutoButtonColor = false
    button.Font = Enum.Font.GothamBold
    button.Text = text
    button.TextColor3 = Color3.fromRGB(170, 176, 198)
    button.TextSize = 14
    button.Parent = TopBar

    local corner = Instance.new("UICorner")
    corner.CornerRadius = UDim.new(0, 8)
    corner.Parent = button

    button.MouseEnter:Connect(function()
        TweenService:Create(button, TweenInfo.new(0.15), {
            BackgroundColor3 = Color3.fromRGB(38, 42, 59),
            TextColor3 = Color3.fromRGB(255, 255, 255)
        }):Play()
    end)
    button.MouseLeave:Connect(function()
        TweenService:Create(button, TweenInfo.new(0.15), {
            BackgroundColor3 = Color3.fromRGB(27, 30, 43),
            TextColor3 = Color3.fromRGB(170, 176, 198)
        }):Play()
    end)

    return button
end

local MinimizeButton = makeTopButton("Minimize", "—", -56)
local CloseButton = makeTopButton("Close", "×", -20)

local Divider = Instance.new("Frame")
Divider.BackgroundColor3 = Color3.fromRGB(38, 42, 57)
Divider.BorderSizePixel = 0
Divider.Position = UDim2.fromOffset(20, 61)
Divider.Size = UDim2.new(1, -40, 0, 1)
Divider.Parent = Main

local Content = Instance.new("Frame")
Content.Name = "Content"
Content.BackgroundTransparency = 1
Content.Position = UDim2.fromOffset(20, 75)
Content.Size = UDim2.new(1, -40, 1, -95)
Content.Parent = Main

local KeyLabel = Instance.new("TextLabel")
KeyLabel.BackgroundTransparency = 1
KeyLabel.Font = Enum.Font.GothamMedium
KeyLabel.Size = UDim2.new(1, 0, 0, 20)
KeyLabel.Text = "License Key"
KeyLabel.TextColor3 = Color3.fromRGB(206, 211, 230)
KeyLabel.TextSize = 12
KeyLabel.TextXAlignment = Enum.TextXAlignment.Left
KeyLabel.Parent = Content

local InputHolder = Instance.new("Frame")
InputHolder.BackgroundColor3 = Color3.fromRGB(23, 26, 38)
InputHolder.BorderSizePixel = 0
InputHolder.Position = UDim2.fromOffset(0, 28)
InputHolder.Size = UDim2.new(1, 0, 0, 48)
InputHolder.Parent = Content

local InputCorner = Instance.new("UICorner")
InputCorner.CornerRadius = UDim.new(0, 10)
InputCorner.Parent = InputHolder

local InputStroke = Instance.new("UIStroke")
InputStroke.Color = Color3.fromRGB(48, 53, 72)
InputStroke.Transparency = 0.15
InputStroke.Thickness = 1
InputStroke.Parent = InputHolder

local KeyBox = Instance.new("TextBox")
KeyBox.Name = "KeyBox"
KeyBox.BackgroundTransparency = 1
KeyBox.ClearTextOnFocus = false
KeyBox.Font = Enum.Font.Code
KeyBox.PlaceholderColor3 = Color3.fromRGB(94, 101, 126)
KeyBox.PlaceholderText = "AIRESZ-XXXX-XXXX-XXXX-XXXX"
KeyBox.Position = UDim2.fromOffset(14, 0)
KeyBox.Size = UDim2.new(1, -56, 1, 0)
KeyBox.Text = ""
KeyBox.TextColor3 = Color3.fromRGB(235, 238, 249)
KeyBox.TextSize = 13
KeyBox.TextXAlignment = Enum.TextXAlignment.Left
KeyBox.Parent = InputHolder

local ClearButton = Instance.new("TextButton")
ClearButton.BackgroundTransparency = 1
ClearButton.Font = Enum.Font.GothamBold
ClearButton.Position = UDim2.new(1, -42, 0, 0)
ClearButton.Size = UDim2.fromOffset(42, 48)
ClearButton.Text = "×"
ClearButton.TextColor3 = Color3.fromRGB(107, 114, 139)
ClearButton.TextSize = 18
ClearButton.Parent = InputHolder

local StatusDot = Instance.new("Frame")
StatusDot.BackgroundColor3 = Color3.fromRGB(124, 132, 157)
StatusDot.BorderSizePixel = 0
StatusDot.Position = UDim2.fromOffset(0, 98)
StatusDot.Size = UDim2.fromOffset(8, 8)
StatusDot.Parent = Content

local StatusCorner = Instance.new("UICorner")
StatusCorner.CornerRadius = UDim.new(1, 0)
StatusCorner.Parent = StatusDot

local Status = Instance.new("TextLabel")
Status.BackgroundTransparency = 1
Status.Font = Enum.Font.Gotham
Status.Position = UDim2.fromOffset(15, 90)
Status.Size = UDim2.new(1, -15, 0, 24)
Status.Text = "Waiting for a key"
Status.TextColor3 = Color3.fromRGB(135, 142, 166)
Status.TextSize = 11
Status.TextTruncate = Enum.TextTruncate.AtEnd
Status.TextXAlignment = Enum.TextXAlignment.Left
Status.Parent = Content

local ButtonRow = Instance.new("Frame")
ButtonRow.BackgroundTransparency = 1
ButtonRow.Position = UDim2.fromOffset(0, 124)
ButtonRow.Size = UDim2.new(1, 0, 0, 46)
ButtonRow.Parent = Content

local GetKeyButton = Instance.new("TextButton")
GetKeyButton.BackgroundColor3 = Color3.fromRGB(27, 30, 43)
GetKeyButton.BorderSizePixel = 0
GetKeyButton.Size = UDim2.new(0.37, -5, 1, 0)
GetKeyButton.AutoButtonColor = false
GetKeyButton.Font = Enum.Font.GothamSemibold
GetKeyButton.Text = "GET KEY"
GetKeyButton.TextColor3 = Color3.fromRGB(185, 191, 214)
GetKeyButton.TextSize = 12
GetKeyButton.Parent = ButtonRow

local GetKeyCorner = Instance.new("UICorner")
GetKeyCorner.CornerRadius = UDim.new(0, 10)
GetKeyCorner.Parent = GetKeyButton

local VerifyButton = Instance.new("TextButton")
VerifyButton.AnchorPoint = Vector2.new(1, 0)
VerifyButton.BackgroundColor3 = Color3.fromRGB(91, 103, 255)
VerifyButton.BorderSizePixel = 0
VerifyButton.Position = UDim2.fromScale(1, 0)
VerifyButton.Size = UDim2.new(0.63, -5, 1, 0)
VerifyButton.AutoButtonColor = false
VerifyButton.Font = Enum.Font.GothamBold
VerifyButton.Text = "VERIFY & LOAD"
VerifyButton.TextColor3 = Color3.fromRGB(255, 255, 255)
VerifyButton.TextSize = 12
VerifyButton.Parent = ButtonRow

local VerifyCorner = Instance.new("UICorner")
VerifyCorner.CornerRadius = UDim.new(0, 10)
VerifyCorner.Parent = VerifyButton

local VerifyGradient = Instance.new("UIGradient")
VerifyGradient.Color = ColorSequence.new({
    ColorSequenceKeypoint.new(0, Color3.fromRGB(118, 82, 255)),
    ColorSequenceKeypoint.new(1, Color3.fromRGB(49, 185, 255))
})
VerifyGradient.Rotation = 15
VerifyGradient.Parent = VerifyButton

local verifying = false
local minimized = false
local currentSession = nil
local sessionGeneration = 0

local REKEY_CODES = {
    KEY_EXPIRED = true,
    KEY_REVOKED = true,
    KEY_DELETED = true,
    KEY_INACTIVE = true,
    SESSION_EXPIRED = true
}

local function setStatus(text, state)
    Status.Text = tostring(text)

    local colors = {
        idle = Color3.fromRGB(124, 132, 157),
        loading = Color3.fromRGB(255, 190, 75),
        success = Color3.fromRGB(65, 211, 139),
        error = Color3.fromRGB(255, 91, 112)
    }

    local color = colors[state] or colors.idle
    TweenService:Create(StatusDot, TweenInfo.new(0.18), {
        BackgroundColor3 = color
    }):Play()

    TweenService:Create(Status, TweenInfo.new(0.18), {
        TextColor3 = state == "error" and Color3.fromRGB(255, 142, 157)
            or state == "success" and Color3.fromRGB(117, 232, 174)
            or Color3.fromRGB(135, 142, 166)
    }):Play()
end

local function trim(text)
    return tostring(text or ""):gsub("^%s+", ""):gsub("%s+$", "")
end

local function deleteSavedKey()
    local deleted = false

    if type(isfile) == "function" and type(delfile) == "function" then
        for _, path in ipairs({KEY_FILE, FALLBACK_KEY_FILE}) do
            local ok = pcall(function()
                if isfile(path) then
                    delfile(path)
                    deleted = true
                end
            end)

            if not ok then
                -- Continue checking the fallback path.
            end
        end
    end

    local env = type(getgenv) == "function" and getgenv() or _G
    env.AIRESZ_SAVED_KEY = nil
    return deleted
end

local function saveKey(key)
    key = trim(key)

    if key == "" then
        return false, "Enter a key before saving"
    end

    -- Runtime fallback. This survives a GUI reopen in the same executor session,
    -- even when the executor has no file API.
    local env = type(getgenv) == "function" and getgenv() or _G
    env.AIRESZ_SAVED_KEY = key

    if type(writefile) ~= "function" then
        return false, "Executor does not support writefile"
    end

    local errors = {}

    -- Preferred location: AireszHub/saved-key.txt
    local folderReady = true
    if type(isfolder) == "function" and type(makefolder) == "function" then
        local ok, err = pcall(function()
            if not isfolder(KEY_FOLDER) then
                makefolder(KEY_FOLDER)
            end
        end)
        folderReady = ok
        if not ok then
            table.insert(errors, tostring(err))
        end
    elseif type(isfolder) ~= "function" or type(makefolder) ~= "function" then
        folderReady = false
    end

    if folderReady then
        local ok, err = pcall(writefile, KEY_FILE, key)
        if ok then
            return true, "Key saved"
        end
        table.insert(errors, tostring(err))
    end

    -- Fallback for executors that support writefile but not folders.
    local ok, err = pcall(writefile, FALLBACK_KEY_FILE, key)
    if ok then
        return true, "Key saved"
    end
    table.insert(errors, tostring(err))

    return false, "Could not save key: " .. table.concat(errors, " | ")
end

local function loadSavedKey()
    local env = type(getgenv) == "function" and getgenv() or _G
    local key = trim(env.AIRESZ_SAVED_KEY)

    if key == "" and type(isfile) == "function" and type(readfile) == "function" then
        for _, path in ipairs({KEY_FILE, FALLBACK_KEY_FILE}) do
            local ok, result = pcall(function()
                if isfile(path) then
                    return readfile(path)
                end
            end)

            result = trim(result)
            if ok and result ~= "" then
                key = result
                break
            end
        end
    end

    return key
end

local function setVerifyBusy(value)
    verifying = value
    VerifyButton.Text = value and "VERIFYING..." or "VERIFY & LOAD"
    VerifyButton.Active = not value
    KeyBox.TextEditable = not value
    VerifyButton.BackgroundTransparency = value and 0.18 or 0
end

local function showKeyGui(message, state)
    if not ScreenGui or not ScreenGui.Parent then
        return
    end

    ScreenGui.Enabled = true
    Main.Visible = true
    minimized = false
    Content.Visible = true
    Divider.Visible = true
    MinimizeButton.Text = "—"
    setVerifyBusy(false)

    if message then
        setStatus(message, state or "idle")
    end

    -- Entry animation only when the GUI actually needs to be shown.
    Main.Size = UDim2.fromOffset(430, 230)
    Main.BackgroundTransparency = 1
    Dim.BackgroundTransparency = 1

    TweenService:Create(Dim, TweenInfo.new(0.25), {
        BackgroundTransparency = 0.45
    }):Play()

    TweenService:Create(Main, TweenInfo.new(0.3, Enum.EasingStyle.Back, Enum.EasingDirection.Out), {
        Size = UDim2.fromOffset(430, 270),
        BackgroundTransparency = 0
    }):Play()
end

local function hideKeyGui()
    if ScreenGui and ScreenGui.Parent then
        ScreenGui.Enabled = false
    end
end

local function verifyAndLoad(keyOverride, silentSavedKey)
    if verifying then
        return
    end

    local key = trim(keyOverride or KeyBox.Text)
    if key == "" then
        showKeyGui("Please enter your key", "error")
        notify("Airesz Key System", "Enter a valid key first.")
        return
    end

    sessionGeneration = sessionGeneration + 1
    local attemptGeneration = sessionGeneration

    setVerifyBusy(true)
    if not silentSavedKey then
        setStatus("Connecting to authorization server...", "loading")
    end

    task.spawn(function()
        local verified = false

        local ok, err = pcall(function()
            local cacheBuster = tostring(os.time()) .. tostring(math.random(1000, 9999))
            local source = game:HttpGet(AUTH_CLIENT_URL .. "?v=" .. cacheBuster, true)

            -- Keeps the GUI working even if the public client still contains its placeholder.
            source = source:gsub(
                "https://YOUR%-WORKER%.workers%.dev",
                WORKER_URL
            )

            local compileClient, compileError = loadstring(source)
            if not compileClient then
                error("Authorization client compile failed: " .. tostring(compileError))
            end

            local startAireszSession = compileClient()
            if type(startAireszSession) ~= "function" then
                error("roblox-client.lua must end with: return startAireszSession")
            end

            if not silentSavedKey then
                setStatus("Checking key and device...", "loading")
            end

            local session, resultOrError = startAireszSession(key, function(reason, code)
                if attemptGeneration ~= sessionGeneration then
                    return
                end

                warn("[AIRESZ] Access stopped:", reason)
                currentSession = nil

                if REKEY_CODES[tostring(code or "")] then
                    deleteSavedKey()
                    KeyBox.Text = ""
                    showKeyGui("Key expired or inactive. Enter a new key.", "error")
                    notify("Airesz Key System", "Your key is no longer active. Enter a new key.")
                else
                    KeyBox.Text = key
                    showKeyGui("Access stopped: " .. tostring(reason), "error")
                    notify("Airesz Key System", tostring(reason))
                end
            end)

            if not session then
                error(tostring(resultOrError or "Key verification failed."))
            end

            verified = true
            currentSession = session

            local saved, saveMessage = saveKey(key)
            if not saved then
                warn("[AIRESZ] Auto-save key failed:", saveMessage)
            end

            -- Keep the Key GUI alive but hidden so heartbeat denial can show it
            -- again without requiring another execute or a rejoin.
            if not silentSavedKey then
                notify("Airesz Key System", "Key verified. Loading script...")
            end

            hideKeyGui()

            local loaded, loadError = session:LoadLatestScript()
            if not loaded then
                session:Stop("Private script failed to load.")
                currentSession = nil
                error(tostring(loadError or "Private script could not be loaded."))
            end

            notify("Airesz Key System", "Script loaded successfully.")
        end)

        if not ok then
            local message = tostring(err)
            message = message:gsub("^.-:%d+:%s*", "")

            if silentSavedKey and not verified then
                -- Prevent an invalid/expired saved key from causing an endless auto-login loop.
                deleteSavedKey()
                KeyBox.Text = ""
                showKeyGui("Saved key is no longer valid. Enter a new key.", "error")
                warn("[AIRESZ] Saved key verification failed:", message)
                notify("Airesz Key System", "Saved key expired or invalid.")
            elseif ScreenGui and ScreenGui.Parent then
                showKeyGui(message, "error")
                notify(verified and "Script Load Failed" or "Verification Failed", message)
            else
                -- Verification succeeded and the GUI was already closed;
                -- this means the private script failed while loading.
                warn("[AIRESZ] Script load failed:", message)
                notify("Script Load Failed", message)
            end
        end
    end)
end

ClearButton.MouseButton1Click:Connect(function()
    if verifying then return end
    KeyBox.Text = ""
    deleteSavedKey()
    setStatus("Saved key cleared", "idle")
end)

GetKeyButton.MouseButton1Click:Connect(function()
    if type(setclipboard) == "function" then
        setclipboard(GET_KEY_URL)
        setStatus("Key page link copied to clipboard", "success")
        notify("Airesz Key System", "Key page link copied.")
    else
        setStatus("Open: " .. GET_KEY_URL, "idle")
        notify("Get Key", GET_KEY_URL)
    end
end)

VerifyButton.MouseButton1Click:Connect(function()
    verifyAndLoad(nil, false)
end)
KeyBox.FocusLost:Connect(function(enterPressed)
    if enterPressed then
        verifyAndLoad(nil, false)
    end
end)

CloseButton.MouseButton1Click:Connect(function()
    if verifying then
        setStatus("Wait until verification finishes", "loading")
        return
    end
    if currentSession and type(currentSession.IsAllowed) == "function" and currentSession:IsAllowed() then
        hideKeyGui()
    else
        setStatus("Enter a valid key to continue", "error")
        hideKeyGui()
    end
end)

MinimizeButton.MouseButton1Click:Connect(function()
    minimized = not minimized
    Content.Visible = not minimized
    Divider.Visible = not minimized
    MinimizeButton.Text = minimized and "+" or "—"

    TweenService:Create(Main, TweenInfo.new(0.22, Enum.EasingStyle.Quart, Enum.EasingDirection.Out), {
        Size = minimized and UDim2.fromOffset(430, 62) or UDim2.fromOffset(430, 270)
    }):Play()
end)

GetKeyButton.MouseEnter:Connect(function()
    TweenService:Create(GetKeyButton, TweenInfo.new(0.15), {
        BackgroundColor3 = Color3.fromRGB(37, 41, 58),
        TextColor3 = Color3.fromRGB(230, 233, 245)
    }):Play()
end)
GetKeyButton.MouseLeave:Connect(function()
    TweenService:Create(GetKeyButton, TweenInfo.new(0.15), {
        BackgroundColor3 = Color3.fromRGB(27, 30, 43),
        TextColor3 = Color3.fromRGB(185, 191, 214)
    }):Play()
end)

VerifyButton.MouseEnter:Connect(function()
    if verifying then return end
    TweenService:Create(VerifyButton, TweenInfo.new(0.15), {
        Size = UDim2.new(0.63, -2, 1, 0)
    }):Play()
end)
VerifyButton.MouseLeave:Connect(function()
    TweenService:Create(VerifyButton, TweenInfo.new(0.15), {
        Size = UDim2.new(0.63, -5, 1, 0)
    }):Play()
end)

KeyBox.Focused:Connect(function()
    TweenService:Create(InputStroke, TweenInfo.new(0.15), {
        Color = Color3.fromRGB(99, 111, 255),
        Transparency = 0
    }):Play()
end)
KeyBox.FocusLost:Connect(function()
    TweenService:Create(InputStroke, TweenInfo.new(0.15), {
        Color = Color3.fromRGB(48, 53, 72),
        Transparency = 0.15
    }):Play()
end)

-- Dragging support for mouse and touch.
do
    local dragging = false
    local dragStart
    local startPosition
    local dragInput

    TopBar.InputBegan:Connect(function(input)
        if input.UserInputType == Enum.UserInputType.MouseButton1
            or input.UserInputType == Enum.UserInputType.Touch then
            dragging = true
            dragStart = input.Position
            startPosition = Main.Position

            input.Changed:Connect(function()
                if input.UserInputState == Enum.UserInputState.End then
                    dragging = false
                end
            end)
        end
    end)

    TopBar.InputChanged:Connect(function(input)
        if input.UserInputType == Enum.UserInputType.MouseMovement
            or input.UserInputType == Enum.UserInputType.Touch then
            dragInput = input
        end
    end)

    UserInputService.InputChanged:Connect(function(input)
        if input == dragInput and dragging then
            local delta = input.Position - dragStart
            Main.Position = UDim2.new(
                startPosition.X.Scale,
                startPosition.X.Offset + delta.X,
                startPosition.Y.Scale,
                startPosition.Y.Offset + delta.Y
            )
        end
    end)
end

local savedKey = loadSavedKey()

if savedKey ~= "" then
    -- Valid saved key: no key GUI is shown; verify and load directly.
    verifyAndLoad(savedKey, true)
else
    showKeyGui("Waiting for a key", "idle")
end
