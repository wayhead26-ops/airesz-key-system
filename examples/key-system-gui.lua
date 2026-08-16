--[[
    Airesz Key System - Alternative GUI + Production Runtime
    Auto login, saved key, auto re-key, protected script loading and session cleanup.
]]

local WORKER_URL = "https://airesz-key-api.airesz-key-system.workers.dev"
local AUTH_CLIENT_URL = "https://raw.githubusercontent.com/wayhead26-ops/airesz-key-system/main/examples/roblox-client.lua"
local GET_KEY_URL = "https://wayhead26-ops.github.io/airesz-key-system/"
local DISCORD_URL = "https://discord.gg/nAqMBZVbTK"

local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")
local StarterGui = game:GetService("StarterGui")
local LocalPlayer = Players.LocalPlayer
local KEY_FOLDER = "AireszHub"
local KEY_FILE = KEY_FOLDER .. "/saved-key.txt"
local FALLBACK_KEY_FILE = "AireszHub_saved-key.txt"
local RuntimeEnv = type(getgenv) == "function" and getgenv() or _G

local COLORS = {
    Background = Color3.fromRGB(8, 10, 17),
    Panel = Color3.fromRGB(14, 17, 27),
    Card = Color3.fromRGB(20, 24, 37),
    CardHover = Color3.fromRGB(27, 32, 48),
    Border = Color3.fromRGB(48, 56, 78),
    Muted = Color3.fromRGB(125, 134, 158),
    Text = Color3.fromRGB(238, 241, 250),
    Purple = Color3.fromRGB(139, 92, 246),
    Blue = Color3.fromRGB(53, 166, 255),
    Green = Color3.fromRGB(52, 211, 153),
    Yellow = Color3.fromRGB(251, 191, 36),
    Red = Color3.fromRGB(251, 113, 133)
}

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

local function corner(parent, radius)
    local object = Instance.new("UICorner")
    object.CornerRadius = UDim.new(0, radius)
    object.Parent = parent
    return object
end

local function stroke(parent, color, transparency, thickness)
    local object = Instance.new("UIStroke")
    object.Color = color
    object.Transparency = transparency or 0
    object.Thickness = thickness or 1
    object.Parent = parent
    return object
end

local function label(parent, text, position, size, font, textSize, color)
    local object = Instance.new("TextLabel")
    object.BackgroundTransparency = 1
    object.Font = font or Enum.Font.Gotham
    object.Position = position
    object.Size = size
    object.Text = text
    object.TextColor3 = color or COLORS.Text
    object.TextSize = textSize or 12
    object.TextXAlignment = Enum.TextXAlignment.Left
    object.Parent = parent
    return object
end

local function button(parent, name, text, position, size, color)
    local object = Instance.new("TextButton")
    object.Name = name
    object.AutoButtonColor = false
    object.BackgroundColor3 = color or COLORS.Card
    object.BorderSizePixel = 0
    object.Font = Enum.Font.GothamSemibold
    object.Position = position
    object.Size = size
    object.Text = text
    object.TextColor3 = COLORS.Text
    object.TextSize = 11
    object.Parent = parent
    corner(object, 10)
    stroke(object, COLORS.Border, 0.4, 1)
    return object
end

local function addInteraction(object, normalColor, hoverColor)
    local scale = Instance.new("UIScale")
    scale.Parent = object

    object.MouseEnter:Connect(function()
        TweenService:Create(object, TweenInfo.new(0.14), {
            BackgroundColor3 = hoverColor
        }):Play()
    end)

    object.MouseLeave:Connect(function()
        TweenService:Create(object, TweenInfo.new(0.14), {
            BackgroundColor3 = normalColor
        }):Play()
        TweenService:Create(scale, TweenInfo.new(0.1), {Scale = 1}):Play()
    end)

    object.MouseButton1Down:Connect(function()
        TweenService:Create(scale, TweenInfo.new(0.08), {Scale = 0.97}):Play()
    end)

    object.MouseButton1Up:Connect(function()
        TweenService:Create(
            scale,
            TweenInfo.new(0.12, Enum.EasingStyle.Back),
            {Scale = 1}
        ):Play()
    end)
end

local guiParent = getGuiParent()
local previousSession = RuntimeEnv.AIRESZ_SESSION
if type(previousSession) == "table" and type(previousSession.Stop) == "function" then
    pcall(function()
        previousSession:Stop("Loader restarted.")
    end)
end

local previous = guiParent:FindFirstChild("AireszKeyAlternative")
if previous then
    previous:Destroy()
end

