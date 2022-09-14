//@ts-check

// NAME: Group Session
// AUTHOR: Tim Lange (@timll)
// DESCRIPTION: Brings group sessions to the desktop client.

/// <reference path="../globals.d.ts" />

(function GroupSession() {
    if (!Spicetify.CosmosAsync || !Spicetify.LocalStorage) {
        setTimeout(GroupSession, 300);
        return;
    }

    // Interval in which to check if the session is still alive
    const ALIVE_INTERVAL = 5000;
    // Interval for the current session check
    const SESSION_CHECK_INTERVAL = 5000;

    // Global enable state
    let isEnabled;
    // Option: Show scan code in full screen mode
    let showScanCode;
    // Whether user is about to join a session (by entering link)
    let isJoiningSession;
    // Whether user just triggered a link copy
    let isCopyingLink;
    // Device ID of the local desktop client
    let local_device_id;
    // Private session id
    let session_id;
    // Whether user is the owner of the group session
    let is_session_owner;
    // Public session token used for others to join
    let join_session_token;
    // Contains the interval id for the session heartbeat
    let alive_job;
    // Contains the interval id for the task checking for an existing session
    let session_check_job;
    // Cache of users listening
    let users;
    // Caching profile picture links to save api calls
    let imageCache;

    const buildURL = (url, queryParams) => {
        const params = new URLSearchParams(queryParams).toString();
        return `${url}?${params}`;
    }

    /*************
     * API Calls *
     *************/
    const createSession = async () => {
        // Doesn't fail. If session already exists, the current session is returned.
        try {
            const endpoint = buildURL(
                "https://spclient.wg.spotify.com/social-connect/v2/sessions/current_or_new", 
                { local_device_id: local_device_id, type: "REMOTE" });
            const response = await Spicetify.CosmosAsync.get(endpoint);
            setCurrentSession(response);
        } catch (e) {
            Spicetify.showNotification("Session creation failed. Make sure your connected to the internet and the account has Spotify Premium.");
        }
    }

    const joinSession = async (sessionToken) => {
        // Doesn't fail. If session already exists, the current session is returned.
        try {
            const endpoint = buildURL(
                `https://spclient.wg.spotify.com/social-connect/v2/sessions/join/${sessionToken}`, 
                {
                    join_type: "deeplinking",
                    local_device_id: local_device_id,
                    playback_control: "listen_and_control"
                });
            const response = await Spicetify.CosmosAsync.post(endpoint);
            setCurrentSession(response);
            return true;
        } catch (e) {
            Spicetify.showNotification("Session joining failed. Make sure your connected to the internet and the account has Spotify Premium.");
        }
        return false;
    }

    const leaveSession = async () => {
        if (session_id !== null) {
            // On success, the response is empty.
            // On error, it contains error_type and message.
            const endpoint = buildURL(
                `https://spclient.wg.spotify.com/social-connect/v3/sessions/${session_id}/leave`, 
                { local_device_id: local_device_id });
            const response = await Spicetify.CosmosAsync.post(endpoint);

            if ("error_type" in response) {
                Spicetify.showNotification(response.message);
            }
        }
        
        clearCurrentSession();
    }

    const deleteSession = async () => {
        if (session_id !== null) {
            // On success, the response is empty.
            // On error, it contains error_type and message.
            const endpoint = buildURL(
                `https://spclient.wg.spotify.com/social-connect/v3/sessions/${session_id}`, 
                { local_device_id: local_device_id });
            const response = await Spicetify.CosmosAsync.del(endpoint);

            if ("error_type" in response) {
                Spicetify.showNotification(response.message);
            }
        }

        clearCurrentSession();
    }

    const getCurrentSession = async () => {
        try {
            const endpoint = buildURL(
                `https://spclient.wg.spotify.com/social-connect/v2/sessions/current`,
                { local_device_id: local_device_id });
            const response = await Spicetify.CosmosAsync.get(endpoint);
            if ("initialSessionType" in response && response["initialSessionType"] === "REMOTE") {
                return response;
            }
        } catch (e) {
            // console.error(e);
            // console.error("Error checking current session");
            return null;
        }
        return null;
    }

    const getSessionMembers = async () => {
        try {
            const response = await Spicetify.CosmosAsync.get(
                `https://spclient.wg.spotify.com/social-connect/v2/sessions/info/${join_session_token}`);
            return response["session_members"];
        } catch (ex) {
            return null;
        }
        return null;
    }

    /******************
     * Listener Modal *
     ******************/
    const injectListenerStyles = () => {
        const style = document.styleSheets[document.styleSheets.length - 1];
        // Listeners Styles
        style.insertRule(`
            .spicetify-user-list-item {
                display: flex;
                align-items: center;
                padding: 10px;
                border-radius: 5px;
            }`, 
            style.cssRules.length);
        style.insertRule(`
            .spicetify-user-list-item:hover {
                background-color: rgba(255, 255, 255, 0.1);
                text-decoration: none;
            }`, 
            style.cssRules.length);
        style.insertRule(`
            .spicetify-user-list-item-img {
                width: 50px;
                height: 50px;
                border-radius: 50px;
                margin-right: 15px;
            }`, 
            style.cssRules.length);
        style.insertRule(`
            .spicetify-group-button {
                box-sizing: border-box;
                font-family: var(--font-family,spotify-circular),Helvetica,Arial,sans-serif;
                -webkit-tap-highlight-color: transparent;
                font-size: 1rem;
                line-height: 1.5rem;
                font-weight: 700;
                border: 0px;
                border-radius: 500px;
                display: inline-block;
                position: relative;
                text-align: center;
                text-decoration: none;
                text-transform: none;
                touch-action: manipulation;
                transition-duration: 33ms;
                transition-property: background-color, border-color, color, box-shadow, filter, transform;
                user-select: none;
                vertical-align: middle;
                transform: translate3d(0px, 0px, 0px);
                padding: 0px;
                min-inline-size: 0px;
                align-self: center;
                position: relative;
                background-color: var(--background-base,#1ed760);
                color: var(--text-base,#000000);
                border-radius: 500px;
                padding-block: 12px;
                padding-inline: 32px;
            }`, 
            style.cssRules.length);
        style.insertRule(`
            .spicetify-group-button:hover {
                background-color: var(--background-highlight,#1fdf64);
                transform: scale(1.04);
            }`, 
            style.cssRules.length);
    }

    const getUserItem = async (user) => {
        if (!(user["username"] in imageCache)) {
            const resp = await Spicetify.CosmosAsync.get(`https://api.spotify.com/v1/users/${user["username"]}`);
            imageCache[user["username"]] = resp["images"];
        }

        const userLink = document.createElement("a");
        userLink.classList.add("spicetify-user-list-item");
        userLink.href = `https://open.spotify.com/user/${user["username"]}`;
        userLink.draggable = false;
        userLink.addEventListener("click", Spicetify.PopupModal.hide);

        const images = imageCache[user["username"]];
        let img;
        if (images.length === 0) {
            img = document.createElement("span");
            img.style.backgroundColor = "#1ED760";
            if (user["display_name"].length > 0) {
                img.textContent = user["display_name"][0];
                img.style.textAlign = "center";
                img.style.lineHeight = "50px";
            }
        } else {
            img = document.createElement("img");
            img.src = images[0]["url"];
        }
        img.classList.add("spicetify-user-list-item-img");
        userLink.appendChild(img);

        const name = document.createElement("span");
        name.style.fontSize = "18px";
        name.textContent = user["display_name"];
        userLink.appendChild(name);

        return userLink;
    }

    const showUserList = async (e) => {
        if (session_id === null) {
            return;
        }

        const userContainer = document.createElement("div");
        userContainer.style.display = "flex";
        userContainer.style.flexDirection = "column";

        Spicetify.PopupModal.display({
            title: "Listeners",
            content: userContainer,
        });

        for (let i = 0; i < users.length; i++) {
            const user = await getUserItem(users[i])
            userContainer.appendChild(user);
        }
    }


    /***************
     * Device Menu *
     ***************/
    const buildContainerAndTitle = () => {
        const containerDiv = document.createElement("div");
        containerDiv.id = "spicetify-group-session-menu"
        containerDiv.style.display = "flex";
        containerDiv.style.justifyContent = "center";
        containerDiv.style.flexWrap = "wrap";
        containerDiv.style.paddingBottom = "12px";

        const titleDiv = document.createElement("div");
        titleDiv.classList.add("connect-title", "main-type-cello");
        titleDiv.style.color = "#ffffff";

        const title = document.createElement("h3");
        titleDiv.appendChild(title);
        title.classList.add("connect-title__text");
        title.textContent = "Group Session";
        title.style.padding = "0px 0px";
        title.style.marginBottom = "3px";

        const helpLink = document.createElement("a");
        titleDiv.appendChild(helpLink);
        helpLink.draggable = false;
        helpLink.classList.add("connect-title__help");
        helpLink.href = "https://support.spotify.com/us/article/group-session/";
        helpLink.target = "_blank";

        const tooltip = document.createElement("span");
        helpLink.appendChild(tooltip);
        tooltip.classList.add("hidden-visually");
        tooltip.textContent = "What are group sessions?";

        containerDiv.appendChild(titleDiv);
        
        const lineBreakDiv = document.createElement("div");
        lineBreakDiv.style.width = "100%";
        containerDiv.appendChild(lineBreakDiv);

        return containerDiv;
    }

    const timeout = (ms) => {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    const handleCreateButtonPressed = async (e) => {
        e.target.disabled = true;
        await createSession();
        updateMenu();
    }

    const handleJoinButtonPressed = async (e) => {
        e.target.disabled = true;
        isJoiningSession = true;
        await timeout(100);
        updateMenu();
    }

    const buildStartMenu = () => {
        const containerDiv = buildContainerAndTitle();
        
        const buttonDiv = document.createElement("div");
        buttonDiv.style.display = "flex";
        buttonDiv.style.flexGrow = "1";
        buttonDiv.style.marginTop = "5px";

        const createButton = document.createElement("button");
        createButton.style.flex = "1";
        createButton.style.marginRight = "7px";
        createButton.style.padding = "8px 8px";
        createButton.classList.add("encore-bright-accent-set", "spicetify-group-button");
        createButton.textContent = "Start";
        createButton.addEventListener("click", handleCreateButtonPressed);
        buttonDiv.appendChild(createButton);

        const joinButton = document.createElement("button");
        joinButton.style.flex = "1";
        joinButton.style.padding = "8px 8px";
        joinButton.classList.add("encore-bright-accent-set", "spicetify-group-button");
        joinButton.textContent = "Join";
        joinButton.addEventListener("click", handleJoinButtonPressed);
        buttonDiv.appendChild(joinButton);

        containerDiv.appendChild(buttonDiv);

        return containerDiv;
    }

    const handleLeaveButtonPressed = async (e) => {
        e.target.disabled = true;
        if (is_session_owner) {
            await deleteSession();
        } else {
            await leaveSession();
        }
        updateMenu();
    }

    const handleCopyLink = (e) => {
        if (!isCopyingLink) {
            return;
        }
        // @ts-ignore
        const sessionLink = document.getElementById("spicetify-group-session-menu-link").value;
        e.clipboardData.setData('text/plain', sessionLink);
        e.preventDefault();
        Spicetify.showNotification("Link copied to clipboard");
        isCopyingLink = false;
    }

    const handleCopyLinkPressed = () => {
        isCopyingLink = true;
        document.execCommand('copy');
    }

    const buildSessionMenu = () => {
        const containerDiv = buildContainerAndTitle();
        
        const img_bg_color = "1ED760"; // spotify green
        const img_text_color = "black"; // or white
        const width = "600";
        const join_img = `https://scannables.scdn.co/uri/plain/png/${img_bg_color}/${img_text_color}/${width}/spotify%3Asocialsession%3A${join_session_token}`;

        const imgEl = document.createElement("img");
        imgEl.src = join_img;
        imgEl.style.width = "100%";
        imgEl.style.paddingBottom = "12px";
        containerDiv.appendChild(imgEl);

        const copyLink = document.createElement("input");
        copyLink.id = "spicetify-group-session-menu-link";
        copyLink.type = "text";
        copyLink.readOnly = true;
        copyLink.onclick = handleCopyLinkPressed;
        copyLink.value = `https://open.spotify.com/socialsession/${join_session_token}`;
        copyLink.classList.add("main-playlistEditDetailsModal-textElement", "main-playlistEditDetailsModal-titleInput");
        copyLink.style.marginBottom = "12px";
        copyLink.style.cursor = "pointer";
        containerDiv.appendChild(copyLink);

        const listenerButton = document.createElement("button");
        listenerButton.addEventListener("click", showUserList);
        listenerButton.classList.add("spicetify-group-button");
        listenerButton.textContent = "Show Listeners";
        listenerButton.style.marginBottom = "12px";
        containerDiv.appendChild(listenerButton);

        const closeButton = document.createElement("button");
        closeButton.addEventListener("click", handleLeaveButtonPressed);
        closeButton.classList.add("spicetify-group-button");
        closeButton.textContent = "Close Session";
        closeButton.style.fontSize = "8px";
        closeButton.style.lineHeight = "8px";
        containerDiv.appendChild(closeButton);

        return containerDiv;
    }

    const extractSessionToken = (sessionLink) => {
        const prefix = "open.spotify.com/socialsession/";
        let startIndex = sessionLink.indexOf(prefix);
        if (startIndex === -1) { // Obviously invalid link
            return null;
        }
        startIndex += prefix.length;
        let endIndex = sessionLink.lastIndexOf("?");
        if (endIndex === -1) {
            endIndex = sessionLink.length;
        }
        return sessionLink.substring(startIndex, endIndex);
    }

    const handleConfirmJoinButtonPressed = async (e) => {
        e.target.disabled = true;

        // Reading link
        const enterLinkField = document.getElementById("spicetify-group-session-join-link");
        
        // @ts-ignore
        const sessionToken = extractSessionToken(enterLinkField.value);
        if (sessionToken !== null) {
            await joinSession(sessionToken);
            isJoiningSession = false;
        } else {
            Spicetify.showNotification("Could not join session. Maybe the session link is invalid?");
            await timeout(100);
        }
        updateMenu();
    }

    const handleCancelJoinButtonPressed = async (e) => {
        e.target.disabled = true;
        isJoiningSession = false;
        await timeout(100);
        updateMenu();
    }

    const buildJoinMenu = () => {
        const containerDiv = buildContainerAndTitle();

        const enterLink = document.createElement("input");
        enterLink.id = "spicetify-group-session-join-link";
        enterLink.type = "text";
        enterLink.onkeyup = (e) => {
            if (e.key === "Enter") {
                document.getElementById("confirm-join-button").click();
            }
        };
        enterLink.placeholder = `https://open.spotify.com/socialsession/`;
        enterLink.classList.add("main-playlistEditDetailsModal-textElement", "main-playlistEditDetailsModal-titleInput");
        enterLink.style.marginBottom = "12px";
        setTimeout(() => enterLink.focus(), 100);
        containerDiv.appendChild(enterLink);

        const confirmJoinButton = document.createElement("button");
        confirmJoinButton.id = "confirm-join-button";
        confirmJoinButton.addEventListener("click", handleConfirmJoinButtonPressed);
        confirmJoinButton.classList.add("spicetify-group-button");
        confirmJoinButton.textContent = "Join";
        confirmJoinButton.style.marginBottom = "12px";
        confirmJoinButton.style.marginRight = "5px";
        containerDiv.appendChild(confirmJoinButton);

        const cancelButton = document.createElement("button");
        cancelButton.addEventListener("click", handleCancelJoinButtonPressed);
        cancelButton.classList.add("spicetify-group-button");
        cancelButton.textContent = "Cancel";
        cancelButton.style.marginBottom = "12px";
        containerDiv.appendChild(cancelButton);
        
        return containerDiv;
    };

    const updateMenu = () => {
        // remove the old menu if exists
        const oldMenu = document.getElementById("spicetify-group-session-menu");
        if (oldMenu !== null) {
            oldMenu.remove();
        }

        if (!isEnabled)
            return;

        let deviceMenu = document.querySelector(".connect-device-list-content");
        if (deviceMenu === null) {
            // try to find the menu with version 1.1.93.896+
            deviceMenu = document.querySelector('[aria-labelledby="device-picker-icon-button"]');
            if (deviceMenu === null)
                return;
        }

        // get the new menu
        let containerDiv;
        if (session_id !== null && join_session_token !== null && is_session_owner !== null) {
            containerDiv = buildSessionMenu();
        } else if (isJoiningSession) {
            containerDiv = buildJoinMenu();
        } else {
            session_id = null;
            is_session_owner = null;
            join_session_token = null;
            containerDiv = buildStartMenu();
        }
        deviceMenu.appendChild(containerDiv);
    }


    /**************
     * Fullscreen *
     **************/
    const tryInsertFullScreen = () => {
        if (!showScanCode || join_session_token == null) {
            return;
        }
        const main = document.querySelector(".npv-main-container");
        if (main === null) {
            return;
        }
        if (document.getElementById("spicetify-scancode-fullscreen") !== null) {
            return;
        }
        const img_bg_color = "1ED760"; // spotify green
        const img_text_color = "black"; // or white
        const width = "600";
        const join_img = `https://scannables.scdn.co/uri/plain/png/${img_bg_color}/${img_text_color}/${width}/spotify%3Asocialsession%3A${join_session_token}`;
        
        const imgEl = document.createElement("img");
        imgEl.id = "spicetify-scancode-fullscreen";
        imgEl.src = join_img;
        imgEl.style.opacity = "0.5";
        imgEl.style.position = "absolute";
        imgEl.style.bottom = "36em";
        imgEl.style.right = "14em";
        imgEl.style.width = "62em";

        main.appendChild(imgEl);
    }

    const onFullscreen = (e) => {
        setTimeout(tryInsertFullScreen, 100);
    }


    /***********
     * General *
     ***********/
    const insertObserver = (e) => {
        if (!isEnabled) {
            return;
        }

        const target = e.target;
        // Make sure we accutally have an element
        if (target === null || !("classList" in target)) {
            return;
        }

        // Update menu on display of the device menu, and when devices appear & disappear
        // @ts-ignore
        if (target.classList.contains("connect-device-list-container--is-visible") || 
            target.classList.contains("connect-device-list") ||
            ("previousSibling" in target && target.previousSibling !== null && 
             target.previousSibling.id === "spicetify-group-session-menu") ||
            target.querySelector('[aria-labelledby="device-picker-icon-button"]') !== null
        ) {
            updateMenu();
            return;
        }
    }

    const checkCurrentSession = async () => {
        const response = await getCurrentSession();
        if (response !== null) {
            try {
                // await joinSession(response.join_session_token);
                setCurrentSession(response);
                Spicetify.showNotification("Connected to an existing groups session!");
                updateMenu();
            } catch (e) {
                console.error(e);
                console.error("Error checking current session");
            }
        }
    }

    const checkAlive = async () => {
        const response = await getSessionMembers();
        if (response !== null) {
            users = response;
        } else {
            Spicetify.showNotification("Session has been ended.");
            clearCurrentSession();
            updateMenu();
        }
    }

    const setCurrentSession = (data) => {
        session_id = data["session_id"];
        is_session_owner = data["is_session_owner"];
        join_session_token = data["join_session_token"];
        users = data["session_members"];
        imageCache = {};
        alive_job = setInterval(checkAlive, ALIVE_INTERVAL);
        clearInterval(session_check_job);
    }

    const clearCurrentSession = (shouldStartChecking = true) => {
        session_id = null;
        is_session_owner = null;
        join_session_token = null;
        imageCache = null;
        users = null;
        clearInterval(alive_job);
        if (shouldStartChecking) {
            clearInterval(session_check_job);
            session_check_job = setInterval(checkCurrentSession, SESSION_CHECK_INTERVAL);
        }
    }

    const fetchLocalDevices = async () => {
        /**
         * Found in xpui.js, which used the Cosmos sub call instead.
         * However, it seems like `sub` subscribes to a specific
         * endpoint - we only need to GET it once.
         */
        return await Spicetify.CosmosAsync.get(
            "sp://connect/v1", null, {
                "include-local-device": "1"
            });
    }

    const initialize = async () => {
        injectListenerStyles();
        document.addEventListener("DOMNodeInserted", insertObserver);
        document.addEventListener("copy", handleCopyLink);

        const registerFullscreenClick = () => {
            const fs_btn = document.querySelector(".main-nowPlayingBar-right > .ExtraControls > button.control-button");
            if (fs_btn !== null) {
                fs_btn.addEventListener("click", onFullscreen);
            } else {
                setTimeout(registerFullscreenClick, 1000);
            }
        }
        registerFullscreenClick();

        const data = await fetchLocalDevices();
        try {
            local_device_id = Spicetify.Player.data.play_origin.device_identifier;
            for (const device of data.devices) {
                if (device.is_local) {
                    local_device_id = device.physical_identifier;
                    break;
                }
            }
            console.log(`Found local device id (${local_device_id})`);
        } catch (e) {
            console.warn("Could not fetch local device ID. Resorting to backup option.");
        } finally {
            clearCurrentSession();
        }
    }

    const terminate = () => {
        document.removeEventListener("DOMNodeInserted", insertObserver);
        document.removeEventListener("copy", handleCopyLink);
        const fs_btn = document.querySelector(".main-nowPlayingBar-right > .ExtraControls > button.control-button");
        if (fs_btn !== null) {
            fs_btn.removeEventListener("click", onFullscreen);
        }
        clearCurrentSession(false);
        updateMenu();
    }

    isEnabled = Spicetify.LocalStorage.get("group-session-enabled") === "true" || Spicetify.LocalStorage.get("group-session-enabled") === null;
    showScanCode = Spicetify.LocalStorage.get("group-session-showscancode") === "true";
    isJoiningSession = false;
    isCopyingLink = false;

    if (isEnabled) {
        initialize();
    }

    const enableMenuItem = new Spicetify.Menu.Item(
        "Enable Group Session",
        isEnabled,
        (item) => {
            isEnabled = !isEnabled;
            item.setState(isEnabled);
            Spicetify.LocalStorage.set("group-session-enabled", isEnabled ? "true" : "false");

            if (isEnabled) {
                initialize();
            } else {
                terminate();
            }
        }
    );
    const showInFSItem = new Spicetify.Menu.Item(
        "Show Spotify Code in Fullscreen Mode",
        showScanCode,
        (item) => {
            showScanCode = !showScanCode;
            item.setState(showScanCode);
            Spicetify.LocalStorage.set("group-session-showscancode", showScanCode ? "true" : "false");
        }
    );
    const menu = new Spicetify.Menu.SubMenu("Group Session", [enableMenuItem, showInFSItem]);
    menu.register();
})();
