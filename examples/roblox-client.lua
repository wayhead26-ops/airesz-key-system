-- Airesz v3.9.0 authorization client:
-- maintenance heartbeat + multi-game auto update + protected-payload cleanup.
local WORKER_URL = "https://airesz-key-api.airesz-key-system.workers.dev"

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local player = Players.LocalPlayer
local RuntimeEnv = type(getgenv) == "function" and getgenv() or _G

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

local function callPayloadCleanup(payloadResult, reason)
    if type(payloadResult) == "function" then
        pcall(payloadResult, reason)
        return
    end

    if type(payloadResult) ~= "table" then
        return
    end

    for _, methodName in ipairs({"Unload", "Destroy", "Stop"}) do
        local method = payloadResult[methodName]
        if type(method) == "function" then
            pcall(function()
                method(payloadResult, reason)
            end)
            return
        end
    end
end

local function startAireszSession(key, onBlocked)
    local verifyPayload = identityPayload()
    verifyPayload.key = key

    local statusCode, result = requestJson("/api/key/verify", verifyPayload)
    if statusCode ~= 200 or not result.valid or not result.sessionToken then
        return nil,
            result.error or "Key verification failed.",
            result.code or (statusCode == 0 and "NETWORK_UNAVAILABLE" or "VERIFY_FAILED")
    end

    local session = {
        allowed = true,
        stopped = false,
        token = result.sessionToken,
        sessionId = result.sessionId,
        heartbeatSeconds = 10,
        verification = result,
        cleanupCallbacks = {},
        trackedConnections = {},
        trackedInstances = {},
        payloadResult = nil,
        payloadLoaded = false,
        unloading = false,
        endSent = false
    }

    RuntimeEnv.AIRESZ_AUTHORIZED = true
    RuntimeEnv.AIRESZ_SESSION = session

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

    -- Private game scripts use this to stop loops, disconnect events and close UI.
    function session:RegisterCleanup(callback)
        assert(type(callback) == "function", "RegisterCleanup expects a function.")
        table.insert(self.cleanupCallbacks, callback)
        return callback
    end

    -- Connections registered by a protected payload are disconnected before
    -- the payload UI is removed. This prevents old callbacks surviving re-key.
    function session:RegisterConnection(connection)
        assert(
            typeof(connection) == "RBXScriptConnection",
            "RegisterConnection expects an RBXScriptConnection."
        )
        table.insert(self.trackedConnections, connection)
        return connection
    end

    -- Optional helper for GUI or other instances owned by a protected payload.
    function session:TrackInstance(instance)
        assert(typeof(instance) == "Instance", "TrackInstance expects an Instance.")
        table.insert(self.trackedInstances, instance)
        return instance
    end

    function session:UnloadProtectedPayload(reason)
        if self.unloading then
            return
        end

        self.unloading = true
        local cleanupReason = tostring(reason or "Authorization ended.")

        local callbacks = self.cleanupCallbacks
        self.cleanupCallbacks = {}
        for index = #callbacks, 1, -1 do
            pcall(callbacks[index], cleanupReason)
        end

        local connections = self.trackedConnections
        self.trackedConnections = {}
        for index = #connections, 1, -1 do
            local connection = connections[index]
            pcall(function()
                if connection and connection.Connected then
                    connection:Disconnect()
                end
            end)
        end

        local payloadResult = self.payloadResult
        self.payloadResult = nil
        callPayloadCleanup(payloadResult, cleanupReason)

        local instances = self.trackedInstances
        self.trackedInstances = {}
        for index = #instances, 1, -1 do
            local instance = instances[index]
            pcall(function()
                if instance and instance.Parent then
                    instance:Destroy()
                end
            end)
        end

        self.payloadLoaded = false
        RuntimeEnv.AIRESZ_PAYLOAD = nil
        RuntimeEnv.AIRESZ_GAME_CONFIG = nil
        RuntimeEnv.AIRESZ_GAME_VERSION = nil
        if RuntimeEnv.AIRESZ_SESSION == self then
            RuntimeEnv.AIRESZ_SESSION = nil
        end
        self.unloading = false
    end

    function session:LoadLatestScript()
        self:AssertAllowed()

        if self.payloadLoaded then
            self:UnloadProtectedPayload("Reloading protected payload.")
        end

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

        local downloadStatus = tonumber(response.StatusCode) or 0
        local source = tostring(response.Body or "")
        if downloadStatus ~= 200 then
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

        RuntimeEnv.AIRESZ_SESSION = self
        RuntimeEnv.AIRESZ_GAME_CONFIG = gameConfig
        RuntimeEnv.AIRESZ_GAME_VERSION = gameConfig.latestVersion

        local okRun, resultValue = pcall(chunk)
        if not okRun then
            self:UnloadProtectedPayload("Latest script runtime failed.")
            return nil, "Latest script runtime failed: " .. tostring(resultValue)
        end

        self.payloadResult = resultValue
        self.payloadLoaded = true
        RuntimeEnv.AIRESZ_PAYLOAD = resultValue
        return true, resultValue
    end

    function session:Stop(reason)
        if self.stopped and not self.payloadLoaded then
            return
        end

        self.stopped = true
        self.allowed = false
        RuntimeEnv.AIRESZ_AUTHORIZED = false
        self:UnloadProtectedPayload(reason or "Session stopped.")

        if not self.endSent then
            self.endSent = true
            pcall(function()
                requestJson("/api/client/end", { sessionToken = self.token })
            end)
        end
    end

    local function block(reason, code)
        if not session.allowed then
            return
        end

        session.allowed = false
        session.stopped = true
        RuntimeEnv.AIRESZ_AUTHORIZED = false
        session:UnloadProtectedPayload(reason)

        warn("[AIRESZ] Access stopped: " .. tostring(reason))
        if type(onBlocked) == "function" then
            pcall(onBlocked, tostring(reason), tostring(code or "ACCESS_DENIED"))
        end
    end

    task.spawn(function()
        local networkFailures = 0

        while session:IsAllowed() do
            task.wait(session.heartbeatSeconds)
            if not session:IsAllowed() then
                break
            end

            local heartbeatPayload = identityPayload()
            heartbeatPayload.sessionToken = session.token

            local ok, heartbeatStatus, heartbeat = pcall(function()
                local code, data = requestJson("/api/client/heartbeat", heartbeatPayload)
                return code, data
            end)

            if not ok then
                networkFailures = networkFailures + 1
                if networkFailures >= 3 then
                    block("Authorization heartbeat could not reach the server.", "NETWORK_UNAVAILABLE")
                end
            elseif heartbeatStatus == 200 and heartbeat.allowed then
                networkFailures = 0
                if heartbeat.sessionToken then
                    session.token = tostring(heartbeat.sessionToken)
                end
                session.heartbeatSeconds = 10
            elseif heartbeatStatus == 0 or heartbeatStatus >= 500 then
                networkFailures = networkFailures + 1
                if networkFailures >= 3 then
                    block(heartbeat.error or "Authorization server is unavailable.", "SERVER_UNAVAILABLE")
                end
            else
                block(
                    heartbeat.error or "Access was denied by the authorization server.",
                    heartbeat.code or "ACCESS_DENIED"
                )
            end
        end
    end)

    return session, result
end

return startAireszSession