local ScreenGui = Instance.new("ScreenGui")
ScreenGui.Name = "AireszKeyAlternative"
ScreenGui.IgnoreGuiInset = true
ScreenGui.ResetOnSpawn = false
ScreenGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
ScreenGui.Enabled = false
ScreenGui.Parent = guiParent
RuntimeEnv.AIRESZ_KEY_GUI = ScreenGui

local Backdrop = Instance.new("Frame")
Backdrop.BackgroundColor3 = COLORS.Background
Backdrop.BackgroundTransparency = 0.18
Backdrop.BorderSizePixel = 0
Backdrop.Size = UDim2.fromScale(1, 1)
Backdrop.Parent = ScreenGui

local backdropGradient = Instance.new("UIGradient")
backdropGradient.Color = ColorSequence.new({
    ColorSequenceKeypoint.new(0, Color3.fromRGB(7, 8, 15)),
    ColorSequenceKeypoint.new(0.55, Color3.fromRGB(19, 12, 35)),
    ColorSequenceKeypoint.new(1, Color3.fromRGB(7, 20, 30))
})
backdropGradient.Rotation = 30
backdropGradient.Parent = Backdrop

local Main = Instance.new("Frame")
Main.Name = "Main"
Main.AnchorPoint = Vector2.new(0.5, 0.5)
Main.BackgroundColor3 = Color3.fromRGB(104, 117, 255)
Main.BorderSizePixel = 0
Main.ClipsDescendants = true
Main.Position = UDim2.fromScale(0.5, 0.5)
Main.Size = UDim2.fromOffset(560, 440)
Main.Parent = ScreenGui
corner(Main, 18)

local Surface = Instance.new("Frame")
Surface.Name = "Surface"
Surface.BackgroundColor3 = COLORS.Panel
Surface.BorderSizePixel = 0
Surface.ClipsDescendants = true
Surface.Position = UDim2.fromOffset(2, 2)
Surface.Size = UDim2.new(1, -4, 1, -4)
Surface.Parent = Main
corner(Surface, 16)

local Sidebar = Instance.new("Frame")
Sidebar.BackgroundColor3 = Color3.fromRGB(17, 17, 30)
Sidebar.BorderSizePixel = 0
Sidebar.ClipsDescendants = true
Sidebar.Size = UDim2.new(0, 152, 1, 0)
Sidebar.Parent = Surface
corner(Sidebar, 16)

local SidebarSquareFill = Instance.new("Frame")
SidebarSquareFill.BackgroundColor3 = Sidebar.BackgroundColor3
SidebarSquareFill.BorderSizePixel = 0
SidebarSquareFill.Position = UDim2.fromOffset(16, 0)
SidebarSquareFill.Size = UDim2.new(1, -16, 1, 0)
SidebarSquareFill.Parent = Sidebar

local BrandIcon = Instance.new("Frame")
BrandIcon.BackgroundColor3 = COLORS.Purple
BrandIcon.BorderSizePixel = 0
BrandIcon.Position = UDim2.fromOffset(18, 20)
BrandIcon.Size = UDim2.fromOffset(40, 40)
BrandIcon.Parent = Sidebar
corner(BrandIcon, 12)
stroke(BrandIcon, Color3.fromRGB(185, 164, 255), 0.2, 1)

local iconGradient = Instance.new("UIGradient")
iconGradient.Color = ColorSequence.new(COLORS.Purple, COLORS.Blue)
iconGradient.Rotation = 40
iconGradient.Parent = BrandIcon

local BrandLetter = label(
    BrandIcon,
    "A",
    UDim2.fromScale(0, 0),
    UDim2.fromScale(1, 1),
    Enum.Font.GothamBold,
    20,
    Color3.new(1, 1, 1)
)
BrandLetter.TextXAlignment = Enum.TextXAlignment.Center

label(Sidebar, "AIRESZ", UDim2.fromOffset(18, 72), UDim2.fromOffset(116, 20), Enum.Font.GothamBold, 15)
label(Sidebar, "ACCESS PORTAL", UDim2.fromOffset(18, 91), UDim2.fromOffset(116, 16), Enum.Font.GothamBold, 8, COLORS.Muted)

local NavCard = Instance.new("Frame")
NavCard.BackgroundColor3 = Color3.fromRGB(29, 25, 51)
NavCard.BorderSizePixel = 0
NavCard.Position = UDim2.fromOffset(12, 132)
NavCard.Size = UDim2.new(1, -24, 0, 42)
NavCard.Parent = Sidebar
corner(NavCard, 10)
stroke(NavCard, COLORS.Purple, 0.5, 1)

local NavAccent = Instance.new("Frame")
NavAccent.BackgroundColor3 = COLORS.Purple
NavAccent.BorderSizePixel = 0
NavAccent.Position = UDim2.fromOffset(0, 9)
NavAccent.Size = UDim2.fromOffset(3, 24)
NavAccent.Parent = NavCard
corner(NavAccent, 3)

