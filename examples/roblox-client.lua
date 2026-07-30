-- Airesz v3.7.1 client example: maintenance heartbeat + multi-game auto update
-- Replace this with your deployed Cloudflare Worker URL.
local WORKER_URL = "https://airesz-key-api.airesz-key-system.workers.dev"

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local player = Players.LocalPlayer

local function getRequestFunction()
    return request or http_request or (syn and syn.request)
end

local function getExecutorName()
    if identifyexecutor then
        local ok, name = pcall(identifyexecutor)
        if ok and name then
            return tostring(name)
        end
    end
    return "Unknown"
end

local function getHwid()
    local ok, value = pcall(function()
        return gethwid and gethwid()
    end)
    if ok and value and tostring(value) ~= "" then
        return tostring(value)
    end
    -- Compatibility fallback only. A real executor HWID is stronger than this fallback.
    return "roblox-user-" .. tostring(player.UserId)
end

local function requestJson(path, payload)
    local requestFn = getRequestFunction()
    assert(requestFn, "This environment does not provide an HTTP request function.")

    local response = requestFn({
        Url = WORKER_URL .. path,
        Method = "POST",
        Headers = { ["Content-Type"] = "application/json" },
        Body = HttpService:JSONEncode(payload)
    })

    local decoded = {}
    local ok = pcall(function()
        decoded = HttpService:JSONDecode(response.Body or "{}")
    end)
    if not ok then
        decoded = { error = "The authorization server returned invalid JSON." }
    end

    return tonumber(response.StatusCode) or 0, decoded
end

local function identityPayload()
    return {
        userId = tostring(player.UserId),
        username = tostring(player.Name),
        placeId = tostring(game.PlaceId),
        jobId = tostring(game.JobId or ""),
        hwid = getHwid(),
        executorName = getExecutorName()
    }
end

local function startAireszSession(key, onBlocked)
    local verifyPayload = identityPayload()
    verifyPayload.key = key

    local statusCode, result = requestJson("/api/key/verify", verifyPayload)
    if statusCode ~= 200 or not result.valid or not result.sessionToken then
        return nil, result.error or "Key verification failed."
    end

    local session = {
        allowed = true,
        stopped = false,
        token = result.sessionToken,
        sessionId = result.sessionId,
        heartbeatSeconds = tonumber(result.heartbeatSeconds) or 30,
        verification = result
    }

    getgenv().AIRESZ_AUTHORIZED = true

    function session:IsAllowed()
        return self.allowed and not self.stopped
    end

    function session:AssertAllowed()
        assert(self:IsAllowed(), "Airesz authorization is no longer active.")
        return true
    end

    function session:GetGameConfig()
        return self.verification and self.verification.game or nil
    end

    function session:LoadLatestScript()
        self:AssertAllowed()
        local gameConfig = self:GetGameConfig()
        if not gameConfig then
            return nil, "This Place ID is not registered in Game Control."
        end
        if not gameConfig.autoUpdate or not gameConfig.scriptEndpoint then
            return nil, "No Private Script Path is configured for this game."
        end

        local requestFn = getRequestFunction()
        if not requestFn then
            return nil, "This environment does not provide an HTTP request function."
        end

        local payload = identityPayload()
        payload.sessionToken = self.token

        local response = requestFn({
            Url = WORKER_URL .. tostring(gameConfig.scriptEndpoint),
            Method = "POST",
            Headers = { ["Content-Type"] = "application/json" },
            Body = HttpService:JSONEncode(payload)
        })

        local statusCode = tonumber(response.StatusCode) or 0
        local source = tostring(response.Body or "")
        if statusCode ~= 200 then
            local message = "Auto update download failed."
            pcall(function()
                local decoded = HttpService:JSONDecode(source)
                message = decoded.error or message
            end)
            return nil, message
        end
        if source == "" then
            return nil, "The latest script response was empty."
        end

        local chunk, compileError = loadstring(source)
        if not chunk then
            return nil, "Latest script compile failed: " .. tostring(compileError)
        end

        getgenv().AIRESZ_SESSION = self
        getgenv().AIRESZ_GAME_CONFIG = gameConfig
        getgenv().AIRESZ_GAME_VERSION = gameConfig.latestVersion

        local okRun, resultValue = pcall(chunk)
        if not okRun then
            return nil, "Latest script runtime failed: " .. tostring(resultValue)
        end
        return true, resultValue
    end

    function session:Stop()
        if self.stopped then return end
        self.stopped = true
        self.allowed = false
        getgenv().AIRESZ_AUTHORIZED = false
        pcall(function()
            requestJson("/api/client/end", { sessionToken = self.token })
        end)
    end

    local function block(reason)
        if not session.allowed then return end
        session.allowed = false
        session.stopped = true
        getgenv().AIRESZ_AUTHORIZED = false
        warn("[AIRESZ] Access stopped: " .. tostring(reason))
        if type(onBlocked) == "function" then
            pcall(onBlocked, tostring(reason))
        end
    end

    task.spawn(function()
        local networkFailures = 0
        while session:IsAllowed() do
            task.wait(session.heartbeatSeconds)
            if not session:IsAllowed() then break end

            local payload = identityPayload()
            payload.sessionToken = session.token

            local ok, heartbeatStatus, heartbeat = pcall(function()
                local code, data = requestJson("/api/client/heartbeat", payload)
                return code, data
            end)

            if not ok then
                networkFailures += 1
                if networkFailures >= 3 then
                    block("Authorization heartbeat could not reach the server.")
                end
            elseif heartbeatStatus == 200 and heartbeat.allowed then
                networkFailures = 0
            elseif heartbeatStatus == 0 or heartbeatStatus >= 500 then
                networkFailures += 1
                if networkFailures >= 3 then
                    block(heartbeat.error or "Authorization server is unavailable.")
                end
            else
                block(heartbeat.error or "Access was denied by the authorization server.")
            end
        end
    end)

    return session, result
end

-- Example usage:
-- local KEY = "AIRESZ-24H-XXXX-XXXX-XXXX-XXXX-XXXX"
-- local session, result = startAireszSession(KEY, function(reason)
--     -- Stop loops, close your UI and disable protected features here.
--     warn("Protected payload disabled:", reason)
-- end)
-- if not session then error(result) end
-- print("Key valid. Counted execution:", result.counted)
-- print("Matched game:", result.game and result.game.name or "Unmanaged Place ID")
--
-- Auto update for the current game:
-- local loaded, loadError = session:LoadLatestScript()
-- if not loaded then error(loadError) end
--
-- The downloaded script can access:
-- getgenv().AIRESZ_SESSION
-- getgenv().AIRESZ_GAME_CONFIG
-- getgenv().AIRESZ_GAME_VERSION
--
-- In long-running loops, check:
-- while session:IsAllowed() do
--     task.wait(1)
--     -- protected feature
-- end

return startAireszSession