label(NavCard, "◇", UDim2.fromOffset(12, 0), UDim2.fromOffset(22, 42), Enum.Font.GothamBold, 14, Color3.fromRGB(180, 163, 255))
label(NavCard, "License", UDim2.fromOffset(37, 0), UDim2.new(1, -42, 1, 0), Enum.Font.GothamSemibold, 11)

local SideStatus = Instance.new("Frame")
SideStatus.BackgroundColor3 = Color3.fromRGB(16, 35, 32)
SideStatus.BorderSizePixel = 0
SideStatus.Position = UDim2.new(0, 12, 1, -82)
SideStatus.Size = UDim2.new(1, -24, 0, 54)
SideStatus.Parent = Sidebar
corner(SideStatus, 11)
stroke(SideStatus, COLORS.Green, 0.65, 1)

local LiveDot = Instance.new("Frame")
LiveDot.BackgroundColor3 = COLORS.Green
LiveDot.BorderSizePixel = 0
LiveDot.Position = UDim2.fromOffset(12, 13)
LiveDot.Size = UDim2.fromOffset(8, 8)
LiveDot.Parent = SideStatus
corner(LiveDot, 8)

label(SideStatus, "SYSTEM ONLINE", UDim2.fromOffset(27, 7), UDim2.new(1, -34, 0, 20), Enum.Font.GothamBold, 9, COLORS.Green)
label(SideStatus, "All services ready", UDim2.fromOffset(12, 28), UDim2.new(1, -20, 0, 16), Enum.Font.Gotham, 8, COLORS.Muted)

TweenService:Create(
    LiveDot,
    TweenInfo.new(0.9, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true),
    {BackgroundTransparency = 0.65}
):Play()

local Header = Instance.new("Frame")
Header.BackgroundTransparency = 1
Header.Position = UDim2.fromOffset(152, 0)
Header.Size = UDim2.new(1, -152, 0, 70)
Header.Parent = Surface

label(Header, "License verification", UDim2.fromOffset(22, 13), UDim2.new(1, -120, 0, 24), Enum.Font.GothamBold, 17)
label(Header, "Enter your access key to continue", UDim2.fromOffset(22, 38), UDim2.new(1, -120, 0, 18), Enum.Font.Gotham, 10, COLORS.Muted)

local MinimizeButton = button(Header, "Minimize", "—", UDim2.new(1, -74, 0, 18), UDim2.fromOffset(26, 26), Color3.fromRGB(27, 31, 45))
local CloseButton = button(Header, "Close", "×", UDim2.new(1, -40, 0, 18), UDim2.fromOffset(26, 26), Color3.fromRGB(27, 31, 45))

local Content = Instance.new("Frame")
Content.BackgroundTransparency = 1
Content.Position = UDim2.fromOffset(174, 72)
Content.Size = UDim2.new(1, -196, 1, -92)
Content.Parent = Surface

local KeyCard = Instance.new("Frame")
KeyCard.BackgroundColor3 = COLORS.Card
KeyCard.BorderSizePixel = 0
KeyCard.Size = UDim2.new(1, 0, 0, 116)
KeyCard.Parent = Content
corner(KeyCard, 13)
stroke(KeyCard, COLORS.Border, 0.28, 1)

label(KeyCard, "YOUR LICENSE KEY", UDim2.fromOffset(14, 11), UDim2.new(1, -28, 0, 18), Enum.Font.GothamBold, 9, Color3.fromRGB(166, 174, 200))

local InputHolder = Instance.new("Frame")
InputHolder.BackgroundColor3 = Color3.fromRGB(13, 16, 26)
InputHolder.BorderSizePixel = 0
InputHolder.Position = UDim2.fromOffset(14, 36)
InputHolder.Size = UDim2.new(1, -28, 0, 48)
InputHolder.Parent = KeyCard
corner(InputHolder, 10)
local inputStroke = stroke(InputHolder, COLORS.Border, 0.2, 1)

local KeyBox = Instance.new("TextBox")
KeyBox.BackgroundTransparency = 1
KeyBox.ClearTextOnFocus = false
KeyBox.Font = Enum.Font.Code
KeyBox.PlaceholderColor3 = Color3.fromRGB(83, 92, 116)
KeyBox.PlaceholderText = "AIRESZ-XXXX-XXXX-XXXX"
KeyBox.Position = UDim2.fromOffset(13, 0)
KeyBox.Size = UDim2.new(1, -98, 1, 0)
KeyBox.Text = ""
KeyBox.TextColor3 = COLORS.Text
KeyBox.TextSize = 12
KeyBox.TextXAlignment = Enum.TextXAlignment.Left
KeyBox.Parent = InputHolder

local EyeButton = button(InputHolder, "ShowHide", "HIDE", UDim2.new(1, -76, 0, 8), UDim2.fromOffset(62, 32), Color3.fromRGB(29, 34, 50))
EyeButton.TextSize = 9

local HelperDot = Instance.new("Frame")
HelperDot.BackgroundColor3 = COLORS.Muted
HelperDot.BorderSizePixel = 0
HelperDot.Position = UDim2.fromOffset(15, 97)
HelperDot.Size = UDim2.fromOffset(6, 6)
HelperDot.Parent = KeyCard
corner(HelperDot, 6)

local StatusText = label(KeyCard, "Waiting for your key", UDim2.fromOffset(28, 89), UDim2.new(1, -42, 0, 20), Enum.Font.Gotham, 9, COLORS.Muted)

local ActionRow = Instance.new("Frame")
ActionRow.BackgroundTransparency = 1
ActionRow.Position = UDim2.fromOffset(0, 126)
ActionRow.Size = UDim2.new(1, 0, 0, 46)
ActionRow.Parent = Content

local GetKeyButton = button(ActionRow, "GetKey", "GET KEY", UDim2.fromOffset(0, 0), UDim2.new(0.36, -5, 1, 0), Color3.fromRGB(27, 31, 46))
local VerifyButton = button(ActionRow, "Verify", "VERIFY & CONTINUE", UDim2.new(0.36, 5, 0, 0), UDim2.new(0.64, -5, 1, 0), COLORS.Purple)
VerifyButton.Text = ""

local verifyGradient = Instance.new("UIGradient")
verifyGradient.Color = ColorSequence.new(COLORS.Purple, COLORS.Blue)
verifyGradient.Rotation = 15
verifyGradient.Parent = VerifyButton

local VerifyButtonText = label(
    VerifyButton,
    "VERIFY & CONTINUE",
    UDim2.fromScale(0, 0),
    UDim2.fromScale(1, 1),
    Enum.Font.GothamSemibold,
    11,
    Color3.fromRGB(255, 255, 255)
)
VerifyButtonText.TextXAlignment = Enum.TextXAlignment.Center
VerifyButtonText.ZIndex = VerifyButton.ZIndex + 1

local SessionCard = Instance.new("Frame")
SessionCard.BackgroundColor3 = COLORS.Card
SessionCard.BorderSizePixel = 0
SessionCard.Position = UDim2.fromOffset(0, 182)
SessionCard.Size = UDim2.new(1, 0, 0, 64)
SessionCard.Parent = Content
corner(SessionCard, 12)
stroke(SessionCard, COLORS.Border, 0.35, 1)

local SessionIcon = Instance.new("Frame")
SessionIcon.BackgroundColor3 = Color3.fromRGB(39, 34, 61)
SessionIcon.BorderSizePixel = 0
SessionIcon.Position = UDim2.fromOffset(12, 12)
SessionIcon.Size = UDim2.fromOffset(40, 40)
SessionIcon.Parent = SessionCard
corner(SessionIcon, 10)

local SessionGlyph = label(SessionIcon, "◆", UDim2.fromScale(0, 0), UDim2.fromScale(1, 1), Enum.Font.GothamBold, 14, Color3.fromRGB(181, 164, 255))
SessionGlyph.TextXAlignment = Enum.TextXAlignment.Center

label(SessionCard, "License status", UDim2.fromOffset(63, 10), UDim2.new(1, -175, 0, 19), Enum.Font.GothamSemibold, 11)
local SessionText = label(SessionCard, "Verify to view expiry information", UDim2.fromOffset(63, 31), UDim2.new(1, -76, 0, 17), Enum.Font.Gotham, 9, COLORS.Muted)
local SessionState = label(SessionCard, "UNVERIFIED", UDim2.new(1, -112, 0, 10), UDim2.fromOffset(98, 19), Enum.Font.GothamBold, 9, COLORS.Yellow)
SessionState.TextXAlignment = Enum.TextXAlignment.Right

local SaveRow = Instance.new("Frame")
SaveRow.BackgroundColor3 = COLORS.Card
SaveRow.BorderSizePixel = 0
SaveRow.Position = UDim2.fromOffset(0, 256)
SaveRow.Size = UDim2.new(1, 0, 0, 48)
SaveRow.Parent = Content
corner(SaveRow, 11)
stroke(SaveRow, COLORS.Border, 0.4, 1)

label(SaveRow, "Remember this key", UDim2.fromOffset(13, 5), UDim2.new(1, -95, 0, 20), Enum.Font.GothamSemibold, 10)
label(SaveRow, "Auto-login when you execute again", UDim2.fromOffset(13, 23), UDim2.new(1, -95, 0, 17), Enum.Font.Gotham, 8, COLORS.Muted)

local SaveToggle = Instance.new("TextButton")
SaveToggle.AutoButtonColor = false
SaveToggle.BackgroundColor3 = COLORS.Purple
SaveToggle.BorderSizePixel = 0
SaveToggle.Position = UDim2.new(1, -58, 0, 12)
SaveToggle.Size = UDim2.fromOffset(44, 24)
SaveToggle.Text = ""
SaveToggle.Parent = SaveRow
corner(SaveToggle, 12)

local ToggleKnob = Instance.new("Frame")
ToggleKnob.AnchorPoint = Vector2.new(0.5, 0.5)
ToggleKnob.BackgroundColor3 = Color3.new(1, 1, 1)
ToggleKnob.BorderSizePixel = 0
ToggleKnob.Position = UDim2.new(1, -12, 0.5, 0)
ToggleKnob.Size = UDim2.fromOffset(18, 18)
ToggleKnob.Parent = SaveToggle
corner(ToggleKnob, 9)

local BottomRow = Instance.new("Frame")
BottomRow.BackgroundTransparency = 1
BottomRow.Position = UDim2.fromOffset(0, 314)
BottomRow.Size = UDim2.new(1, 0, 0, 38)
BottomRow.Parent = Content

local DiscordButton = button(BottomRow, "Discord", "COPY DISCORD", UDim2.fromOffset(0, 0), UDim2.new(0.5, -5, 1, 0), Color3.fromRGB(27, 31, 46))
DiscordButton.TextColor3 = Color3.fromRGB(181, 190, 255)
local ResetButton = button(BottomRow, "Reset", "RESET KEY", UDim2.new(0.5, 5, 0, 0), UDim2.new(0.5, -5, 1, 0), Color3.fromRGB(45, 25, 35))
ResetButton.TextColor3 = Color3.fromRGB(255, 151, 173)

local saveEnabled = true
local keyVisible = true
local verifying = false
local minimized = false
local currentSession = nil
local sessionGeneration = 0

local REKEY_CODES = {
    KEY_EXPIRED = true,
    KEY_REVOKED = true,
    KEY_DELETED = true,
    KEY_INACTIVE = true,
    KEY_INVALID = true,
    KEY_NOT_FOUND = true,
    KEY_DISABLED = true,
    INVALID_KEY = true,
    SESSION_EXPIRED = true,
    SESSION_REVOKED = true,
    ACCESS_DENIED = true,
    UNAUTHORIZED = true
}

local NON_REKEY_CODES = {
    NETWORK_UNAVAILABLE = true,
    SERVER_UNAVAILABLE = true,
    MAINTENANCE = true,
    SERVER_MAINTENANCE = true,
    SERVICE_UNAVAILABLE = true,
    RATE_LIMITED = true
}

local Mask = label(InputHolder, "", KeyBox.Position, KeyBox.Size, Enum.Font.Code, 12, COLORS.Text)
Mask.Visible = false
Mask.ZIndex = KeyBox.ZIndex + 1

local function notify(title, text)
    pcall(function()
        StarterGui:SetCore("SendNotification", {
            Title = title,
            Text = text,
            Duration = 5
        })
    end)
end

local function setStatus(text, state)
    local colors = {
        idle = COLORS.Muted,
        loading = COLORS.Yellow,
        success = COLORS.Green,
        error = COLORS.Red
    }
    local color = colors[state] or colors.idle
    StatusText.Text = text
    StatusText.TextColor3 = color
    HelperDot.BackgroundColor3 = color
end

local function updateMask()
    Mask.Text = string.rep("•", utf8.len(KeyBox.Text) or #KeyBox.Text)
end

local function setKeyVisible(value)
    keyVisible = value
    KeyBox.TextTransparency = value and 0 or 1
    Mask.Visible = not value
    EyeButton.Text = value and "HIDE" or "SHOW"
    updateMask()
end

local function setSaveEnabled(value)
    saveEnabled = value
    TweenService:Create(SaveToggle, TweenInfo.new(0.18), {
        BackgroundColor3 = value and COLORS.Purple or Color3.fromRGB(47, 53, 69)
    }):Play()
    TweenService:Create(ToggleKnob, TweenInfo.new(0.18, Enum.EasingStyle.Quart), {
        Position = value and UDim2.new(1, -12, 0.5, 0) or UDim2.new(0, 12, 0.5, 0)
    }):Play()
    setStatus(value and "Auto-login enabled" or "Key will not be saved", "idle")
end

local function trim(text)
    return tostring(text or ""):gsub("^%s+", ""):gsub("%s+$", "")
end

local function requiresNewKey(reason, code)
    local normalizedCode = tostring(code or "UNKNOWN"):upper()
    if REKEY_CODES[normalizedCode] then
        return true
    end
    if NON_REKEY_CODES[normalizedCode] then
        return false
    end

    local message = tostring(reason or ""):lower()
    if message:find("maintenance", 1, true)
        or message:find("network", 1, true)
        or message:find("unavailable", 1, true)
        or message:find("timeout", 1, true)
        or message:find("rate limit", 1, true)
    then
        return false
    end

    for _, marker in ipairs({
        "expired", "revoked", "deleted", "inactive", "invalid key",
        "key not found", "unknown key", "access denied", "unauthorized"
    }) do
        if message:find(marker, 1, true) then
            return true
        end
    end

    return false
end

local function deleteSavedKey(markRekey)
    if type(isfile) == "function" and type(delfile) == "function" then
        for _, path in ipairs({KEY_FILE, FALLBACK_KEY_FILE}) do
            pcall(function()
                if isfile(path) then
                    delfile(path)
                end
            end)
        end
    end

    RuntimeEnv.AIRESZ_SAVED_KEY = nil
    RuntimeEnv.AIRESZ_REKEY_REQUIRED = markRekey ~= false
end

local function saveKey(key)
    key = trim(key)
    if key == "" then
        return false, "Key is empty"
    end

    RuntimeEnv.AIRESZ_SAVED_KEY = key
    RuntimeEnv.AIRESZ_REKEY_REQUIRED = false

    if type(writefile) ~= "function" then
        return false, "Executor does not support writefile"
    end

    local folderReady = false
    if type(isfolder) == "function" and type(makefolder) == "function" then
        folderReady = pcall(function()
            if not isfolder(KEY_FOLDER) then
                makefolder(KEY_FOLDER)
            end
        end)
    end

    if folderReady and pcall(writefile, KEY_FILE, key) then
        return true
    end
    if pcall(writefile, FALLBACK_KEY_FILE, key) then
        return true
    end

    return false, "Could not write saved key"
end

local function loadSavedKey()
    local key = trim(RuntimeEnv.AIRESZ_SAVED_KEY)
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

local function formatDuration(seconds)
    seconds = math.max(0, math.floor(tonumber(seconds) or 0))
    local days = math.floor(seconds / 86400)
    local hours = math.floor(seconds % 86400 / 3600)
    local minutes = math.floor(seconds % 3600 / 60)

    if days > 0 then
        return string.format("%dd %dh %dm", days, hours, minutes)
    end
    if hours > 0 then
        return string.format("%dh %dm", hours, minutes)
    end
    return string.format("%dm", minutes)
end

local function getRemainingText(...)
    for index = 1, select("#", ...) do
        local source = select(index, ...)
        if type(source) == "table" then
            for _, field in ipairs({
                "remainingSeconds", "keyRemainingSeconds", "expiresIn",
                "ttlSeconds", "keyTtlSeconds", "remaining"
            }) do
                local value = tonumber(source[field])
                if value then
                    return formatDuration(value)
                end
            end

            for _, field in ipairs({"expiresAt", "keyExpiresAt", "expiry"}) do
                local value = tonumber(source[field])
                if value then
                    if value > 1000000000000 then
                        value = math.floor(value / 1000)
                    end
                    return formatDuration(value - os.time())
                end
            end
        end
    end
end

local function setVerifyBusy(value)
    verifying = value
    VerifyButtonText.Text = value and "VERIFYING..." or "VERIFY & CONTINUE"
    VerifyButton.Active = not value
    KeyBox.TextEditable = not value
    VerifyButton.BackgroundTransparency = value and 0.15 or 0

    if value then
        SessionState.Text = "VERIFYING"
        SessionState.TextColor3 = COLORS.Yellow
        SessionText.Text = "Checking license key and device..."
    end
end

local function showKeyGui(message, state)
    if not ScreenGui or not ScreenGui.Parent then
        return
    end

    ScreenGui.Enabled = true
    Sidebar.Visible = true
    Content.Visible = true
    Header.Position = UDim2.fromOffset(152, 0)
    Header.Size = UDim2.new(1, -152, 0, 70)
    Main.Size = UDim2.fromOffset(560, 440)
    MinimizeButton.Text = "—"
    minimized = false
    setVerifyBusy(false)

    if message then
        setStatus(message, state or "idle")
    end
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
        showKeyGui("Enter a valid key first", "error")
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
        local verificationCode = nil
        local ok, err = pcall(function()
            local cacheBuster = tostring(os.time()) .. tostring(math.random(1000, 9999))
            local source = game:HttpGet(AUTH_CLIENT_URL .. "?v=" .. cacheBuster, true)
            source = source:gsub("https://YOUR%-WORKER%.workers%.dev", WORKER_URL)

            local compileClient, compileError = loadstring(source)
            if not compileClient then
                error("Authorization client compile failed: " .. tostring(compileError))
            end

            local startAireszSession = compileClient()
            if type(startAireszSession) ~= "function" then
                error("Authorization client did not return a start function")
            end

            if not silentSavedKey then
                setStatus("Checking key and device...", "loading")
            end

            local session, resultOrError, resultCode = startAireszSession(key, function(reason, code)
                if attemptGeneration ~= sessionGeneration then
                    return
                end

                currentSession = nil
                if requiresNewKey(reason, code) then
                    deleteSavedKey(true)
                    KeyBox.Text = ""
                    SessionState.Text = "EXPIRED"
                    SessionState.TextColor3 = COLORS.Red
                    SessionText.Text = "Enter a new key to continue"
                    showKeyGui("Key expired, revoked or invalid", "error")
                    notify("Airesz Key System", "Your saved key was removed. Enter a new key.")
                else
                    KeyBox.Text = key
                    SessionState.Text = "PAUSED"
                    SessionState.TextColor3 = COLORS.Yellow
                    SessionText.Text = "Saved key kept safely"
                    showKeyGui(tostring(reason or "Service temporarily unavailable"), "error")
                    notify("Airesz Key System", "Maintenance or connection issue. Saved key was kept.")
                end
            end)

            if not session then
                verificationCode = resultCode
                error(tostring(resultOrError or "Key verification failed"))
            end

            verified = true
            currentSession = session
            local remainingText = getRemainingText(resultOrError, session)

            if saveEnabled then
                local saved, saveError = saveKey(key)
                if not saved then
                    warn("[AIRESZ] Could not save key:", saveError)
                end
            else
                deleteSavedKey(false)
            end

            SessionState.Text = "ACTIVE"
            SessionState.TextColor3 = COLORS.Green
            SessionText.Text = remainingText
                and ("Key active • " .. remainingText .. " remaining")
                or "Key active • session authorized"

            if not silentSavedKey then
                setStatus("Access granted • loading script...", "success")
                task.wait(0.5)
            end

            hideKeyGui()

            local loaded, loadError = session:LoadLatestScript()
            if not loaded then
                session:Stop("Private script failed to load.")
                currentSession = nil
                error(tostring(loadError or "Private script could not be loaded"))
            end

            notify(
                "Airesz Key System",
                remainingText
                    and ("Key active • " .. remainingText .. " remaining")
                    or "Script loaded successfully."
            )
        end)

        if not ok then
            local message = tostring(err):gsub("^.-:%d+:%s*", "")
            if not verified and requiresNewKey(message, verificationCode) then
                deleteSavedKey(true)
                KeyBox.Text = ""
                showKeyGui("Saved key expired or invalid", "error")
                notify("Airesz Key System", "Saved key expired or invalid and was removed.")
            elseif not verified then
                SessionState.Text = "UNAVAILABLE"
                SessionState.TextColor3 = COLORS.Yellow
                SessionText.Text = "Saved key kept • try again later"
                KeyBox.Text = key
                showKeyGui("Verification unavailable: " .. message, "error")
                notify("Airesz Key System", "Maintenance or connection issue. Saved key was kept.")
            else
                SessionState.Text = "LOAD ERROR"
                SessionState.TextColor3 = COLORS.Red
                SessionText.Text = "Authorization passed but script failed to load"
                showKeyGui("Script load failed: " .. message, "error")
                notify("Script Load Failed", message)
            end
        end
    end)
end

KeyBox:GetPropertyChangedSignal("Text"):Connect(updateMask)
KeyBox.Focused:Connect(function()
    TweenService:Create(inputStroke, TweenInfo.new(0.15), {
        Color = COLORS.Purple,
        Transparency = 0
    }):Play()
end)
KeyBox.FocusLost:Connect(function(enterPressed)
    TweenService:Create(inputStroke, TweenInfo.new(0.15), {
        Color = COLORS.Border,
        Transparency = 0.2
    }):Play()
    if enterPressed then
        verifyAndLoad(nil, false)
    end
end)

EyeButton.MouseButton1Click:Connect(function()
    setKeyVisible(not keyVisible)
end)
SaveToggle.MouseButton1Click:Connect(function()
    setSaveEnabled(not saveEnabled)
end)
VerifyButton.MouseButton1Click:Connect(function()
    verifyAndLoad(nil, false)
end)

GetKeyButton.MouseButton1Click:Connect(function()
    if type(setclipboard) == "function" then
        setclipboard(GET_KEY_URL)
        setStatus("Key link copied", "success")
        notify("Airesz Key System", "Key page link copied.")
    else
        setStatus("Clipboard is not supported", "error")
    end
end)

DiscordButton.MouseButton1Click:Connect(function()
    if type(setclipboard) == "function" then
        setclipboard(DISCORD_URL)
        setStatus("Discord link copied", "success")
        notify("Airesz Key System", "Discord link copied.")
    else
        setStatus("Clipboard is not supported", "error")
    end
end)

ResetButton.MouseButton1Click:Connect(function()
    if verifying then
        return
    end
    deleteSavedKey(true)
    KeyBox.Text = ""
    SessionState.Text = "UNVERIFIED"
    SessionState.TextColor3 = COLORS.Yellow
    SessionText.Text = "Verify to view expiry information"
    setStatus("Saved key removed", "idle")
    notify("Airesz Key System", "Saved key removed.")
end)

addInteraction(GetKeyButton, Color3.fromRGB(27, 31, 46), COLORS.CardHover)
addInteraction(DiscordButton, Color3.fromRGB(27, 31, 46), COLORS.CardHover)
addInteraction(ResetButton, Color3.fromRGB(45, 25, 35), Color3.fromRGB(65, 31, 45))
addInteraction(EyeButton, Color3.fromRGB(29, 34, 50), Color3.fromRGB(42, 49, 70))
addInteraction(MinimizeButton, Color3.fromRGB(27, 31, 45), COLORS.CardHover)
addInteraction(CloseButton, Color3.fromRGB(27, 31, 45), Color3.fromRGB(67, 31, 44))

MinimizeButton.MouseButton1Click:Connect(function()
    minimized = not minimized
    Sidebar.Visible = not minimized
    Content.Visible = not minimized
    Header.Position = minimized and UDim2.fromOffset(0, 0) or UDim2.fromOffset(152, 0)
    Header.Size = minimized and UDim2.new(1, 0, 0, 70) or UDim2.new(1, -152, 0, 70)
    MinimizeButton.Text = minimized and "+" or "—"
    TweenService:Create(Main, TweenInfo.new(0.2, Enum.EasingStyle.Quart), {
        Size = minimized and UDim2.fromOffset(408, 74) or UDim2.fromOffset(560, 440)
    }):Play()
end)

CloseButton.MouseButton1Click:Connect(function()
    if verifying then
        setStatus("Wait until verification finishes", "loading")
        return
    end

    local allowed = false
    if currentSession and type(currentSession.IsAllowed) == "function" then
        local ok, result = pcall(function()
            return currentSession:IsAllowed()
        end)
        allowed = ok and result == true
    end

    if allowed then
        hideKeyGui()
    else
        hideKeyGui()
    end
end)

local dragging = false
local dragStart
local startPosition

Header.InputBegan:Connect(function(input)
    if input.UserInputType == Enum.UserInputType.MouseButton1
        or input.UserInputType == Enum.UserInputType.Touch
    then
        dragging = true
        dragStart = input.Position
        startPosition = Main.Position
    end
end)

UserInputService.InputChanged:Connect(function(input)
    if dragging and (
        input.UserInputType == Enum.UserInputType.MouseMovement
        or input.UserInputType == Enum.UserInputType.Touch
    ) then
        local delta = input.Position - dragStart
        Main.Position = UDim2.new(
            startPosition.X.Scale,
            startPosition.X.Offset + delta.X,
            startPosition.Y.Scale,
            startPosition.Y.Offset + delta.Y
        )
    end
end)

UserInputService.InputEnded:Connect(function(input)
    if input.UserInputType == Enum.UserInputType.MouseButton1
        or input.UserInputType == Enum.UserInputType.Touch
    then
        dragging = false
    end
end)

local interfaceScale = Instance.new("UIScale")
interfaceScale.Parent = Main

local function updateScale()
    local camera = workspace.CurrentCamera
    if not camera then
        return
    end

    local viewport = camera.ViewportSize
    interfaceScale.Scale = math.clamp(math.min(viewport.X / 620, viewport.Y / 500), 0.68, 1)
end

updateScale()
if workspace.CurrentCamera then
    workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(updateScale)
end

setKeyVisible(true)
setSaveEnabled(true)

local savedKey = loadSavedKey()
if savedKey ~= "" then
    KeyBox.Text = savedKey
    verifyAndLoad(savedKey, true)
else
    showKeyGui("Waiting for a key", "idle")
end
